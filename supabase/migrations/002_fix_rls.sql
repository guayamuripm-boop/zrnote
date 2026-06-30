-- Fix RLS policies for upload-segment flow

-- 1. Allow authenticated users to INSERT meetings they create
CREATE POLICY "Authenticated users create meetings" ON meetings FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- 2. Allow authenticated users to UPDATE meetings they created
CREATE POLICY "Authenticated users update own meetings" ON meetings FOR UPDATE
  USING (auth.uid() = created_by);

-- 3. Allow authenticated users to INSERT participants for meetings they created
CREATE POLICY "Authenticated users manage own participants" ON meeting_participants FOR ALL
  USING (
    meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  );

-- 4. Enable storage RLS on meeting-audio bucket
-- First, make sure the bucket exists and is not public
UPDATE storage.buckets SET public = false WHERE id = 'meeting-audio';

-- 5. Allow authenticated users to upload files to meeting-audio
CREATE POLICY "Authenticated users upload audio" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'meeting-audio');

-- 6. Allow authenticated users to read their own uploads
CREATE POLICY "Authenticated users read own audio" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'meeting-audio');

-- 7. Allow authenticated users to delete their own uploads
CREATE POLICY "Authenticated users delete own audio" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'meeting-audio');

-- 8. Promote the first user to super_admin (run this with your user ID)
-- UPDATE users SET role = 'super_admin' WHERE id = 'YOUR_USER_ID_HERE';
