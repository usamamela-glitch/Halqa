// The daily list: every day, 15 pinned + 20 unpinned people to get in touch
// with, picked at random from those not in touch for the longest. Kept on this
// phone (db.meta 'daily'); the per-contact "Later" and "Don't show again"
// flags live on the contact, so they sync.
//
// Item states: open (to do), later / hidden (swapped for someone new). An open
// item whose contact is in touch today counts as done, wherever that happened.
import { db, getMeta, setMeta } from './db'
import { updateRow } from './store'
import { phonesOf } from './phone'
import { localDay, inTouchToday } from './touch'

export const SPLIT = { pinned: 15, unpinned: 20 }
const LATER_DAYS = 7
const NEW_WAIT_DAYS = 7          // new contacts first come up a week after being added
const NEW_WINDOW_DAYS = 21       // ...and get priority until three weeks after
const DAY = 86400000

const kindOf = c => (c.pinned ? 'pinned' : 'unpinned')

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Contacts added in bulk (the iPhone import) share one created_at; only people
// added one by one get the "a week later" follow-up priority.
function bulkTimes(contacts) {
  const n = new Map()
  contacts.forEach(c => n.set(c.created_at, (n.get(c.created_at) || 0) + 1))
  return new Set([...n].filter(([, k]) => k > 3).map(([t]) => t))
}

// Pick `count` people of one kind, never anyone in `exclude`.
function pick(contacts, kind, count, exclude, now = Date.now()) {
  if (count <= 0) return []
  const bulk = bulkTimes(contacts)
  const eligible = contacts.filter(c =>
    kindOf(c) === kind &&
    !exclude.has(c.id) &&
    !c.list_hidden &&
    !(c.snoozed_until && Date.parse(c.snoozed_until) > now) &&
    phonesOf(c).length > 0 &&
    !inTouchToday(c) &&
    !(c.created_at && now - Date.parse(c.created_at) < NEW_WAIT_DAYS * DAY))

  // New people (added one by one 1–3 weeks ago, not in touch since): first.
  const isFollowUp = c => c.created_at && !bulk.has(c.created_at) &&
    now - Date.parse(c.created_at) < NEW_WINDOW_DAYS * DAY &&
    !(c.last_contacted && Date.parse(c.last_contacted) >= Date.parse(c.created_at) + NEW_WAIT_DAYS * DAY - DAY)
  const followUps = shuffle(eligible.filter(isFollowUp)).slice(0, count)

  // The rest: random among the longest out of touch ("Not yet" counts as longest).
  const taken = new Set(followUps.map(c => c.id))
  const rest = eligible
    .filter(c => !taken.has(c.id))
    .sort((a, b) => (a.last_contacted ? Date.parse(a.last_contacted) : 0) - (b.last_contacted ? Date.parse(b.last_contacted) : 0))
  const need = count - followUps.length
  const window = rest.slice(0, Math.max(need * 4, 60))
  return [...followUps, ...shuffle(window).slice(0, need)]
}

const item = c => ({ id: c.id, kind: kindOf(c), state: 'open' })

// Today's list, building a new one (with yesterday's leftovers) on a new day.
export async function ensureToday() {
  const today = localDay()
  const saved = await getMeta('daily', null)
  if (saved && saved.date === today) return saved
  const contacts = await db.contacts.toArray()
  const byId = new Map(contacts.map(c => [c.id, c]))

  // Leftovers carry forward: still open, still wanted, not in touch yesterday.
  const leftovers = (saved?.items || []).filter(it => {
    const c = byId.get(it.id)
    return it.state === 'open' && c && !c.list_hidden && !(c.last_contacted && localDay(c.last_contacted) === saved.date)
  }).map(it => ({ ...it, kind: kindOf(byId.get(it.id)), state: 'open' }))

  const exclude = new Set(leftovers.map(it => it.id))
  const fresh = []
  for (const kind of ['pinned', 'unpinned']) {
    const have = leftovers.filter(it => it.kind === kind).length
    pick(contacts, kind, SPLIT[kind] - have, exclude).forEach(c => { exclude.add(c.id); fresh.push(item(c)) })
  }
  const daily = { date: today, items: [...leftovers, ...fresh] }
  await setMeta('daily', daily)
  return daily
}

async function addPeople(daily, counts) {
  const contacts = await db.contacts.toArray()
  const exclude = new Set(daily.items.map(it => it.id))
  const added = []
  for (const [kind, n] of Object.entries(counts)) {
    pick(contacts, kind, n, exclude).forEach(c => { exclude.add(c.id); added.push(item(c)) })
  }
  return added
}

// "Show me 35 more".
export async function showMore() {
  const daily = await ensureToday()
  const added = await addPeople(daily, SPLIT)
  await setMeta('daily', { ...daily, items: [...daily.items, ...added] })
  return added.length
}

// "Later" (back in about a week) or "Don't show again": swap for someone new of the same kind.
// Returns an undo function.
export async function setAside(id, how) {
  const daily = await ensureToday()
  const it = daily.items.find(x => x.id === id)
  if (!it) return () => {}
  const contact = await db.contacts.get(id)
  const before = { snoozed_until: contact?.snoozed_until || null, list_hidden: !!contact?.list_hidden }
  await updateRow('contacts', id, how === 'later'
    ? { snoozed_until: new Date(Date.now() + LATER_DAYS * DAY).toISOString() }
    : { list_hidden: true })
  const [replacement] = await addPeople(daily, { [it.kind]: 1 })
  const items = daily.items.map(x => (x.id === id ? { ...x, state: how } : x))
  await setMeta('daily', { ...daily, items: replacement ? [...items, replacement] : items })

  return async () => {
    await updateRow('contacts', id, before)
    const now = await getMeta('daily', daily)
    await setMeta('daily', {
      ...now,
      items: now.items
        .filter(x => !(replacement && x.id === replacement.id && x.state === 'open'))
        .map(x => (x.id === id ? { ...x, state: 'open' } : x)),
    })
  }
}
