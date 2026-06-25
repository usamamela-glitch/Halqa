-- Run this entire script in your Supabase SQL Editor

-- VILLAGES
create table villages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  result_2018 text,
  result_2024 text,
  population integer,
  registered_voters integer,
  our_group text,
  anti_group text,
  development text,
  created_at timestamptz default now()
);

-- CONTACTS
create table contacts (
  id uuid primary key default gen_random_uuid(),
  village_id uuid references villages(id) on delete cascade,
  name text not null,
  phone text,
  description text,
  created_at timestamptz default now()
);

-- NOTES
create table notes (
  id uuid primary key default gen_random_uuid(),
  village_id uuid references villages(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- INDEXES for speed
create index on contacts(village_id);
create index on notes(village_id);

-- DISABLE Row Level Security (personal app, no auth needed)
alter table villages disable row level security;
alter table contacts disable row level security;
alter table notes disable row level security;
