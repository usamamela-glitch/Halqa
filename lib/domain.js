export const TAGS = ['Key Voter', 'Opposition', 'Neutral', 'Government Officer', 'Religious Leader', 'Youth', 'Lawyer', 'Ours', 'Journalist', 'Wasayba Leader']

export function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'
}

export function filled(s) {
  return !!(s && String(s).trim())
}

// Brief: green = dynamics + development + at least one contact; red = empty.
export function villageCompletion(v, contactCount) {
  const checks = [
    filled(v.result_2018) || filled(v.result_2024),
    !!(v.population || v.registered_voters),
    filled(v.our_group) || filled(v.anti_group),
    filled(v.development),
    contactCount > 0,
  ]
  const done = checks.filter(Boolean).length
  const pct = Math.round((done / checks.length) * 100)
  const core = checks[2] && checks[3] && checks[4]
  const level = core ? 'green' : done === 0 ? 'red' : 'amber'
  return { pct, level }
}

export function daysSince(iso) {
  if (!iso) return null
  const then = new Date(iso)
  const now = new Date()
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((b - a) / 86400000))
}

export function contactedLevel(days) {
  if (days === null) return 'none'
  if (days < 7) return 'green'
  if (days <= 30) return 'amber'
  return 'red'
}

// "In touch" age, e.g. "Today", "5 days ago", "2 months ago", "Not yet".
export function contactedLabel(days) {
  if (days === null) return 'Not yet'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 45) return `${days} days ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  const years = Math.round(days / 365)
  return years === 1 ? 'A year ago' : `${years} years ago`
}

export function byName(a, b) {
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
}

export function sortContacts(list) {
  return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || byName(a, b))
}

export function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

// ---------- When a contact was added ----------

// Contacts added in bulk (the iPhone import, 25–29 Oct 2026) share one
// created_at per batch. Only people added one by one have a meaningful
// "added" date.
export function bulkAddTimes(contacts) {
  const n = new Map()
  contacts.forEach(c => n.set(c.created_at, (n.get(c.created_at) || 0) + 1))
  return new Set([...n].filter(([, k]) => k > 3).map(([t]) => t))
}

// "Today", "Yesterday", "Sat 7 Nov", "12 Sep", "3 Jun 2025"
export function addedLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
}

// "7 Nov 2026"
export const addedDate = iso => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
