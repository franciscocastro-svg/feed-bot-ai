-- Backfill legacy rows so account-scoped templates are respected by every
-- rendering path: preview, browser generation, worker and scheduler.

UPDATE public.news_items AS news
SET instagram_account_id = scheduled.instagram_account_id
FROM (
  SELECT DISTINCT ON (news_item_id)
    news_item_id,
    instagram_account_id
  FROM public.scheduled_posts
  WHERE news_item_id IS NOT NULL
    AND instagram_account_id IS NOT NULL
  ORDER BY news_item_id, scheduled_for DESC
) AS scheduled
WHERE news.id = scheduled.news_item_id
  AND news.instagram_account_id IS NULL;

UPDATE public.user_settings AS settings
SET default_feed_template_id = settings.default_template_id
FROM public.post_templates AS template
WHERE settings.default_feed_template_id IS NULL
  AND settings.default_template_id = template.id
  AND COALESCE(template.format, 'feed') = 'feed';

UPDATE public.user_settings AS settings
SET default_story_template_id = settings.default_template_id
FROM public.post_templates AS template
WHERE settings.default_story_template_id IS NULL
  AND settings.default_template_id = template.id
  AND COALESCE(template.format, 'feed') = 'stories';

UPDATE public.user_settings AS settings
SET default_reel_template_id = settings.default_template_id
FROM public.post_templates AS template
WHERE settings.default_reel_template_id IS NULL
  AND settings.default_template_id = template.id
  AND COALESCE(template.format, 'feed') = 'reels';

UPDATE public.account_settings AS settings
SET default_feed_template_id = settings.default_template_id
FROM public.post_templates AS template
WHERE settings.default_feed_template_id IS NULL
  AND settings.default_template_id = template.id
  AND COALESCE(template.format, 'feed') = 'feed';

UPDATE public.account_settings AS settings
SET default_story_template_id = settings.default_template_id
FROM public.post_templates AS template
WHERE settings.default_story_template_id IS NULL
  AND settings.default_template_id = template.id
  AND COALESCE(template.format, 'feed') = 'stories';

UPDATE public.account_settings AS settings
SET default_reel_template_id = settings.default_template_id
FROM public.post_templates AS template
WHERE settings.default_reel_template_id IS NULL
  AND settings.default_template_id = template.id
  AND COALESCE(template.format, 'feed') = 'reels';
