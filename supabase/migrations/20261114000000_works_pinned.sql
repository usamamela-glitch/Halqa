-- Pin important targets to the top of their category. Additive only. Safe to run more than once.
alter table public.works add column if not exists pinned boolean not null default false;
notify pgrst, 'reload schema';
