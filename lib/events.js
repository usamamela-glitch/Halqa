// The Planner: weddings (most of it) and other events. Cards shared from
// WhatsApp arrive with status 'review' (read by the read-cards server
// function); Usama confirms them. Times are only "morning / afternoon / night".
import { updateRow, deleteRow } from './store'
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
