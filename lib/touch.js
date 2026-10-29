// "In touch": the last day a contact came across Usama's screen in a way that
// counts — opening their contact card, or tapping WhatsApp or Call on them.
// Stored in contacts.last_contacted (the column predates the new meaning).
import { db } from './db'
import { updateRow } from './store'

export function localDay(d = new Date()) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const inTouchToday = c => !!(c && c.last_contacted && localDay(c.last_contacted) === localDay())

export async function markInTouch(id) {
  const c = await db.contacts.get(id)
  if (!c || inTouchToday(c)) return
  await updateRow('contacts', id, { last_contacted: new Date().toISOString() })
}
