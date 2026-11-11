# Halqa: the native iPhone app

Agreed with Usama, 11 Nov 2026. This is the build list for when Apple approves the developer account.

## How it works
- **Same app, same look.** The current Halqa is wrapped in a native iPhone shell (Capacitor). Every screen and all data stay as they are.
- **Changes still go live instantly.** Screens, the Planner, Tell Halqa, the AI and the layout update the moment they're shipped, exactly like now.
- **New iPhone features need an update.** Widgets, caller ID, the share menu and permissions need a new build, which is about 20–30 minutes of building, then one TestFlight update on the phone.
- **Installed through TestFlight.** The icon is the same Halqa icon. Apple adds a small orange dot before the name, which can't be removed.
- **It never expires.** TestFlight builds last 90 days, so an automatic rebuild runs about every 60 days. The Apple Developer account ($99 a year) must stay paid.
- **Built in the cloud.** No Mac needed.

## Phase 1: the first build
1. **Halqa in the share menu**, replacing both long Shortcuts:
   - **Event:** a wedding card picture, a PDF, or an invitation sent as a text message. Claude reads it, and it goes to *To review* in the Planner.
   - **Contact:** a contact card, or a message with a number in it. Quick Add opens already filled in.
2. **Back Tap stays.** A ready-made one-block Shortcut, "Quick Add copied number": copy a number, Back Tap, and Quick Add opens with it filled in, never in Safari. Numbers split over two lines are joined.
3. **iPhone contacts stay in step with Halqa, automatically.** Halqa is the master copy.
   - **New contact in Halqa:** saved to the iPhone contacts too. No more "Save to iPhone" step.
   - **Edited in Halqa** (name, a number added or changed): the matching iPhone contact is updated by itself, so it's always the **exact same name** as in Halqa. Example: "Afzal Naseerpur" became "Afzal Maachi Naseerpur" (11 Nov).
   - **Matching:** each Halqa person is linked to their iPhone contact. Existing ones are linked once by phone number. If two iPhone contacts share a number, Halqa asks which.
   - **No village added to names:** Usama already writes the place into names, so no "(village)" suffix, to avoid doubling.
   - **Deleting** someone in Halqa never deletes them from the iPhone; Halqa asks instead.
   - **Edits made on the iPhone** don't flow back into Halqa (one direction only, keeps it simple). Could be added later.
4. **Caller ID.** An incoming call from any Halqa number shows "Name · Village · Pinned", even if the number isn't saved on the iPhone.
5. **Native polish:**
   - no Safari and no web address bar
   - a proper icon and opening screen
   - small vibrations on taps (haptics)
   - smoother keyboard and swipe-back
   - the status bar matched to the green header
   - offline data kept permanently
   - links always open the app

6. **Share a contact card from Halqa.** On anyone's profile, a **Share contact** button opens the iPhone share menu with a proper contact card: name, all numbers, and the village in the card. Pick **WhatsApp**, then the person or group, and it arrives as a normal contact card they can save with one tap. It works for Messages, email and AirDrop too. (Asked 12 Nov.)
   - **Several at once:** in any list (a village's Contacts tab, Main Groups, the Today list, Search results, Recently added), a **Select** button lets you tick people (or **Select all**), then **Share**. They go as one bundle of contact cards: WhatsApp shows them in one message, each with its own Save button. (Asked 12 Nov.)

7. **Swipe left in the Planner** (every tab: Events and all lists), like the iPhone Notes app. (Asked 12 Nov.)
   - **List items:** Share · Move (to another list) · Delete.
   - **Events:** Share · Delete. Share sends the details as text, e.g. "Baraat · Daughter of Umer Farooq · The Signature Club, G.T Road, Gujranwala · Thu 12 Nov, night".
   - Deleting shows an Undo for a few seconds, so an accidental swipe can be reversed.
   - **Built in the web app on 12 Nov**, so it carries over as it is.

## Phase 2
8. **Location** (with permission "Always"):
   - Halqa records which villages you visit, and when.
   - Visits go into the AI reports and the monthly briefing.
   - Arriving in a village: "You're in Hujjan · 8 numbers · 2 pinned · last visit 4 months ago".
9. **Reminders:**
   - events, e.g. "Mehndi tonight · Halalpur"
   - the Today list, e.g. "26 people left today" in the evening
   - areas you've been away from, e.g. "Nobody in Bhabra contacted for 30 days"
10. **Widgets:** Today (9 of 35) and the next two events. They can be removed any time.
11. **iPhone Calendar:** Planner events go into the iPhone Calendar automatically, with the venue, so the Watch and CarPlay show them and one tap starts directions.
12. **After a call** started from Halqa, the "did you reach them?" question appears reliably.

## Phase 3
13. **Siri and the Action button:** "Tell Halqa…" and Quick Add.
14. **A better microphone for Tell Halqa:** record inside the app and use a proper speech-to-text service. This needs one extra API key (OpenAI or ElevenLabs), costing about Rs 2 per minute.

## Already in the app (carries over, nothing to do)
Everything in the web app comes across unchanged, including recent additions:
- **Event notes in bold navy blue** on the card's top row, usually who invited him (12 Nov).
- The Today hub on the home screen, event times, and the "Reached …? Yes / No" bar.

## Your friend (NA-78), later
A separate TestFlight app pointed at his own website and database, covered by Usama's developer account. The native features need his copy updated first, and that's his decision.

## Discussed and parked (not building now)
- **A message queue:** AI-written personal WhatsApp messages; tap to send, then the next. About 20 people in 10 minutes.
- **Personal voice notes** to top contacts.
- **WhatsApp Business broadcast lists** (people who saved the number), and the official WhatsApp business system (costly; Meta restricts political use).
- **Swing-vote fields:** leaning, influence, polling station linked to the 2024 results.
- **Going deeper:** photograph a dera register so Claude adds the names; a QR sign-up at events; prompts to ask regulars for more numbers.
- **Voter lists:** Usama isn't sure how these would work yet.
- **Election mode:** polling stations, booth agents, transport, turnout on the day, and results against relationships afterwards. To be picked up nearer the election.
- **Selling Halqa:** decided against on 11 Nov; it's a competitive edge.

## Waiting on Usama (after Apple's "Welcome" email)
- **Part 3:** send the Team ID; register the App ID `com.usamamela.halqa`.
- **Part 4:** create the app "Halqa NA-83" in App Store Connect (SKU `halqa1`).
- **Part 5:** create the API key "Halqa builds" (Admin). Save `APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID` and `APP_STORE_KEY` as GitHub Actions secrets in usamamela-glitch/halqa.
- **Part 6:** install TestFlight on the iPhone.
