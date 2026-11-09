-- Halqa Planner lists (Islamabad, Lahore, Sargodha City, Halqa…). Additive only. Safe to run more than once.

create table if not exists public.planner_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.planner_lists(id) on delete cascade,
  title text not null default '',
  details text,
  day date,                         -- optional: then it also shows in the Calendar
  contact_id uuid,                  -- optional: someone in Halqa
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.halqa_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists planner_lists_touch on public.planner_lists;
create trigger planner_lists_touch before insert or update on public.planner_lists
  for each row execute function public.halqa_touch_updated_at();
drop trigger if exists list_items_touch on public.list_items;
create trigger list_items_touch before insert or update on public.list_items
  for each row execute function public.halqa_touch_updated_at();
create index if not exists list_items_list_id on public.list_items (list_id);

do $$
declare t text;
begin
  foreach t in array array['planner_lists', 'list_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "halqa signed in" on public.%I', t);
    execute format('create policy "halqa signed in" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- The four starting lists (only if there are none yet).
insert into public.planner_lists (name, sort)
select v.name, v.sort from (values ('Islamabad', 1), ('Lahore', 2), ('Sargodha City', 3), ('Halqa', 4)) as v(name, sort)
where not exists (select 1 from public.planner_lists);

notify pgrst, 'reload schema';
