# Halqa v2: agreed decisions

Usama Mela (MNA, NA-83 Sargodha-II) is not a developer: explain things in plain language, and show him screenshots or test links before changes he hasn't seen.

## Status (8 Nov 2026)
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

- **11 Nov:** the three big count boxes (villages, contacts, pinned) became one small line under the constituency name, and the Today card now sits above Tell Halqa.
- **11 Nov, Today hub:** Today is its own rounded dark green banner (tap for the Today list); a small gap, then on the plain grey background the next two days that have something on, one line each ("Fri 13 · Mehndi · Halalpur · Night"; a busy day lists "3 weddings afternoon · Jalsa 4:30 PM · 3 weddings night"), plus a "Review" line when WhatsApp cards are waiting; tapping a line opens the Planner scrolled to that day. Under that, three dark teal buttons: Tell Halqa, Main Groups, Planner. This replaced the separate Tell Halqa bar, the Coming-up boxes and the two big tiles. (Tell Halqa's bar is still at the top of the Planner.)

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
- **Search (improved 9 Nov 2026, `lib/search.js`):** every word typed must appear somewhere, in any order, in the name, village or description. So "aftab jah", "khanana aftab" and "aftab haider kot momin" all find Aftab Haider Jahankhanana. Spaces don't matter ("jahan khanana" = "Jahankhanana"). If nothing matches exactly, results show under **Similar spellings**, matched on consonants: Haider/Hyder, Muhammad/Mohammad, Waseem/Wasim. Used by the Search tab, village pages, the village picker and "add this number to someone already in Halqa".
- **Recently added (built 8 Nov 2026):**
  - When the search box is empty, the Search tab lists the last 15 people added one by one, with village and "Today" / "Yesterday" / "Thu 5 Nov".
  - People without a description get an **Add description** link, which opens Edit with the cursor in the description box. Meant for quick adds in the field, finished at home.
  - The iPhone import (batches sharing one `created_at`, see `bulkAddTimes` in `lib/domain.js`) is left out.
- **Date added:** each profile shows "Added 5 Nov 2026" under the village (from `contacts.created_at`), for everyone added one by one, back to June. Hidden for the iPhone import, whose date is only the import day.
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

  **A new number for someone already in Halqa** (built 8 Nov): Quick Add opened by a Shortcut shows "+ Add this number to someone already in Halqa" (search by name or village), plus suggestions when the shared name matches someone. The number goes into their first empty slot (Phone 2 / Phone 3). If they already have 3, Halqa asks which to replace. A toast offers Undo, and their profile opens (`AddToExisting` in `components/contacts.js`).

  Halqa (`parseSharedText` in `lib/importContacts.js`) reads the first number, the name (from the same or the previous line) and a village mentioned anywhere in the message.

## Daily list + monthly AI briefing (built 29 Oct 2026)

**"In touch" = confirmed reached** (changed 8 Nov 2026; before that, opening a card or tapping WhatsApp/Call counted too). Recorded only by:
- **✓ Done** in the Today list (Undo puts back the previous date),
- **✓ Yes** on the "Reached Rana Asif?" bar that appears when he comes back to Halqa after a WhatsApp or call made **outside** the Today list (✗ No, or no answer within 5 seconds = nothing recorded; `components/ReachedPrompt.js`),
- **Mark as in touch today** on a contact card (met in person, they called). For someone open in today's list it counts as ✓ Done.

Tapping WhatsApp/Call is only an attempt: in the Today list the card shows "Tried 4:12 PM" (kept on that phone for the day). Opening a card never counts. Cards show "In touch: 2 months ago", or "Not yet". The AI briefing is told about the 8 Nov change, so it treats older dates with caution.

**Daily list:**
1. A new day brings **35 people: 15 pinned + 20 unpinned**. They're picked at random from those not in touch for the longest.
2. The list stays the same all day.
3. **Leftovers carry forward:** anyone not ticked Done stays in the list the next day, and the list is topped up to 35 (keeping the 15/20 split).
4. **Each card shows:** name, village, tags, description, "in touch" age, then buttons: **✓ Done**, WhatsApp, call, Later, Don't show.
5. **WhatsApp or call:** they stay in the list, marked "Tried 4:12 PM". Only **✓ Done** records them as in touch and takes them off the list (with Undo). **Later** is for "couldn't reach them". Progress counts Done, e.g. "12 of 35 done".
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

## Planner (built 9 Nov 2026, replaces the Day to Day tile)
- **Events tab** (first; called Calendar until 10 Nov): weddings (Mehndi, Baraat, Walima, Nikah, Rukhsati) and other events (dinner, jalsa, meeting, meet-up, other), grouped by day. Weddings have only afternoon / night (or morning) as the time; other events (dinner, jalsa, meeting…) can have an exact time (column `events.time`, "16:30", added 11 Nov) or fall back to morning / afternoon / night, and a day is sorted by time. Tell Halqa and WhatsApp cards fill in the time when one is given. Past events sit under a toggle. Day to Day notes are linked from the bottom. Table `public.events` (migration 20261109000000).
- **Home:** a "Coming up" strip for the next 5 days (weddings, events, dated to-dos) and a Planner tile.
- **List tabs:** Islamabad, Lahore, Sargodha City and Halqa to start, plus "+ New list" (rename or delete from the ⋯ menu). Each is a checklist of people to meet and things to do there. Ticked items stay at the bottom for 7 days, then go under "Show done". An item with a date also shows under Events. Order: Events, Halqa, Islamabad, Lahore, Sargodha City. Tables `planner_lists` and `list_items` (migration 20261110000000; Usama runs it).
- **Tell Halqa** (home screen and top of the Planner): he types or dictates (keyboard mic, English or Urdu). Claude (Opus 5.5, his own API key, `lib/tell.js`) turns it into events, list items, village notes, a new contact (opens Quick Add filled in) or an answer to a question. Each thing is shown as a card; ✕ leaves it out, tapping opens the full form, and nothing is saved until he taps Add.
- **Home tile** just says "Planner", with a count under it only when something is waiting ("3 to review" / "5 upcoming") (10 Nov).
- **WhatsApp cards (working since 10 Nov):** share a card picture or PDF from WhatsApp → "Add to Halqa" Shortcut → the `read-cards` server function (Claude reads it) → "To review" at the top of Events, with the card saved in the private `event-cards` bucket. PDFs show as a red "PDF" box with "Open the PDF". Condolence cards are dropped for now (handwriting reading wasn't good enough).
  - Supabase secrets set by Usama: `ANTHROPIC_API_KEY` (a separate key named "Halqa cards") and `HALQA_SHARE_KEY` (his private code; spaces around it are ignored).
  - The Shortcut: Receive Images and PDFs from Share Sheet → Base64 Encode (Line Breaks: None) → Combine Text with Custom "," → Get Contents of URL (POST `https://zietsuiuzkfjjgbdybdd.supabase.co/functions/v1/read-cards`, header `x-halqa-key` = his code, Request Body File = Combined Text) → Show Notification (Contents of URL). On new iOS the Details ⓘ is at the bottom of the editor and stays grey until the Shortcut has one action.
  - A notification "Wrong Halqa code in the Shortcut." means the code in the header doesn't match the secret (watch for the iPhone capitalising the first letter).
- **Meeting notes moved into the lists (10 Nov):** the four general notes "Meetings Islamabad / Lahore / Halka / Sargodha City" became 35 list items, one per line with the exact text, in the same order. The original notes are still in Notes for Usama to delete.
- **Tell Halqa dictation:** the 🎙 is the iPhone keyboard's (Apple's speech recognition), not Claude's, so names and mixed Urdu/English come out worse than in the Claude app. Options offered (Usama is leaving it for now, 10 Nov): (1) switch to an English (India) keyboard for dictation; (2) have Claude correct misheard names against contact and village names; (3) record inside Halqa and use a dedicated speech-to-text service (OpenAI or ElevenLabs, extra key, about Rs 2 per minute).
- **Next:** Usama is trying out what he says in Tell Halqa against where things land in the Planner, and will come back with changes.

## Ideas Usama is considering (not started)
- **Briefing picks in the Today list** (discussed 8 Nov; Usama is thinking about it):
  - The monthly briefing would also hand Halqa its ~15 "people to see" as contact IDs, with a one-line reason and talking point each, saved in `analysis_reports.meta`.
  - They would come into the Today list a few a day (e.g. 3), within the 35, with a ✨ Briefing badge, "Why now" and "Talk about" on the card.
  - Later and carry-forward work as normal, and a new briefing replaces unreached picks.
  - Open choices: how many a day, and whether inside the 35 or extra.
- **Other ideas offered 8 Nov, not chosen yet:**
  - "Plan visit" on a village page: its people in order, pinned and longest out of touch first, with the 2024 result and notes on one screen.
  - A one-card-at-a-time "go through" mode for the Today list.
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
