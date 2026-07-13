
# Fase 1E-A.2 — Automação de acesso e ciclo de pagamento

Plano técnico de leitura apenas. Nenhum arquivo, migration, Edge Function, secret, banco ou configuração será alterado antes da sua aprovação explícita.

## 1. Objetivo

Depois que o Stripe aprovar o pagamento, liberar o plano automaticamente, sem aprovação manual de administrador e sem edição manual de banco, preservando:

- verificação de propriedade do e-mail (código de 6 dígitos);
- idempotência e fencing do webhook (`payment_webhook_events`, `payment_webhook_effects`);
- isolamento total entre `environment='live'` e `environment='sandbox'`;
- ausência de duplicação de e-mail transacional, Meta CAPI e outros efeitos externos.

## 2. Regra de liberação (fluxo pretendido)

Estados de `user_subscriptions.approval_status`:

- `pending_payment` — sem pagamento aprovado.
- `pending_email_verification` — pagamento aprovado, e-mail ainda não confirmado.
- `approved` — pagamento aprovado E `auth.users.email_confirmed_at IS NOT NULL`.
- `rejected` / `blocked` — inalterado; controle administrativo permanece.

Gatilhos de promoção automática (todos idempotentes):

1. **Webhook `payments-webhook`** — ao concluir com sucesso `customer.subscription.created/updated` ou `invoice.payment_succeeded`, chama nova RPC `sync_subscription_approval(_user_id, _environment)`:
   - Se `status ∈ {trialing, active}` e `email_confirmed_at IS NOT NULL` → `approval_status='approved'`.
   - Se `status ∈ {trialing, active}` e e-mail não confirmado → `approval_status='pending_email_verification'`.
   - Nunca rebaixa `approved → pending_*` só por reprocessar um evento antigo (fencing por `updated_at`/`event_created_at`).

2. **`verify_email_code`** (existente) — mantém a lógica atual de promover para `approved` quando o pagamento já está aprovado. Fica alinhada à mesma RPC compartilhada `sync_subscription_approval`.

3. **Trigger em `auth.users` NÃO será criado.** O schema `auth` é intocável. A promoção via confirmação de e-mail continua acontecendo dentro de `verify_email_code` (fluxo do próprio código de 6 dígitos), que é o único caminho suportado hoje. Para clientes que confirmam por link (se existir), adicionar hook em `auth-email-hook` apenas para chamar a mesma RPC — sem tocar em `auth.*`.

## 3. Tratamento de eventos Stripe adicionais

Adicionar ao `payments-webhook` (mantendo idempotência via `payment_webhook_effects` por `effect_type`):

| Evento Stripe | Ação em `user_subscriptions` | Acesso |
|---|---|---|
| `charge.refunded` (full) | `status='canceled'`, `approval_status='rejected'`, `expires_at=now()` | Revogado imediatamente |
| `charge.refunded` (partial) | Log + `refund_state='partial'` (novo campo opcional); não revoga | Mantido |
| `charge.dispute.created` | `status='disputed'`, `access_frozen=true` | Bloqueio imediato via guard |
| `charge.dispute.closed` (won) | Restaura `status` anterior | Reativado |
| `charge.dispute.closed` (lost) | `status='canceled'`, `expires_at=now()` | Revogado |
| `customer.subscription.updated` com `cancel_at_period_end=true` | Grava `cancel_at_period_end=true`, mantém `status='active'` | Mantido até `current_period_end` |
| `customer.subscription.deleted` | `status='canceled'`; **respeitar** `current_period_end` se futuro e pago | Ver §5 |
| `invoice.payment_failed` | `status='past_due'`, `past_due_since=now()` | Ver §6 |
| `subscription.paused` | `status='paused'` | Bloqueio imediato |

Todos os efeitos externos (e-mail de reembolso, Meta CAPI de refund, etc.) passam por `try_claim_payment_webhook_effect(provider, environment, event_id, effect_type, request_id)` — nenhum efeito é disparado duas vezes.

## 4. Isolamento `sandbox` vs `live` (obrigatório em todos os pontos)

Frontend e RPCs devem filtrar por `environment` em **todas** as leituras:

- `ProtectedRoute.tsx` — hoje lê `user_subscriptions` sem filtro. Corrigir: passar `getStripeEnvironment()` e `.eq('environment', env)`.
- `useSubscriptionStatus.tsx` — `get_subscription_status(_user_id, _environment)` passa a receber o env explicitamente; RPC filtra internamente.
- `get_subscription_status` (RPC) — assinatura nova: `(_user_id uuid, _environment text)`. Assinatura antiga fica com wrapper que loga aviso e assume `'live'` por 1 release (deprecation), depois removida.
- `has_active_subscription`, `sync_subscription_approval`, `verify_email_code`, `claim_payment_webhook_event` — todas exigem `_environment` explícito. Sem default.
- Testes: cobrir cenário "usuário tem sandbox ativo mas live inexistente" → deve bloquear em produção.

## 5. Política `cancel_at_period_end` e `subscription.deleted`

Guard de acesso passa a ser:

```
hasAccess = status IN ('trialing','active')
         OR (status='canceled' AND current_period_end > now())
         OR (cancel_at_period_end=true AND current_period_end > now())
```

`ProtectedRoute` e `has_active_subscription` alinhados. Cliente que cancela mantém acesso até o fim do período pago; ao chegar `current_period_end`, o próximo mount / realtime revoga.

## 6. Política `past_due` — decisão pendente

**Opção A — Bloqueio imediato** (comportamento atual). Simples, sem risco de uso não pago. Ruim para clientes com cartão que falhou por motivo transitório (limite momentâneo, 3DS pendente).

**Opção B — Tolerância configurável** (`PAST_DUE_GRACE_HOURS`, default 72h). Mantém acesso enquanto Stripe faz dunning; bloqueia se `past_due_since + grace < now()` ou se Stripe emitir `subscription.deleted`/`unpaid`. Requer campo `past_due_since` + job leve (pode ser feito on-read, sem cron novo).

**Recomendação: Opção B com 72h.** Stripe faz 4 tentativas em ~3 semanas por padrão; 72h captura a maioria dos falsos positivos (limite, expiração de cartão renovado) sem expor a plataforma. Fácil de reverter para A mudando o env var para `0`.

Aguardando sua decisão antes de implementar.

## 7. Atualização em tempo real no frontend

Duas camadas complementares:

1. **Realtime** — habilitar `supabase_realtime` para `public.user_subscriptions` (filtro por `user_id`). `useSubscriptionStatus` e `ProtectedRoute` inscrevem canal no `useEffect`, e no callback fazem **refetch** com filtro de `environment` (não confiar em `payload.new`, que não tem noção do env do cliente).

2. **Polling controlado de fallback** — quando o usuário está na tela `/verify-email` ou `/checkout/return`, poll a cada 5s por até 2min (`setInterval` com cleanup). Cobre o caso de realtime indisponível ou WebSocket bloqueado por rede corporativa.

Nenhum reload é exigido.

## 8. Impedir "pagamento aprovado sem liberação"

- `sync_subscription_approval` é chamada **dentro da mesma transação** de `complete_payment_webhook_event`. Se a RPC falhar, o evento não é marcado `completed` e Stripe retenta.
- Job de reconciliação diária (novo cron opcional, fora do escopo desta fase — apenas mencionado): compara `user_subscriptions.status IN (active,trialing)` com `approval_status != 'approved' AND email_confirmed_at IS NOT NULL` e corrige. Só entra se você aprovar; caso contrário, o webhook idempotente já cobre o caminho feliz.
- Métrica/log: contar `subscription_active_without_approval` por hora para alertar regressões.

## 9. Impedir acesso indevido após reembolso/disputa/encerramento

- Guard único no frontend (`ProtectedRoute`) + guard no backend (`has_active_subscription`) — nunca só um.
- Toda revogação (`refunded`, `dispute lost`, `subscription.deleted` sem período restante, `unpaid`) escreve `expires_at=now()` além do `status`, para que o próximo `is_expired` retorne `true` mesmo se algum código legado só olhar para essa flag.
- Realtime derruba a sessão de UI ao detectar mudança de `status` para valor sem acesso (`ProtectedRoute` re-render → tela de bloqueio).

## 10. Migração de banco necessária

Uma migration (nome final gerado pelo tool):

- `ALTER TABLE public.user_subscriptions ADD COLUMN past_due_since timestamptz`, `refund_state text`, `access_frozen boolean DEFAULT false` (todos nullable/default seguros).
- `CREATE OR REPLACE FUNCTION public.sync_subscription_approval(_user_id uuid, _environment text) RETURNS void SECURITY DEFINER SET search_path=public`.
- `CREATE OR REPLACE FUNCTION public.get_subscription_status(_user_id uuid, _environment text)` — nova assinatura; drop da antiga após 1 release.
- `CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid, _environment text)`.
- `GRANT EXECUTE` só para `service_role` nas RPCs internas; `authenticated` apenas nas RPCs consumidas pelo frontend (`get_subscription_status`, `has_active_subscription`).
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions`.
- Todas as funções: `SECURITY DEFINER`, `SET search_path=public` (ou `public, auth, extensions` quando ler `email_confirmed_at`), sem grant a `anon`/`authenticated` nas RPCs sensíveis.

## 11. Edge Functions que precisam de novo deploy

- `payments-webhook` — novos handlers de refund/dispute + chamada a `sync_subscription_approval`.
- `auth-email-hook` — apenas se decidirmos cobrir confirmação por link (opcional).
- `verify-code` / `send-verification-code` — sem mudança se `verify_email_code` já centraliza a promoção.
- Nenhuma outra função é tocada.

## 12. Testes

Vitest (frontend + shared):
- `payment-webhook-idempotency.test.ts` — expandir para refund, dispute created/closed, subscription.deleted com/sem período restante, past_due com/sem grace.
- Novo `subscription-approval-sync.test.ts` — matriz `(status × email_confirmed × approval_status atual)` → estado final esperado, garantindo que `approved` nunca é rebaixado.
- Novo `protected-route-environment.test.tsx` — sandbox não libera acesso em live e vice-versa.
- Novo `subscription-realtime.test.tsx` — mock do canal; muda `status` → UI re-renderiza sem reload.

Manuais em sandbox (Stripe CLI/dashboard sandbox, sem cartões reais):
- Trial → active → cancel_at_period_end → expira.
- Payment_failed → past_due → recover (invoice.payment_succeeded).
- Full refund → acesso revogado em <10s (via realtime).
- Dispute created → freeze; dispute won → unfreeze.

## 13. Riscos residuais

- **Ordem de eventos Stripe** — já documentado como risco da 1E-A; comparação por `event_created_at` antes de sobrescrever `updated_at` continua sendo a próxima fase.
- **Realtime indisponível** — mitigado pelo polling na tela de verificação.
- **Confirmação por link mágico** — se algum fluxo confirma o e-mail fora do código de 6 dígitos, o usuário fica em `pending_email_verification` até o próximo mount que dispare a reconciliação. Aceitável, pois hoje o único caminho de confirmação suportado é o código.
- **Rebaixamento acidental** — mitigado por regra "nunca rebaixar `approved` sem evento explícito de revogação".

## 14. Rollback

- **Código:** redeploy do commit anterior (`c794dbd...`) da `payments-webhook`. A migration é aditiva (colunas nullable, funções novas), então o handler antigo continua funcionando.
- **Banco:** `DROP FUNCTION sync_subscription_approval`, reverter `get_subscription_status`/`has_active_subscription` para assinaturas antigas via segunda migration. Colunas novas ficam (inertes).
- **Realtime:** `ALTER PUBLICATION supabase_realtime DROP TABLE public.user_subscriptions`.

## 15. Arquivos que seriam alterados (preview, nenhum toque ainda)

- `supabase/functions/payments-webhook/index.ts`
- `supabase/functions/_shared/approval.ts` (helper compartilhado com `verify-code`)
- `src/components/ProtectedRoute.tsx`
- `src/hooks/useSubscriptionStatus.tsx`
- `src/lib/stripe.ts` (nenhuma mudança de assinatura; apenas uso)
- Nova migration em `supabase/migrations/`
- Novos testes em `src/test/`
- `docs/PHASE-1E-A-2-PAYMENT-AUTOMATION.md` (novo)

`types.ts`, `bun.lock`, `supabase/config.toml`, `.env*` e função `mcp` não são tocados.

## 16. Decisões que preciso de você antes de codar

1. **Past_due:** opção A (bloqueio imediato) ou B (72h de tolerância, recomendada)?
2. **Cron de reconciliação diária:** entra nesta fase ou fica para depois?
3. **Confirmação por link mágico:** cobrir agora no `auth-email-hook` ou manter apenas o código de 6 dígitos?
4. **Realtime na tabela `user_subscriptions`:** confirma habilitar? (Impacta billing de realtime marginalmente — 1 evento por mudança de assinatura por usuário.)

Aguardando sua aprovação do plano e das decisões acima antes de qualquer alteração.
