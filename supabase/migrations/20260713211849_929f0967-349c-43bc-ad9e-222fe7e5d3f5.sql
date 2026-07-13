-- =============================================================================
-- Phase 1E-A.2 — Access lifecycle automation (subphase i)
-- Additive schema + RPCs. No cron. No auth.* writes. RLS preserved.
-- =============================================================================

create extension if not exists pgcrypto;

-- --- user_subscriptions new columns ------------------------------------------
alter table public.user_subscriptions
  add column if not exists payment_email_verified_at timestamptz,
  add column if not exists past_due_since            timestamptz,
  add column if not exists refund_state              text        not null default 'none',
  add column if not exists access_frozen             boolean     not null default false,
  add column if not exists terminal_state            boolean     not null default false,
  add column if not exists last_stripe_event_id      text,
  add column if not exists last_stripe_event_at      timestamptz,
  add column if not exists last_stripe_event_type    text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_subscriptions_refund_state_check') then
    alter table public.user_subscriptions
      add constraint user_subscriptions_refund_state_check
      check (refund_state in ('none','partial','full'));
  end if;
end $$;

-- --- payment_webhook_effects outbox extension --------------------------------
alter table public.payment_webhook_effects
  add column if not exists status              text        not null default 'pending',
  add column if not exists attempt_count       integer     not null default 0,
  add column if not exists started_at          timestamptz,
  add column if not exists completed_at        timestamptz,
  add column if not exists error_code          text,
  add column if not exists stripe_response_id  text,
  add column if not exists claim_expires_at    timestamptz,
  add column if not exists updated_at          timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_webhook_effects_status_check') then
    alter table public.payment_webhook_effects
      add constraint payment_webhook_effects_status_check
      check (status in ('pending','processing','completed','failed','skipped'));
  end if;
end $$;

create index if not exists idx_pwe_status_expiry
  on public.payment_webhook_effects (status, claim_expires_at)
  where status in ('pending','processing','failed');

-- --- Preflight for duplicates + partial unique index (only when safe) --------
do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count from (
    select user_id, environment
      from public.user_subscriptions
     where terminal_state = false
     group by user_id, environment
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise notice '[phase-1e-a-2] preflight: % duplicate (user_id, environment) group(s) with non-terminal rows. Partial unique index NOT created. Resolve manually.', dup_count;
  else
    raise notice '[phase-1e-a-2] preflight: no duplicates. Creating partial unique index.';
    execute $ddl$ create unique index if not exists uq_user_subscriptions_current on public.user_subscriptions (user_id, environment) where terminal_state = false $ddl$;
  end if;
end $$;

-- --- Outbox RPCs -------------------------------------------------------------
create or replace function public.try_claim_payment_webhook_effect(
  p_provider text, p_environment text, p_event_id text, p_effect_type text, p_request_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_claimed boolean := false;
begin
  if p_environment not in ('sandbox','live') then
    raise exception 'invalid environment %', p_environment using errcode = '22023';
  end if;

  insert into public.payment_webhook_effects
    (provider, environment, event_id, effect_type, request_id,
     status, attempt_count, started_at, claim_expires_at)
  values
    (p_provider, p_environment, p_event_id, p_effect_type, p_request_id,
     'processing', 1, now(), now() + interval '5 minutes')
  on conflict do nothing;

  if found then return true; end if;

  update public.payment_webhook_effects
     set status='processing', request_id=p_request_id, attempt_count=attempt_count+1,
         started_at=now(), claim_expires_at=now() + interval '5 minutes', updated_at=now()
   where provider=p_provider and environment=p_environment
     and event_id=p_event_id and effect_type=p_effect_type
     and status in ('processing','pending','failed')
     and (claim_expires_at is null or claim_expires_at < now())
  returning true into v_claimed;

  return coalesce(v_claimed,false);
end $$;
revoke all on function public.try_claim_payment_webhook_effect(text,text,text,text,uuid) from public;
grant execute on function public.try_claim_payment_webhook_effect(text,text,text,text,uuid) to service_role;

create or replace function public.complete_payment_webhook_effect(
  p_provider text, p_environment text, p_event_id text, p_effect_type text,
  p_request_id uuid, p_stripe_response_id text default null
) returns boolean language sql security definer set search_path = public as $$
  update public.payment_webhook_effects
     set status='completed', completed_at=now(), updated_at=now(),
         stripe_response_id=coalesce(p_stripe_response_id, stripe_response_id),
         error_code=null
   where provider=p_provider and environment=p_environment
     and event_id=p_event_id and effect_type=p_effect_type
     and request_id=p_request_id and status='processing'
  returning true;
$$;
revoke all on function public.complete_payment_webhook_effect(text,text,text,text,uuid,text) from public;
grant execute on function public.complete_payment_webhook_effect(text,text,text,text,uuid,text) to service_role;

create or replace function public.fail_payment_webhook_effect(
  p_provider text, p_environment text, p_event_id text, p_effect_type text,
  p_request_id uuid, p_error_code text
) returns boolean language sql security definer set search_path = public as $$
  update public.payment_webhook_effects
     set status='failed', completed_at=now(), updated_at=now(), error_code=p_error_code
   where provider=p_provider and environment=p_environment
     and event_id=p_event_id and effect_type=p_effect_type
     and request_id=p_request_id and status='processing'
  returning true;
$$;
revoke all on function public.fail_payment_webhook_effect(text,text,text,text,uuid,text) from public;
grant execute on function public.fail_payment_webhook_effect(text,text,text,text,uuid,text) to service_role;

create or replace function public.recover_expired_webhook_claims(
  p_environment text, p_limit integer default 500
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if p_environment not in ('sandbox','live') then
    raise exception 'invalid environment %', p_environment using errcode='22023';
  end if;
  update public.payment_webhook_effects
     set status='pending', request_id=null, claim_expires_at=null, updated_at=now()
   where id in (
     select id from public.payment_webhook_effects
      where environment=p_environment and status='processing'
        and claim_expires_at is not null and claim_expires_at < now()
      order by claim_expires_at asc limit p_limit
   );
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.recover_expired_webhook_claims(text,integer) from public;
grant execute on function public.recover_expired_webhook_claims(text,integer) to service_role;

-- --- Access rule -------------------------------------------------------------
create or replace function public.compute_subscription_access(
  _user_id uuid, _environment text
) returns table (
  has_access boolean, effective_plan text, reason text,
  subscription_id uuid, stripe_subscription_id text, status text,
  approval_status text, cancel_at_period_end boolean,
  current_period_end timestamptz, refund_state text, terminal_state boolean,
  payment_email_verified_at timestamptz, email_verified_via_auth boolean
) language plpgsql stable security definer set search_path = public, auth as $$
declare
  r record; v_email_confirmed_at timestamptz; v_email_verified boolean; v_grace_ok boolean;
begin
  if _environment not in ('sandbox','live') then
    raise exception 'invalid environment %', _environment using errcode='22023';
  end if;

  select u.email_confirmed_at into v_email_confirmed_at from auth.users u where u.id = _user_id;

  select s.* into r
    from public.user_subscriptions s
   where s.user_id=_user_id and s.environment=_environment and s.terminal_state=false
   order by s.created_at desc limit 1;

  if not found then
    return query select false, 'free'::text, 'no_subscription'::text,
      null::uuid, null::text, null::text, null::text, false, null::timestamptz,
      'none'::text, false, null::timestamptz, (v_email_confirmed_at is not null);
    return;
  end if;

  v_email_verified := (v_email_confirmed_at is not null) or (r.payment_email_verified_at is not null);

  if r.approval_status in ('rejected','blocked') then
    return query select false, 'free'::text, r.approval_status,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state, r.terminal_state,
      r.payment_email_verified_at, (v_email_confirmed_at is not null);
    return;
  end if;

  if r.refund_state='full' or r.terminal_state=true or r.access_frozen=true then
    return query select false, 'free'::text, 'terminal'::text,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state, r.terminal_state,
      r.payment_email_verified_at, (v_email_confirmed_at is not null);
    return;
  end if;

  if r.status in ('canceled','unpaid','incomplete_expired') then
    if r.status='canceled' and r.cancel_at_period_end=true
       and r.current_period_end is not null and r.current_period_end > now()
       and v_email_verified and r.approval_status='approved' then
      return query select true, r.plan, 'grace_until_period_end'::text,
        r.id, r.stripe_subscription_id, r.status, r.approval_status,
        r.cancel_at_period_end, r.current_period_end, r.refund_state, r.terminal_state,
        r.payment_email_verified_at, (v_email_confirmed_at is not null);
      return;
    end if;
    return query select false, 'free'::text, r.status,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state, r.terminal_state,
      r.payment_email_verified_at, (v_email_confirmed_at is not null);
    return;
  end if;

  if r.status='past_due' then
    v_grace_ok := r.past_due_since is not null and r.past_due_since > (now() - interval '72 hours');
    if not v_grace_ok then
      return query select false, 'free'::text, 'past_due_expired'::text,
        r.id, r.stripe_subscription_id, r.status, r.approval_status,
        r.cancel_at_period_end, r.current_period_end, r.refund_state, r.terminal_state,
        r.payment_email_verified_at, (v_email_confirmed_at is not null);
      return;
    end if;
  end if;

  if not v_email_verified then
    return query select false, 'free'::text, 'email_not_verified'::text,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state, r.terminal_state,
      r.payment_email_verified_at, (v_email_confirmed_at is not null);
    return;
  end if;

  if r.approval_status <> 'approved' then
    return query select false, 'free'::text, 'pending_approval'::text,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state, r.terminal_state,
      r.payment_email_verified_at, (v_email_confirmed_at is not null);
    return;
  end if;

  return query select true, r.plan, 'active'::text,
    r.id, r.stripe_subscription_id, r.status, r.approval_status,
    r.cancel_at_period_end, r.current_period_end, r.refund_state, r.terminal_state,
    r.payment_email_verified_at, (v_email_confirmed_at is not null);
end $$;
revoke all on function public.compute_subscription_access(uuid,text) from public;
grant execute on function public.compute_subscription_access(uuid,text) to authenticated, service_role;

-- --- Internal sync (no public grants) ----------------------------------------
create or replace function public.sync_subscription_approval_internal(
  _user_id uuid, _environment text
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  r record; v_email_confirmed_at timestamptz; v_email_verified boolean; v_next_status text;
begin
  if _environment not in ('sandbox','live') then
    raise exception 'invalid environment %', _environment using errcode='22023';
  end if;

  select u.email_confirmed_at into v_email_confirmed_at from auth.users u where u.id = _user_id;

  select s.* into r
    from public.user_subscriptions s
   where s.user_id=_user_id and s.environment=_environment and s.terminal_state=false
   order by s.created_at desc limit 1 for update;

  if not found then return; end if;
  if r.approval_status in ('rejected','blocked') then return; end if;

  v_email_verified := (v_email_confirmed_at is not null) or (r.payment_email_verified_at is not null);
  v_next_status := r.approval_status;

  if r.status in ('trialing','active') and v_email_verified then
    v_next_status := 'approved';
  elsif r.status='past_due' and v_email_verified
        and r.past_due_since is not null
        and r.past_due_since > (now() - interval '72 hours') then
    v_next_status := 'approved';
  elsif r.status in ('trialing','active','past_due') and not v_email_verified then
    v_next_status := 'pending_email_verification';
  else
    v_next_status := 'pending_payment';
  end if;

  if v_next_status is distinct from r.approval_status then
    update public.user_subscriptions
       set approval_status=v_next_status,
           approved_at = case when v_next_status='approved' then coalesce(approved_at, now()) else approved_at end,
           updated_at = now()
     where id = r.id;
  end if;
end $$;
revoke all on function public.sync_subscription_approval_internal(uuid,text) from public;
grant execute on function public.sync_subscription_approval_internal(uuid,text) to service_role;

create or replace function public.sync_subscription_approval(
  _user_id uuid, _environment text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_subscription_approval_internal(_user_id, _environment);
end $$;
revoke all on function public.sync_subscription_approval(uuid,text) from public;
grant execute on function public.sync_subscription_approval(uuid,text) to service_role;

create or replace function public.reconcile_my_subscription_approval(
  _environment text
) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform public.sync_subscription_approval_internal(v_uid, _environment);
end $$;
revoke all on function public.reconcile_my_subscription_approval(text) from public;
grant execute on function public.reconcile_my_subscription_approval(text) to authenticated;

-- --- Atomic Stripe event application -----------------------------------------
create or replace function public.apply_stripe_subscription_event(
  p_environment text, p_event_id text, p_event_type text, p_event_created_at timestamptz,
  p_user_id uuid, p_stripe_subscription_id text, p_stripe_customer_id text,
  p_plan text, p_status text, p_product_id text, p_price_id text,
  p_current_period_start timestamptz, p_current_period_end timestamptz,
  p_cancel_at_period_end boolean, p_terminal boolean,
  p_refund_state text default null, p_request_id uuid default null
) returns table (subscription_id uuid, action text)
language plpgsql security definer set search_path = public as $$
declare
  v_lock_key1 int := hashtext(p_user_id::text);
  v_lock_key2 int := hashtext(coalesce(p_environment,''));
  r_existing record;
  v_incoming_terminal_rank int := case when p_terminal then 1 else 0 end;
  v_existing_terminal_rank int;
  v_id uuid;
begin
  if p_environment not in ('sandbox','live') then
    raise exception 'invalid environment %', p_environment using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

  select * into r_existing
    from public.user_subscriptions
   where stripe_subscription_id=p_stripe_subscription_id and environment=p_environment
   for update;

  if found then
    v_existing_terminal_rank := case when r_existing.terminal_state then 1 else 0 end;

    if r_existing.last_stripe_event_at is not null
       and p_event_created_at < r_existing.last_stripe_event_at then
      return query select r_existing.id, 'skipped_older_event'::text; return;
    end if;

    if r_existing.last_stripe_event_at is not null
       and p_event_created_at = r_existing.last_stripe_event_at
       and v_incoming_terminal_rank < v_existing_terminal_rank then
      return query select r_existing.id, 'skipped_terminal_priority'::text; return;
    end if;

    if r_existing.terminal_state=true and p_terminal=false then
      return query select r_existing.id, 'skipped_row_is_terminal'::text; return;
    end if;

    update public.user_subscriptions
       set plan=coalesce(p_plan, plan),
           status=coalesce(p_status, status),
           stripe_customer_id=coalesce(p_stripe_customer_id, stripe_customer_id),
           product_id=coalesce(p_product_id, product_id),
           price_id=coalesce(p_price_id, price_id),
           current_period_start=coalesce(p_current_period_start, current_period_start),
           current_period_end=coalesce(p_current_period_end, current_period_end),
           expires_at=coalesce(p_current_period_end, expires_at),
           cancel_at_period_end=coalesce(p_cancel_at_period_end, cancel_at_period_end),
           refund_state=coalesce(p_refund_state, refund_state),
           terminal_state=greatest(terminal_state::int, p_terminal::int)::boolean,
           past_due_since = case
             when p_status='past_due' and past_due_since is null then now()
             when p_status is not null and p_status<>'past_due' then null
             else past_due_since end,
           last_stripe_event_id=p_event_id,
           last_stripe_event_at=p_event_created_at,
           last_stripe_event_type=p_event_type,
           updated_at=now()
     where id=r_existing.id
    returning id into v_id;

    perform public.sync_subscription_approval_internal(r_existing.user_id, p_environment);
    return query select v_id, 'updated'::text; return;
  end if;

  insert into public.user_subscriptions (
    user_id, environment, plan, status, approval_status,
    stripe_customer_id, stripe_subscription_id, product_id, price_id,
    current_period_start, current_period_end, expires_at,
    cancel_at_period_end, refund_state, terminal_state,
    last_stripe_event_id, last_stripe_event_at, last_stripe_event_type,
    past_due_since
  ) values (
    p_user_id, p_environment, coalesce(p_plan,'free'), coalesce(p_status,'incomplete'),
    'pending_email_verification',
    p_stripe_customer_id, p_stripe_subscription_id, p_product_id, p_price_id,
    p_current_period_start, p_current_period_end, p_current_period_end,
    coalesce(p_cancel_at_period_end,false), coalesce(p_refund_state,'none'),
    coalesce(p_terminal,false),
    p_event_id, p_event_created_at, p_event_type,
    case when p_status='past_due' then now() else null end
  ) returning id into v_id;

  perform public.sync_subscription_approval_internal(p_user_id, p_environment);
  return query select v_id, 'inserted'::text;
end $$;
revoke all on function public.apply_stripe_subscription_event(
  text,text,text,timestamptz,uuid,text,text,text,text,text,text,
  timestamptz,timestamptz,boolean,boolean,text,uuid
) from public;
grant execute on function public.apply_stripe_subscription_event(
  text,text,text,timestamptz,uuid,text,text,text,text,text,text,
  timestamptz,timestamptz,boolean,boolean,text,uuid
) to service_role;

-- --- verify_email_code(code, environment) -----------------------------------
drop function if exists public.verify_email_code(text);

create or replace function public.verify_email_code(
  _code text, _environment text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r_code record;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','unauthorized'); end if;
  if _environment not in ('sandbox','live') then
    return jsonb_build_object('ok',false,'error','invalid_environment');
  end if;
  if _code is null or _code !~ '^\d{6}$' then
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;

  select * into r_code from public.email_verification_codes
   where user_id=v_uid order by created_at desc limit 1 for update;

  if not found then return jsonb_build_object('ok',false,'error','no_code'); end if;
  if r_code.used_at is not null then return jsonb_build_object('ok',false,'error','already_used'); end if;
  if r_code.expires_at < now() then return jsonb_build_object('ok',false,'error','expired'); end if;
  if r_code.attempts >= 5 then return jsonb_build_object('ok',false,'error','rate_limited'); end if;

  update public.email_verification_codes set attempts=attempts+1 where id=r_code.id;

  if r_code.code_hash <> crypt(_code, r_code.code_hash) then
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;

  update public.email_verification_codes set used_at=now() where id=r_code.id;

  update public.user_subscriptions
     set payment_email_verified_at=coalesce(payment_email_verified_at, now()), updated_at=now()
   where user_id=v_uid and environment=_environment and payment_email_verified_at is null;

  perform public.sync_subscription_approval_internal(v_uid, _environment);

  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.verify_email_code(text,text) from public;
grant execute on function public.verify_email_code(text,text) to authenticated;
