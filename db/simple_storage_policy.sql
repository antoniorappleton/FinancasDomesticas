-- SIMPLIFIED POLICY: Fix "Violates Row-Level Security" error
-- Allows authenticated users to upload ANY file to 'user-assets', ignoring folder structure.

-- 1. Drop strict policies
DROP POLICY IF EXISTS "Users can upload their own background" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own background" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own background" ON storage.objects;

-- 2. Create Permissive Policies (Authenticated Only)
CREATE POLICY "Users can upload to user-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'user-assets');

CREATE POLICY "Users can update in user-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'user-assets');

CREATE POLICY "Users can delete in user-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'user-assets');

-- 3. Ensure Select is open
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-assets');
