-- Run in Supabase -> SQL Editor. Stores free ($0) item requests with shipping
-- info. Writes happen only via the free-request Edge Function (service_role),
-- so no public insert policy — the table is not readable/writable by the anon key.

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid,
  piece_title text,
  name text not null,
  email text not null,
  address1 text not null,
  address2 text,
  city text not null,
  state text not null,
  postal text not null,
  country text not null default 'USA',
  note text,
  created_at timestamptz default now()
);

alter table requests enable row level security;
-- No policies for anon = no public access. The Edge Function uses service_role,
-- which bypasses RLS.
