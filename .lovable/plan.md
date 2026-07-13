# Fase 1E-A.2 — Automação de acesso e ciclo de pagamento (Plano revisado v3)

> **Status:** somente plano. Nada foi implementado, migrado, deployado ou publicado.
> **Branch base para implementação futura:** `main` no commit `c794dbd559156da007e2093406f0b5d93d9d3724`.
> Commit atual `341d3e1` na branch de edição contém apenas este `.lovable/plan.md` e não deve sobrescrever nada da `main`.

Decisões mantidas: **1-B** (`past_due` com tolerância 72h) · **2-B** (reconciliação diária) · **3-B** (código próprio + Google + Apple + magic link) · **4-C** (Realtime + polling controlado).

---

## 1. Confirmação de cada correção solicitada

| # | Correção pedida | Status no plano |
|---|-----------------|-----------------|
| 1 | Regra central com denies terminais antes de qualquer allow; `past_due` exige e-mail verificado + approved; preservar `rejected`/`blocked` | **Incorporada** — ver §3 |
| 2 | Não alterar `auth.users`; introduzir `payment_email_verified_at`; considerar verificado se `auth.users.email_confirmed_at` OU `payment_email_verified_at` | **Incorporada** — ver §4 |
| 3 | Criar RPC estreita `reconcile_my_subscription_approval(_environment)` para `authenticated`; manter `sync_subscription_approval` só em `service_role`; sem `current_setting('role')` como prova única | **Incorporada** — ver §5 |
| 4 | Nova compra após estado terminal libera novo ciclo; ordenação e terminal por `stripe_subscription_id`; evento antigo não revoga assinatura nova | **Incorporada** — ver §6 |
| 5 | Preflight de duplicatas antes de `UNIQUE(user_id, environment)`; advisory lock por (user_id, environment) cobrindo INSERT; não deletar duplicatas silenciosamente | **Incorporada** — ver §7 |
| 6 | Outbox `payment_webhook_effects` com `status/attempt_count/started_at/completed_at/error_code/stripe_response_id`; recuperação de claim expirado; retry pelo reconciliador | **Incorporada** — ver §8 |
| 7 | Reembolso total: revogar local + 1 única chamada de cancelamento imediato no Stripe se ainda ativa; validar `charge → invoice → subscription → user/env`; parcial não revoga | **Incorporada** — ver §9 |
| 8 | Cron sem `activity_logs` global; segredo no Vault; separar sandbox/live; paginação; logs estruturados; reconciliar `failed/pending` expirados | **Incorporada** — ver §10 |
| 9 | `apply_stripe_subscription_event` recebe `request_id uuid`; remover flag `PAYMENTS_USE_ATOMIC_RPC`; rollback via redeploy do commit anterior; sem `DROP` destrutivo automático | **Incorporada** — ver §11 |
| 10 | `payments-reconcile` com `deno.json`, `deno.lock` congelado, entrada em `ops/edge-functions-critical.json`, gate `deno check --frozen`, `INTERNAL_CRON_SECRET`, `verify_jwt` coerente, testes isolamento live/sandbox | **Incorporada** — ver §12 |
| 11 | Base = `main@c794dbd`; preservar mudanças da `main`; não tocar `mcp`, `worker`, `types.ts`, `secrets`, lockfiles não relacionados | **Confirmada** |

**Nada foi implementado.** Este documento é somente leitura para revisão.

---

## 2. Objetivo e escopo

Liberar o plano automaticamente quando pagamento aprovado + e-mail verificado, sem aprovação manual de administrador, respeitando decisões administrativas (`rejected`/`blocked`), estados terminais (reembolso total, disputa perdida, cancelamento efetivado) e a tolerância de 72h em `past_due`.

Fora de escopo: alterações em `mcp`, `worker`, `src/integrations/supabase/types.ts` (regenerado), secrets não citados, lockfiles não relacionados às funções alteradas, e qualquer alteração em `auth.*`.

---

## 3. Regra central de acesso (`compute_subscription_access`)

RPC `SECURITY DEFINER`, `search_path = public, auth`, `STABLE`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated, service_role`. Assinatura:

```
public.compute_subscription_access(_user_id uuid, _environment text)
  returns table (
    has_access boolean,
    effective_plan text,
    reason text,
    subscription_id uuid,
    stripe_subscription_id text,
    current_period_end timestamptz,
    past_due_deadline timestamptz
  )
```

Validação: `_environment IN ('sandbox','live')`. Se chamada pelo cliente, exige `_user_id = auth.uid()`; service_role pode passar qualquer id.

Ordem de avaliação (deny-first, curto-circuito):

1. **Deny terminais** (retorna `has_access=false` imediatamente):
   - `approval_status IN ('rejected','blocked')` → `reason='admin_denied'`
   - `access_frozen = true` → `reason='access_frozen'`
   - `refund_state = 'full'` → `reason='refunded'`
   - `terminal_state = true` **para a assinatura corrente** → `reason='terminal'`
   - `expires_at IS NOT NULL AND expires_at < now()` → `reason='expired'`
2. **Exige e-mail verificado** (`auth.users.email_confirmed_at IS NOT NULL OR user_subscriptions.payment_email_verified_at IS NOT NULL`). Sem isso → `has_access=false`, `reason='email_unverified'`. Vale para `active`, `trialing` **e** `past_due`.
3. **Exige `approval_status = 'approved'`**. Sem isso → `has_access=false`, `reason='pending_approval'`.
4. **Status permitido**:
   - `status IN ('active','trialing')` e (`current_period_end IS NULL OR current_period_end > now()`) → allow.
   - `status = 'past_due'` e `past_due_since + interval '72 hours' > now()` → allow com `past_due_deadline`.
   - `status = 'canceled'` e `cancel_at_period_end = true` e `current_period_end > now()` → allow até o fim do período.
5. Caso contrário: `has_access=false`, `reason='no_active_subscription'`, `effective_plan='free'`.

Assinatura corrente = a linha mais recente por `(user_id, environment)` (ordem `created_at desc` com desempate por `id`). Ver §6 para reset após nova compra.

---

## 4. Verificação de e-mail — auditoria e nova coluna

**Auditoria do estado atual** (a incluir na PR quando implementar):

- `verify-code` valida o código de 6 dígitos e hoje chama `admin.updateUserById({ email_confirm: true })`, o que escreve em `auth.users.email_confirmed_at`. Isso não é um fluxo nativo do Supabase Auth OTP — é uma verificação comercial própria acoplada à assinatura, e a alteração é feita fora do `GoTrue`.
- Google/Apple/magic link já preenchem `auth.users.email_confirmed_at` nativamente via `GoTrue`.

**Decisão do plano:** parar de mutar `auth.users` a partir de `verify-code`. Motivo: schema `auth.*` é intocável neste projeto e o código de 6 dígitos é uma prova de pagamento, não uma confirmação de identidade de e-mail no sentido do provider.

**Solução:**

- Adicionar `payment_email_verified_at timestamptz` em `public.user_subscriptions`.
- `verify-code` preenche `payment_email_verified_at = now()` **na linha da assinatura corrente** (via RPC dedicada; ver §5).
- Google/Apple/magic link continuam usando `auth.users.email_confirmed_at` (sem mudança).
- `compute_subscription_access` (§3) considera verificado quando **qualquer** dos dois está preenchido.

**Auth hook não é alterado.** `auth-email-hook` só envia e-mails e não muta identidade.

---

## 5. RPCs — separação authenticated vs service_role

### 5.1 `reconcile_my_subscription_approval(_environment text)` — **authenticated**

- `SECURITY DEFINER`, `search_path = public, auth`, `VOLATILE`.
- `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO authenticated`.
- Usa exclusivamente `auth.uid()`; não aceita `user_id` como parâmetro.
- Valida `_environment IN ('sandbox','live')`.
- **Preserva decisões administrativas:** se `approval_status IN ('rejected','blocked')`, retorna sem alterar.
- Lê a assinatura corrente do próprio usuário, recalcula `approval_status` conforme regra:
  - se `compute_subscription_access` diz `has_access=true` e status atual é `pending_email_verification` → promove para `approved`.
  - se `email_unverified` ou `pending_approval` → mantém `pending_*` correspondente.
- Retorna o snapshot atualizado (mesma shape de `get_subscription_status`).
- **Não pode alterar assinatura de outro usuário** por construção (só usa `auth.uid()`).

### 5.2 `sync_subscription_approval(_user_id uuid, _environment text)` — **service_role**

- `SECURITY DEFINER`. `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO service_role`.
- Usada apenas por Edge Functions (`payments-webhook`, `payments-reconcile`, `verify-code`).
- Prova de service_role: **grant explícito** (não `current_setting('role')`). Adicionalmente, a função valida `auth.jwt() ->> 'role' = 'service_role'` como defesa em profundidade; o grant é a fonte primária.
- Nunca converte `rejected`/`blocked` em `approved`.

### 5.3 `apply_stripe_subscription_event(...)` — **service_role**

- Recebe `p_request_id uuid` (compatível com `payment_webhook_events.request_id`). **Não usar `text`.**
- Executa em transação: escreve `user_subscriptions`, `payment_webhook_effects` (ver §8) e chama `sync_subscription_approval` internamente.
- Chamadas externas ao Stripe **não entram na transação** — são despachadas pelo outbox (§8).

### 5.4 Frontend

`useSubscriptionStatus` continua chamando `get_subscription_status`. Novo hook/uso pontual chama `reconcile_my_subscription_approval` em `VerifyEmail` e `CheckoutReturn` (polling controlado) e no callback `SIGNED_IN` de `AuthContext`.

---

## 6. Estado terminal e nova compra após terminal

- `terminal_state`, `refund_state`, `access_frozen`, `last_stripe_event_id`, `last_stripe_event_at` são armazenados **por linha de assinatura**, chaveados por `stripe_subscription_id`.
- Ordenação de eventos é feita por `(stripe_subscription_id, event_created_at, event_id)` — nunca por `user_id` apenas.
- Um evento (`refund`/`dispute.lost`/`subscription.deleted`) **só afeta a linha cuja `stripe_subscription_id` corresponde**.
- Nova compra:
  - `checkout.session.completed` + `customer.subscription.created` (ou `.updated` com status `active`/`trialing`) com **nova `stripe_subscription_id`** cria uma nova linha `user_subscriptions` para o mesmo `(user_id, environment)`.
  - A "assinatura corrente" passa a ser a mais recente (ver §3).
  - Terminais antigos permanecem inertes nas linhas antigas; **não bloqueiam** a linha nova.
- Somente evento `subscription.created`/`.updated` com status ativo e assinatura confirmada no Stripe pode marcar a linha nova como não-terminal. Reembolso/disputa/deleted de linha antiga **nunca** revoga a nova.

Isso muda a modelagem: `UNIQUE(user_id, environment)` de §7 precisa ser **parcial** (`WHERE terminal_state = false`) para permitir múltiplas linhas históricas + uma única corrente. Ver §7.

---

## 7. Concorrência e unicidade

**Preflight (script de leitura, sem escrita):**

```sql
SELECT user_id, environment, count(*)
FROM public.user_subscriptions
GROUP BY 1,2 HAVING count(*) > 1;
```

Resultado é anexado à PR para revisão manual. **Nenhum registro é deletado automaticamente.** Consolidação, se necessária, é feita por migration manual separada, preservando histórico (nunca DELETE — no máximo marcar `terminal_state=true` em linhas antigas).

**Constraint:**

```sql
CREATE UNIQUE INDEX user_subscriptions_current_unique
  ON public.user_subscriptions (user_id, environment)
  WHERE terminal_state = false;
```

Isto garante no máximo uma assinatura "corrente" por ambiente e permite N históricas terminais.

**Concorrência:** advisory lock por `hashtextextended(user_id::text || ':' || environment, 0)` no início de `apply_stripe_subscription_event`. Cobre o primeiro INSERT (que `SELECT FOR UPDATE` não cobre porque a linha não existe).

---

## 8. Outbox `payment_webhook_effects` (durável)

**Colunas atuais** (auditadas): `provider`, `environment`, `event_id`, `effect_type`, `request_id`, `created_at`. **Faltam** todas as colunas de estado.

**Migration adiciona:**

- `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed'))`
- `attempt_count int NOT NULL DEFAULT 0`
- `started_at timestamptz`
- `completed_at timestamptz`
- `last_attempt_at timestamptz`
- `error_code text` (sanitizado — sem PII, sem stack Stripe)
- `stripe_response_id text` (ex.: `re_...`, `sub_...`; nunca payload cru)
- `claim_expires_at timestamptz` (para recuperar claims travados)

**Efeitos cobertos pelo outbox** (novo `effect_type`):

- `stripe_cancel_after_refund` (substitui a chamada síncrona atual)
- `meta_start_trial`, `meta_purchase` (já existem como claim; passam a ter status + retry)
- `send_verification_code`

**Ciclo:** `pending → processing (com claim_expires_at = now()+5min) → completed | failed`. `payments-reconcile` (§12) reprocessa `pending` e `failed` (com backoff) e recupera `processing` com `claim_expires_at < now()`.

Uma falha de rede após o claim **não trava** o efeito permanentemente — o reconciliador libera o claim expirado e incrementa `attempt_count`.

---

## 9. Reembolso total e parcial

**Mapeamento** (obrigatório antes de qualquer efeito):

- `charge.refunded` → `charge.invoice` → `invoice.subscription` → `user_subscriptions.stripe_subscription_id`.
- Se qualquer elo falhar, gravar `error_code='refund_mapping_failed'` no outbox e retornar sem tocar estado local. Reconciliador tenta novamente.
- Confirmar que `stripe_subscription_id` do evento **bate com** a linha alterada. Se não bater, ignorar (evento pertence a outra assinatura, ver §6).

**Reembolso total** (`amount_refunded == amount_captured`):

1. Localmente: `refund_state='full'`, `access_frozen=true`, `terminal_state=true`, `approval_status='rejected'` na linha correspondente.
2. Se `stripe.subscriptions.retrieve(sub_id).status NOT IN ('canceled','incomplete_expired')`, enfileira **uma única** operação de outbox `stripe_cancel_after_refund` que chama `stripe.subscriptions.cancel(sub_id, { invoice_now: false, prorate: false })`. Sem `update({cancel_at_period_end:true})` antes.
3. Se já cancelada, não faz nada externo.

**Reembolso parcial** (`amount_refunded < amount_captured`): registra `refund_state='partial'` e nada mais. **Não revoga**, **não cancela**.

**Disputa perdida** (`charge.dispute.closed` com `status='lost'`): mesmo tratamento do reembolso total.

Idempotência: o outbox `stripe_cancel_after_refund` é chaveado por `(event_id, effect_type)` — reprocessos não geram cancel duplicado.

---

## 10. Cron e observabilidade

- `pg_cron` agenda `payments-reconcile` em **dois jobs separados**: `03:00` UTC sandbox, `03:15` UTC live.
- **Segredo:** `INTERNAL_CRON_SECRET` armazenado no Vault (`vault.secrets`). SQL do `cron.schedule` lê via `vault.decrypted_secrets`; nunca literal na migration. Migration usa `insert` tool (não `migration`) para não vazar em remixes.
- Sem escrita em `activity_logs` (exige `user_id`). Métricas globais vão para logs estruturados da Edge Function via `createLogger('payments-reconcile')`: `duration_ms`, `subs_scanned`, `subs_updated`, `divergences`, `effects_recovered`, `errors_by_code`. Nada de PII.
- **Paginação obrigatória:** lote de 500 assinaturas por iteração, cursor por `(created_at, id)`. Nunca `SELECT *` sem `LIMIT`.
- Reconcilia:
  - `user_subscriptions` vs `stripe.subscriptions.retrieve` (status divergente).
  - Outbox `pending` antigo (> 10 min) ou `failed` (com backoff exponencial, max 8 tentativas).
  - `processing` com `claim_expires_at < now()` → volta para `pending`.
- Credenciais sandbox e live **nunca** se cruzam: cada execução recebe `env` fixo e usa apenas o key correspondente.

---

## 11. Tipos, flags e rollback

- `apply_stripe_subscription_event` recebe `p_request_id uuid`.
- **`PAYMENTS_USE_ATOMIC_RPC` removido do plano.** Não haverá secret nem feature flag. Fallback para o caminho não-atômico é indesejado.
- **Rollback:** feito por redeploy do commit anterior das Edge Functions afetadas (via `ops/edge-functions-critical.json`). Migration usa apenas mudanças aditivas (novas colunas nullable, novos índices, novas RPCs). **Sem `DROP COLUMN`** no rollback automático. Se necessário reverter schema, migration corretiva manual.
- Colunas novas ficam inertes se as Edge Functions forem revertidas (defaults seguros: `access_frozen=false`, `terminal_state=false`, `refund_state=NULL`, `payment_email_verified_at=NULL`).

---

## 12. Nova Edge Function `payments-reconcile`

Artefatos criados:

- `supabase/functions/payments-reconcile/index.ts`
- `supabase/functions/payments-reconcile/deno.json`
- `supabase/functions/payments-reconcile/deno.lock` (congelado; validado por `deno check --frozen` no CI, mesmo gate das outras críticas)
- Entrada em `ops/edge-functions-critical.json` **e** em `ops/releases/phase-1e-a-2.json` (novo arquivo de release desta fase).
- `verify_jwt = false` documentado em `supabase/config.toml` (bloco por-função). Autenticação por header `x-internal-secret` comparado a `INTERNAL_CRON_SECRET` em tempo constante.
- Testes:
  - `src/test/payments-reconcile-isolation.test.ts` — garante que run sandbox nunca lê chave live e vice-versa.
  - `src/test/payments-reconcile-pagination.test.ts` — garante paginação e ausência de query global.
  - `src/test/payments-reconcile-outbox.test.ts` — recuperação de `processing` expirado e retry de `failed`.

---

## 13. Lista final de arquivos

**Criados:**

- `supabase/migrations/<ts>_phase_1e_a_2_access_automation.sql`
- `supabase/functions/payments-reconcile/{index.ts,deno.json,deno.lock}`
- `ops/releases/phase-1e-a-2.json`
- `docs/PHASE-1E-A-2-ACCESS-AUTOMATION.md`
- `src/test/payments-reconcile-isolation.test.ts`
- `src/test/payments-reconcile-pagination.test.ts`
- `src/test/payments-reconcile-outbox.test.ts`
- `src/test/compute-subscription-access.test.ts` (via `supabase.rpc`)
- `src/test/reconcile-my-subscription-approval.test.ts`

**Modificados:**

- `supabase/functions/payments-webhook/index.ts` (novos handlers `charge.refunded`, `charge.dispute.*`; usa `apply_stripe_subscription_event`; usa outbox para `stripe_cancel_after_refund`)
- `supabase/functions/payments-webhook/deno.lock` (se dependências mudarem)
- `supabase/functions/verify-code/index.ts` (não muta `auth.users`; grava `payment_email_verified_at` via RPC; chama `sync_subscription_approval`)
- `supabase/functions/verify-code/deno.lock` (idem)
- `src/hooks/useSubscriptionStatus.tsx` (Realtime com filtro `user_id`; refetch via RPC; polling controlado em `VerifyEmail`/`CheckoutReturn`)
- `src/contexts/AuthContext.tsx` (chama `reconcile_my_subscription_approval` em `SIGNED_IN`)
- `src/components/ProtectedRoute.tsx` (usa `has_access` de `get_subscription_status`, que passa a delegar a `compute_subscription_access`)
- `src/pages/VerifyEmail.tsx`, `src/pages/CheckoutReturn.tsx` (polling controlado)
- `ops/edge-functions-critical.json` (adiciona `payments-reconcile`)
- `supabase/config.toml` (bloco `[functions.payments-reconcile]` com `verify_jwt = false`)
- `.lovable/plan.md` (este arquivo, versão final aprovada)

**Não tocados:** `src/integrations/supabase/{client.ts,types.ts}`, `src/lib/mcp/**`, `supabase/functions/mcp/**`, `worker/**`, `supabase/functions/_shared/approval.ts` (mantém papel atual de gate por role em Edge Functions), qualquer secret ou lockfile fora do escopo listado.

---

## 14. Migration final planejada (única, aditiva)

Conteúdo:

1. `ALTER TABLE public.user_subscriptions ADD COLUMN` (todas nullable ou com default seguro):
   - `payment_email_verified_at timestamptz`
   - `past_due_since timestamptz`
   - `refund_state text CHECK (refund_state IN ('none','partial','full'))`
   - `access_frozen boolean NOT NULL DEFAULT false`
   - `terminal_state boolean NOT NULL DEFAULT false`
   - `last_stripe_event_id text`
   - `last_stripe_event_at timestamptz`
2. `ALTER TABLE public.payment_webhook_effects ADD COLUMN` `status`, `attempt_count`, `started_at`, `completed_at`, `last_attempt_at`, `error_code`, `stripe_response_id`, `claim_expires_at` (defaults conforme §8).
3. `CREATE UNIQUE INDEX user_subscriptions_current_unique ... WHERE terminal_state = false` (§7).
4. `CREATE OR REPLACE FUNCTION public.compute_subscription_access(...)` (§3) — `SECURITY DEFINER`, `search_path=public,auth`, `STABLE`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated, service_role`.
5. `CREATE OR REPLACE FUNCTION public.reconcile_my_subscription_approval(_environment text)` (§5.1) — grants apenas para `authenticated`.
6. `CREATE OR REPLACE FUNCTION public.sync_subscription_approval(_user_id uuid, _environment text)` (§5.2) — grants apenas para `service_role`.
7. `CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_event(p_request_id uuid, ...)` (§5.3, §6, §7, §9) — grants apenas para `service_role`.
8. Redefinir `public.get_subscription_status` para delegar a `compute_subscription_access` (mesma shape observável, adicionando `has_access` e `reason`).

Cron (via `insert` tool, arquivo separado da migration): dois `cron.schedule` (sandbox 03:00, live 03:15) lendo `INTERNAL_CRON_SECRET` do Vault. **Não** vai em `supabase/migrations/`.

---

## 15. Edge Functions finais que exigem novo deploy

Registradas em `ops/releases/phase-1e-a-2.json`:

- `payments-webhook` (redeploy)
- `verify-code` (redeploy)
- `payments-reconcile` (deploy inicial)

`auth-email-hook` **não** precisa de redeploy nesta fase.

---

## 16. Critérios de aceite atualizados

1. Pagamento aprovado + código verificado → `has_access=true` sem intervenção humana, em ≤ 5s no cliente (Realtime + polling).
2. Google/Apple/magic link → verificado nativo; polling em `VerifyEmail` conclui sem depender de `verify-code`.
3. `rejected`/`blocked` administrativo **nunca** vira `approved` por webhook, cron ou RPC do cliente.
4. Reembolso total → acesso revogado localmente + 1 única `subscriptions.cancel` no Stripe (só se ainda ativa); reembolso parcial não revoga.
5. Disputa perdida → mesmo comportamento de reembolso total.
6. `past_due` concede acesso apenas dentro da janela de 72h **e** com e-mail verificado + approved.
7. Nova compra após terminal cria nova linha e restaura acesso; eventos da assinatura antiga não afetam a nova.
8. Duplicatas `(user_id, environment)` detectadas pelo preflight são listadas na PR; migration falha se detectar duplicata não resolvida (ou usa índice parcial que só considera `terminal_state=false`, permitindo históricos).
9. Advisory lock impede corrida em primeiro INSERT concorrente (teste dedicado).
10. Outbox recupera claim expirado após 5 min sem duplicar efeito externo.
11. `payments-reconcile` roda com paginação, isola sandbox de live, e reconcilia `pending`/`failed`/`processing-expirado`.
12. Nenhum código escreve em `auth.users` a partir de `verify-code`.
13. `reconcile_my_subscription_approval` chamada por `authenticated` funciona; chamada com `user_id` de outro usuário é impossível por assinatura da função.
14. `sync_subscription_approval` chamada por `authenticated` falha com erro de grant.
15. Rollback = redeploy do commit anterior das Edge Functions; migration é aditiva e permanece inerte.
16. CI: `deno check --frozen` cobre `payments-reconcile`; testes novos passam; `edge-function-manifest.test.ts` reconhece a nova função.

---

## 17. Confirmação final

- **Nenhum arquivo do projeto foi implementado, modificado ou deletado** além deste `.lovable/plan.md`.
- **Nenhuma migration foi aplicada.**
- **Nenhuma Edge Function foi deployada.**
- **Nenhum secret foi criado ou alterado.**
- **Nenhuma publicação foi feita.**
- Aguardando aprovação explícita para iniciar a implementação a partir de `main@c794dbd559156da007e2093406f0b5d93d9d3724`.
