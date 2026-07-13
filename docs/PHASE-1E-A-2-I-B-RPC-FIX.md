# Phase 1E-A.2/i-b — RPC correction gate

This corrective step must be applied before any Phase 1E-A.2 Edge Function
starts calling the new subscription RPCs.

## Guarantees

- `compute_subscription_access` is self-only for authenticated users and
  unrestricted only for `service_role`.
- Access is limited to `active`, `trialing`, and the configured 72-hour
  `past_due` grace period. `canceled`, `paused`, `unpaid`, `incomplete`, and
  `incomplete_expired` never grant access. A `free`/`expired` plan never grants
  access even if Stripe state is stale.
- `apply_stripe_subscription_event` mutates subscription state and completes
  the owned webhook ledger claim in one PostgreSQL transaction.
- Stale/terminal events are acknowledged without changing subscription state.
- A new subscription may replace only an already terminal local current row.
  A second active subscription is rejected for explicit reconciliation instead
  of silently hiding a potentially billable Stripe subscription.

## Deployment gate

Applying this migration does not switch the currently deployed webhook to the
new RPC. The temporary insert-only effect-claim containment remains active.
`payments-webhook` may adopt `apply_stripe_subscription_event` only after its
subphase tests verify that it no longer calls `complete_payment_webhook_event`
separately.

No cron job is created by this step.

## Rollback

Do not drop additive columns or historical rows. If a production problem is
found before Edge adoption, revoke `compute_subscription_access` from
`authenticated` and redeploy the preceding RPC definitions through a new
corrective migration. Never edit an applied migration in place.
