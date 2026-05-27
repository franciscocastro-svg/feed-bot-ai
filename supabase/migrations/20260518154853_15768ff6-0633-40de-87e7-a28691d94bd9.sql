
CREATE TABLE public.creator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  niche_detail text,
  target_audience text,
  voice_tone text,
  expertise_summary text,
  signature_phrases text[] NOT NULL DEFAULT '{}',
  forbidden_words text[] NOT NULL DEFAULT '{}',
  cta_style text,
  example_posts text[] NOT NULL DEFAULT '{}',
  extra_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own creator_profile" ON public.creator_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_creator_profiles_updated
  BEFORE UPDATE ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
