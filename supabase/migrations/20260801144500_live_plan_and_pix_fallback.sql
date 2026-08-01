-- Production plan resolution must never fall back to sandbox. This legacy RPC
-- still feeds quota/resource functions, so keep its answer aligned with the
-- live entitlement rules used by compute_subscription_access.
create or replace function public.get_user_plan(_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_subscription public.user_subscriptions%rowtype;
  v_caller_id uuid := auth.uid();
  v_caller_role text := coalesce(auth.jwt() ->> 'role', '');
  v_email_confirmed_at timestamptz;
  v_access_expires_at timestamptz;
begin
  if v_caller_role <> 'service_role'
     and (v_caller_id is null
          or (v_caller_id <> _user_id and not public.is_admin())) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select subscription.*
    into v_subscription
    from public.user_subscriptions subscription
   where subscription.user_id = _user_id
     and subscription.environment = 'live'
     and subscription.terminal_state = false
   order by subscription.created_at desc, subscription.id desc
   limit 1;

  if not found then
    return 'free';
  end if;

  if coalesce(v_subscription.plan, 'free') = 'free' then
    if v_subscription.created_at < now() - interval '7 days' then
      return 'expired';
    end if;
    return 'free';
  end if;

  if v_subscription.plan = 'expired'
     or v_subscription.status not in ('active', 'trialing', 'past_due')
     or v_subscription.approval_status <> 'approved'
     or v_subscription.refund_state = 'full'
     or v_subscription.access_frozen = true then
    return 'expired';
  end if;

  select users.email_confirmed_at
    into v_email_confirmed_at
    from auth.users users
   where users.id = _user_id;

  if v_email_confirmed_at is null
     and v_subscription.payment_email_verified_at is null then
    return 'expired';
  end if;

  v_access_expires_at := coalesce(
    v_subscription.expires_at,
    v_subscription.current_period_end
  );

  if v_subscription.status <> 'past_due'
     and v_access_expires_at is not null
     and v_access_expires_at <= now() then
    return 'expired';
  end if;

  if v_subscription.status = 'past_due'
     and (v_subscription.past_due_since is null
          or v_subscription.past_due_since <= now() - interval '72 hours') then
    return 'expired';
  end if;

  return v_subscription.plan;
end;
$$;

revoke all on function public.get_user_plan(uuid) from public, anon;
grant execute on function public.get_user_plan(uuid) to authenticated, service_role;

comment on function public.get_user_plan(uuid) is
  'Resolves quota plan from the latest nonterminal live subscription only; sandbox never leaks into production.';

-- A failed/terminal Stripe attempt may safely be replaced by manual Pix. An
-- active, trialing, past_due, paused or incomplete Stripe subscription still
-- requires cancellation in Stripe first, preventing duplicate billing.
create or replace function public.admin_upsert_pix_subscription(
  _user_id uuid,
  _plan text,
  _amount_paid_brl numeric,
  _duration_months integer default 1,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin_id uuid := auth.uid();
  v_caller_role text := coalesce(auth.jwt() ->> 'role', '');
  v_existing public.user_subscriptions%rowtype;
  v_has_existing boolean := false;
  v_replaced_stripe_id uuid := null;
  v_subscription_id uuid;
  v_expires_at timestamptz;
  v_action text;
  v_notes text := nullif(left(trim(coalesce(_notes, '')), 500), '');
begin
  if v_caller_role <> 'service_role'
     and (v_admin_id is null
          or not public.is_admin()
          or not public.admin_has_permission('finance')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = _user_id) then
    raise exception 'user_not_found' using errcode = '22023';
  end if;

  if _plan is null
     or _plan in ('free', 'expired')
     or not exists (select 1 from public.plan_limits where plan = _plan) then
    raise exception 'invalid_paid_plan' using errcode = '22023';
  end if;

  if _amount_paid_brl is null or _amount_paid_brl <= 0 or _amount_paid_brl > 1000000 then
    raise exception 'invalid_pix_amount' using errcode = '22023';
  end if;

  if _duration_months <> 1 then
    raise exception 'invalid_pix_duration' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_user_id::text || ':live:pix', 0));

  select subscription.*
    into v_existing
    from public.user_subscriptions subscription
   where subscription.user_id = _user_id
     and subscription.environment = 'live'
     and subscription.terminal_state = false
   order by subscription.created_at desc, subscription.id desc
   limit 1
   for update;
  v_has_existing := found;

  if v_has_existing
     and (v_existing.stripe_customer_id is not null
          or v_existing.stripe_subscription_id is not null) then
    if v_existing.status in ('canceled', 'unpaid', 'incomplete_expired') then
      v_replaced_stripe_id := v_existing.id;

      update public.user_subscriptions
         set terminal_state = true,
             access_frozen = true,
             approval_status = 'rejected',
             approval_reason = 'replaced_by_manual_pix',
             updated_at = now()
       where id = v_existing.id;

      v_has_existing := false;
    else
      raise exception 'live_stripe_subscription_exists' using errcode = '23505';
    end if;
  end if;

  v_expires_at := case
    when v_has_existing
      and v_existing.manual_payment_method = 'pix'
      and coalesce(v_existing.expires_at, v_existing.current_period_end) > now()
      then coalesce(v_existing.expires_at, v_existing.current_period_end) + interval '1 month'
    else now() + interval '1 month'
  end;

  if v_has_existing then
    update public.user_subscriptions
       set plan = _plan,
           status = 'active',
           approval_status = 'approved',
           approval_reason = 'manual_pix',
           approved_at = now(),
           environment = 'live',
           current_period_start = now(),
           current_period_end = v_expires_at,
           expires_at = v_expires_at,
           cancel_at_period_end = false,
           payment_email_verified_at = coalesce(payment_email_verified_at, now()),
           past_due_since = null,
           refund_state = 'none',
           access_frozen = false,
           terminal_state = false,
           stripe_customer_id = null,
           stripe_subscription_id = null,
           product_id = null,
           price_id = null,
           last_stripe_event_id = null,
           last_stripe_event_at = null,
           last_stripe_event_type = null,
           manual_payment_method = 'pix',
           manual_amount_paid_brl = round(_amount_paid_brl, 2),
           manual_payment_recorded_at = now(),
           manual_payment_recorded_by = v_admin_id,
           notes = v_notes,
           updated_at = now()
     where id = v_existing.id
     returning id into v_subscription_id;
    v_action := 'renewed';
  else
    insert into public.user_subscriptions (
      user_id,
      plan,
      status,
      approval_status,
      approval_reason,
      approved_at,
      environment,
      current_period_start,
      current_period_end,
      expires_at,
      cancel_at_period_end,
      payment_email_verified_at,
      refund_state,
      access_frozen,
      terminal_state,
      manual_payment_method,
      manual_amount_paid_brl,
      manual_payment_recorded_at,
      manual_payment_recorded_by,
      notes
    ) values (
      _user_id,
      _plan,
      'active',
      'approved',
      'manual_pix',
      now(),
      'live',
      now(),
      v_expires_at,
      v_expires_at,
      false,
      now(),
      'none',
      false,
      false,
      'pix',
      round(_amount_paid_brl, 2),
      now(),
      v_admin_id,
      v_notes
    ) returning id into v_subscription_id;

    v_action := case
      when v_replaced_stripe_id is not null then 'converted_from_failed_stripe'
      else 'created'
    end;
  end if;

  insert into public.activity_logs (user_id, action, entity_type, entity_id, details)
  values (
    _user_id,
    'pix_subscription_' || v_action,
    'user_subscription',
    v_subscription_id,
    jsonb_build_object(
      'environment', 'live',
      'plan', _plan,
      'amount_paid_brl', round(_amount_paid_brl, 2),
      'duration_months', 1,
      'expires_at', v_expires_at,
      'recorded_by', v_admin_id,
      'replaced_stripe_subscription_row', v_replaced_stripe_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'subscription_id', v_subscription_id,
    'environment', 'live',
    'payment_method', 'pix',
    'plan', _plan,
    'amount_paid_brl', round(_amount_paid_brl, 2),
    'expires_at', v_expires_at,
    'replaced_stripe_subscription_row', v_replaced_stripe_id
  );
end;
$$;

revoke all on function public.admin_upsert_pix_subscription(uuid, text, numeric, integer, text) from public, anon;
grant execute on function public.admin_upsert_pix_subscription(uuid, text, numeric, integer, text) to authenticated, service_role;

comment on function public.admin_upsert_pix_subscription(uuid, text, numeric, integer, text) is
  'Creates or renews one-month live Pix access; replaces only terminal Stripe failures and never overwrites an active Stripe subscription.';

notify pgrst, 'reload schema';
