-- Road size for road projects: main | link | small. Additive only. Safe to run more than once.
alter table public.works add column if not exists road_type text;
notify pgrst, 'reload schema';
