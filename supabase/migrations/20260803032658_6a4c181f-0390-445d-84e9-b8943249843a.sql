-- Affiliate referrals (MVP)
--
-- This migration is intentionally independent from Stripe, Pix, plans and
-- subscription writes. It records immutable signup attribution and exposes
-- privacy-safe aggregates through authenticated RPCs.

create table if not exists public.affiliate_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null unique,
  status text not null default 'active',
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz not null default now(),
  paused_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_accounts_status_check
    check (status in ('active', 'paused')),
  constraint affiliate_accounts_referral_code_check
    check (
      referral_code = lower(referral_code)
      and referral_code ~ '^[a-z0-9][a-z0-9_-]{5,31}$'
    ),
  constraint affiliate_accounts_notes_length_check
    check (notes is null or char_length(notes) <= 500)
);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete restrict,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code_snapshot text not null,
  registered_at timestamptz not null,
  claimed_at timestamptz not null default now(),
  constraint affiliate_referrals_code_snapshot_check
    check (
      referral_code_snapshot = lower(referral_code_snapshot)
      and referral_code_snapshot ~ '^[a-z0-9][a-z0-9_-]{5,31}$'
    )
);

create index if not exists idx_affiliate_referrals_affiliate_registered
  on public.affiliate_referrals (affiliate_id, registered_at desc);

alter table public.affiliate_accounts enable row level security;
alter table public.affiliate_referrals enable row level security;

-- These tables are RPC-only. No authenticated role receives direct table
-- access and there are intentionally no permissive RLS policies.
revoke all on table public.affiliate_accounts from public, anon, authenticated;
revoke all on table public.affiliate_referrals from public, anon, authenticated;

drop trigger if exists tg_affiliate_accounts_updated_at on public.affiliate_accounts;
create trigger tg_affiliate_accounts_updated_at
before update on public.affiliate_accounts
for each row execute function public.tg_set_updated_at();

create or replace function public.normalize_affiliate_referral_code(_code text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select lower(trim(coalesce(_code, '')))
$$;

revoke all on function public.normalize_affiliate_referral_code(text)
  from public, anon, authenticated;

create or replace function public.admin_set_affiliate(
  _user_id uuid,
  _active boolean,
  _referral_code text default null,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_admin_id uuid := auth.uid();
  v_existing public.affiliate_accounts%rowtype;
  v_code text;
  v_notes text := nullif(left(trim(coalesce(_notes, '')), 500), '');
begin
  if v_admin_id is null
     or not public.is_admin()
     or not public.admin_has_permission('users') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if _user_id is null or not exists (select 1 from auth.users where id = _user_id) then
    raise exception 'user_not_found' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_user_id::text || ':affiliate', 0));

  select account.*
    into v_existing
    from public.affiliate_accounts account
   where account.user_id = _user_id
   for update;

  if not coalesce(_active, false) then
    if not found then
      return jsonb_build_object('ok', true, 'status', 'not_enabled');
    end if;

    update public.affiliate_accounts
       set status = 'paused',
           paused_at = coalesce(paused_at, now()),
           notes = case when _notes is null then notes else v_notes end
     where id = v_existing.id;

    return jsonb_build_object(
      'ok', true,
      'affiliate_id', v_existing.id,
      'referral_code', v_existing.referral_code,
      'status', 'paused'
    );
  end if;

  v_code := case
    when _referral_code is not null then public.normalize_affiliate_referral_code(_referral_code)
    when found then v_existing.referral_code
    else 'ff-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
  end;

  if v_code !~ '^[a-z0-9][a-z0-9_-]{5,31}$' then
    raise exception 'invalid_referral_code' using errcode = '22023';
  end if;

  if found then
    update public.affiliate_accounts
       set referral_code = v_code,
           status = 'active',
           activated_by = v_admin_id,
           activated_at = now(),
           paused_at = null,
           notes = case when _notes is null then notes else v_notes end
     where id = v_existing.id
     returning * into v_existing;
  else
    insert into public.affiliate_accounts (
      user_id, referral_code, status, activated_by, notes
    ) values (
      _user_id, v_code, 'active', v_admin_id, v_notes
    )
    returning * into v_existing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'affiliate_id', v_existing.id,
    'referral_code', v_existing.referral_code,
    'status', v_existing.status
  );
exception
  when unique_violation then
    raise exception 'referral_code_in_use' using errcode = '23505';
end;
$$;

create or replace function public.claim_affiliate_referral(_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_created_at timestamptz;
  v_code text := public.normalize_affiliate_referral_code(_referral_code);
  v_affiliate public.affiliate_accounts%rowtype;
  v_existing_affiliate_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if v_code !~ '^[a-z0-9][a-z0-9_-]{5,31}$' then
    return jsonb_build_object('claimed', false, 'status', 'invalid_or_inactive');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':referral', 0));

  select referral.affiliate_id
    into v_existing_affiliate_id
    from public.affiliate_referrals referral
   where referral.referred_user_id = v_user_id;

  if found then
    return jsonb_build_object('claimed', false, 'status', 'already_attributed');
  end if;

  select users.created_at
    into v_user_created_at
    from auth.users users
   where users.id = v_user_id;

  if v_user_created_at is null or v_user_created_at < now() - interval '24 hours' then
    return jsonb_build_object('claimed', false, 'status', 'registration_window_expired');
  end if;

  select account.*
    into v_affiliate
    from public.affiliate_accounts account
   where account.referral_code = v_code
     and account.status = 'active';

  if not found then
    return jsonb_build_object('claimed', false, 'status', 'invalid_or_inactive');
  end if;

  if v_affiliate.user_id = v_user_id then
    return jsonb_build_object('claimed', false, 'status', 'self_referral');
  end if;

  insert into public.affiliate_referrals (
    affiliate_id,
    referred_user_id,
    referral_code_snapshot,
    registered_at
  ) values (
    v_affiliate.id,
    v_user_id,
    v_code,
    v_user_created_at
  );

  return jsonb_build_object('claimed', true, 'status', 'claimed');
exception
  when unique_violation then
    return jsonb_build_object('claimed', false, 'status', 'already_attributed');
end;
$$;

create or replace function public.get_my_affiliate_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_affiliate public.affiliate_accounts%rowtype;
  v_registered bigint := 0;
  v_paid_active bigint := 0;
  v_recent bigint := 0;
  v_monthly jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select account.*
    into v_affiliate
    from public.affiliate_accounts account
   where account.user_id = v_user_id;

  if not found then
    return jsonb_build_object('eligible', false, 'status', 'not_enabled');
  end if;

  if v_affiliate.status <> 'active' then
    return jsonb_build_object('eligible', false, 'status', v_affiliate.status);
  end if;

  select
    count(*),
    count(*) filter (where referral.registered_at >= now() - interval '30 days'),
    count(*) filter (
      where exists (
        select 1
          from public.user_subscriptions subscription
         where subscription.user_id = referral.referred_user_id
           and subscription.environment = 'live'
           and subscription.plan not in ('free', 'expired')
           and subscription.status = 'active'
           and subscription.approval_status = 'approved'
           and subscription.terminal_state = false
           and subscription.access_frozen = false
           and subscription.refund_state <> 'full'
           and (
             coalesce(subscription.expires_at, subscription.current_period_end) is null
             or coalesce(subscription.expires_at, subscription.current_period_end) >= now()
           )
      )
    )
    into v_registered, v_recent, v_paid_active
    from public.affiliate_referrals referral
   where referral.affiliate_id = v_affiliate.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', to_char(months.month_start, 'YYYY-MM'),
      'registrations', months.registrations
    ) order by months.month_start
  ), '[]'::jsonb)
    into v_monthly
    from (
      select series.month_start, count(referral.id)::bigint as registrations
        from generate_series(
          date_trunc('month', now()) - interval '5 months',
          date_trunc('month', now()),
          interval '1 month'
        ) as series(month_start)
        left join public.affiliate_referrals referral
          on referral.affiliate_id = v_affiliate.id
         and referral.registered_at >= series.month_start
         and referral.registered_at < series.month_start + interval '1 month'
       group by series.month_start
    ) months;

  return jsonb_build_object(
    'eligible', true,
    'status', v_affiliate.status,
    'referral_code', v_affiliate.referral_code,
    'registered_count', v_registered,
    'paid_active_count', v_paid_active,
    'not_active_count', greatest(v_registered - v_paid_active, 0),
    'registrations_last_30_days', v_recent,
    'conversion_rate', case
      when v_registered = 0 then 0
      else round((v_paid_active::numeric * 100) / v_registered::numeric, 1)
    end,
    'monthly_registrations', v_monthly
  );
end;
$$;

create or replace function public.admin_affiliate_overview()
returns table (
  affiliate_id uuid,
  user_id uuid,
  email text,
  display_name text,
  referral_code text,
  status text,
  activated_at timestamptz,
  registered_count bigint,
  paid_active_count bigint,
  not_active_count bigint,
  conversion_rate numeric,
  last_referral_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if auth.uid() is null
     or not public.is_admin()
     or not public.admin_has_permission('users') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
  select
    account.id,
    account.user_id,
    users.email::text,
    profile.display_name,
    account.referral_code,
    account.status,
    account.activated_at,
    metrics.registered_count,
    metrics.paid_active_count,
    greatest(metrics.registered_count - metrics.paid_active_count, 0)::bigint,
    case
      when metrics.registered_count = 0 then 0::numeric
      else round((metrics.paid_active_count::numeric * 100) / metrics.registered_count::numeric, 1)
    end,
    metrics.last_referral_at
  from public.affiliate_accounts account
  join auth.users users on users.id = account.user_id
  left join public.profiles profile on profile.id = account.user_id
  cross join lateral (
    select
      count(*)::bigint as registered_count,
      count(*) filter (
        where exists (
          select 1
            from public.user_subscriptions subscription
           where subscription.user_id = referral.referred_user_id
             and subscription.environment = 'live'
             and subscription.plan not in ('free', 'expired')
             and subscription.status = 'active'
             and subscription.approval_status = 'approved'
             and subscription.terminal_state = false
             and subscription.access_frozen = false
             and subscription.refund_state <> 'full'
             and (
               coalesce(subscription.expires_at, subscription.current_period_end) is null
               or coalesce(subscription.expires_at, subscription.current_period_end) >= now()
             )
        )
      )::bigint as paid_active_count,
      max(referral.registered_at) as last_referral_at
    from public.affiliate_referrals referral
    where referral.affiliate_id = account.id
  ) metrics
  order by (account.status = 'active') desc, metrics.registered_count desc, account.activated_at desc;
end;
$$;

revoke all on function public.admin_set_affiliate(uuid, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_affiliate_referral(text)
  from public, anon, authenticated;
revoke all on function public.get_my_affiliate_dashboard()
  from public, anon, authenticated;
revoke all on function public.admin_affiliate_overview()
  from public, anon, authenticated;

grant execute on function public.admin_set_affiliate(uuid, boolean, text, text)
  to authenticated, service_role;
grant execute on function public.claim_affiliate_referral(text)
  to authenticated, service_role;
grant execute on function public.get_my_affiliate_dashboard()
  to authenticated, service_role;
grant execute on function public.admin_affiliate_overview()
  to authenticated, service_role;

comment on table public.affiliate_accounts is
  'Admin-enabled affiliate accounts. Direct customer access is denied; use RPCs.';
comment on table public.affiliate_referrals is
  'Immutable one-affiliate-per-user signup attribution. No payment data is copied.';
comment on function public.claim_affiliate_referral(text) is
  'Claims one active referral code for a newly registered authenticated user within 24 hours.';
comment on function public.get_my_affiliate_dashboard() is
  'Returns privacy-safe aggregate referral metrics for the current active affiliate.';