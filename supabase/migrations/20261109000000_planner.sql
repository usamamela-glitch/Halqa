-- Halqa Planner: weddings and other events. Additive only. Safe to run more than once.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'wedding',      -- wedding | dinner | jalsa | meeting | meetup | other
  function text,                             -- Mehndi, Baraat, Walima, Nikah, Rukhsati… (weddings)
  title text not null default '',            -- groom's name, or what the event is
  village text,
  venue text,
  day date,
  part text,                                 -- morning | afternoon | night
  notes text,
  status text not null default 'confirmed',  -- confirmed | review (read from a card, not yet checked)
  source text not null default 'manual',     -- manual | whatsapp
  unsure boolean not null default false,
  batch_id uuid,                             -- functions read from the same shared cards
  image_path text,                           -- the card photo, in the private event-cards bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.halqa_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists events_touch on public.events;
create trigger events_touch before insert or update on public.events
  for each row execute function public.halqa_touch_updated_at();
create index if not exists events_day on public.events (day);

-- Only signed-in users, like every other table.
alter table public.events enable row level security;
drop policy if exists "halqa signed in" on public.events;
create policy "halqa signed in" on public.events for all to authenticated using (true) with check (true);
revoke all on public.events from anon;
grant select, insert, update, delete on public.events to authenticated;

-- Card photos: private; the app shows them to signed-in users only.
insert into storage.buckets (id, name, public) values ('event-cards', 'event-cards', false)
on conflict (id) do nothing;
drop policy if exists "halqa signed in read" on storage.objects;
create policy "halqa signed in read" on storage.objects for select to authenticated
  using (bucket_id in ('note-images', 'contact-photos', 'maps', 'event-cards'));
drop policy if exists "halqa signed in delete cards" on storage.objects;
create policy "halqa signed in delete cards" on storage.objects for delete to authenticated
  using (bucket_id = 'event-cards');

notify pgrst, 'reload schema';
