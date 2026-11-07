-- Halqa: only signed-in users can read or change data.
-- Run AFTER Halqa has been signed in on every phone/computer that uses it.
-- Safe to run more than once. Nothing is deleted.

-- Tables: switch on row level security, allow everything to signed-in users,
-- and take all rights away from the public (not signed in) key.
do $$
declare t text;
begin
  foreach t in array array['qanungos', 'villages', 'contacts', 'notes', 'general_notes', 'day_note', 'analysis_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "halqa signed in" on public.%I', t);
    execute format('create policy "halqa signed in" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Photos: only signed-in users can upload or list them. Each photo still opens
-- from its own link (the app shows photos that way), and those links contain
-- random IDs that are only stored in the locked database.
drop policy if exists "Allow delete note images" on storage.objects;
drop policy if exists "Allow upload note images" on storage.objects;
drop policy if exists "Public read note images" on storage.objects;
drop policy if exists "halqa contact-photos read" on storage.objects;
drop policy if exists "halqa contact-photos upload" on storage.objects;
drop policy if exists "halqa note-images read" on storage.objects;
drop policy if exists "halqa note-images upload" on storage.objects;
drop policy if exists "halqa signed in read" on storage.objects;
drop policy if exists "halqa signed in upload" on storage.objects;
create policy "halqa signed in read" on storage.objects for select to authenticated
  using (bucket_id in ('note-images', 'contact-photos', 'maps'));
create policy "halqa signed in upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('note-images', 'contact-photos'));

notify pgrst, 'reload schema';
