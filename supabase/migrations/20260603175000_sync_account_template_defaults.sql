-- The Templates page manages global defaults. Account-level template overrides are
-- not exposed in the UI, so keep existing account settings aligned with them.
UPDATE public.account_settings AS account
SET
  default_template_id = COALESCE(settings.default_template_id, account.default_template_id),
  default_feed_template_id = COALESCE(settings.default_feed_template_id, settings.default_template_id, account.default_feed_template_id),
  default_story_template_id = COALESCE(settings.default_story_template_id, settings.default_template_id, account.default_story_template_id),
  default_reel_template_id = COALESCE(settings.default_reel_template_id, settings.default_template_id, account.default_reel_template_id),
  updated_at = now()
FROM public.user_settings AS settings
WHERE account.user_id = settings.user_id
  AND (
    account.default_template_id IS DISTINCT FROM COALESCE(settings.default_template_id, account.default_template_id)
    OR account.default_feed_template_id IS DISTINCT FROM COALESCE(settings.default_feed_template_id, settings.default_template_id, account.default_feed_template_id)
    OR account.default_story_template_id IS DISTINCT FROM COALESCE(settings.default_story_template_id, settings.default_template_id, account.default_story_template_id)
    OR account.default_reel_template_id IS DISTINCT FROM COALESCE(settings.default_reel_template_id, settings.default_template_id, account.default_reel_template_id)
  );
