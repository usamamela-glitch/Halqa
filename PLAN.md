# Halqa v2: agreed decisions

Usama Mela (MNA, NA-83 Sargodha-II) is not a developer: explain things in plain language, and show him screenshots or test links before changes he hasn't seen.

## Status (7 Nov 2026)
- v2 is live on `main` (halqa-apps.vercel.app). Usama has no laptop: he works from the Claude app on his iPhone.
- **How changes ship:** commit on `claude/review-requested-jvbtwm`, run `npm run build`, push the branch, then push the same commit to `main`. Vercel deploys `main` to production. After each deploy, check that `/` and `/sw.js` return 200.
- **Access:** the cloud environment "Usama" stores network secrets for `api.supabase.com` and `api.vercel.com` (Name `Authorization`, Prefix `Bearer`). The Vercel token ("Claude Halqa") never expires. GitHub access comes from the Claude GitHub connector.
- **Database updates** (all five have been run):
  - `supabase/migrations/20261016000000_halqa_v2.sql`
  - `supabase/migrations/20261017000000_analysis_reports.sql`
  - `supabase/migrations/20261029000000_daily_list.sql` (daily list: Later, Don't show, briefing stats)
  - `supabase/migrations/20261031000000_whatsapp_number.sql` (remembered WhatsApp number)
  - `supabase/migrations/20261107000000_login_required.sql` (login required: RLS on, anon has no rights)
  
  The auto-mode safety check blocks Claude from running SQL that changes the live database, so Usama pastes the SQL into the Supabase SQL Editor himself. Give him the **contents**, not the file name. "Run without RLS" is the right choice.
- **Weekly check-up:** a scheduled task, "Halqa weekly check-up", runs every Monday at 8:53 PKT. It is read-only, except for the monthly backup into `halqa-backups`. It notifies him only if something needs attention.
- **Rollback point** (the old v1 app): Vercel deployment `dpl_FS9AMxK6nZpz5mURyC9gnym93tLF` (commit 7e86dc3).
- **Vercel settings:** Deployment Protection ("Vercel Authentication") is off, so test links open on his phone without a login. The env var `HALQA_CONTACTS_PASSWORD` is left over from the dropped CardDAV attempt and is unused.

- **Crash recovery (2 Nov 2026):** if anything crashes, Halqa reopens itself once instead of showing a white "client-side exception" page; if it crashes again straight away it shows a "Reopen Halqa" button. The last problem is shown in small text at the bottom of Settings (`components/Recover.js`). The likely cause of the 2 Nov white screen: iOS cutting the phone's database connection after Halqa sat in the background. New versions now load by themselves: Halqa checks for one each time it's reopened, and reloads into it the next time it goes into the background (iPhone otherwise kept the old version running). The service worker also keeps the previous version's files for a copy of Halqa still open from before an update. **Fixed 7 Nov:** that kept copy made phones open the *previous* version (one update behind; Safari got stuck). The worker now always serves its own version's page and files first (`fromCache` in `scripts/sw-template.js`).

## Decided
- **Login (7 Nov 2026, replaces "no login"):**
  - **Sign-in:** email + password, via Supabase Auth.
    - Each device signs in once and stays signed in, offline too (`lib/auth.js`; the session is kept under localStorage `halqa-auth`).
    - The home-screen app and Safari count as separate devices.
    - Settings → Account → **Sign out of this device** removes Halqa's data and API key from the device.
  - **Accounts:** only Usama's for now. New accounts are made in Supabase → Authentication → Users → Add user, with Auto Confirm ticked. Sign-ups are switched off.
  - **Locked database:**
    - Row level security is on for all 7 tables, with one policy each: signed-in users can do everything.
    - The public `anon` key has no rights (`supabase/migrations/20261107000000_login_required.sql`, run 7 Nov).
    - **Any new table must get the same RLS policy**, or it will be either open or unusable.
  - **Photos:**
    - Only signed-in users can upload or list them.
    - Each photo still opens from its own link (buckets stay public), and the links hold random IDs that are stored only in the locked database.
  - **Sync safeguards (`lib/sync.js`):**
    - It doesn't sync without a session.
    - It keeps changes queued on 401/403/RLS errors.
    - It refuses to replace the phone's copy if the server returns no contacts.
- **Monthly backup (7 Nov 2026):**
  - **Where:** the private repo `usamamela-glitch/halqa-backups`, with one folder per month: every table as JSON, plus every Storage file.
  - **Retention:** only the newest 3 months, kept as a single commit, so older backups are really deleted.
  - **How it runs:** the Monday check-up runs `python3 backup.py --push`, which does nothing if this month is already saved.
  - **Restoring:** see that repo's README.

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
- Tabs: Qanungos · Notes · Search. **Qanungos stays the home page.**
- A teal **"Today" card** under the tabs ("Today · 12 of 35 done", a progress bar, and "October 2026 briefing is ready" when one is waiting). Tapping it opens the daily list.
- Main Groups and Day to Day side by side, under the Today card.
- Qanungo cards: "…" menu (Rename / Remove), contact count, thin completion bar.
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
- **WhatsApp with several numbers** (built 31 Oct 2026):
  - WhatsApp won't tell other apps which number is on it, so the first WhatsApp tap on someone with 2–3 numbers asks "Which number is on WhatsApp?".
  - The choice is remembered in `contacts.whatsapp_phone` and syncs; after that the WhatsApp button goes straight to that number.
  - On the contact card each number has its own WhatsApp button; the remembered one has a green outline, and using another one changes the remembered number.

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

## "Save to Halqa" Shortcut (built 28 Oct 2026, working)
- In WhatsApp: hold a shared contact → Forward → share button → **Save to Halqa**. Halqa opens in Safari on Quick Add with the name and number(s) filled in. The village is always left for him to choose.
- Link format: `/?add=1&name=<encoded>&phone=<encoded numbers, one per line>`, handled in `HomeScreen.js`.
- The Shortcut on his iPhone, in order:
  1. Receive **Contacts** from Share Sheet
  2. Get Name from Shortcut Input
  3. URL Encode
  4. Get Phone Numbers from Shortcut Input
  5. URL Encode
  6. Text: `https://halqa-apps.vercel.app/?add=1&name=[encoded name]&phone=[encoded phones]`
  7. Open URLs

- **Second Shortcut, "Save number to Halqa"** (for forwarded text such as "03007100764 rana Shahbaz"):
  1. Receive **Text** from Share Sheet
  2. URL Encode Shortcut Input
  3. Text: `https://halqa-apps.vercel.app/?add=1&text=[URL Encoded Text]`
  4. Open URLs

  Its "If there's no input" is set to **Get Clipboard**, and iPhone **Back Tap → Double Tap** runs it. So for an unsaved number (e.g. someone who messaged on WhatsApp): copy the number, then double-tap the back of the phone, and Quick Add opens with it filled in.

  **If the number is already in Halqa** (either Shortcut, matched on the last 10 digits of any of a contact's numbers), that person's **profile opens instead of Quick Add** (built 7 Nov). So copying a number and double-tapping the back also answers "who is this?".

  Halqa (`parseSharedText` in `lib/importContacts.js`) reads the first number, the name (from the same or the previous line) and a village mentioned anywhere in the message.

## Daily list + monthly AI briefing (built 29 Oct 2026)

**"In touch" replaces "Last contacted"** (the manual toggle goes). A person is in touch today when he:
- taps **WhatsApp** or **call** on them, anywhere in Halqa, or
- **opens their contact card**, anywhere.

Just scrolling past someone doesn't count. Cards show "In touch: 2 months ago", or "Not yet".

**Daily list:**
1. A new day brings **35 people: 15 pinned + 20 unpinned**. They're picked at random from those not in touch for the longest.
2. The list stays the same all day.
3. **Leftovers carry forward:** anyone not ticked Done stays in the list the next day, and the list is topped up to 35 (keeping the 15/20 split).
4. **Each card shows:** name, village, tags, description, "in touch" age, then buttons: **✓ Done**, WhatsApp, call, Later, Don't show.
5. **WhatsApp or call, or opening the card:** marks them in touch, but **they stay in the list**, marked "✓ In touch today". Only the **✓ Done** button takes someone off the list (with Undo). Progress counts Done, e.g. "12 of 35 done".
6. **Later:** removes them now, brings them back in about a week, and **a new random person of the same kind (pinned or unpinned) takes their place**.
7. **Don't show again** (died, or any other reason): they stay in Halqa but leave the list for good. They can be brought back from their card, and Settings lists everyone hidden. A replacement is added the same way as Later.
8. **Deleting** someone on today's list, or hiding them from their contact card, also brings in a replacement, so the list stays at 35. Someone already ticked Done and then deleted still counts as done. (Fixed 3 Nov; before that the list dropped to 34.)
9. **Undo** for a few seconds after each action.
10. **"Show me 35 more"** brings another batch.
11. **New people** added to Halqa (Quick Add, the Shortcut, import) come up in the list about **a week after being added**.
12. Everything works offline; "in touch" dates sync to all devices.

**First days of use (31 Oct):** 2,884 contacts, 805 pinned. 42 people in touch that day, 25 set to Later, 9 hidden.

**Rotation:** with 799 pinned and 2,079 unpinned (29 Oct), pinned people come round about every 2 months and unpinned about every 3½ months, faster with "Show me 35 more".

**Monthly AI briefing:**
- Written on the first open of each month, or on demand. Saved with the reports, with follow-up questions.
- **It covers:**
  - Gaps: villages and important people not in touch.
  - Weak spots: villages lost or narrowly won in 2024, and the attention they've had.
  - About 15 people to see this month, each with a reason and a talking point.
  - Progress compared with last month.

**Where it lives in the code:**
- `lib/daily.js`: picking the list, Later, Don't show, Show more.
- `lib/touch.js`: recording "in touch".
- `components/screens/TodayScreen.js`: the daily list screen, plus the teal "Today" card at the top of the home page (Qanungos tab, which stays the home page).
- `lib/briefing.js`: the automatic monthly run. The first one is October 2026's, written on 1 Nov.
- Briefing prompt: `lib/analysis.js`, scope `briefing`, targets `month:YYYY-MM` or `last30:YYYY-MM-DD`.
- The list itself is kept on the phone (`db.meta 'daily'`).
- `contacts.list_hidden`, `contacts.snoozed_until` and `analysis_reports.meta` need `supabase/migrations/20261029000000_daily_list.sql`.

**Not wanted:**
- ready-made WhatsApp greeting
- category/village weighting
- a morning notification
- a coverage figure on the home screen
- a one-line note after contact

## Ideas Usama is considering (not started)
- **Seeing a caller's Halqa profile when they call or WhatsApp.** A full profile on the call screen is impossible on iOS. Options offered:
  1. A "Paste number" button in Search that opens the matching profile.
  2. Back Tap plus a Shortcut that opens Halqa on the copied number. (Back Tap is now used by "Save number to Halqa", so this would need Triple Tap.)
  3. Getting Halqa details into the iPhone contact name, either by adding tags to the saved vCard name or by retrying the automatic CardDAV sync on `halqa-apps.vercel.app/carddav/`. The code for that is in git history, commit b396b61.
- **A copy of Halqa for a friend** (NA-78 Gujranwala-II, his own GitHub, Supabase and Vercel; set up 4 Nov 2026):
  - A fresh clean copy of the 3 Nov app was sent to Usama as `halqa-na78.zip`: no data, no keys, no Sargodha details. On screen Qanungo → **Area**, Village → **Mohalla** (tables keep their names). AI prompt describes an urban constituency; his own NA-78 map (union councils with roads, from his PDF) is on the map button; "Wasayba Leader" tag removed; first automatic briefing is November 2026.
  - Inside: `SETUP.md` (step-by-step for the friend's Claude), `CLAUDE.md` (rules for his later sessions), `supabase/setup.sql` (whole database, tested twice on Postgres; turns RLS off).
  - **Done 5 Nov 2026.** Live at halqa-pi.vercel.app (Vercel account mubeenjutt-7091, GitHub g8wzfd875d-cell/halqa). His own Claude maintains it from now on; Usama set up both Shortcuts on his iPhone. Usama's decision (7 Nov): the friend's copy is his own. He adds login, backups or anything else himself; we don't maintain it.
  - Lessons for next time: GitHub's web uploader fails on dragged folders, so upload the zip and let Claude unzip it. "Continue with Apple" gives GitHub a hidden Apple relay address that only GitHub can email, so a Vercel account made through that GitHub never gets its verification codes; use a Vercel account made with a real email instead.
  - Usama's day-of checklist is the artifact "Halqa NA-78 Setup" (claude.ai/artifact/9ZHru6MothWU86faU6ZbB3).

## Dropped
- **Automatic iPhone Contacts sync (CardDAV, 17 Oct):** built, but the iPhone never connected, so the one-tap save button was chosen instead. It may be revisited (see the ideas above).
