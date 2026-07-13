-- =============================================================================
-- Phase 1E-A.2/i-b — RPC correctness before Edge Function adoption
--
-- This migration is additive/corrective. It does not enable cron and does not
-- change the temporary legacy webhook effect-claim contract installed by the
-- preceding containment migration.
-- =============================================================================

create or replace function public.compute_subscription_access(
  _user_id uuid,
  _environment text
)
returns table (
  has_access boolean,
  effective_plan text,
  reason text,
  subscription_id uuid,
  stripe_subscription_id text,
  status text,
  approval_status text,
  cancel_at_period_end boolean,
  current_period_end timestamptz,
  refund_state text,
  terminal_state boolean,
  payment_email_verified_at timestamptz,
  email_verified_via_auth boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  r record;
  v_caller_id uuid := auth.uid();
  v_caller_role text := coalesce(auth.jwt() ->> 'role', '');
  v_email_confirmed_at timestamptz;
  v_email_verified boolean;
  v_access_expires_at timestamptz;
begin
  if _environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment' using errcode = '22023';
  end if;

  if v_caller_role <> 'service_role'
     and (v_caller_id is null or v_caller_id <> _user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select u.email_confirmed_at
    into v_email_confirmed_at
    from auth.users u
   where u.id = _user_id;

  select s.*
    into r
    from public.user_subscriptions s
   where s.user_id = _user_id
     and s.environment = _environment
     and s.terminal_state = false
   order by s.created_at desc, s.id desc
   limit 1;

  if not found then
    return query select
      false,
      'free'::text,
      'no_subscription'::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      false,
      null::timestamptz,
      'none'::text,
      false,
      null::timestamptz,
      (v_email_confirmed_at is not null);
    return;
  end if;

  v_email_verified :=
    (v_email_confirmed_at is not null)
    or (r.payment_email_verified_at is not null);
  v_access_expires_at := coalesce(r.expires_at, r.current_period_end);

  if r.approval_status in ('rejected', 'blocked') then
    return query select
      false, 'free'::text, r.approval_status,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state,
      r.terminal_state, r.payment_email_verified_at,
      (v_email_confirmed_at is not null);
    return;
  end if;

  if r.refund_state = 'full' or r.access_frozen = true then
    return query select
      false, 'free'::text,
      case when r.refund_state = 'full' then 'refunded'::text else 'access_frozen'::text end,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state,
      r.terminal_state, r.payment_email_verified_at,
      (v_email_confirmed_at is not null);
    return;
  end if;

  if r.status not in ('active', 'trialing', 'past_due') then
    return query select
      false, 'free'::text, coalesce(r.status, 'invalid_status'),
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state,
      r.terminal_state, r.payment_email_verified_at,
      (v_email_confirmed_at is not null);
    return;
  end if;

  if coalesce(r.plan, 'free') in ('free', 'expired') then
    return query select
      false, 'free'::text, 'no_paid_plan'::text,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state,
      r.terminal_state, r.payment_email_verified_at,
      (v_email_confirmed_at is not null);
    return;
  end if;

  if r.status <> 'past_due'
     and v_access_expires_at is not null
     and v_access_expires_at <= now() then
    return query select
      false, 'free'::text, 'expired'::text,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state,
      r.terminal_state, r.payment_email_verified_at,
      (v_email_confirmed_at is not null);
    return;
  end if;

  if r.status = 'past_due'
     and (r.past_due_since is null
          or r.past_due_since <= now() - interval '72 hours') then
    return query select
      false, 'free'::text, 'past_due_expired'::text,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state,
      r.terminal_state, r.payment_email_verified_at,
      (v_email_confirmed_at is not null);
    return;
  end if;

  if not v_email_verified then
    return query select
      false, 'free'::text, 'email_not_verified'::text,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state,
      r.terminal_state, r.payment_email_verified_at,
      (v_email_confirmed_at is not null);
    return;
  end if;

  if r.approval_status <> 'approved' then
    return query select
      false, 'free'::text, 'pending_approval'::text,
      r.id, r.stripe_subscription_id, r.status, r.approval_status,
      r.cancel_at_period_end, r.current_period_end, r.refund_state,
      r.terminal_state, r.payment_email_verified_at,
      (v_email_confirmed_at is not null);
    return;
  end if;

  return query select
    true,
    r.plan,
    case when r.status = 'past_due' then 'past_due_grace'::text else 'active'::text end,
    r.id,
    r.stripe_subscription_id,
    r.status,
    r.approval_status,
    r.cancel_at_period_end,
    r.current_period_end,
    r.refund_state,
    r.terminal_state,
    r.payment_email_verified_at,
    (v_email_confirmed_at is not null);
end;
$$;

revoke all on function public.compute_subscription_access(uuid,text) from public;
revoke execute on function public.compute_subscription_access(uuid,text) from anon;
grant execute on function public.compute_subscription_access(uuid,text) to authenticated, service_role;

comment on function public.compute_subscription_access(uuid,text) is
  'Phase 1E-A.2 access source of truth. Self-only for authenticated; unrestricted for service_role.';

create or replace function public.apply_stripe_subscription_event(
  p_environment text,
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_plan text,
  p_status text,
  p_product_id text,
  p_price_id text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_terminal boolean,
  p_refund_state text default null,
  p_request_id uuid default null
)
returns table (subscription_id uuid, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_key1 integer;
  v_lock_key2 integer;
  v_existing record;
  v_current record;
  v_id uuid;
  v_action text;
  v_completed boolean;
  v_incoming_terminal_rank integer := case when coalesce(p_terminal, false) then 1 else 0 end;
  v_existing_terminal_rank integer;
begin
  if p_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment' using errcode = '22023';
  end if;
  if p_user_id is null then
    raise exception 'missing_user_id' using errcode = '22023';
  end if;
  if nullif(trim(p_stripe_subscription_id), '') is null then
    raise exception 'missing_stripe_subscription_id' using errcode = '22023';
  end if;
  if nullif(trim(p_event_id), '') is null or p_event_created_at is null then
    raise exception 'invalid_event_identity' using errcode = '22023';
  end if;
  if p_refund_state is not null and p_refund_state not in ('none', 'partial', 'full') then
    raise exception 'invalid_refund_state' using errcode = '22023';
  end if;
  if p_status is not null
     and p_status not in (
       'active', 'trialing', 'past_due', 'canceled', 'unpaid',
       'incomplete', 'incomplete_expired', 'paused'
     ) then
    raise exception 'invalid_subscription_status' using errcode = '22023';
  end if;

  v_lock_key1 := hashtext(p_user_id::text);
  v_lock_key2 := hashtext(p_environment);
  perform pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

  select s.*
    into v_existing
    from public.user_subscriptions s
   where s.stripe_subscription_id = p_stripe_subscription_id
     and s.environment = p_environment
   order by s.created_at desc, s.id desc
   limit 1
   for update;

  if found then
    v_id := v_existing.id;
    v_existing_terminal_rank := case when v_existing.terminal_state then 1 else 0 end;

    if v_existing.last_stripe_event_at is not null
       and p_event_created_at < v_existing.last_stripe_event_at then
      v_action := 'skipped_older_event';
    elsif v_existing.last_stripe_event_at is not null
          and p_event_created_at = v_existing.last_stripe_event_at
          and v_incoming_terminal_rank < v_existing_terminal_rank then
      v_action := 'skipped_terminal_priority';
    elsif v_existing.terminal_state = true and coalesce(p_terminal, false) = false then
      v_action := 'skipped_row_is_terminal';
    else
      update public.user_subscriptions as us
         set plan = coalesce(p_plan, us.plan),
             status = coalesce(p_status, us.status),
             stripe_customer_id = coalesce(p_stripe_customer_id, us.stripe_customer_id),
             product_id = coalesce(p_product_id, us.product_id),
             price_id = coalesce(p_price_id, us.price_id),
             current_period_start = coalesce(p_current_period_start, us.current_period_start),
             current_period_end = coalesce(p_current_period_end, us.current_period_end),
             expires_at = coalesce(p_current_period_end, us.expires_at),
             cancel_at_period_end = coalesce(p_cancel_at_period_end, us.cancel_at_period_end),
             refund_state = coalesce(p_refund_state, us.refund_state),
             terminal_state = us.terminal_state or coalesce(p_terminal, false),
             past_due_since = case
               when p_status = 'past_due' and us.past_due_since is null then now()
               when p_status is not null and p_status <> 'past_due' then null
               else us.past_due_since
             end,
             last_stripe_event_id = p_event_id,
             last_stripe_event_at = p_event_created_at,
             last_stripe_event_type = p_event_type,
             updated_at = now()
       where us.id = v_existing.id;

      perform public.sync_subscription_approval_internal(v_existing.user_id, p_environment);
      v_action := 'updated';
    end if;
  else
    select s.*
      into v_current
      from public.user_subscriptions s
     where s.user_id = p_user_id
       and s.environment = p_environment
       and s.terminal_state = false
     order by s.created_at desc, s.id desc
     limit 1
     for update;

    if found and coalesce(p_terminal, false) = false then
      if v_current.status in ('canceled', 'unpaid', 'incomplete_expired')
         or v_current.refund_state = 'full' then
        update public.user_subscriptions as us
           set terminal_state = true,
               updated_at = now()
         where us.id = v_current.id;
      else
        raise exception 'active_subscription_conflict' using errcode = '23505';
      end if;
    end if;

    insert into public.user_subscriptions (
      user_id,
      environment,
      plan,
      status,
      approval_status,
      stripe_customer_id,
      stripe_subscription_id,
      product_id,
      price_id,
      current_period_start,
      current_period_end,
      expires_at,
      cancel_at_period_end,
      refund_state,
      terminal_state,
      last_stripe_event_id,
      last_stripe_event_at,
      last_stripe_event_type,
      past_due_since
    ) values (
      p_user_id,
      p_environment,
      coalesce(p_plan, 'free'),
      coalesce(p_status, 'incomplete'),
      'pending_email_verification',
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_product_id,
      p_price_id,
      p_current_period_start,
      p_current_period_end,
      p_current_period_end,
      coalesce(p_cancel_at_period_end, false),
      coalesce(p_refund_state, 'none'),
      coalesce(p_terminal, false),
      p_event_id,
      p_event_created_at,
      p_event_type,
      case when p_status = 'past_due' then now() else null end
    )
    returning id into v_id;

    perform public.sync_subscription_approval_internal(p_user_id, p_environment);
    v_action := 'inserted';
  end if;

  if p_request_id is not null then
    select public.complete_payment_webhook_event(
      'stripe',
      p_environment,
      p_event_id,
      p_request_id
    ) into v_completed;

    if v_completed is distinct from true then
      raise exception 'webhook_fence_lost' using errcode = '40001';
    end if;
  end if;

  return query select v_id, v_action;
end;
$$;

revoke all on function public.apply_stripe_subscription_event(
  text,text,text,timestamptz,uuid,text,text,text,text,text,text,
  timestamptz,timestamptz,boolean,boolean,text,uuid
) from public;
revoke execute on function public.apply_stripe_subscription_event(
  text,text,text,timestamptz,uuid,text,text,text,text,text,text,
  timestamptz,timestamptz,boolean,boolean,text,uuid
) from anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(
  text,text,text,timestamptz,uuid,text,text,text,text,text,text,
  timestamptz,timestamptz,boolean,boolean,text,uuid
) to service_role;

comment on function public.apply_stripe_subscription_event(
  text,text,text,timestamptz,uuid,text,text,text,text,text,text,
  timestamptz,timestamptz,boolean,boolean,text,uuid
) is
  'Phase 1E-A.2 atomic subscription mutation plus optional fenced webhook completion.';