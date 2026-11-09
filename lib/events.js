// The Planner: weddings (most of it) and other events. Cards shared from
// WhatsApp arrive with status 'review' (read by the read-cards server
// function); Usama confirms them. Times are only "morning / afternoon / night".
import { db } from './db'
import { insertRow, updateRow, deleteRow } from './store'
import { localDay } from './touch'

export const KINDS = [
  { id: 'wedding', label: 'Wedding' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'jalsa', label: 'Jalsa' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'meetup', label: 'Meet-up' },
  { id: 'other', label: 'Other' },
]
export const kindLabel = id => (KINDS.find(k => k.id === id) || KINDS[KINDS.length - 1]).label

export const WEDDING_FUNCTIONS = ['Mehndi', 'Baraat', 'Walima', 'Nikah', 'Rukhsati']
export const PARTS = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'night', label: 'Night' },
]
const PART_ORDER = { morning: 0, afternoon: 1, night: 2 }
export const partLabel = id => (PARTS.find(p => p.id === id) || {}).label || ''

// The label shown on a line: the function for weddings ("Walima"), else the kind ("Jalsa").
export const tagFor = ev => (ev.kind === 'wedding' ? ev.function || 'Wedding' : ev.function || kindLabel(ev.kind))

export const sortEvents = list =>
  [...list].sort((a, b) => (a.day || '9999').localeCompare(b.day || '9999') || (PART_ORDER[a.part] ?? 1) - (PART_ORDER[b.part] ?? 1) || (a.title || '').localeCompare(b.title || ''))

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localDay(d)
}

// "Today", "Tomorrow", "Sat 14 Nov", "Sat 14 Nov 2027"
export function dayLabel(day) {
  if (!day) return 'No date'
  const today = localDay()
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  if (day === addDays(today, -1)) return 'Yesterday'
  const d = new Date(`${day}T12:00:00`)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).replace(',', '')
}

export const confirmEvent = id => updateRow('events', id, { status: 'confirmed', unsure: false })
export const removeEvent = id => deleteRow('events', id)

// ---------- Lists (Islamabad, Lahore, Sargodha City, Halqa…) ----------

export const DONE_KEEP_DAYS = 7

export const sortLists = lists => [...lists].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.name || '').localeCompare(b.name || ''))

// Finds a list by name (any case), creating it if it doesn't exist. Returns its id.
export async function listIdByName(name) {
  const clean = (name || '').trim()
  const lists = await db.planner_lists.toArray()
  const hit = lists.find(l => l.name.toLowerCase() === clean.toLowerCase())
  if (hit) return hit.id
  const row = await insertRow('planner_lists', { name: clean || 'Other', sort: lists.reduce((m, l) => Math.max(m, l.sort || 0), 0) + 1 })
  return row.id
}

export const toggleDone = item => updateRow('list_items', item.id, { done_at: item.done_at ? null : new Date().toISOString() })
export const removeListItem = id => deleteRow('list_items', id)
