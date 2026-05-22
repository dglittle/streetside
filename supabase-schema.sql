-- Run this in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Creates the gallery table, makes it publicly readable, and turns on Realtime.

create table if not exists art_pieces (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  suggested_amount numeric default 5,
  payment_link text,            -- your Square Payment Link for this piece
  created_at timestamptz default now()
);

-- Row Level Security: anyone can READ the gallery; nobody can write from the
-- browser. You add/edit pieces from the Supabase dashboard (Table editor).
alter table art_pieces enable row level security;

drop policy if exists "public read art" on art_pieces;
create policy "public read art"
  on art_pieces for select
  to anon
  using (true);

-- A couple of starter rows (edit/delete freely in the Table editor).
insert into art_pieces (title, description, suggested_amount, image_url, payment_link)
values
  ('Tiny Cloud #4', 'Hand-cut paper cloud on a clothespin. One of a kind.', 5,
   'https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=600&q=70',
   'https://square.link/u/REPLACE-ME'),
  ('Pocket Monster', 'Clay creature, about the size of a walnut. Friendly, mostly.', 8,
   'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=70',
   'https://square.link/u/REPLACE-ME');
