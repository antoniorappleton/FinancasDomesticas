-- FIX: Drop the previous incorrect policies first to avoid conflicts
DROP POLICY IF EXISTS "Users can upload their own background" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own background" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own background" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;

-- 1. Insert Policy (Corrected for 'bg/' prefix)
CREATE POLICY "Users can upload their own background"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-assets' AND 
  name LIKE 'bg/' || auth.uid() || '/%'
);

-- 2. Update Policy
CREATE POLICY "Users can update their own background"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-assets' AND 
  name LIKE 'bg/' || auth.uid() || '/%'
);

-- 3. Delete Policy
CREATE POLICY "Users can delete their own background"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-assets' AND 
  name LIKE 'bg/' || auth.uid() || '/%'
);

-- 4. Select Policy (Public)
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-assets');
