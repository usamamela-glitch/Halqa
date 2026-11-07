// "In touch": the last day Usama actually reached someone. Recorded only when
// he confirms it:
//   - ✓ Done in the Today list,
//   - ✓ Yes on "Reached …?" after a WhatsApp or call from anywhere else,
//   - the "Mark as in touch today" button on a contact card.
// Tapping WhatsApp or Call is only an attempt ("Tried 4:12 PM" in the Today
// list); opening a card never counts. Rule in force from 8 November 2026;
// before that, opening a card or tapping WhatsApp/Call counted too.
// Stored in contacts.last_contacted (the column predates the new meaning).
import { db, getMeta, setMeta } from './db'
import { updateRow } from './store'

export const CONFIRMED_SINCE = '8 November 2026'

export function localDay(d = new Date()) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const inTouchToday = c => !!(c && c.last_contacted && localDay(c.last_contacted) === localDay())

// Records "in touch today". Returns an undo function.
export async function markInTouch(id) {
  const c = await db.contacts.get(id)
  if (!c) return () => {}
  const before = c.last_contacted || null
  if (!inTouchToday(c)) await updateRow('contacts', id, { last_contacted: new Date().toISOString() })
  return () => updateRow('contacts', id, { last_contacted: before })
}

// ---------- Attempts (WhatsApp / Call taps) ----------

const ASK_KEY = 'halqa.reachedAsk'
const ASK_WITHIN_MS = 3 * 60 * 60 * 1000

// Today's attempts on this device: { contactId: ISO time of the latest }.
export async function attemptsToday() {
  const a = await getMeta('attempts', null)
  return a && a.day === localDay() ? a.byId : {}
}

// Called on every WhatsApp or Call tap. People who are open in today's list
// are confirmed with ✓ Done there; anyone else gets "Reached …?" on return.
export async function recordAttempt(contact) {
  const now = new Date().toISOString()
  const byId = await attemptsToday()
  await setMeta('attempts', { day: localDay(), byId: { ...byId, [contact.id]: now } })
  const daily = await getMeta('daily', null)
  const inTodayList = daily && daily.date === localDay() && daily.items.some(x => x.id === contact.id && x.state === 'open')
  try {
    if (inTodayList) localStorage.removeItem(ASK_KEY)
    else localStorage.setItem(ASK_KEY, JSON.stringify({ id: contact.id, name: contact.name, at: Date.now() }))
  } catch { /* storage blocked: no question, nothing recorded */ }
}

// The pending "Reached …?" question, taken off the queue so it is asked once.
export function takeReachedQuestion() {
  try {
    const q = JSON.parse(localStorage.getItem(ASK_KEY) || 'null')
    if (!q) return null
    localStorage.removeItem(ASK_KEY)
    return Date.now() - q.at < ASK_WITHIN_MS ? q : null
  } catch { return null }
}
