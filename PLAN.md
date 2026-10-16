# Halqa v2: agreed decisions (16 Oct 2026)

Paused until the build session resumes on a laptop. Give this file and the original briefing to the next session.

## Status
- A first version of v2 is built and tested against a simulated database. It is committed on branch `claude/review-requested-jvbtwm` but **not pushed**: GitHub refused Claude's access (error 403).
- The live app (`main`, halqa-apps.vercel.app) is untouched.
- A full source backup (`halqa-v2-source.zip`) was sent in chat.

## Before building resumes
1. Reconnect GitHub for Claude (claude.ai → Settings → Connectors → GitHub), and install the Claude GitHub App on the Halqa repo if asked. Then push the branch.
2. Give Claude Supabase and Vercel access: create tokens, add `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` in the cloud environment's settings, and allow these hosts: `zietsuiuzkfjjgbdybdd.supabase.co`, `api.supabase.com`, `api.vercel.com`, `vercel.com`, `*.vercel.app`. Never paste tokens into chat.
3. Run the database migration `supabase/migrations/20261016000000_halqa_v2.sql`. It only adds things.

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

## Feature to add: Halqa contacts in iPhone Contacts
Every Halqa contact appears automatically in iPhone Contacts (and so in Phone and WhatsApp caller ID), via a CardDAV account added once on the iPhone.
- One-way (Halqa → iPhone), with the village in the name.
- Updates arrive when the iPhone next checks, typically within 15–60 minutes, not instantly.
- Needs a small password-protected server endpoint on Vercel.
- **Still to answer:**
  1. Name format: "Rana Asif (Lilliani)" or another style.
  2. Which phones get it: only Usama's, or the colleagues' too.
  3. All contacts, or only pinned and tagged ones.
