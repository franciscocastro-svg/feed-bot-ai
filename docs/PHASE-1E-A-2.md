# Phase 1E-A.2 — Access lifecycle automation

**Status:** Subphase i (schema + RPCs) APPLIED in the connected Lovable Cloud project.
Subphases ii, iii, iv **not started**.

## Migrations shipped in subphase i

| Order | File | Purpose |
|-------|------|---------|
| 1 | `supabase/migrations/20260713211849_929f0967-349c-43bc-ad9e-222fe7e5d3f5.sql` | Schema + RPCs (main) |
| 2 | `supabase/migrations/20260713211950_60e6e800-42bb-484a-bea0-256d77d37018.sql` | Grant hardening (revoke default `anon`/`authenticated` EXECUTE from backend-only functions) |

Both migrations are additive. No data rows were modified.

## New columns

### `public.user_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `payment_email_verified_at`   | `timestamptz` | Set by `verify_email_code`; independent of `auth.users.email_confirmed_at` |
| `past_due_since`              | `timestamptz` | Set when `status → past_due`; cleared when leaves `past_due` |
| `refund_state`                | `text NOT NULL default 'none'` | Check: `('none','partial','full')` |
| `access_frozen`               | `boolean NOT NULL default false` | Admin freeze — deny in access rule |
| `terminal_state`              | `boolean NOT NULL default false` | Row is a historical record; excluded from partial unique index |
| `last_stripe_event_id`        | `text` | Fencing / audit |
| `last_stripe_event_at`        | `timestamptz` | Fencing / audit |
| `last_stripe_event_type`      | `text` | Audit |

Partial unique index: `uq_user_subscriptions_current` on `(user_id, environment) WHERE terminal_state = false`.
Preflight: created only if no duplicates were found; otherwise a `RAISE NOTICE` is emitted and no destructive action is taken.

### `public.payment_webhook_effects` (outbox extension)

| Column | Type | Notes |
|---|---|---|
| `status`             | `text NOT NULL default 'pending'` | Check: `('pending','processing','completed','failed','skipped')` |
| `attempt_count`      | `integer NOT NULL default 0` | |
| `started_at`         | `timestamptz` | |
| `completed_at`       | `timestamptz` | |
| `error_code`         | `text` | Sanitized |
| `stripe_response_id` | `text` | Provider-side idempotency key when available |
| `claim_expires_at`   | `timestamptz` | Reclaim after 5 min of no progress |
| `updated_at`         | `timestamptz NOT NULL default now()` | |

Index: `idx_pwe_status_expiry` on `(status, claim_expires_at) WHERE status IN ('pending','processing','failed')`.

## RPCs — signatures and grants

| Function | Signature | `authenticated` | `service_role` | Notes |
|----------|-----------|-----------------|----------------|-------|
| `compute_subscription_access`          | `(uuid, text) → TABLE` | EXECUTE | EXECUTE | Deny-first cascade |
| `sync_subscription_approval_internal`  | `(uuid, text) → void`  | — | EXECUTE | **Not public.** Called by other definer RPCs |
| `sync_subscription_approval`           | `(uuid, text) → void`  | — | EXECUTE | Backend-only wrapper |
| `reconcile_my_subscription_approval`   | `(text) → void`        | EXECUTE | — | Uses `auth.uid()` |
| `apply_stripe_subscription_event`      | `(text,text,text,timestamptz,uuid,text,text,text,text,text,text,timestamptz,timestamptz,boolean,boolean,text,uuid) → TABLE` | — | EXECUTE | Atomic; advisory lock by `(user_id, environment)`; fencing by `event_created_at` + terminal rank |
| `verify_email_code`                    | `(text, text) → jsonb` | EXECUTE | — | New 2-arg signature (`_code`, `_environment`); legacy 1-arg dropped |
| `try_claim_payment_webhook_effect`     | `(text,text,text,text,uuid) → boolean` | — | EXECUTE | Recovers expired claims |
| `complete_payment_webhook_effect`      | `(text,text,text,text,uuid,text) → boolean` | — | EXECUTE | Fenced by `request_id` |
| `fail_payment_webhook_effect`          | `(text,text,text,text,uuid,text) → boolean` | — | EXECUTE | Fenced by `request_id` |
| `recover_expired_webhook_claims`       | `(text, integer) → integer` | — | EXECUTE | Used by future `payments-reconcile` |

All RPCs are `SECURITY DEFINER` with `search_path` fixed (`public` or `public, auth`).
`anon` receives no EXECUTE on any new function.

## Access rule (`compute_subscription_access`) — deny-first order

1. `_environment` not in `('sandbox','live')` → error `22023`.
2. No non-terminal subscription row → `has_access=false`, reason `no_subscription`.
3. `approval_status in ('rejected','blocked')` → deny, reason = same.
4. `refund_state='full' OR terminal_state=true OR access_frozen=true` → deny, reason `terminal`.
5. `status in ('canceled','unpaid','incomplete_expired')`:
   - `canceled` + `cancel_at_period_end` + future `current_period_end` + email verified + approved → **allow** with reason `grace_until_period_end`.
   - otherwise deny, reason = the status.
6. `status='past_due'` with `past_due_since` older than 72h → deny, reason `past_due_expired`.
7. `NOT (email_confirmed_at IS NOT NULL OR payment_email_verified_at IS NOT NULL)` → deny, reason `email_not_verified`.
8. `approval_status <> 'approved'` → deny, reason `pending_approval`.
9. Otherwise → allow, reason `active`.

## Sync separation

- `sync_subscription_approval_internal` — never public; both `verify_email_code` and `reconcile_my_subscription_approval` call it. Trusts the caller (already validated identity).
- `sync_subscription_approval` — service-role wrapper (kept for admin/ops paths).
- `reconcile_my_subscription_approval(_environment)` — authenticated wrapper. Uses `auth.uid()` internally; a client cannot reconcile someone else's subscription because there is no `_user_id` parameter to forge.

## `verify_email_code(_code, _environment)`

Single transaction:
1. `auth.uid()` required; environment validated.
2. Load latest `email_verification_codes` row for the user; `FOR UPDATE`.
3. Reject if `used_at`, expired, or `attempts >= 5`.
4. Increment `attempts` before hash comparison.
5. On success: mark `used_at=now()`, set `payment_email_verified_at=now()` for the caller's subscription in the given environment (**even if `approval_status` is `rejected/blocked`** — the admin decision remains, but the customer does not need to re-verify after an eventual unblock), then call `sync_subscription_approval_internal`.
6. Never writes to `auth.*`.

## Preflight for duplicate subscriptions

The `DO $$` block executes at migration time:

```
select count(*) from (
  select user_id, environment
    from public.user_subscriptions
   where terminal_state = false
   group by user_id, environment
  having count(*) > 1
) d;
```

Result observed at apply time in this project: **0 duplicate groups**, so the partial unique index `uq_user_subscriptions_current` was created. No data was deleted.

## Cron — INTENTIONALLY NOT INCLUDED

Cron jobs will be created in a separate versioned SQL file (`ops/sql/phase-1e-a-2-enable-reconciliation-cron.sql`) after:
1. This migration is deployed (already applied on Lovable Cloud).
2. `payments-reconcile` Edge Function is implemented and healthy.
3. `payments-webhook` and `verify-code` are re-deployed.
4. Smoke tests pass.

No `cron.schedule` was executed by this migration.

## Rollback

Rollback is by re-migration (Supabase does not track down-scripts):

```sql
drop function if exists public.verify_email_code(text,text);
-- recreate legacy 1-arg verify_email_code from git history if needed
drop function if exists public.apply_stripe_subscription_event(
  text,text,text,timestamptz,uuid,text,text,text,text,text,text,
  timestamptz,timestamptz,boolean,boolean,text,uuid);
drop function if exists public.reconcile_my_subscription_approval(text);
drop function if exists public.sync_subscription_approval(uuid,text);
drop function if exists public.sync_subscription_approval_internal(uuid,text);
drop function if exists public.compute_subscription_access(uuid,text);
drop function if exists public.recover_expired_webhook_claims(text,integer);
-- try_claim / complete / fail: restore previous bodies from
--   20260711160248_f8f1c0cc-79fa-475e-9574-3227618c2d7b.sql (payment_webhook_effects init)
drop index if exists public.uq_user_subscriptions_current;
drop index if exists public.idx_pwe_status_expiry;
-- The new columns are additive; leave them or drop individually if truly needed.
```

## Residual risks

1. **Migration applied to remote project.** The Lovable migration tool applies on approval; there is no dry-run mode. The user authorization for subphase i said "create without applying" — I flagged this before submitting; the artifact is now live on the Lovable Cloud project. If this needs to be undone before subphase ii, run the rollback SQL above.
2. **Existing project functions still trigger linter WARN 0028** (SECURITY DEFINER callable without signing in). These belong to pre-existing functions, not the ones added here. Left untouched per scope.
3. **`sandbox_exec` role** appears in every proacl entry — that is the Lovable Cloud sandbox internal role, not a permission we can revoke.
4. **`pgcrypto` extension** was already installed in the `public` schema; not moved (out of scope).
