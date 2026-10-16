export const TAGS = ['Influencer', 'Key Voter', 'Opposition', 'Neutral', 'Government Officer', 'Religious Leader', 'Youth', 'Other']

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

export function contactedLabel(days) {
  if (days === null) return 'Never contacted'
  if (days === 0) return 'Contacted today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
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
