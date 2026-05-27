UPDATE public.news_sources
SET translate_to_pt = true, cultural_adaptation = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'ferramentasempresa001@gmail.com')
  AND (translate_to_pt = false OR cultural_adaptation = false);