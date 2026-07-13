
# Fase 1E-A.2 — Plano Revisado (aguardando aprovação)

Decisões incorporadas: **1-B** (past_due 72h configurável), **2-B** (reconciliação diária), **3-B** (cobrir 6 dígitos + Google + Apple + link), **4-C** (Realtime + polling controlado).

Nada será implementado, migrado ou deployado até aprovação explícita.

---

## 1. Objetivo e escopo

Liberar automaticamente o acesso do cliente após pagamento aprovado **e** e-mail confirmado, e revogar automaticamente após refund total, disputa perdida, unpaid, cancelamento efetivo (`subscription.deleted`) e fim de período em cancelamentos agendados. Nenhuma aprovação manual de administrador no fluxo feliz.

Fora do escopo: mudanças em `auth.*`, novo provedor de pagamento, novo provedor de e-mail, telas administrativas novas.

---

## 2. Regra central de acesso (fonte única, no banco)

Criar RPC `public.compute_subscription_access(_user_id uuid, _environment text) returns record` — **única fonte de verdade**. Retorna `(has_access boolean, approval_status text, reason text)`.

Regras (aplicadas em ordem):

1. `environment` deve ser `'live'` ou `'sandbox'`. Caso contrário → erro.
2. `access_frozen = true` (dispute aberto) → sem acesso, reason=`dispute_frozen`.
3. `refund_state = 'full'` → sem acesso, reason=`refunded`.
4. `status = 'canceled'` **sem** flag `cancel_at_period_end` prévia → sem acesso (encerramento efetivo via `subscription.deleted`).
5. `status IN ('active','trialing')` **e** (`cancel_at_period_end=false` **ou** `current_period_end > now()`) **e** email confirmado (`auth.users.email_confirmed_at IS NOT NULL`) → acesso.
6. `status='past_due'` **e** `past_due_since > now() - interval '72 hours'` (configurável via `plan_limits.past_due_grace_hours`, default 72) → acesso.
7. `status='unpaid'` → sem acesso.
8. Caso contrário → sem acesso.

**Correção da regra de cancelamento (item 1 do usuário):** `status='canceled' + current_period_end futuro` **não** concede acesso. Só concede quando a transição foi via `cancel_at_period_end=true` em assinatura ainda `active/trialing` — nesse caso `status` permanece `active` até `current_period_end` (é isso que o Stripe envia). `customer.subscription.deleted` seta `status='canceled'` e revoga imediatamente.

Esta RPC é chamada por:
- `has_active_subscription(_user_id, _environment)` — wrapper booleano.
- `get_subscription_status(_user_id, _environment)` — retorna linha + `has_access`.
- `sync_subscription_approval(_user_id, _environment)` — usa a mesma regra para decidir promoção a `approved`.
- `verify_email_code` (Edge) — chama a RPC após marcar código válido.

Sem duplicação em TypeScript.

---

## 3. Atomicidade real (item 3)

Criar RPC única `public.apply_stripe_subscription_event(payload jsonb, _request_id text) returns jsonb` que executa **em uma única transação**:

1. `SELECT ... FOR UPDATE` da linha `user_subscriptions` (fencing por `id`).
2. Guarda de ordenação: se `payload->>'event_created_at' < last_stripe_event_created_at` **e** o tipo do último evento é terminal (`refund_full`, `dispute_lost`, `unpaid`, `deleted`) → ignora e retorna `{skipped:'stale'}` (ver §8).
3. Upsert dos campos do evento (`status`, períodos, `cancel_at_period_end`, `refund_state`, `access_frozen`, `past_due_since`, `last_stripe_event_type`, `last_stripe_event_created_at`).
4. Recalcula `approval_status` chamando `compute_subscription_access` internamente.
5. Chama `complete_payment_webhook_event` fenced dentro da mesma transação.
6. Retorna `{ok, approval_status, has_access, skipped?}`.

O Edge Function `payments-webhook` faz **uma** chamada RPC por evento (após `claim_payment_webhook_event`). Não haverá mais sequência `upsert → sync → complete` fora de transação.

**Se o processo cair no meio:** a transação faz rollback completo, o ledger permanece em `processing` com fence do request antigo, e o retry do Stripe (ou o cron de reconciliação) reprocessa o evento. Nunca ficamos com assinatura gravada mas ledger não fechado, nem vice-versa.

---

## 4. Refund total × parcial (item 2)

- `charge.refunded` com `amount_refunded < amount_captured` → apenas `refund_state='partial'`, sem alteração de acesso.
- `charge.refunded` com `amount_refunded = amount_captured` → `refund_state='full'`, acesso revogado pela regra §2.3, **e** chamada `stripe.subscriptions.update(id, {cancel_at_period_end:true})` seguida de `stripe.subscriptions.cancel(id)` se ainda ativa, para impedir renovação.

**Idempotência da chamada externa:** usa `try_claim_payment_webhook_effect(effect_type='stripe_cancel_after_refund')` já existente. A tentativa só ocorre se a reivindicação for bem-sucedida; falhas são registradas e o cron diário reconcilia. Auditoria: linha em `payment_webhook_effects` com `event_id`, `request_id`, `status`, `stripe_response_id`.

**Por que não haverá cobrança futura:** após `cancel()` no Stripe, o próximo webhook `customer.subscription.deleted` confirma `status='canceled'` local; e o cron diário (§8) compara com Stripe e reforça caso o webhook falhe.

---

## 5. Eventos Stripe cobertos

| Evento | Efeito |
|---|---|
| `checkout.session.completed` | Meta CAPI StartTrial (idempotente, já existe) |
| `customer.subscription.created/updated` | Upsert via `apply_stripe_subscription_event` |
| `customer.subscription.deleted` | Encerramento efetivo → `status='canceled'`, acesso revogado |
| `invoice.payment_succeeded` | `status='active'`, limpa `past_due_since`, Meta Purchase |
| `invoice.payment_failed` | `status='past_due'`, `past_due_since=now()` se null |
| `charge.refunded` | Parcial: `refund_state='partial'`. Total: revoga + cancela Stripe |
| `charge.dispute.created/funds_withdrawn` | `access_frozen=true` |
| `charge.dispute.closed` (won) | `access_frozen=false` |
| `charge.dispute.closed` (lost) | Revoga acesso + cancela Stripe (evento terminal) |

---

## 6. Autenticação — cobrir 6 dígitos, Google, Apple (item 6)

**Fonte de verdade:** `auth.users.email_confirmed_at`. A RPC `compute_subscription_access` lê dessa coluna via `security definer` com `search_path=public, auth`.

- **Código de 6 dígitos:** `verify-code` marca `email_verification_codes.used_at`, chama `auth.admin.updateUserById(user_id, {email_confirm:true})` (isso preenche `email_confirmed_at`), depois chama `sync_subscription_approval`.
- **Google/Apple OAuth:** o provider já retorna e-mail verificado; `email_confirmed_at` é preenchido pelo próprio Supabase Auth no primeiro sign-in. Não precisa de mudança no `auth-email-hook`. Adicionar em `AuthContext` (client) um refetch de `get_subscription_status` no evento `SIGNED_IN`, que dispara `sync_subscription_approval` server-side via RPC (ver §7).
- **Link mágico futuro:** mesmo caminho — Supabase preenche `email_confirmed_at`, `SIGNED_IN` dispara a sync.

Não há regra duplicada em TS. `verify-code` e o client apenas **chamam** `sync_subscription_approval`, que aplica a regra única.

---

## 7. RPCs — segurança (item 4)

Todas `SECURITY DEFINER`, `SET search_path = public, auth`, `REVOKE ALL FROM PUBLIC`.

| RPC | Grant | Validação |
|---|---|---|
| `compute_subscription_access(_user_id, _env)` | `service_role` | interna |
| `has_active_subscription(_user_id, _env)` | `authenticated`, `service_role` | `_user_id = auth.uid() OR has_role(auth.uid(),'admin') OR current_setting('role')='service_role'`. `_env IN ('live','sandbox')` |
| `get_subscription_status(_user_id, _env)` | `authenticated`, `service_role` | igual acima |
| `sync_subscription_approval(_user_id, _env)` | `service_role` | interna, chamada por Edge/RPC |
| `apply_stripe_subscription_event(payload, req_id)` | `service_role` | valida shape do payload |

Qualquer `_user_id` diferente do `auth.uid()` (sem ser admin/service_role) → `RAISE EXCEPTION 'forbidden'`. Env inválido → `RAISE EXCEPTION 'invalid_environment'`.

---

## 8. Ordem de eventos (item 7)

Novas colunas em `user_subscriptions`:
- `last_stripe_event_created_at timestamptz`
- `last_stripe_event_type text`
- `terminal_state boolean not null default false` — setado ao aplicar `refund_full`, `dispute_lost`, `unpaid`, `deleted`.

Regra de precedência em `apply_stripe_subscription_event`:

1. Se `terminal_state=true` e o novo evento **não** é um evento explícito de reativação administrativa (não existe hoje) → `skipped:'terminal'`.
2. Se `payload.event_created_at <= last_stripe_event_created_at` → `skipped:'stale'`.
3. Caso contrário aplica e atualiza `last_stripe_event_*`.

Duplicatas continuam bloqueadas pelo `payment_webhook_events` (ledger).

---

## 9. Cron diário de reconciliação (item 8)

Nova Edge Function `payments-reconcile` (invocada por `pg_cron` diário, 03:00 UTC, sandbox e live em execuções separadas):

Para cada `user_subscriptions` com `status IN ('active','trialing','past_due')` **ou** modificada nas últimas 48h:

1. `stripe.subscriptions.retrieve(id)`.
2. Comparar `status`, `cancel_at_period_end`, `current_period_end`, itens/plano.
3. Divergência → chamar `apply_stripe_subscription_event` com payload sintético marcado `source='reconcile'` (mesma RPC, mesma trava de ordem — `event_created_at = stripe.updated`).
4. Verificar `email_confirmed_at` e chamar `sync_subscription_approval`.
5. Métricas em `activity_logs`: `reconciled_count`, `divergences_count`, `errors_count`. Sem PII, sem tokens.

**Nunca faz revogação destrutiva sem evento Stripe correspondente** — apenas alinha ao estado do Stripe. Isolamento `sandbox`/`live` rigoroso (execuções e credenciais separadas).

---

## 10. Realtime + polling (item 5)

- Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;` **sem** `REPLICA IDENTITY FULL` (frontend não usa `old_record`).
- RLS existente já limita `SELECT` a `auth.uid() = user_id`. Filtro server-side na subscrição: `filter: user_id=eq.<uid>`.
- No callback: **ignorar** `payload.new` e refazer `supabase.rpc('get_subscription_status', {_user_id, _environment})`.
- Polling controlado apenas em `/verify-email` e `/checkout/return`: `setInterval` 5s, timeout 2min, `clearInterval` no unmount e ao detectar `approval_status='approved'`.

---

## 11. Migration prevista (única)

```
ALTER TABLE public.user_subscriptions
  ADD COLUMN past_due_since timestamptz,
  ADD COLUMN refund_state text CHECK (refund_state IN ('partial','full')),
  ADD COLUMN access_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN last_stripe_event_created_at timestamptz,
  ADD COLUMN last_stripe_event_type text,
  ADD COLUMN terminal_state boolean NOT NULL DEFAULT false;

ALTER TABLE public.plan_limits
  ADD COLUMN past_due_grace_hours int NOT NULL DEFAULT 72;

-- Publicação realtime (sem REPLICA IDENTITY FULL)
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;

-- RPCs (SECURITY DEFINER, search_path fixo, revoke public, grants mínimos)
CREATE OR REPLACE FUNCTION public.compute_subscription_access(...) ...;
CREATE OR REPLACE FUNCTION public.sync_subscription_approval(...) ...;
CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_event(...) ...;
CREATE OR REPLACE FUNCTION public.has_active_subscription(...) ...; -- substitui versão atual
CREATE OR REPLACE FUNCTION public.get_subscription_status(...) ...; -- substitui versão atual

-- pg_cron
SELECT cron.schedule('payments-reconcile-sandbox','0 3 * * *', $$ ...net.http_post... env=sandbox $$);
SELECT cron.schedule('payments-reconcile-live','15 3 * * *', $$ ...net.http_post... env=live $$);
```

---

## 12. Edge Functions com novo deploy

| Função | Motivo |
|---|---|
| `payments-webhook` | Substitui sequência não-atômica por `apply_stripe_subscription_event`; adiciona handlers refund/dispute; chama Stripe cancel após refund total (idempotente) |
| `verify-code` | Após validar código, chama `sync_subscription_approval` |
| `payments-reconcile` (nova) | Cron diário |

**Sem deploy:** `auth-email-hook` (não é fonte de verdade), demais funções.

---

## 13. Arquivos — lista exata (item 9)

Criar:
- `supabase/functions/payments-reconcile/index.ts`
- `supabase/functions/payments-reconcile/deno.json`
- `src/test/payment-webhook-atomicity.test.ts`
- `src/test/subscription-access-rule.test.ts` (RPC via `supabase.rpc`)
- `src/test/subscription-realtime.test.tsx`
- `docs/PHASE-1E-A-2-PAYMENT-AUTOMATION.md`
- 1 arquivo de migration (§11)

Modificar:
- `supabase/functions/payments-webhook/index.ts` — chamar `apply_stripe_subscription_event`, novos handlers
- `supabase/functions/verify-code/index.ts` — chamar `sync_subscription_approval`
- `src/hooks/useSubscriptionStatus.tsx` — aceitar `environment`, subscrição Realtime com filtro `user_id`, refetch via RPC
- `src/components/ProtectedRoute.tsx` — passar `environment` do `getStripeEnvironment()`, ler `has_access`
- `src/pages/VerifyEmail.tsx` e `src/pages/CheckoutReturn.tsx` — polling controlado
- `src/contexts/AuthContext.tsx` — no `SIGNED_IN`, chamar `sync_subscription_approval` via RPC
- `supabase/config.toml` — declarar `payments-reconcile`
- `ops/edge-functions-critical.json` — incluir `payments-reconcile`

**Não** modificar: `supabase/functions/_shared/approval.ts` (mantém papel atual de gate de Edge por role; **não** é fonte de verdade de acesso à assinatura — essa fonte é a RPC no banco).

---

## 14. Testes

- **Atomicidade:** simular crash entre passos → verificar rollback total (ledger não fecha, linha não muta).
- **Ordem de eventos:** aplicar `deleted` e depois `updated` antigo → `skipped:'terminal'`.
- **Refund total:** verifica revogação + chamada Stripe cancel + idempotência (2ª chamada não repete).
- **Regra `canceled`:** `subscription.deleted` revoga imediatamente; `cancel_at_period_end=true` mantém acesso até `current_period_end`.
- **Segurança RPC:** usuário A não lê assinatura de B; env inválido rejeitado.
- **OAuth:** signup Google/Apple → `SIGNED_IN` promove a `approved` automaticamente.
- **Realtime:** update no banco chega ao client, refetch usa filtro por env.

---

## 15. Riscos e rollback

| Risco | Mitigação | Rollback |
|---|---|---|
| RPC atômica falha em produção | Feature flag `PAYMENTS_USE_ATOMIC_RPC` no Edge — fallback para caminho antigo | Desligar flag |
| Cron reconcilia divergência falsa | Só alinha ao Stripe, nunca revoga sem evento | Desabilitar `cron.unschedule` |
| Realtime aumenta custo | Filtro por `user_id`, sem `REPLICA IDENTITY FULL` | `ALTER PUBLICATION ... DROP TABLE` |
| Refund cancel duplicado | `try_claim_payment_webhook_effect` | Nenhum — idempotente |
| RPC bloqueia leitura por RLS mais estrita | Grants explícitos + testes automatizados | Revert migration |

Rollback geral: `DROP FUNCTION` das novas RPCs, revert das colunas, revert do deploy das 3 Edge Functions. Ledger `payment_webhook_events` continua íntegro.

---

## 16. Critérios de aceite

1. Pagamento aprovado + e-mail confirmado (código, Google ou Apple) → `approval_status='approved'` em ≤ 5s sem intervenção manual.
2. Refund total → acesso revogado + assinatura cancelada no Stripe + sem cobrança na próxima renovação (verificado por reconciliação).
3. Dispute aberto → `access_frozen`. Won → libera. Lost → revoga permanente.
4. `cancel_at_period_end=true` mantém acesso até `current_period_end`; `subscription.deleted` revoga imediatamente.
5. Evento fora de ordem após terminal → ignorado.
6. Crash no meio do handler → sem estado inconsistente após retry.
7. Usuário A não consegue ler assinatura de B via RPC.
8. Cron diário registra métricas e nunca revoga sem evento Stripe.
9. Sandbox e live totalmente isolados em toda leitura, escrita e cron.

---

Aguardo aprovação explícita para executar. Nenhum arquivo, migration, Edge Function ou secret foi alterado.
