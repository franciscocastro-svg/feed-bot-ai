
-- Add image_url to support_messages
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS image_url text;

-- Update existing CHECK constraint to allow image-only messages
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'public.support_messages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%body%audio_url%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.support_messages DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_has_content
  CHECK (
    (body IS NOT NULL AND length(btrim(body)) > 0)
    OR audio_url IS NOT NULL
    OR image_url IS NOT NULL
  );

-- Create private support-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-images', 'support-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: ticket owner or admin can read
CREATE POLICY "support-images read own or admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'support-images'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.user_id = auth.uid()
      )
    )
  );

-- Ticket owner or admin can upload into their ticket folder
CREATE POLICY "support-images insert own or admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'support-images'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.user_id = auth.uid()
      )
    )
  );
