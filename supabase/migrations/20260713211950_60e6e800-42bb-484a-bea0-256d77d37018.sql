-- Revoke default anon/authenticated EXECUTE from backend-only functions.
revoke execute on function public.sync_subscription_approval_internal(uuid,text) from anon, authenticated;
revoke execute on function public.sync_subscription_approval(uuid,text)          from anon, authenticated;
revoke execute on function public.apply_stripe_subscription_event(
  text,text,text,timestamptz,uuid,text,text,text,text,text,text,
  timestamptz,timestamptz,boolean,boolean,text,uuid
) from anon, authenticated;
revoke execute on function public.try_claim_payment_webhook_effect(text,text,text,text,uuid) from anon, authenticated;
revoke execute on function public.complete_payment_webhook_effect(text,text,text,text,uuid,text) from anon, authenticated;
revoke execute on function public.fail_payment_webhook_effect(text,text,text,text,uuid,text)     from anon, authenticated;
revoke execute on function public.recover_expired_webhook_claims(text,integer)                    from anon, authenticated;

-- Also revoke anon EXECUTE from the intentionally-authenticated functions
-- (leave authenticated + service_role).
revoke execute on function public.compute_subscription_access(uuid,text)         from anon;
revoke execute on function public.reconcile_my_subscription_approval(text)       from anon;
revoke execute on function public.verify_email_code(text,text)                   from anon;
