-- =============================================================================
-- Phase 1E-A.2 containment
-- =============================================================================

update public.payment_webhook_effects
   set status = 'completed',
       attempt_count = greatest(attempt_count, 1),
       started_at = coalesce(started_at, created_at),
       completed_at = coalesce(completed_at, updated_at, created_at, now()),
       claim_expires_at = null,
       updated_at = now()
 where status in ('pending', 'processing', 'failed');

create or replace function public.try_claim_payment_webhook_effect(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_effect_type text,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean := false;
begin
  if p_provider <> 'stripe' then
    raise exception 'invalid provider' using errcode = '22023';
  end if;
  if p_environment not in ('sandbox', 'live') then
    raise exception 'invalid environment' using errcode = '22023';
  end if;
  if p_effect_type is null or p_effect_type !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'invalid effect_type' using errcode = '22023';
  end if;

  insert into public.payment_webhook_effects (
    provider,
    environment,
    event_id,
    effect_type,
    request_id,
    status,
    attempt_count,
    started_at,
    completed_at,
    claim_expires_at
  ) values (
    p_provider,
    p_environment,
    p_event_id,
    p_effect_type,
    p_request_id,
    'completed',
    1,
    now(),
    now(),
    null
  )
  on conflict (provider, environment, event_id, effect_type) do nothing
  returning true into v_inserted;

  return coalesce(v_inserted, false);
end;
$$;

revoke all on function public.try_claim_payment_webhook_effect(text,text,text,text,uuid) from public;
revoke execute on function public.try_claim_payment_webhook_effect(text,text,text,text,uuid) from anon, authenticated;
grant execute on function public.try_claim_payment_webhook_effect(text,text,text,text,uuid) to service_role;

comment on function public.try_claim_payment_webhook_effect(text,text,text,text,uuid) is
  'Temporary Phase 1E-A.2 containment: legacy insert-only, at-most-once claim contract.';

create or replace function public.verify_email_code(_code text)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.verify_email_code(_code, 'live'::text);
$$;

revoke all on function public.verify_email_code(text) from public;
revoke execute on function public.verify_email_code(text) from anon;
grant execute on function public.verify_email_code(text) to authenticated;

comment on function public.verify_email_code(text) is
  'Temporary live-only compatibility wrapper. Remove after verify-code passes _environment.';

revoke execute on function public.compute_subscription_access(uuid,text) from public, anon, authenticated;
grant execute on function public.compute_subscription_access(uuid,text) to service_role;

comment on function public.compute_subscription_access(uuid,text) is
  'Phase 1E-A.2 containment: service_role-only until caller identity validation is deployed.';
