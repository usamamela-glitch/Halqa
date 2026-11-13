// Works: development work people have asked for (roads, jobs, electricity…).
// One category per item; the Works tab shows one category at a time.
import { insertRow, updateRow, deleteRow, restoreRow } from './store'

export const WORK_CATEGORIES = [
  { id: 'roads', label: 'Roads' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'electricity', label: 'Electricity' },
  { id: 'gas', label: 'Gas' },
  { id: 'health', label: 'Health' },
  { id: 'education', label: 'Education' },
  { id: 'other', label: 'Other' },
]
const IDS = WORK_CATEGORIES.map(c => c.id)
export const categoryOf = w => (IDS.includes(w.category) ? w.category : 'other')
export const categoryLabel = id => (WORK_CATEGORIES.find(c => c.id === id) || WORK_CATEGORIES[WORK_CATEGORIES.length - 1]).label

// Done items stay in the list for 7 days, then go under "Show done".
export const WORK_DONE_KEEP_DAYS = 7
export const recentlyDone = w => !!w.done_at && Date.now() - new Date(w.done_at).getTime() < WORK_DONE_KEEP_DAYS * 864e5

// Oldest first, so the list keeps the order things were written down in.
export const byCreated = (a, b) => (a.created_at || '').localeCompare(b.created_at || '')

export function splitWorks(works) {
  const open = works.filter(w => !w.done_at).sort(byCreated)
  const done = works.filter(w => w.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at))
  return { open, recent: done.filter(recentlyDone), old: done.filter(w => !recentlyDone(w)) }
}

export function saveWork(id, data) {
  return id ? updateRow('works', id, data) : insertRow('works', { done_at: null, ...data })
}

// Returns an undo function.
export async function setWorkDone(work, done) {
  const before = work.done_at || null
  await updateRow('works', work.id, { done_at: done ? new Date().toISOString() : null })
  return () => updateRow('works', work.id, { done_at: before })
}

export async function removeWork(work) {
  await deleteRow('works', work.id)
  return () => restoreRow('works', work)
}

// Plain text for the iPhone share menu.
export function workShareText(work, villageNames, peopleNames) {
  return [
    `${categoryLabel(categoryOf(work))}: ${(work.body || '').trim()}`,
    villageNames.length ? `Village: ${villageNames.join(', ')}` : '',
    peopleNames.length ? `Asked by: ${peopleNames.join(', ')}` : '',
    work.self_identified ? 'Self identified' : '',
  ].filter(Boolean).join('\n')
}
