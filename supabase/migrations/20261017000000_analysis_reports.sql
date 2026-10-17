-- Halqa: saved AI analysis reports and their follow-up conversations.
-- Additive only. Safe to run more than once.

create table if not exists public.analysis_reports (
  id uuid primary key,
  title text not null default '',
  scope text,                 -- 'village' | 'qanungo' | 'all'
  target text,                -- village or qanungo id, or 'all'
  turns jsonb not null default '[]'::jsonb,  -- [{ "q": question or null, "a": answer }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The server sets updated_at, so phones can download only what changed.
create or replace function public.halqa_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists analysis_reports_touch on public.analysis_reports;
create trigger analysis_reports_touch before insert or update on public.analysis_reports
  for each row execute function public.halqa_touch_updated_at();

create index if not exists analysis_reports_updated_at on public.analysis_reports (updated_at);

-- Same access as the other Halqa tables (no login, by design).
grant select, insert, update, delete on public.analysis_reports to anon, authenticated;

notify pgrst, 'reload schema';
