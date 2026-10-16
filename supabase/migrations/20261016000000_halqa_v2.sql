-- Halqa v2: additive changes only. Nothing existing is renamed or dropped,
-- so the old app keeps working alongside the new one.
-- Safe to run more than once.

-- Contacts: profile photo, tags, last contacted date.
alter table public.contacts add column if not exists photo_path text;
alter table public.contacts add column if not exists tags text[] not null default '{}';
alter table public.contacts add column if not exists last_contacted timestamptz;

-- Storage bucket for contact photos (public, like note-images).
insert into storage.buckets (id, name, public)
values ('contact-photos', 'contact-photos', true)
on conflict (id) do nothing;

-- Let the app (anon key, no login — same as the rest of Halqa) read and
-- upload photos in the photo buckets.
do $$
declare
  b text;
begin
  foreach b in array array['contact-photos', 'note-images'] loop
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'halqa ' || b || ' read') then
      execute format('create policy %I on storage.objects for select to anon, authenticated using (bucket_id = %L)', 'halqa ' || b || ' read', b);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'halqa ' || b || ' upload') then
      execute format('create policy %I on storage.objects for insert to anon, authenticated with check (bucket_id = %L)', 'halqa ' || b || ' upload', b);
    end if;
  end loop;
end $$;
