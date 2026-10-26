# Halqa v2: agreed decisions

Usama Mela (MNA, NA-83 Sargodha-II) is not a developer: explain things in plain language, and show him screenshots or test links before changes he hasn't seen.

## Status (26 Oct 2026)
- v2 is live on `main` (halqa-apps.vercel.app). Usama has no laptop: he works from the Claude app on his iPhone.
- **How changes ship:** commit on `claude/review-requested-jvbtwm`, run `npm run build`, push the branch, then push the same commit to `main`. Vercel deploys `main` to production. After each deploy, check that `/` and `/sw.js` return 200.
- **Access:** the cloud environment "Usama" stores network secrets for `api.supabase.com` and `api.vercel.com` (Name `Authorization`, Prefix `Bearer`). The Vercel token ("Claude Halqa") never expires. GitHub access comes from the Claude GitHub connector.
- **Database updates** (both have been run):
  - `supabase/migrations/20261016000000_halqa_v2.sql`
  - `supabase/migrations/20261017000000_analysis_reports.sql`
  
  The auto-mode safety check blocks Claude from running SQL that changes the live database, so Usama pastes the SQL into the Supabase SQL Editor himself. Give him the **contents**, not the file name. "Run without RLS" is the right choice.
- **Weekly check-up:** a scheduled task, "Halqa weekly check-up", runs every Monday at 8:53 PKT. It is read-only and notifies him only if something needs attention.
- **Rollback point** (the old v1 app): Vercel deployment `dpl_FS9AMxK6nZpz5mURyC9gnym93tLF` (commit 7e86dc3).
- **Vercel settings:** Deployment Protection ("Vercel Authentication") is off, so test links open on his phone without a login. The env var `HALQA_CONTACTS_PASSWORD` is left over from the dropped CardDAV attempt and is unused.

## Decided
- **No login.** The app stays open to anyone with the URL. This includes saved AI reports, which colleagues can see (Usama chose this).
- **Offline mode** is the top priority: the whole app and all data are on the phone, and changes queue and upload when signal returns.
- **Election results:** keep the free-text 2018 and 2024 fields exactly as they are (e.g. "Usama 294, Mohsin 341, Aslam 66. Net: -47"). No structured vote fields.
- **Not wanted:**
  - the heatmap
  - extra feature ideas such as a requests tracker, occasions log, voice debrief or photo-to-data
  - Urdu text in the UI ("H" is used on the loading screen)
- **Constituency settings** (name, the politician the AI advises, map on/off) live in `lib/config.js`.

## Home page
- Header: "Halqa" + "NA-83 Sargodha-II", with three number boxes: Villages · Contacts · Pinned.
- Sync badge (Synced / Offline · N waiting).
- Header icons: map, AI analysis, settings.
- Main Groups and Day to Day side by side.
- Qanungo cards: "…" menu (Rename / Remove), contact count, thin completion bar.
- Tabs: Qanungos · Notes · Search.
- ⚡ Quick Add, bottom right.
- A card "N iPhone contacts to sort" appears while an import is unfinished.

## Contacts
- **Contact cards:** pin, call, WhatsApp and save-to-iPhone buttons on their own row under the details, so names keep the full width on small iPhones.
- **Save to iPhone:** downloads a vCard named "Name - Village" (e.g. "Rana Asif - Lilliani"). It's offered on each card, and as "Save to iPhone" in the confirmation after adding a contact.
- **Quick Add (contacts only):**
  - fields: name, phone, village (searchable; picking one closes the list), Pin to Main Groups switch, description, tags
  - remembers the last village used
  - warns about duplicate numbers
- **Tags (categories)**, in this order: Key Voter · Opposition · Neutral · Government Officer · Religious Leader · Youth · Lawyer · Ours · Journalist · Wasayba Leader.
  - "Other" and "Influencer" were removed; no contacts used them.
  - Usama may add more.
  - Defined in `lib/domain.js` (`TAGS`).
- **Main Groups:**
  - pinned contacts grouped by Qanungo, under large headings
  - a sticky strip of Qanungo buttons at the top jumps to each section

## Importing iPhone contacts (built 25 Oct 2026, one-time)
- **Purpose:** a one-time import of the roughly 5,660 contacts in his iPhone, of which at least 3,500 belong in Halqa. From now on he saves new people directly in Halqa.
- **How:** export a .vcf from the Contacts app (Lists → hold "All Contacts" → Export → Save to Files), then Settings → Import contacts → choose the file.
- **Duplicates:**
  - Anyone with any number already in Halqa is left out, matched on the last 10 digits.
  - Same name with a different number is flagged for him to check.
- **Village suggestions:** taken from the name, company or notes, and the village is removed from the name. Watch for villages that are also personal names (e.g. "Badar").
- **The sorting list and "Not for Halqa" stay on that phone only.** Added contacts upload in batches of 200.

## AI analysis
- **Model and setup:** Claude Opus 5.5, using his own API key, stored only on the phone.
- **Questions and follow-ups:**
  - He can ask his own question, or get the standard report (Village / Qanungo / Constituency).
  - He can ask follow-ups; the data is cached so follow-ups cost less.
- **Saved reports:**
  - kept permanently in the `analysis_reports` table and synced to all devices
  - can be deleted (with undo)
  - older reports can be continued later

## Ideas Usama is considering (not started)
- **Seeing a caller's Halqa profile when they call or WhatsApp.** A full profile on the call screen is impossible on iOS. Options offered:
  1. A "Paste number" button in Search that opens the matching profile.
  2. Back Tap plus a Shortcut that opens Halqa on the copied number.
  3. Getting Halqa details into the iPhone contact name, either by adding tags to the saved vCard name or by retrying the automatic CardDAV sync on `halqa-apps.vercel.app/carddav/`. The code for that is in git history, commit b396b61.
- **A copy of Halqa for a friend** (another politician, with his own accounts):
  - A clean copy (no key, no history, none of Usama's notes) plus `SETUP.md` and `supabase/setup.sql` was sent to Usama as `halqa-clean-copy.zip`.
  - The friend sets it up in his own Claude Code session, then imports his PDF of contacts into his own Supabase.
  - It's waiting for the friend to be ready.

## Dropped
- **Automatic iPhone Contacts sync (CardDAV, 17 Oct):** built, but the iPhone never connected, so the one-tap save button was chosen instead. It may be revisited (see the ideas above).
