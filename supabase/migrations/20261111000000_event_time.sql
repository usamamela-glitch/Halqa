-- Exact time for events that are not weddings ("16:30"). Additive only. Safe to run more than once.
alter table public.events add column if not exists time text;
notify pgrst, 'reload schema';
