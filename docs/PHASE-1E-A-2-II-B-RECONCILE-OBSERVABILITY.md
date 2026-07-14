# Phase 1E-A.2/ii-b — Durable reconciliation observability

## Purpose

The first automatic reconciliation cron runs could be proven to have queued an
HTTP request, but the short retention of `pg_net` responses and platform logs
made their final HTTP status and sanitized metrics unavailable later. This
subphase adds durable evidence without changing payment reconciliation logic.

No customer identifier, e-mail, Stripe object, payload, request header, secret,
subscription identifier or provider response is stored in the new ledger.

## Private run ledger

`public.payment_reconcile_runs` records only:

- the `sandbox` or `live` environment;
- delivery correlation (`pg_net_request_id` and the Edge request UUID);
- queued, started and finished timestamps;
- terminal state, intended HTTP response status and duration;
- `subs_scanned`, `subs_updated`, `divergences`, `effects_recovered` and
  `errors_count`;
- one sanitized error code when the whole run fails.

RLS is enabled with no public policies. `anon` and `authenticated` have no
privileges. Only `service_role` can read or write the table; the cron dispatcher
is also executable by the database owner used by `pg_cron`.

## Delivery correlation and fencing

`dispatch_payment_reconcile(environment)` creates a `queued` row and enqueues
`net.http_post` in one database transaction. The body contains only the
environment and generated run UUID. The internal secret and URL are read from
Vault at runtime and are never copied into the table or cron command.

On receipt, `payments-reconcile` claims that exact row through
`begin_payment_reconcile_run` before initializing Stripe. A duplicate delivery
cannot claim the same row and returns `409` before external or subscription
work. The terminal update is fenced by run UUID, environment and Edge request
UUID.

During the safe release transition, the old cron body (which has no run UUID)
is accepted only after internal authentication. The Edge Function creates a
`legacy_cron` run before doing work, so applying the ledger migration, deploying
the function and then replacing the cron jobs does not create an unobservable
or non-functional window.

## Release order

Follow `ops/releases/phase-1e-a-2-ii-b.json` exactly:

1. Apply `20260714153000_phase_1e_a_2_reconcile_run_ledger.sql`.
2. Deploy only `payments-reconcile`; do not invoke it.
3. Apply `20260714153100_phase_1e_a_2_reconcile_observable_cron.sql`.
4. Verify private grants and exactly two reconciler jobs.
5. Wait for the next scheduled sandbox/live executions and audit the ledger.

Do not proceed to Phase 1E-A.2/iii until both automatic environments have a
terminal ledger row and the stored sanitized metrics have been reviewed.

## Rollback

Do not delete ledger rows. If rollback is required, use a reviewed corrective
migration to restore the prior two cron commands before redeploying an older
function. The private table and RPCs may remain inert; they do not affect
payments, subscriptions or webhook processing by themselves.
