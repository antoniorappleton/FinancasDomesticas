-- Enable RLS on storage.objects if not already enabled (usually is by default)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 1. Allow Upload (INSERT) for authenticated users to their own folder
CREATE POLICY "Users can upload their own background"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Allow Update (Overwrite) for authenticated users to their own folder
CREATE POLICY "Users can update their own background"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Allow View (SELECT) - Required for listing or logical checks, 
-- though public URL downloads bypass this if bucket is public.
-- We'll allow public view for simplicity since the bucket is public.
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-assets');

-- 4. Allow Delete
CREATE POLICY "Users can delete their own background"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
