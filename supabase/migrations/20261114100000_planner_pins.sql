-- Pins in the Planner: events and list items. Additive only. Safe to run more than once.
alter table public.events add column if not exists pinned boolean not null default false;
alter table public.list_items add column if not exists pinned boolean not null default false;
notify pgrst, 'reload schema';
