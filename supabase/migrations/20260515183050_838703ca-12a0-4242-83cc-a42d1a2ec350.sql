
CREATE TABLE public.release_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text,
  title text NOT NULL,
  content text NOT NULL,
  highlight boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authenticated views published releases"
ON public.release_notes FOR SELECT
TO authenticated
USING (published = true OR public.is_admin());

CREATE POLICY "admins manage releases"
ON public.release_notes FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER tg_release_notes_updated_at
BEFORE UPDATE ON public.release_notes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.user_release_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  release_id uuid NOT NULL REFERENCES public.release_notes(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, release_id)
);

ALTER TABLE public.user_release_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own release views select"
ON public.user_release_views FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "own release views insert"
ON public.user_release_views FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_release_notes_published ON public.release_notes(published, published_at DESC);
CREATE INDEX idx_user_release_views_user ON public.user_release_views(user_id);

CREATE OR REPLACE FUNCTION public.get_unseen_releases()
RETURNS SETOF public.release_notes
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.* FROM public.release_notes r
  WHERE r.published = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_release_views v
      WHERE v.release_id = r.id AND v.user_id = auth.uid()
    )
  ORDER BY r.published_at DESC NULLS LAST, r.created_at DESC;
$$;
