-- Phase 1E-A.2/ii-c — dual-environment checkout activation hotfix.
--
-- The original schema allowed only one subscription row per user. The payment
-- model now keeps sandbox and live subscriptions independently, so that legacy
-- constraint rejects the first live subscription for users who already own the
-- sandbox row created at signup.

do $$
begin
  if exists (
    select 1
      from public.user_subscriptions
     where terminal_state = false
     group by user_id, environment
    having count(*) > 1
  ) then
    raise exception 'duplicate active subscription rows by user/environment';
  end if;
end
$$;

create unique index if not exists uq_user_subscriptions_current
  on public.user_subscriptions (user_id, environment)
  where terminal_state = false;

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_user_id_key;

create index if not exists idx_user_subscriptions_user_environment_recent
  on public.user_subscriptions (user_id, environment, created_at desc, id desc);

-- The mailer stores a SHA-256 digest. Keep verification atomic and scoped to
-- the paid environment; never mutate auth.users from this payment flow.
create or replace function public.verify_email_code(
  _code text,
  _environment text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
  v_code record;
  v_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if _environment not in ('sandbox', 'live') then
    return jsonb_build_object('ok', false, 'error', 'invalid_environment');
  end if;
  if _code is null or _code !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select s.* into v_sub
    from public.user_subscriptions s
   where s.user_id = v_uid
     and s.environment = _environment
     and s.terminal_state = false
   order by s.created_at desc, s.id desc
   limit 1
   for update;

  if not found or v_sub.approval_status not in ('pending_email_verification', 'approved') then
    return jsonb_build_object('ok', false, 'error', 'payment_required');
  end if;
  if v_sub.approval_status = 'approved' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_sub.verification_blocked_until is not null
     and v_sub.verification_blocked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'error', 'blocked',
      'retry_after', extract(epoch from (v_sub.verification_blocked_until - now()))::integer
    );
  end if;

  select c.* into v_code
    from public.email_verification_codes c
   where c.user_id = v_uid
     and c.used_at is null
   order by c.created_at desc, c.id desc
   limit 1
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_code');
  end if;
  if v_code.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_code.attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'blocked', 'retry_after', 900);
  end if;

  v_hash := encode(extensions.digest(_code, 'sha256'), 'hex');
  if v_hash <> v_code.code_hash then
    update public.email_verification_codes
       set attempts = attempts + 1
     where id = v_code.id;
    update public.user_subscriptions
       set verification_attempts = case
             when verification_attempts + 1 >= 5 then 0
             else verification_attempts + 1
           end,
           verification_blocked_until = case
             when verification_attempts + 1 >= 5 then now() + interval '15 minutes'
             else verification_blocked_until
           end,
           updated_at = now()
     where id = v_sub.id;
    if v_sub.verification_attempts + 1 >= 5 then
      return jsonb_build_object('ok', false, 'error', 'blocked', 'retry_after', 900);
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.email_verification_codes
     set used_at = now()
   where id = v_code.id
     and used_at is null;

  update public.user_subscriptions
     set payment_email_verified_at = coalesce(payment_email_verified_at, now()),
         verification_attempts = 0,
         verification_blocked_until = null,
         updated_at = now()
   where id = v_sub.id
     and approval_status not in ('rejected', 'blocked');

  perform public.sync_subscription_approval_internal(v_uid, _environment);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.verify_email_code(text, text) from public, anon;
grant execute on function public.verify_email_code(text, text) to authenticated, service_role;

-- Keep the legacy zero-argument admin RPC deterministic after a user starts
-- having one row per environment. Production/live wins; sandbox is the safe
-- fallback for users who have not subscribed in live yet.
create or replace function public.admin_overview()
returns table (
  user_id uuid, email text, display_name text, created_at timestamptz,
  plan text, sub_status text, approval_status text, expires_at timestamptz,
  auto_approve boolean, ig_accounts bigint, ig_token_expires timestamptz,
  sources_active bigint, news_pending bigint, posts_scheduled bigint,
  posts_published bigint, posts_failed bigint, last_activity timestamptz
) language sql stable security definer set search_path = public, auth
as $$
  select u.id, u.email::text, p.display_name, u.created_at,
    coalesce(s.plan, 'free'), coalesce(s.status, 'active'),
    coalesce(s.approval_status, 'pending_payment'), s.expires_at,
    coalesce(us.auto_approve, false),
    (select count(*) from public.instagram_accounts ia where ia.user_id = u.id and ia.active),
    (select max(ia.token_expires_at) from public.instagram_accounts ia where ia.user_id = u.id and ia.active),
    (select count(*) from public.news_sources ns where ns.user_id = u.id and ns.active),
    (select count(*) from public.news_items ni where ni.user_id = u.id and ni.status = 'pending'),
    (select count(*) from public.scheduled_posts sp where sp.user_id = u.id and sp.status = 'scheduled'),
    (select count(*) from public.scheduled_posts sp where sp.user_id = u.id and sp.status = 'posted'),
    (select count(*) from public.scheduled_posts sp where sp.user_id = u.id and sp.status = 'failed'),
    (select max(al.created_at) from public.activity_logs al where al.user_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join lateral (
    select candidate.*
      from public.user_subscriptions candidate
     where candidate.user_id = u.id
     order by
       (candidate.environment = 'live') desc,
       candidate.terminal_state asc,
       candidate.created_at desc,
       candidate.id desc
     limit 1
  ) s on true
  left join public.user_settings us on us.user_id = u.id
  where public.is_admin()
  order by (coalesce(s.approval_status, 'pending_payment') <> 'approved') desc,
           u.created_at desc;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated, service_role;