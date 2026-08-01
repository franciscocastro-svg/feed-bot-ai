-- =============================================================================
-- Manual Pix subscriptions are production billing records.
--
-- Stripe does not provide recurring Pix for this product. Administrators can
-- therefore record a verified Pix payment, but the resulting entitlement must
-- always live in the `live` environment and must never require Stripe IDs.
-- =============================================================================

alter table public.user_subscriptions
  add column if not exists manual_payment_method text,
  add column if not exists manual_amount_paid_brl numeric(12, 2),
  add column if not exists manual_payment_recorded_at timestamptz,
  add column if not exists manual_payment_recorded_by uuid references auth.users(id) on delete set null;

-- Existing paid rows without Stripe identifiers are the legacy manual/Pix
-- records. Preserve them and make their origin explicit when a catalog price is
-- available. No environment is changed by this backfill.
update public.user_subscriptions as subscription
   set manual_payment_method = 'pix',
       manual_amount_paid_brl = limits.price_brl,
       manual_payment_recorded_at = coalesce(subscription.updated_at, subscription.created_at)
  from public.plan_limits as limits
 where subscription.plan = limits.plan
   and limits.price_brl is not null
   and limits.price_brl > 0
   and subscription.plan not in ('free', 'expired')
   and subscription.stripe_customer_id is null
   and subscription.stripe_subscription_id is null
   and subscription.manual_payment_method is null;

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_manual_payment_method_check,
  add constraint user_subscriptions_manual_payment_method_check
    check (manual_payment_method is null or manual_payment_method = 'pix'),
  drop constraint if exists user_subscriptions_manual_pix_amount_check,
  add constraint user_subscriptions_manual_pix_amount_check
    check (
      manual_payment_method is null
      or (manual_amount_paid_brl is not null and manual_amount_paid_brl > 0)
    ),
  drop constraint if exists user_subscriptions_manual_pix_without_stripe_check,
  add constraint user_subscriptions_manual_pix_without_stripe_check
    check (
      manual_payment_method is null
      or (stripe_customer_id is null and stripe_subscription_id is null)
    );

comment on column public.user_subscriptions.manual_payment_method is
  'Manual payment origin. Currently only pix is accepted; NULL means non-manual.';
comment on column public.user_subscriptions.manual_amount_paid_brl is
  'Amount confirmed by an administrator for a manual Pix payment.';
comment on column public.user_subscriptions.manual_payment_recorded_at is
  'Timestamp when the manual Pix payment was confirmed.';
comment on column public.user_subscriptions.manual_payment_recorded_by is
  'Administrator who confirmed the manual Pix payment.';

-- If a manual row is ever adopted by a Stripe event, Stripe becomes the source
-- of truth and stale Pix metadata must not survive or violate the constraints.
create or replace function public.normalize_subscription_payment_origin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stripe_customer_id is not null or new.stripe_subscription_id is not null then
    new.manual_payment_method := null;
    new.manual_amount_paid_brl := null;
    new.manual_payment_recorded_at := null;
    new.manual_payment_recorded_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_subscription_payment_origin() from public, anon, authenticated;

drop trigger if exists normalize_subscription_payment_origin on public.user_subscriptions;
create trigger normalize_subscription_payment_origin
before insert or update of stripe_customer_id, stripe_subscription_id
on public.user_subscriptions
for each row execute function public.normalize_subscription_payment_origin();

-- Production-oriented admin listing. It intentionally does not fall back to a
-- sandbox row as if that row were a live entitlement; instead it exposes that a
-- sandbox record exists so the UI can warn the administrator.
create or replace function public.admin_subscription_overview()
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  subscription_id uuid,
  plan text,
  sub_status text,
  approval_status text,
  expires_at timestamptz,
  subscription_environment text,
  payment_method text,
  amount_paid_brl numeric,
  has_live_subscription boolean,
  has_sandbox_subscription boolean,
  auto_approve boolean,
  ig_accounts bigint,
  ig_token_expires timestamptz,
  sources_active bigint,
  news_pending bigint,
  posts_scheduled bigint,
  posts_published bigint,
  posts_failed bigint,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    users.id,
    users.email::text,
    profiles.display_name,
    users.created_at,
    live_subscription.id,
    coalesce(live_subscription.plan, 'free'),
    coalesce(live_subscription.status, 'inactive'),
    coalesce(live_subscription.approval_status, 'pending_payment'),
    coalesce(live_subscription.expires_at, live_subscription.current_period_end),
    'live'::text,
    case
      when live_subscription.manual_payment_method = 'pix' then 'pix'::text
      when live_subscription.stripe_customer_id is not null
        or live_subscription.stripe_subscription_id is not null then 'stripe'::text
      else null::text
    end,
    live_subscription.manual_amount_paid_brl,
    (live_subscription.id is not null),
    exists (
      select 1
        from public.user_subscriptions sandbox_subscription
       where sandbox_subscription.user_id = users.id
         and sandbox_subscription.environment = 'sandbox'
         and sandbox_subscription.terminal_state = false
    ),
    coalesce(settings.auto_approve, false),
    (select count(*) from public.instagram_accounts account where account.user_id = users.id and account.active),
    (select max(account.token_expires_at) from public.instagram_accounts account where account.user_id = users.id and account.active),
    (select count(*) from public.news_sources source where source.user_id = users.id and source.active),
    (select count(*) from public.news_items item where item.user_id = users.id and item.status = 'pending'),
    (select count(*) from public.scheduled_posts post where post.user_id = users.id and post.status = 'scheduled'),
    (select count(*) from public.scheduled_posts post where post.user_id = users.id and post.status = 'posted'),
    (select count(*) from public.scheduled_posts post where post.user_id = users.id and post.status = 'failed'),
    (select max(log.created_at) from public.activity_logs log where log.user_id = users.id)
  from auth.users users
  left join public.profiles profiles on profiles.id = users.id
  left join lateral (
    select candidate.*
      from public.user_subscriptions candidate
     where candidate.user_id = users.id
       and candidate.environment = 'live'
       and candidate.terminal_state = false
     order by candidate.created_at desc, candidate.id desc
     limit 1
  ) live_subscription on true
  left join public.user_settings settings on settings.user_id = users.id
  where public.is_admin()
  order by (live_subscription.id is null) desc,
           (coalesce(live_subscription.approval_status, 'pending_payment') <> 'approved') desc,
           users.created_at desc;
$$;

revoke all on function public.admin_subscription_overview() from public, anon;
grant execute on function public.admin_subscription_overview() to authenticated, service_role;

comment on function public.admin_subscription_overview() is
  'Admin production billing overview. Live never falls back to sandbox.';

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

  if found
     and (v_existing.stripe_customer_id is not null
          or v_existing.stripe_subscription_id is not null) then
    raise exception 'live_stripe_subscription_exists' using errcode = '23505';
  end if;

  v_expires_at := case
    when found
      and v_existing.manual_payment_method = 'pix'
      and coalesce(v_existing.expires_at, v_existing.current_period_end) > now()
      then coalesce(v_existing.expires_at, v_existing.current_period_end) + interval '1 month'
    else now() + interval '1 month'
  end;

  if found then
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
    v_action := 'created';
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
      'recorded_by', v_admin_id
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
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.admin_upsert_pix_subscription(uuid, text, numeric, integer, text) from public, anon;
grant execute on function public.admin_upsert_pix_subscription(uuid, text, numeric, integer, text) to authenticated, service_role;

comment on function public.admin_upsert_pix_subscription(uuid, text, numeric, integer, text) is
  'Creates or renews a one-month manual Pix entitlement in live. Never overwrites Stripe.';
