# Halqa v2

Private constituency management app for NA-83 Sargodha-II. It runs as an iPhone home-screen app (PWA) and works fully offline.

## How it's built

- **Next.js (pages router, JavaScript), static export.** `npm run build` writes the whole app to `out/` and generates `out/sw.js`, the service worker that lets the app open with no signal.
- **Offline-first data.** Every screen reads from a local IndexedDB copy of the Supabase tables (`lib/db.js`, Dexie). All writes go to the local copy first and into an outbox (`lib/store.js`). The sync engine (`lib/sync.js`) pushes the outbox to Supabase whenever there's signal, then downloads all tables and re-applies anything still waiting. Conflicts are last-write-wins.
- **Photos taken offline** are stored on the phone and uploaded later. Note bodies store images as `[IMG:path]` markers (older notes with `<img>` tags are converted when edited).
- **Supabase** project `zietsuiuzkfjjgbdybdd`. The anon key is hardcoded in `lib/supabase.js` on purpose (env vars broke Vercel deploys before). No login, by design.
- **AI analysis** calls Claude directly from the phone with the user's own API key (stored only in that phone's localStorage).

## Database

The existing tables are unchanged. v2 only **adds** things — run `supabase/migrations/20261016000000_halqa_v2.sql` once in the Supabase SQL editor:

- `contacts.photo_path`, `contacts.tags`, `contacts.last_contacted`
- the `contact-photos` storage bucket, plus upload/read policies for the photo buckets

Until it's run, the app still works: values for the new fields stay on the phone and Settings shows "Database update needed".

## Saving contacts to the iPhone

The person icon on a contact card (and "Save to iPhone" after adding a contact) downloads a vCard; iOS opens it with the details filled in, named "Name - Village".

## Commands

```bash
npm install
npm run dev      # local dev server (service worker disabled in dev)
npm run build    # production build into out/ + service worker
npm start        # serve out/ locally
```

## Rules for changes

- Run `npm run build` before every commit; never push a failing build.
- Never call a function that isn't defined (the old app's `importFromContacts` white screen).
- Never store `blob:` URLs; images go to Storage and are saved as `[IMG:path]`.
- vCards always include both `FN` and `N`.
- Don't drop or rename existing database columns; only add.

The previous app is kept for reference in `legacy/` (not built or deployed).
