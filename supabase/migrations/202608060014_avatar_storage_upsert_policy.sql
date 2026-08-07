-- Avatar uploads use Storage upsert so users can replace their profile photo.
-- Supabase Storage requires SELECT in addition to INSERT and UPDATE for upsert.
drop policy if exists "users read own avatar metadata" on storage.objects;

create policy "users read own avatar metadata"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
