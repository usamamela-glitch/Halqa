// Tell Halqa: changing things that are already in Halqa (contacts, events,
// list items, lists, projects, notes, villages, qanungos).
// For each change Claude returns, describe() says what the card shows (and
// finds the thing it's about), and run() saves it through the same functions
// the screens use. Every run records how to put things back, for Undo.
import { db } from '../lib/db'
import { insertRow, updateRow, deleteRow, restoreRow } from '../lib/store'
import { categoryLabel, roadTypeLabel, serialLabel, allCategories, categoryOf, saveWork, setWorkDone, setWorkPinned } from '../lib/works'
import { cleanText, phonesOf } from '../lib/phone'
import { TAGS } from '../lib/domain'
import { listIdByName, dayLabel, whenLabel, partFromTime, partLabel, timeLabel, tagFor, kindLabel } from '../lib/events'
import { markInTouch, inTouchToday } from '../lib/touch'
import { tidyToday, markDone, openInToday } from '../lib/daily'
import { plainText, bodyPaths } from '../lib/images'
import t from '../styles/tell.module.css'

// ---------- Finding things ----------

export const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const findVillage = (villages, name) => {
  const n = norm(name)
  return n ? villages.find(v => norm(v.name) === n) || villages.find(v => norm(v.name).includes(n) || n.includes(norm(v.name))) : null
}
const findByName = (rows, name) => {
  const n = norm(name)
  return n ? rows.find(r => norm(r.name) === n) || rows.find(r => norm(r.name).includes(n) || n.includes(norm(r.name))) : null
}
// People he named, matched to his contacts: one match is used; none or several are flagged on the card.
export function matchPeople(contacts, names) {
  return (names || []).map(said => {
    const k = norm(said)
    if (!k) return null
    const exact = contacts.filter(c => norm(c.name) === k)
    const words = said.toLowerCase().split(/\s+/).filter(w => w.length > 1)
    const loose = exact.length ? exact : contacts.filter(c => { const n = (c.name || '').toLowerCase(); return words.length && words.every(w => n.includes(w)) })
    return { said, matches: loose.slice(0, 6) }
  }).filter(Boolean)
}
export const villageIds = (villages, names) => [...new Set((names || []).map(n => findVillage(villages, n)?.id).filter(Boolean))]
// "R-17" → the project with that number.
export function findWork(works, serial) {
  const m = /^\s*([A-Za-z]+)\s*-?\s*(\d+)\s*$/.exec(serial || '')
  if (!m) return null
  const ids = allCategories(works).filter(c => c.prefix.toLowerCase() === m[1].toLowerCase()).map(c => c.id)
  return works.find(w => ids.includes(categoryOf(w)) && w.serial === +m[2]) || null
}
// The contact he means: by name, narrowed by village if he said one. A picked one wins.
function contactsFor(a, contacts, villages) {
  if (a.pick_id) return contacts.filter(c => c.id === a.pick_id)
  let m = matchPeople(contacts, [a.name])[0]?.matches || []
  if (!m.length && a.name) {   // the place may be written into the name: try the first words
    const words = a.name.split(/\s+/)
    for (let n = words.length - 1; n >= 2 && !m.length; n--) m = matchPeople(contacts, [words.slice(0, n).join(' ')])[0]?.matches || []
  }
  const v = a.village && findVillage(villages, a.village)
  if (m.length > 1 && v) { const inV = m.filter(c => c.village_id === v.id); if (inV.length) m = inV }
  return m
}
// The note he means: in that village (or the Planner's notes), by the words he gave.
const firstLine = body => (plainText(body || '').split('\n').map(s => s.trim()).find(Boolean) || 'Empty note').slice(0, 90)
function notesFor(a, D) {
  const v = a.village ? findVillage(D.villages, a.village) : null
  if (a.village && !v) return { table: 'notes', found: [], v: null }
  const table = v ? 'notes' : 'general_notes'
  const pool = (v ? D.notes.filter(n => n.village_id === v.id) : D.generalNotes)
    .slice().sort((x, y) => (y.updated_at || y.created_at || '').localeCompare(x.updated_at || x.created_at || ''))
  if (a.pick_id) return { table, v, found: pool.filter(n => n.id === a.pick_id) }
  if (pool.length <= 1) return { table, v, found: pool }
  const words = (a.old_value || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2)
  if (!words.length) return { table, v, found: pool.slice(0, 6) }
  const scored = pool.map(n => { const txt = plainText(n.body || '').toLowerCase(); return [n, words.filter(w => txt.includes(w)).length] })
  const best = Math.max(...scored.map(s => s[1]))
  return { table, v, found: best ? scored.filter(s => s[1] === best).map(s => s[0]).slice(0, 6) : pool.slice(0, 6) }
}

// ---------- Small helpers ----------

const clean = s => cleanText(s || '').replace(/[ \t]+/g, ' ').trim()
const joinText = (old, add) => { const o = (old || '').trim(), n = clean(add); return n ? (o ? `${o}${/[.!?:]$/.test(o) ? '' : '.'} ${n}` : n) : null }
const phoneKey = p => (p || '').replace(/\D/g, '').replace(/^92/, '0').slice(-10)
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const asBody = text => clean(text) ? text.split('\n').map(l => `<div>${escape(l.trim()) || '<br>'}</div>`).join('') : ''
const vName = (D, id) => D.villages.find(v => v.id === id)?.name || ''

const Old = ({ children }) => <span className={t.old}>{children}</span>
const New = ({ children }) => <b className={t.added}>{children}</b>
const Bad = ({ children }) => <b className={t.danger}>{children}</b>
const added = (old, now) => <>{old ? <Old>{old} </Old> : null}<New>+ {now}</New></>
const replaced = (old, now, empty = 'Nothing yet') => <><Old><s>{old || empty}</s></Old><br /><New>{now}</New></>
const arrow = (from, to) => <>{from} → <New>{to}</New></>
const clip = (s, n = 220) => (s && s.length > n ? `${s.slice(0, n)}…` : s)

// Undo: snapshots of rows before they change, and what was added.
export function recorder() {
  const undos = []
  return {
    undos,
    async snap(table, id) { const row = await db[table].get(id); if (row) undos.push(() => restoreRow(table, row)) },
    added(table, id) { undos.push(() => deleteRow(table, id)) },
    push(fn) { undos.push(fn) },
    async undo() { for (const fn of undos.reverse()) await fn() },
  }
}
async function update(rec, table, id, patch) { await rec.snap(table, id); await updateRow(table, id, patch) }
async function remove(rec, table, id) { await rec.snap(table, id); await deleteRow(table, id) }

// ---------- Contacts ----------

const CONTACT = {
  add_description: 'Add to description', replace_description: 'New description', add_phone: 'Add a number', remove_phone: 'Remove a number',
  replace_phone: 'Change a number', add_tags: 'Add tags', remove_tags: 'Remove tags', pin: 'Pin to Main Groups', unpin: 'Unpin',
  set_village: 'Move village', rename: 'Rename', in_touch: 'In touch today', hide_daily: 'Hide from daily list', show_daily: 'Back in daily list', delete: 'Delete',
}
function contactPatch(a, c, D) {
  const txt = clean(a.details)
  const slots = phones => ({ phone: phones[0] || null, phone2: phones[1] || null, phone3: phones[2] || null })
  switch (a.change) {
    case 'add_description': { const n = joinText(c.description, a.details); return n ? { description: n } : null }
    case 'replace_description': return txt ? { description: txt } : null
    case 'add_phone': {
      const ph = clean(a.phone)
      if (!ph || phonesOf(c).some(p => phoneKey(p) === phoneKey(ph))) return null
      const slot = ['phone', 'phone2', 'phone3'].find(k => !(c[k] || '').trim())
      return slot ? { [slot]: ph } : null
    }
    case 'remove_phone': {
      const all = phonesOf(c), left = all.filter(p => phoneKey(p) !== phoneKey(a.phone || a.old_value))
      return left.length < all.length && left.length ? slots(left) : null
    }
    case 'replace_phone': {
      const all = phonesOf(c), ph = clean(a.phone)
      const i = a.old_value ? all.findIndex(p => phoneKey(p) === phoneKey(a.old_value)) : all.length === 1 ? 0 : -1
      if (!ph || i < 0 || phoneKey(all[i]) === phoneKey(ph)) return null
      return slots(all.map((p, k) => (k === i ? ph : p)))
    }
    case 'add_tags': { const add = (a.tags || []).filter(tg => TAGS.includes(tg) && !(c.tags || []).includes(tg)); return add.length ? { tags: [...(c.tags || []), ...add] } : null }
    case 'remove_tags': { const left = (c.tags || []).filter(tg => !(a.tags || []).includes(tg)); return left.length < (c.tags || []).length ? { tags: left } : null }
    case 'pin': return c.pinned ? null : { pinned: true }
    case 'unpin': return c.pinned ? { pinned: false } : null
    case 'set_village': { const v = findVillage(D.villages, a.new_village || a.village); return v && v.id !== c.village_id ? { village_id: v.id } : null }
    case 'rename': { const n = clean(a.new_name); return n && n !== c.name ? { name: n } : null }
    case 'in_touch': return inTouchToday(c) ? null : { in_touch: true }
    case 'hide_daily': return c.list_hidden ? null : { list_hidden: true }
    case 'show_daily': return c.list_hidden || c.snoozed_until ? { list_hidden: false, snoozed_until: null } : null
    case 'delete': return { delete: true }
    default: return null
  }
}
function contactSub(a, c, p, D) {
  if (p.delete) return <Bad>Delete {c.name} from Halqa</Bad>
  switch (a.change) {
    case 'add_description': return added(c.description, p.description.slice((c.description || '').trim().length).replace(/^\.?\s*/, ''))
    case 'replace_description': return replaced(c.description, p.description, 'No description')
    case 'add_phone': return <New>+ 📞 {Object.values(p)[0]}</New>
    case 'remove_phone': case 'replace_phone': return arrow(phonesOf(c).join(' · '), [p.phone, p.phone2, p.phone3].filter(Boolean).join(' · '))
    case 'add_tags': return <New>+ {p.tags.filter(tg => !(c.tags || []).includes(tg)).join(', ')}</New>
    case 'remove_tags': return <>{(c.tags || []).filter(tg => !p.tags.includes(tg)).map(tg => <s key={tg}>{tg} </s>)}</>
    case 'pin': return <New>📌 Pin to Main Groups</New>
    case 'unpin': return <b>Unpin from Main Groups</b>
    case 'set_village': return arrow(vName(D, c.village_id) || 'No village', vName(D, p.village_id))
    case 'rename': return arrow(c.name, p.name)
    case 'in_touch': return <New>✓ In touch today</New>
    case 'hide_daily': return <b>Don't show in the daily list</b>
    case 'show_daily': return <New>Show in the daily list again</New>
    default: return null
  }
}
const contactPlan = {
  describe(a, D) {
    const found = contactsFor(a, D.contacts, D.villages)
    const c = found.length === 1 ? found[0] : null
    const out = { icon: 'contact', head: `Update ${c ? c.name : a.name || 'contact'}`, dest: CONTACT[a.change] || '' }
    if (c) {
      const p = contactPatch(a, c, D)
      out.title = <>{c.name}<span className={t.who}> · {vName(D, c.village_id) || 'No village'}</span></>
      if (p) { out.sub = contactSub(a, c, p, D); out.ok = true; out.danger = !!p.delete }
      else out.question = a.change === 'add_phone' && phonesOf(c).length >= 3 ? 'All three number slots are full · this will be skipped'
        : a.change === 'remove_phone' && phonesOf(c).length === 1 ? "That's their only number · this will be skipped"
        : a.change === 'in_touch' ? 'Already in touch today · nothing to do' : 'Nothing to change · this will be skipped'
    } else if (found.length > 1) {
      out.question = `Which ${a.name}? (${found.length} in Halqa) · pick one`
      out.choices = found.slice(0, 6).map(x => ({ id: x.id, label: x.name, sub: [vName(D, x.village_id), x.phone].filter(Boolean).join(' · ') }))
    } else out.question = `${a.name || 'This person'} isn't in Halqa · this will be skipped`
    return out
  },
  async run(a, D, rec) {
    const found = contactsFor(a, D.contacts, D.villages)
    if (found.length !== 1) return false
    const c = await db.contacts.get(found[0].id)
    const p = c && contactPatch(a, c, D)
    if (!p) return false
    if (p.delete) { await remove(rec, 'contacts', c.id); await tidyToday(); return }
    if (p.in_touch) { rec.push(await ((await openInToday(c.id)) ? markDone(c.id) : markInTouch(c.id))); return }
    await update(rec, 'contacts', c.id, p)
    if ('list_hidden' in p) await tidyToday()
  },
}

// ---------- Events ----------

const PLANNER = {
  add_details: 'Add to note', replace_details: 'New note', set_date: 'New date', set_time: 'New time', set_venue: 'New venue', rename: 'Rename',
  pin: 'Pin', unpin: 'Unpin', delete: 'Delete', done: 'Mark done', not_done: 'Not done', move: 'Move', set_kind: 'Change type',
  set_village: 'Village', approve: 'Add to Planner', discard: 'Discard card',
}
const batchOf = (D, e) => (e.batch_id ? D.events.filter(x => x.batch_id === e.batch_id && x.status === 'review') : [e])
function eventPatch(a, e) {
  switch (a.change) {
    case 'add_details': { const n = joinText(e.notes, a.details); return n ? { notes: n } : null }
    case 'replace_details': { const n = clean(a.details); return n ? { notes: n } : null }
    case 'set_date': return a.date && a.date !== e.day ? { day: a.date } : null
    case 'set_time':
      if (a.time && e.kind !== 'wedding') return { time: a.time, part: partFromTime(a.time) }
      if (a.time) return { part: partFromTime(a.time) }
      return a.part && a.part !== e.part ? { part: a.part, time: null } : null
    case 'set_venue': { const v = clean(a.venue); return v && v !== e.venue ? { venue: v } : null }
    case 'set_village': { const v = clean(a.village || a.new_village); return v && v !== e.village ? { village: v } : null }
    case 'set_kind': {
      const kind = a.kind || e.kind, fn = clean(a.function) || null
      if (kind === e.kind && (fn || null) === (e.function || null)) return null
      return { kind, function: fn, ...(kind === 'wedding' ? { time: null } : {}) }
    }
    case 'rename': { const n = clean(a.new_name); return n && n !== e.title ? { title: n } : null }
    case 'pin': return e.pinned ? null : { pinned: true }
    case 'unpin': return e.pinned ? { pinned: false } : null
    case 'delete': return { delete: true }
    case 'approve': return e.status === 'review' ? { approve: true } : null
    case 'discard': return e.status === 'review' ? { discard: true } : null
    default: return null
  }
}
function itemPatch(a, i, D) {
  switch (a.change) {
    case 'add_details': { const n = joinText(i.details, a.details); return n ? { details: n } : null }
    case 'replace_details': { const n = clean(a.details); return n ? { details: n } : null }
    case 'set_date': return a.date && a.date !== i.day ? { day: a.date } : null
    case 'done': return i.done_at ? null : { done_at: new Date().toISOString() }
    case 'not_done': return i.done_at ? { done_at: null } : null
    case 'move': {
      const name = (a.list || '').trim(), hit = findByName(D.lists, name)
      if (hit) return hit.id !== i.list_id ? { list_id: hit.id } : null
      return name ? { newList: name } : null
    }
    case 'rename': { const n = clean(a.new_name); return n && n !== i.title ? { title: n } : null }
    case 'pin': return i.pinned ? null : { pinned: true }
    case 'unpin': return i.pinned ? { pinned: false } : null
    case 'delete': return { delete: true }
    default: return null
  }
}
function plannerSub(a, row, p, D, field) {
  const listName = id => D.lists.find(l => l.id === id)?.name || ''
  if (p.delete) return <Bad>{a.type === 'event_update' ? 'Delete this event' : 'Delete this item'}</Bad>
  if (p.approve) { const b = batchOf(D, row); return <New>✓ Add {b.length > 1 ? `all ${b.length} functions from this card` : 'it'} to the Planner</New> }
  if (p.discard) { const b = batchOf(D, row); return <Bad>Throw away this card{b.length > 1 ? ` (${b.length} functions)` : ''}</Bad> }
  switch (a.change) {
    case 'add_details': return added(row[field], p[field].slice((row[field] || '').trim().length).replace(/^\.?\s*/, ''))
    case 'replace_details': return replaced(row[field], p[field], 'No note')
    case 'set_date': return arrow(row.day ? dayLabel(row.day) : 'No date', dayLabel(p.day))
    case 'set_time': return arrow(whenLabel(row) || 'No time', p.time ? timeLabel(p.time) : partLabel(p.part))
    case 'set_venue': return arrow(row.venue || 'No venue', p.venue)
    case 'set_village': return arrow(row.village || 'No village', p.village)
    case 'set_kind': return arrow(tagFor(row), p.function || kindLabel(p.kind))
    case 'rename': return arrow(row.title, p.title)
    case 'pin': return <New>📌 Pin to the top</New>
    case 'unpin': return <b>Unpin</b>
    case 'done': return <New>✓ Mark done</New>
    case 'not_done': return <New>Mark as not done</New>
    case 'move': return arrow(listName(row.list_id), p.newList ? `${p.newList} (new list)` : listName(p.list_id))
    default: return null
  }
}
const eventPlan = {
  describe(a, D) {
    const row = D.events.find(e => e.id === a.target_id)
    const out = { icon: 'event', head: 'Update event', dest: PLANNER[a.change] || '' }
    if (!row) { out.question = "Couldn't find which event · this will be skipped"; return out }
    out.head = `${row.status === 'review' ? 'To review' : 'Update'} · ${tagFor(row)}${row.day ? ` · ${dayLabel(row.day)}` : ''}`
    out.title = row.title || 'Untitled'
    const p = eventPatch(a, row)
    if (p) { out.sub = plannerSub(a, row, p, D, 'notes'); out.ok = true; out.danger = !!(p.delete || p.discard) }
    else out.question = 'Nothing to change · this will be skipped'
    return out
  },
  async run(a, D, rec) {
    const row = await db.events.get(a.target_id || '')
    const p = row && eventPatch(a, row)
    if (!p) return false
    if (p.delete) return remove(rec, 'events', row.id)
    if (p.approve || p.discard) {
      for (const e of batchOf(D, row)) p.approve ? await update(rec, 'events', e.id, { status: 'confirmed', unsure: false }) : await remove(rec, 'events', e.id)
      return
    }
    await update(rec, 'events', row.id, p)
  },
}
const itemPlan = {
  describe(a, D) {
    const row = D.items.find(i => i.id === a.target_id)
    const out = { icon: 'item', head: 'Update list item', dest: (a.change === 'add_details' ? 'Add details' : a.change === 'replace_details' ? 'New details' : PLANNER[a.change]) || '' }
    if (!row) { out.question = "Couldn't find which item · this will be skipped"; return out }
    out.head = `Update · ${D.lists.find(l => l.id === row.list_id)?.name || ''} list`
    out.title = row.title || 'Untitled'
    const p = itemPatch(a, row, D)
    if (p) { out.sub = plannerSub(a, row, p, D, 'details'); out.ok = true; out.danger = !!p.delete }
    else out.question = 'Nothing to change · this will be skipped'
    return out
  },
  async run(a, D, rec) {
    const row = await db.list_items.get(a.target_id || '')
    const p = row && itemPatch(a, row, D)
    if (!p) return false
    if (p.delete) return remove(rec, 'list_items', row.id)
    if (p.newList) {
      const had = new Set(D.lists.map(l => l.id))
      const { newList, ...rest } = p
      const listId = await listIdByName(newList)
      if (!had.has(listId)) rec.added('planner_lists', listId)
      return update(rec, 'list_items', row.id, { ...rest, list_id: listId })
    }
    await update(rec, 'list_items', row.id, p)
  },
}

// ---------- Planner lists ----------

const listPlan = {
  describe(a, D) {
    const l = findByName(D.lists, a.list)
    const n = clean(a.new_name)
    const out = { icon: 'item', head: 'Planner lists', dest: { create: 'New list', rename: 'Rename list', delete: 'Delete list' }[a.change] || '' }
    if (a.change === 'create') {
      if (!n) out.question = 'No name for the new list · this will be skipped'
      else if (findByName(D.lists, n) && norm(findByName(D.lists, n).name) === norm(n)) out.question = `There's already a ${n} list · this will be skipped`
      else { out.title = n; out.sub = <New>+ New list</New>; out.ok = true }
      return out
    }
    if (!l) { out.question = `There's no ${a.list || ''} list · this will be skipped`; return out }
    out.title = `${l.name} list`
    if (a.change === 'rename') {
      if (n && n !== l.name) { out.sub = arrow(l.name, n); out.ok = true } else out.question = 'No new name · this will be skipped'
    } else if (a.change === 'delete') {
      const k = D.items.filter(i => i.list_id === l.id).length
      out.sub = <Bad>Delete the {l.name} list{k ? ` and the ${k} item${k > 1 ? 's' : ''} on it` : ''}</Bad>; out.ok = true; out.danger = true
    } else out.question = 'Nothing to change · this will be skipped'
    return out
  },
  async run(a, D, rec) {
    const n = clean(a.new_name)
    if (a.change === 'create') {
      if (!n || D.lists.some(l => norm(l.name) === norm(n))) return false
      rec.added('planner_lists', await listIdByName(n)); return
    }
    const l = findByName(D.lists, a.list)
    if (!l) return false
    if (a.change === 'rename' && n && n !== l.name) return update(rec, 'planner_lists', l.id, { name: n })
    if (a.change === 'delete') {
      for (const i of await db.list_items.where('list_id').equals(l.id).toArray()) await remove(rec, 'list_items', i.id)
      return remove(rec, 'planner_lists', l.id)
    }
    return false
  },
}

// ---------- Projects ----------

const PROJECT = {
  done: 'Mark as done', not_done: 'Mark as not done', pin: 'Pin to the top', unpin: 'Unpin', add_people: 'Add people', add_villages: 'Add villages',
  remove_people: 'Remove people', remove_villages: 'Remove villages', set_road_type: 'Set road type', move: 'Move',
  add_details: 'Add to description', replace_details: 'New description', delete: 'Delete',
}
function projectPatch(a, w, D) {
  const people = matchPeople(D.contacts, a.people).filter(x => x.matches.length === 1).map(x => x.matches[0].id)
  switch (a.change) {
    case 'done': return w.done_at ? null : { done: true }
    case 'not_done': return w.done_at ? { done: false } : null
    case 'pin': return w.pinned ? null : { pinned: true }
    case 'unpin': return w.pinned ? { pinned: false } : null
    case 'add_people': { const ids = people.filter(id => !(w.contact_ids || []).includes(id)); return ids.length ? { contact_ids: [...(w.contact_ids || []), ...ids] } : null }
    case 'remove_people': { const left = (w.contact_ids || []).filter(id => !people.includes(id)); return left.length < (w.contact_ids || []).length ? { contact_ids: left } : null }
    case 'add_villages': { const ids = villageIds(D.villages, a.villages).filter(id => !(w.village_ids || []).includes(id)); return ids.length ? { village_ids: [...(w.village_ids || []), ...ids] } : null }
    case 'remove_villages': { const rm = villageIds(D.villages, a.villages), left = (w.village_ids || []).filter(id => !rm.includes(id)); return left.length < (w.village_ids || []).length ? { village_ids: left } : null }
    case 'set_road_type': return a.road_type && a.road_type !== w.road_type ? { road_type: a.road_type } : null
    case 'move': return a.category && a.category !== categoryOf(w) ? { category: a.category } : null
    case 'add_details': { const n = clean(a.details); return n ? { body: `${(w.body || '').trim()}\n${n}`.trim() } : null }
    case 'replace_details': { const n = clean(a.details); return n ? { body: n } : null }
    case 'delete': return { delete: true }
    default: return null
  }
}
const contactName = (D, id) => D.contacts.find(c => c.id === id)?.name || '?'
const projectPlan = {
  describe(a, D) {
    const w = findWork(D.works, a.serial)
    const out = { icon: 'project', head: `Update ${w ? serialLabel(w) : a.serial || '?'}`, dest: PROJECT[a.change] || '' }
    if (!w) { out.question = `There's no project ${a.serial || ''} · this will be skipped`; return out }
    out.title = (w.body || '').split('\n')[0]
    const p = projectPatch(a, w, D)
    if (!p) {
      const unknown = matchPeople(D.contacts, a.people).filter(x => x.matches.length !== 1).map(x => (x.matches.length ? `Which ${x.said}?` : `${x.said} isn't in Halqa`))
      out.question = [...unknown, 'Nothing to change · this will be skipped'].join(' · ')
      return out
    }
    out.ok = true; out.danger = !!p.delete
    out.sub = p.delete ? <Bad>Delete this project</Bad>
      : 'done' in p ? <New>{p.done ? '✓ Mark as done' : 'Mark as not done'}</New>
      : 'pinned' in p ? (p.pinned ? <New>📌 Pin to the top</New> : <b>Unpin</b>)
      : p.contact_ids ? (a.change === 'add_people' ? <New>+ {p.contact_ids.filter(id => !(w.contact_ids || []).includes(id)).map(id => `👤 ${contactName(D, id)}`).join('  ')}</New>
        : <>{(w.contact_ids || []).filter(id => !p.contact_ids.includes(id)).map(id => <s key={id}>👤 {contactName(D, id)} </s>)}</>)
      : p.village_ids ? (a.change === 'add_villages' ? <New>+ {p.village_ids.filter(id => !(w.village_ids || []).includes(id)).map(id => `📍 ${vName(D, id)}`).join('  ')}</New>
        : <>{(w.village_ids || []).filter(id => !p.village_ids.includes(id)).map(id => <s key={id}>📍 {vName(D, id)} </s>)}</>)
      : p.road_type ? arrow(roadTypeLabel(w.road_type) || 'No type', roadTypeLabel(p.road_type))
      : p.category ? arrow(categoryLabel(categoryOf(w)), categoryLabel(p.category))
      : a.change === 'add_details' ? <New>+ {clean(a.details)}</New>
      : replaced(w.body, p.body)
    return out
  },
  async run(a, D, rec) {
    const w = findWork(D.works, a.serial)
    const p = w && projectPatch(a, w, D)
    if (!p) return false
    if (p.delete) return remove(rec, 'works', w.id)
    if ('done' in p) { rec.push(await setWorkDone(w, p.done)); return }
    if ('pinned' in p) { rec.push(await setWorkPinned(w, p.pinned)); return }
    await rec.snap('works', w.id)
    if (p.category) await saveWork(w.id, { category: p.category })
    else await updateRow('works', w.id, p)
  },
}

// ---------- Notes (village notes and the Planner's notes) ----------

const notePlan = {
  describe(a, D) {
    const { table, v, found } = notesFor(a, D)
    const where = v ? v.name : a.village ? a.village : 'Planner notes'
    const out = { icon: 'note', head: `Note · ${where}`, dest: { add_details: 'Add to note', replace_details: 'Rewrite note', delete: 'Delete note' }[a.change] || '' }
    if (a.village && !v) { out.question = `There's no village called ${a.village} · this will be skipped`; return out }
    if (!found.length) { out.question = `No notes ${v ? `in ${v.name}` : 'in the Planner'} yet · this will be skipped`; return out }
    if (found.length > 1) {
      out.question = 'Which note? · pick one'
      out.choices = found.map(n => ({ id: n.id, label: firstLine(n.body), sub: (n.updated_at || n.created_at || '').slice(0, 10) }))
      return out
    }
    const n = found[0], text = plainText(n.body || '').trim()
    out.title = firstLine(n.body)
    if (a.change === 'delete') { out.sub = <Bad>Delete this note</Bad>; out.ok = true; out.danger = true }
    else if (!clean(a.details)) out.question = 'Nothing to add · this will be skipped'
    else if (a.change === 'add_details') { out.sub = added(clip(text.replace(/\s*\n\s*/g, ' · ')), clean(a.details)); out.ok = true }
    else if (a.change === 'replace_details') { out.sub = replaced(clip(text.replace(/\s*\n\s*/g, ' · ')), clean(a.details)); out.ok = true }
    out.table = table
    return out
  },
  async run(a, D, rec) {
    const { table, found } = notesFor(a, D)
    if (found.length !== 1) return false
    const n = await db[table].get(found[0].id)
    if (!n) return false
    if (a.change === 'delete') return remove(rec, table, n.id)
    const add = asBody(a.details)
    if (!add) return false
    let body
    if (a.change === 'add_details') body = `${n.body || ''}${add}`
    else if (a.change === 'replace_details') body = `${add}${(n.body || '').match(/\[IMG:[^\]]+\]/g)?.map(tok => `<div>${tok}</div>`).join('') || ''}`
    else return false
    await update(rec, table, n.id, { body, images: bodyPaths(body) })
  },
}

// ---------- Villages ----------

const FIELD = { our_group: 'Our group', anti_group: 'Opposition group', development: 'Development notes', result_2018: '2018 result', result_2024: '2024 result', population: 'Population', registered_voters: 'Registered voters' }
const TEXT_FIELDS = ['our_group', 'anti_group', 'development']
const NUM_FIELDS = ['population', 'registered_voters']
function villagePatch(a, v, D) {
  const f = a.field
  switch (a.change) {
    case 'add_details': { if (!TEXT_FIELDS.includes(f)) return null; const n = joinText(v[f], a.details); return n ? { [f]: n } : null }
    case 'replace_details': { if (!TEXT_FIELDS.includes(f)) return null; const n = clean(a.details); return n ? { [f]: n } : null }
    case 'set_value': {
      if (NUM_FIELDS.includes(f)) { const n = parseInt((a.details || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) && n !== v[f] ? { [f]: n } : null }
      if (f === 'result_2018' || f === 'result_2024') { const n = clean(a.details); return n && n !== v[f] ? { [f]: n } : null }
      if (TEXT_FIELDS.includes(f)) { const n = clean(a.details); return n ? { [f]: n } : null }
      return null
    }
    case 'pin': return v.pinned ? null : { pinned: true }
    case 'unpin': return v.pinned ? { pinned: false } : null
    case 'rename': { const n = clean(a.new_name); return n && n !== v.name ? { name: n } : null }
    case 'set_qanungo': { const q = findByName(D.qanungos, a.qanungo); return q && q.id !== v.qanungo_id ? { qanungo_id: q.id } : null }
    case 'delete': return { delete: true }
    default: return null
  }
}
const qName = (D, id) => D.qanungos.find(q => q.id === id)?.name || 'No qanungo'
const villagePlan = {
  describe(a, D) {
    const out = { icon: 'village', head: 'Village', dest: '' }
    if (a.change === 'create') {
      const n = clean(a.new_name), q = findByName(D.qanungos, a.qanungo)
      out.dest = 'New village'
      if (!n) out.question = 'No name for the new village · this will be skipped'
      else if (D.villages.some(v => norm(v.name) === norm(n))) out.question = `${n} is already in Halqa · this will be skipped`
      else { out.title = n; out.sub = <New>+ New village{q ? ` under ${q.name}` : ' (no qanungo)'}</New>; out.ok = true; if (a.qanungo && !q) out.question = `There's no qanungo called ${a.qanungo}` }
      return out
    }
    const v = findVillage(D.villages, a.village)
    out.dest = a.change === 'add_details' || a.change === 'replace_details' || a.change === 'set_value' ? FIELD[a.field] || '' : { pin: 'Pin', unpin: 'Unpin', rename: 'Rename', set_qanungo: 'Move qanungo', delete: 'Delete village' }[a.change] || ''
    if (!v) { out.question = `There's no village called ${a.village || ''} · this will be skipped`; return out }
    out.head = `Village · ${v.name}`
    out.title = v.name
    const p = villagePatch(a, v, D)
    if (!p) {
      const q = a.change === 'set_qanungo' && findByName(D.qanungos, a.qanungo)
      out.question = q && q.id === v.qanungo_id ? `Already under ${q.name} · nothing to do` : a.change === 'set_qanungo' && !q ? `There's no qanungo called ${a.qanungo || ''} · this will be skipped` : 'Nothing to change · this will be skipped'
      return out
    }
    out.ok = true
    if (p.delete) {
      const c = D.contacts.filter(x => x.village_id === v.id).length, n = D.notes.filter(x => x.village_id === v.id).length
      out.danger = true
      out.sub = <Bad>Delete {v.name}{c || n ? `, with its ${[c && `${c} contact${c > 1 ? 's' : ''}`, n && `${n} note${n > 1 ? 's' : ''}`].filter(Boolean).join(' and ')}` : ''}</Bad>
    } else if (a.change === 'add_details') out.sub = added(clip(v[a.field]), clean(a.details))
    else if (a.change === 'replace_details') out.sub = replaced(clip(v[a.field]), p[a.field])
    else if (a.change === 'set_value') out.sub = arrow(v[a.field] ?? 'Not set', p[a.field])
    else if (a.change === 'pin') out.sub = <New>📌 Pin</New>
    else if (a.change === 'unpin') out.sub = <b>Unpin</b>
    else if (a.change === 'rename') out.sub = arrow(v.name, p.name)
    else if (a.change === 'set_qanungo') out.sub = arrow(qName(D, v.qanungo_id), qName(D, p.qanungo_id))
    return out
  },
  async run(a, D, rec) {
    if (a.change === 'create') {
      const n = clean(a.new_name)
      if (!n || D.villages.some(v => norm(v.name) === norm(n))) return false
      const row = await insertRow('villages', { name: n, qanungo_id: findByName(D.qanungos, a.qanungo)?.id || null, pinned: false })
      rec.added('villages', row.id); return
    }
    const v = findVillage(D.villages, a.village)
    const p = v && villagePatch(a, v, D)
    if (!p) return false
    if (p.delete) {
      for (const c of await db.contacts.where('village_id').equals(v.id).toArray()) await remove(rec, 'contacts', c.id)
      for (const n of await db.notes.where('village_id').equals(v.id).toArray()) await remove(rec, 'notes', n.id)
      await remove(rec, 'villages', v.id)
      await tidyToday(); return
    }
    await update(rec, 'villages', v.id, p)
  },
}

// ---------- Qanungos ----------

const qanungoPlan = {
  describe(a, D) {
    const n = clean(a.new_name)
    const out = { icon: 'village', head: 'Qanungos', dest: { create: 'New qanungo', rename: 'Rename', delete: 'Delete qanungo' }[a.change] || '' }
    if (a.change === 'create') {
      if (!n) out.question = 'No name · this will be skipped'
      else if (D.qanungos.some(q => norm(q.name) === norm(n))) out.question = `${n} is already there · this will be skipped`
      else { out.title = n; out.sub = <New>+ New qanungo</New>; out.ok = true }
      return out
    }
    const q = findByName(D.qanungos, a.qanungo)
    if (!q) { out.question = `There's no qanungo called ${a.qanungo || ''} · this will be skipped`; return out }
    out.title = q.name
    if (a.change === 'rename' && n && n !== q.name) { out.sub = arrow(q.name, n); out.ok = true }
    else if (a.change === 'delete') {
      const k = D.villages.filter(v => v.qanungo_id === q.id).length
      out.sub = <Bad>Delete {q.name}{k ? ` (its ${k} village${k > 1 ? 's' : ''} stay, without a qanungo)` : ''}</Bad>; out.ok = true; out.danger = true
    } else out.question = 'Nothing to change · this will be skipped'
    return out
  },
  async run(a, D, rec) {
    const n = clean(a.new_name)
    if (a.change === 'create') {
      if (!n || D.qanungos.some(q => norm(q.name) === norm(n))) return false
      const row = await insertRow('qanungos', { name: n }); rec.added('qanungos', row.id); return
    }
    const q = findByName(D.qanungos, a.qanungo)
    if (!q) return false
    if (a.change === 'rename' && n && n !== q.name) return update(rec, 'qanungos', q.id, { name: n })
    if (a.change === 'delete') {
      for (const v of D.villages.filter(x => x.qanungo_id === q.id)) await update(rec, 'villages', v.id, { qanungo_id: null })
      return remove(rec, 'qanungos', q.id)
    }
    return false
  },
}

export const PLANS = {
  contact_update: contactPlan, event_update: eventPlan, list_item_update: itemPlan, list_update: listPlan,
  project_update: projectPlan, note_update: notePlan, village_update: villagePlan, qanungo_update: qanungoPlan,
}
export const isChange = a => !!PLANS[a.type]
