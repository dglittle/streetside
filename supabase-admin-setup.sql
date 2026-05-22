-- Run this in Supabase -> SQL Editor AFTER the original supabase-schema.sql.
-- Adds image_path (so we can delete the stored file when a piece is removed)
-- and sets up a public-read Storage bucket for uploaded art images.

-- 1) Track the storage path of each piece's uploaded image.
alter table art_pieces add column if not exists image_path text;

-- 2) Create a public Storage bucket for art images.
--    (public = anyone can READ the images; writes are gated by the Edge Function.)
insert into storage.buckets (id, name, public)
values ('art-images', 'art-images', true)
on conflict (id) do update set public = true;

-- 3) Allow public READ of objects in that bucket. Writes happen only via the
--    Edge Function (service_role), which bypasses RLS — so no public write policy.
drop policy if exists "public read art-images" on storage.objects;
create policy "public read art-images"
  on storage.objects for select
  to anon
  using (bucket_id = 'art-images');
