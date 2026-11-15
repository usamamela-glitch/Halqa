// Works: development work people have asked for (roads, jobs, electricity…).
// One category per item; the Works tab shows one category at a time.
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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
const OTHER = WORK_CATEGORIES[WORK_CATEGORIES.length - 1]

// Lists he adds himself (Water, Sui gas…). The list's name is stored as the
// project's category, so a list with projects in it shows on every phone with
// no database change. A new list that is still empty is kept on this phone
// (in meta) until the first project goes into it.
const EXTRA_KEY = 'work_categories_extra'
const BUILT_IN_PREFIXES = WORK_CATEGORIES.map(c => c.prefix.toLowerCase())
export const isCustomCategory = id => !!id && !IDS.includes(id)
// Short letters for a custom list's numbers: "Water" → W-3. Never the same as a built-in one.
function customPrefix(name) {
  const letters = (name || '').replace(/[^A-Za-z0-9]/g, '') || 'X'
  for (let n = 1; n <= letters.length; n++) {
    const pre = letters[0].toUpperCase() + letters.slice(1, n).toLowerCase()
    if (!BUILT_IN_PREFIXES.includes(pre.toLowerCase())) return pre
  }
  return `${letters[0].toUpperCase()}${letters.slice(1).toLowerCase()}x`
}
const customInfo = id => ({ id, label: id, icon: '•', prefix: customPrefix(id), custom: true })

export const categoryOf = w => {
  const c = typeof w.category === 'string' ? w.category.trim() : ''
  return c ? c : 'other'
}
const categoryInfo = id => WORK_CATEGORIES.find(c => c.id === id) || (isCustomCategory(id) ? customInfo(id) : OTHER)
export const categoryIcon = id => categoryInfo(id).icon

// All the tabs: the built-in ones, then his own lists in alphabetical order,
// with Other always last.
export function allCategories(works, extra) {
  const custom = new Set(extra || [])
  ;(works || []).forEach(w => { const c = categoryOf(w); if (isCustomCategory(c)) custom.add(c) })
  const mine = [...custom].filter(isCustomCategory).sort((a, b) => a.localeCompare(b)).map(customInfo)
  return [...WORK_CATEGORIES.slice(0, -1), ...mine, OTHER]
}
export const getExtraCategories = async () => ((await db.meta.get(EXTRA_KEY))?.value || [])
const setExtraCategories = list => db.meta.put({ key: EXTRA_KEY, value: [...new Set(list)] })

// Live list of categories for screens.
export function useWorkCategories() {
  const works = useLiveQuery(() => db.works.toArray(), [], [])
  const extra = useLiveQuery(() => getExtraCategories(), [], [])
  return useMemo(() => allCategories(works, extra), [works, extra])
}

// The name typed for a new list, matched to an existing one if it's the same
// (so "roads" or "water " don't make a second tab). Returns the category id.
export async function addCategory(name) {
  const clean = (name || '').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  const k = clean.toLowerCase()
  const builtIn = WORK_CATEGORIES.find(c => c.id === k || c.label.toLowerCase() === k)
  if (builtIn) return builtIn.id
  const all = allCategories(await db.works.toArray(), await getExtraCategories())
  const same = all.find(c => c.label.toLowerCase() === k)
  if (same) return same.id
  await setExtraCategories([...(await getExtraCategories()), clean])
  return clean
}

// Rename one of his own lists: every project in it moves with it.
// Returns the new id (or the existing one, if the new name is already a list).
export async function renameCategory(from, to) {
  if (!isCustomCategory(from)) return from
  const clean = (to || '').replace(/\s+/g, ' ').trim()
  if (!clean || clean === from) return from
  const k = clean.toLowerCase()
  const builtIn = WORK_CATEGORIES.find(c => c.id === k || c.label.toLowerCase() === k)
  const target = builtIn ? builtIn.id : clean
  const works = (await db.works.toArray()).filter(w => categoryOf(w) === from)
  // Same list, new name: numbers stay as they are (unless it's merged into another list).
  const merging = (await db.works.toArray()).some(w => categoryOf(w) === target)
  for (const w of works) await (merging ? saveWork(w.id, { category: target }) : updateRow('works', w.id, { category: target }))
  const extra = (await getExtraCategories()).filter(x => x !== from)
  await setExtraCategories(isCustomCategory(target) ? [...extra, target] : extra)
  return target
}

// Remove one of his own lists. Its projects go to Other (nothing is deleted).
export async function removeCategory(id) {
  if (!isCustomCategory(id)) return
  const works = (await db.works.toArray()).filter(w => categoryOf(w) === id)
  for (const w of works) await saveWork(w.id, { category: 'other' })
  await setExtraCategories((await getExtraCategories()).filter(x => x !== id))
  return works.length
}

// Short number per category, to refer to out loud or on paper: R-17 is road 17, J-3 is job 3.
// Numbered oldest first; the database fills in any that are missing.
export const serialLabel = w => (w.serial ? `${categoryInfo(categoryOf(w)).prefix}-${w.serial}` : '')
async function nextSerial(category) {
  const all = await db.works.toArray()
  return all.filter(w => categoryOf(w) === category).reduce((m, w) => Math.max(m, w.serial || 0), 0) + 1
}

// Roads come in three sizes.
export const ROAD_TYPES = [
  { id: 'main', label: 'Main road', short: 'Main' },
  { id: 'link', label: 'Link road', short: 'Link' },
  { id: 'small', label: 'Small road', short: 'Small' },
]
export const roadTypeLabel = id => (ROAD_TYPES.find(r => r.id === id) || {}).label || ''

export const categoryLabel = id => categoryInfo(id).label

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
