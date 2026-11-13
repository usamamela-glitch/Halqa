// Works: development work people have asked for (roads, jobs, electricity…).
// One category per item; the Works tab shows one category at a time.
import { db } from './db'
import { insertRow, updateRow, deleteRow, restoreRow } from './store'

export const WORK_CATEGORIES = [
  { id: 'roads', label: 'Roads', icon: '🛣', prefix: 'R' },
  { id: 'jobs', label: 'Jobs', icon: '💼', prefix: 'J' },
  { id: 'electricity', label: 'Electricity', icon: '⚡', prefix: 'E' },
  { id: 'gas', label: 'Gas', icon: '🔥', prefix: 'G' },
  { id: 'health', label: 'Health', icon: '🏥', prefix: 'H' },
  { id: 'education', label: 'Education', icon: '🎓', prefix: 'Ed' },
  { id: 'other', label: 'Other', icon: '•', prefix: 'O' },
]
const IDS = WORK_CATEGORIES.map(c => c.id)
export const categoryOf = w => (IDS.includes(w.category) ? w.category : 'other')
const categoryInfo = id => WORK_CATEGORIES.find(c => c.id === id) || WORK_CATEGORIES[WORK_CATEGORIES.length - 1]
export const categoryIcon = id => categoryInfo(id).icon

// Short number per category, to refer to out loud or on paper: R-17 is road 17, J-3 is job 3.
// Numbered oldest first; the database fills in any that are missing.
export const serialLabel = w => (w.serial ? `${categoryInfo(categoryOf(w)).prefix}-${w.serial}` : '')
async function nextSerial(category) {
  const all = await db.works.toArray()
  return all.filter(w => categoryOf(w) === category).reduce((m, w) => Math.max(m, w.serial || 0), 0) + 1
}

export const categoryLabel = id => (WORK_CATEGORIES.find(c => c.id === id) || WORK_CATEGORIES[WORK_CATEGORIES.length - 1]).label

// Done items stay in the list for 7 days, then go under "Show done".
export const WORK_DONE_KEEP_DAYS = 7
export const recentlyDone = w => !!w.done_at && Date.now() - new Date(w.done_at).getTime() < WORK_DONE_KEEP_DAYS * 864e5

// Oldest first, so the list keeps the order things were written down in.
export const byCreated = (a, b) => (a.created_at || '').localeCompare(b.created_at || '')

// Pinned items go first (oldest pinned first), then the rest, oldest first.
const pinnedFirst = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || byCreated(a, b)
export function splitWorks(works) {
  const open = works.filter(w => !w.done_at).sort(pinnedFirst)
  const done = works.filter(w => w.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at))
  return { open, recent: done.filter(recentlyDone), old: done.filter(w => !recentlyDone(w)) }
}

// A new item, or one moved to another category, gets the next number in its category.
export async function saveWork(id, data) {
  if (!id) return insertRow('works', { done_at: null, serial: await nextSerial(categoryOf(data)), ...data })
  const before = await db.works.get(id)
  const patch = { ...data }
  if (data.category && before && categoryOf(before) !== categoryOf(data)) patch.serial = await nextSerial(categoryOf(data))
  return updateRow('works', id, patch)
}

// Returns an undo function.
export async function setWorkDone(work, done) {
  const before = work.done_at || null
  await updateRow('works', work.id, { done_at: done ? new Date().toISOString() : null })
  return () => updateRow('works', work.id, { done_at: before })
}

// Returns an undo function.
export async function setWorkPinned(work, pinned) {
  const before = !!work.pinned
  await updateRow('works', work.id, { pinned })
  return () => updateRow('works', work.id, { pinned: before })
}

export async function removeWork(work) {
  await deleteRow('works', work.id)
  return () => restoreRow('works', work)
}

// Plain text for the iPhone share menu.
export function workShareText(work, villageNames, peopleNames) {
  return [
    `${categoryLabel(categoryOf(work))}${work.serial ? ` ${serialLabel(work)}` : ''}: ${(work.body || '').trim()}`,
    villageNames.length ? `Village: ${villageNames.join(', ')}` : '',
    peopleNames.length ? `Asked by: ${peopleNames.join(', ')}` : '',
    work.self_identified ? 'Self identified' : '',
  ].filter(Boolean).join('\n')
}
