-- Short serial numbers for Works (R-17, J-3…): numbered per category, oldest first.
-- Additive only. Safe to run more than once.
alter table public.works add column if not exists serial integer;

-- Number the existing items (only those without a number yet).
update public.works w set serial = n.num
from (
  select id, (select coalesce(max(serial), 0) from public.works x where x.category = y.category) + row_number() over (partition by category order by created_at, id) as num
  from public.works y where serial is null
) n
where w.id = n.id;

-- New items, or items moved to another category, get the next number in their category
-- if the app didn't already give them one.
create or replace function public.works_serial() returns trigger
language plpgsql as $$
begin
  if new.serial is null or (tg_op = 'UPDATE' and new.category is distinct from old.category and new.serial is not distinct from old.serial) then
    select coalesce(max(serial), 0) + 1 into new.serial from public.works where category = new.category and id <> new.id;
  end if;
  return new;
end $$;
drop trigger if exists works_serial on public.works;
create trigger works_serial before insert or update on public.works
  for each row execute function public.works_serial();

notify pgrst, 'reload schema';
