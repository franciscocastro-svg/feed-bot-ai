ALTER TABLE public.instagram_accounts ADD COLUMN IF NOT EXISTS custom_hashtags text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.instagram_accounts
SET custom_hashtags = ARRAY['futebol','football','brasileirao','viral','reels']
WHERE id = 'b066f30a-e930-44ed-96f6-b150407b6c10';