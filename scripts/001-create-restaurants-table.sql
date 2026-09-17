-- UK Halal Restaurant Finder — schema for restaurants scraped from
-- the Halal Monitoring Committee (HMC) and Halal Food Association (HFA).
-- PostgreSQL / Supabase compatible.

create extension if not exists "pgcrypto";

create table if not exists public.restaurants (
  id                   uuid primary key default gen_random_uuid(),
  name                 text        not null,
  address              text        not null,
  postcode             text        not null,
  latitude             double precision not null,
  longitude            double precision not null,
  cuisine_type         text        not null,
  -- 'HMC', 'HFA', or 'BOTH' (certified by both bodies)
  certification_body   text        not null
    check (certification_body in ('HMC', 'HFA', 'BOTH')),
  certification_status text        not null default 'Certified'
    check (certification_status in ('Certified', 'Pending', 'Expired', 'Suspended')),
  last_scraped_date    date        not null default current_date,
  created_at           timestamptz not null default now()
);

-- Common query patterns: filter by cuisine and certification, look up by postcode.
create index if not exists restaurants_cuisine_type_idx on public.restaurants (cuisine_type);
create index if not exists restaurants_certification_body_idx on public.restaurants (certification_body);
create index if not exists restaurants_postcode_idx on public.restaurants (postcode);
create index if not exists restaurants_lat_lng_idx on public.restaurants (latitude, longitude);

-- Row Level Security: restaurant data is public read-only.
alter table public.restaurants enable row level security;

drop policy if exists "Public can read restaurants" on public.restaurants;
create policy "Public can read restaurants"
  on public.restaurants
  for select
  using (true);

-- Seed with the same 5 London halal restaurants used by the mock UI.
insert into public.restaurants
  (name, address, postcode, latitude, longitude, cuisine_type, certification_body, certification_status, last_scraped_date)
values
  ('Tayyabs',        '83-89 Fieldgate St, Whitechapel',       'E1 1JU',  51.5175, -0.0647, 'Pakistani',      'HMC',  'Certified', '2026-09-08'),
  ('Roti King',      '40 Doric Way, Euston',                  'NW1 1LH', 51.5290, -0.1320, 'Malaysian',      'HFA',  'Certified', '2026-09-05'),
  ('The Halal Guys', '89-91 St Martin''s Ln, Covent Garden',  'WC2N 4AP',51.5113, -0.1300, 'Middle Eastern', 'BOTH', 'Certified', '2026-09-10'),
  ('Mangal 2',       '4 Stoke Newington Rd, Dalston',         'N16 8BH', 51.5470, -0.0760, 'Turkish',        'HFA',  'Pending',   '2026-08-29'),
  ('Needoo Grill',   '87 New Rd, Whitechapel',                'E1 1HH',  51.5169, -0.0611, 'Pakistani',      'HMC',  'Expired',   '2026-07-22')
on conflict do nothing;
