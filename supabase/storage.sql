-- Run this in Supabase SQL Editor to create the photo storage bucket

-- Create storage bucket for check-in photos
insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload their own photos
create policy "Users can upload own photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'checkin-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to view all photos (for leaderboard avatars etc)
create policy "Anyone can view photos"
on storage.objects for select
to authenticated
using (bucket_id = 'checkin-photos');

-- Allow users to update/delete their own photos
create policy "Users can update own photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'checkin-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'checkin-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
