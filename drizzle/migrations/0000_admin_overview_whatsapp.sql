DROP FUNCTION IF EXISTS public.admin_subscription_overview();

CREATE OR REPLACE FUNCTION public.admin_subscription_overview()
 RETURNS TABLE(user_id uuid, email text, display_name text, whatsapp text, created_at timestamp with time zone, subscription_id uuid, plan text, sub_status text, approval_status text, expires_at timestamp with time zone, subscription_environment text, payment_method text, amount_paid_brl numeric, has_live_subscription boolean, has_sandbox_subscription boolean, auto_approve boolean, ig_accounts bigint, ig_token_expires timestamp with time zone, sources_active bigint, news_pending bigint, posts_scheduled bigint, posts_published bigint, posts_failed bigint, last_activity timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select
    users.id,
    users.email::text,
    profiles.display_name,
    profiles.whatsapp,
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
$function$;

GRANT EXECUTE ON FUNCTION public.admin_subscription_overview() TO authenticated;