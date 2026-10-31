-- Halqa: which of a contact's numbers is on WhatsApp. Additive only. Safe to run more than once.
alter table public.contacts add column if not exists whatsapp_phone text;
notify pgrst, 'reload schema';
