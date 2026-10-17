# Halqa v2: agreed decisions (16 Oct 2026)

## Status (17 Oct 2026)
- v2 is live on `main` (halqa-apps.vercel.app), switched over after Usama tested it on his iPhone.
- The database update `supabase/migrations/20261016000000_halqa_v2.sql` has been run.
- Previous live version, for rollback: Vercel deployment `dpl_FS9AMxK6nZpz5mURyC9gnym93tLF` (commit 7e86dc3).

## Decided
- **No login.** The app stays open to anyone with the URL, as now.
- **Repo plan:** build on the branch in the same repo, test via the Vercel preview link with real data, then merge to `main`. No new repo, no bookmark change. Same Supabase database, so all existing data appears automatically.
- **Offline mode** is the top priority: the whole app and all data on the phone, changes queue and upload when signal returns.
- **Heatmap:** dropped.
- **Election results:** keep the free-text 2018 and 2024 fields exactly as now (e.g. "Usama 294, Mohsin 341, Aslam 66. Net: -47"). No structured vote fields.
- **Extra feature ideas** (requests tracker, occasions log, voice debrief, photo-to-data, etc.): not wanted.

## Home page
- Header: "Halqa" + "NA-83 Sargodha-II". **No Urdu text.**
- Three number boxes: Villages · Contacts · Pinned.
- Sync badge (Synced / Offline · N waiting).
- Header icons: map, AI analysis, settings.
- Main Groups and Day to Day side by side.
- Qanungo cards: "…" menu (Rename / Remove) instead of the trash button, contact count, thin completion bar.
- "Add Qanungo" button at the bottom of the list.
- Tabs: Qanungos · Notes · Search.
- ⚡ Quick Add button, bottom right.

## Village page / contacts
- **The pin button stays on the contact cards** (alongside call and WhatsApp). This needs changing from the current v2 build, which moved pin into the contact detail sheet.
- Results / population / voters header as a 2×2 layout. Data unchanged.

## Saving contacts to iPhone Contacts (decided 17 Oct 2026)
The automatic iPhone Contacts sync (CardDAV) was built, then dropped at Usama's request: the iPhone never connected and the one-tap button from the old app is simpler.
- A save-to-contacts button on each contact card, as in the old app: tap it, choose "Create New Contact", details are already filled in, tap Done.
- After adding a contact, the confirmation also offers "Save to iPhone".
- Name style: "Rana Asif - Lilliani".
