-- Reset clean policies for post-images bucket on storage.objects
DROP POLICY IF EXISTS "users upload own post images" ON storage.objects;
DROP POLICY IF EXISTS "users update own post images" ON storage.objects;
DROP POLICY IF EXISTS "users delete own post images" ON storage.objects;
DROP POLICY IF EXISTS "public read post images" ON storage.objects;

-- Public can read (bucket is public)
CREATE POLICY "post-images public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-images');

-- Authenticated users can upload to their own folder
CREATE POLICY "post-images auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-images'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users can update their own files
CREATE POLICY "post-images auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'post-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'post-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users can delete their own files
CREATE POLICY "post-images auth delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'post-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Same hardening for template-backgrounds bucket
DROP POLICY IF EXISTS "Users upload own template bg" ON storage.objects;
DROP POLICY IF EXISTS "Users update own template bg" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own template bg" ON storage.objects;
DROP POLICY IF EXISTS "Anyone read template bg" ON storage.objects;

CREATE POLICY "template-bg public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'template-backgrounds');

CREATE POLICY "template-bg auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'template-backgrounds'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "template-bg auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'template-backgrounds'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'template-backgrounds'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "template-bg auth delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'template-backgrounds'
  AND (storage.foldername(name))[1] = auth.uid()::text
);