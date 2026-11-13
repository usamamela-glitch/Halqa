-- Halqa Works (roads, jobs, electricity, gas, health, education, other).
-- Already in the live database (created 13 Nov 2026 with 53 items); kept here
-- so the schema is on record. Additive only. Safe to run more than once.

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'other',          -- roads | jobs | electricity | gas | health | education | other
  body text not null default '',
  village_ids uuid[] not null default '{}',
  contact_ids uuid[] not null default '{}',         -- the people who asked
  self_identified boolean not null default false,
  images text[] not null default '{}',              -- paths in the note-images bucket
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists works_touch on public.works;
create trigger works_touch before insert or update on public.works
  for each row execute function public.halqa_touch_updated_at();

alter table public.works enable row level security;
drop policy if exists "halqa signed in" on public.works;
create policy "halqa signed in" on public.works for all to authenticated using (true) with check (true);
revoke all on public.works from anon;
grant select, insert, update, delete on public.works to authenticated;

notify pgrst, 'reload schema';
