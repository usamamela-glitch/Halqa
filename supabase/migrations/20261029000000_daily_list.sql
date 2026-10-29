-- Halqa: daily list and monthly briefing. Additive only. Safe to run more than once.

-- "Don't show again" in the daily list (the contact stays in Halqa).
alter table public.contacts add column if not exists list_hidden boolean not null default false;
-- "Later": not offered in the daily list until this time.
alter table public.contacts add column if not exists snoozed_until timestamptz;

-- Monthly briefing figures (people in touch, coverage), so next month can compare.
alter table public.analysis_reports add column if not exists meta jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
