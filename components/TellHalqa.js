import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { insertRow, updateRow } from '../lib/store'
import { allCategories, categoryOf, categoryLabel, categoryIcon, roadTypeLabel, serialLabel, saveWork, setWorkDone, setWorkPinned } from '../lib/works'
import { WorkForm } from './Works'
import { tellHalqa } from '../lib/tell'
import { cleanText } from '../lib/phone'
import { TAGS } from '../lib/domain'
import { describeError } from '../lib/analysis'
import { listIdByName, dayLabel, whenLabel, partFromTime, tagFor } from '../lib/events'
import { Sheet, cx, ui, useToast } from './ui'
import { IconSparkles, IconCalendar, IconCheck, IconUserPlus, IconNote, IconX, IconEdit } from './Icons'
import { useContactSheets } from './contacts'
import { EventForm, ItemForm } from './screens/PlannerScreen'
import t from '../styles/tell.module.css'

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const findVillage = (villages, name) => {
  const n = norm(name)
  return n ? villages.find(v => norm(v.name) === n) || villages.find(v => norm(v.name).includes(n) || n.includes(norm(v.name))) : null
}
// People he named, matched to his contacts: one match is used; none or several are flagged on the card.
function matchPeople(contacts, names) {
  return (names || []).map(said => {
    const k = norm(said)
    if (!k) return null
    const exact = contacts.filter(c => norm(c.name) === k)
    const words = said.toLowerCase().split(/\s+/).filter(w => w.length > 1)
    const loose = exact.length ? exact : contacts.filter(c => { const n = (c.name || '').toLowerCase(); return words.length && words.every(w => n.includes(w)) })
    return { said, matches: loose.slice(0, 6) }
  }).filter(Boolean)
}
const villageIds = (villages, names) => [...new Set((names || []).map(n => findVillage(villages, n)?.id).filter(Boolean))]
// "R-17" → the project with that number.
function findWork(works, serial) {
  const m = /^\s*([A-Za-z]+)\s*-?\s*(\d+)\s*$/.exec(serial || '')
  if (!m) return null
  const ids = allCategories(works).filter(c => c.prefix.toLowerCase() === m[1].toLowerCase()).map(c => c.id)
  return works.find(w => ids.includes(categoryOf(w)) && w.serial === +m[2]) || null
}
// The contact he means (contact_update): by name, narrowed by village if he said one.
// A chosen id (when he picked one of several) wins.
function contactsFor(a, contacts, villages) {
  if (a.contact_id) return contacts.filter(c => c.id === a.contact_id)
  let m = matchPeople(contacts, [a.name])[0]?.matches || []
  if (!m.length && a.name) {   // the place may be written into the name: try the first words
    const words = a.name.split(/\s+/)
    for (let n = words.length - 1; n >= 2 && !m.length; n--) m = matchPeople(contacts, [words.slice(0, n).join(' ')])[0]?.matches || []
  }
  const v = a.village && findVillage(villages, a.village)
  if (m.length > 1 && v) { const inV = m.filter(c => c.village_id === v.id); if (inV.length) m = inV }
  return m
}
const phoneKey = p => (p || '').replace(/\D/g, '').replace(/^92/, '0').slice(-10)
// What will be saved for a contact_update (null if there's nothing to do).
function contactPatch(a, c, villages) {
  const txt = cleanText(a.details || '').trim()
  switch (a.change) {
    case 'add_description': {
      if (!txt) return null
      const old = (c.description || '').trim()
      return { description: old ? `${old}${/[.!?]$/.test(old) ? '' : '.'} ${txt}` : txt }
    }
    case 'replace_description': return txt ? { description: txt } : null
    case 'add_phone': {
      const ph = cleanText(a.phone || '').trim()
      if (!ph || ['phone', 'phone2', 'phone3'].some(k => c[k] && phoneKey(c[k]) === phoneKey(ph))) return null
      const slot = ['phone', 'phone2', 'phone3'].find(k => !(c[k] || '').trim())
      return slot ? { [slot]: ph } : null
    }
    case 'add_tags': {
      const add = (a.tags || []).filter(tg => TAGS.includes(tg) && !(c.tags || []).includes(tg))
      return add.length ? { tags: [...(c.tags || []), ...add] } : null
    }
    case 'pin': return c.pinned ? null : { pinned: true }
    case 'unpin': return c.pinned ? { pinned: false } : null
    case 'set_village': { const v = findVillage(villages, a.new_village); return v && v.id !== c.village_id ? { village_id: v.id } : null }
    case 'rename': { const n = cleanText(a.new_name || '').replace(/\s+/g, ' ').trim(); return n && n !== c.name ? { name: n } : null }
    default: return null
  }
}
const CONTACT_CHANGE = { add_description: 'Add to description', replace_description: 'New description', add_phone: 'Add a number', add_tags: 'Add tags', pin: 'Pin to Main Groups', unpin: 'Unpin', set_village: 'Move village', rename: 'Rename' }

const CHANGE_TEXT = {
  done: 'Mark as done', not_done: 'Mark as not done', pin: 'Pin to the top', unpin: 'Unpin',
  add_people: 'Add people', add_villages: 'Add villages', set_road_type: 'Set road type', move: 'Move',
}
// What Claude returned, in the shape the Projects form takes.
const asProject = (a, villages, contacts) => {
  const people = matchPeople(contacts, a.people)
  return {
    category: a.category || 'other',
    body: [a.title, a.details].filter(Boolean).join('\n'),
    village_ids: villageIds(villages, a.villages),
    contact_ids: people.filter(p => p.matches.length === 1).map(p => p.matches[0].id),
    self_identified: !!a.self_identified,
    road_type: a.category === 'roads' && a.road_type ? a.road_type : null,
    images: [],
  }
}

const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// What Claude returned, in the shape the Planner forms take.
const asEvent = a => ({ kind: a.kind || 'other', function: a.function, title: a.title, village: a.village, venue: a.venue, day: a.date, part: a.time ? partFromTime(a.time) : a.part || 'afternoon', time: a.time || '', notes: a.details })
const asItem = (a, lists) => {
  const hit = lists.find(l => l.name.toLowerCase() === (a.list || '').trim().toLowerCase())
  return { title: a.title, details: a.details, day: a.date, ...(hit ? { list_id: hit.id } : { newList: (a.list || '').trim() }) }
}

function ActionCard({ a, lists, villages, contacts, works, onOpen, onDrop, onPick }) {
  let icon, head, dest, title, sub, question = a.question, choices = null
  if (a.type === 'project') {
    const p = asProject(a, villages, contacts)
    const people = matchPeople(contacts, a.people)
    icon = <span>{categoryIcon(p.category)}</span>; head = `${categoryLabel(p.category)}${p.road_type ? ` · ${roadTypeLabel(p.road_type)}` : ''}`; dest = 'New project'
    title = p.body.split('\n')[0]
    sub = [
      ...p.village_ids.map(id => `📍 ${villages.find(v => v.id === id)?.name}`),
      ...people.filter(x => x.matches.length === 1).map(x => `👤 ${x.matches[0].name}`),
      p.self_identified ? '★ Self identified' : '',
    ].filter(Boolean).join('  ')
    const unclear = people.filter(x => x.matches.length !== 1)
      .map(x => (x.matches.length ? `Which ${x.said}? (${x.matches.length} in Halqa)` : `${x.said} isn't in Halqa`))
    question = [...unclear, a.question].filter(Boolean).join(' · ')
  } else if (a.type === 'project_update') {
    const work = findWork(works, a.serial)
    icon = <IconCheck size={16} />; head = `Update ${work ? serialLabel(work) : a.serial || '?'}`; dest = CHANGE_TEXT[a.change] || ''
    title = work ? (work.body || '').split('\n')[0] : null
    const people = matchPeople(contacts, a.people)
    sub = a.change === 'add_people' ? people.map(x => (x.matches.length === 1 ? `👤 ${x.matches[0].name}` : `${x.said}: not found`)).join('  ')
      : a.change === 'add_villages' ? (a.villages || []).map(n => `📍 ${findVillage(villages, n)?.name || `${n}: not found`}`).join('  ')
      : a.change === 'set_road_type' ? roadTypeLabel(a.road_type)
      : a.change === 'move' ? `To ${categoryLabel(a.category)}` : ''
    if (!work) question = `There's no project ${a.serial || ''} · this one will be skipped`
  } else if (a.type === 'contact_update') {
    const found = contactsFor(a, contacts, villages)
    const c = found.length === 1 ? found[0] : null
    const vName = id => villages.find(v => v.id === id)?.name || ''
    icon = <IconEdit size={15} />; head = c ? `Update ${c.name}` : `Update ${a.name || 'contact'}`; dest = CONTACT_CHANGE[a.change] || ''
    if (c) {
      const patch = contactPatch(a, c, villages)
      title = null
      sub = !patch ? null
        : a.change === 'add_description' ? <>{c.description ? <span className={t.old}>{c.description} </span> : null}<b className={t.added}>+ {patch.description.slice((c.description || '').trim().length).trim()}</b></>
        : a.change === 'replace_description' ? <><span className={t.old}><s>{c.description || 'No description'}</s></span><br /><b className={t.added}>{patch.description}</b></>
        : a.change === 'add_phone' ? <b className={t.added}>+ 📞 {Object.values(patch)[0]}</b>
        : a.change === 'add_tags' ? <b className={t.added}>+ {patch.tags.filter(tg => !(c.tags || []).includes(tg)).join(', ')}</b>
        : a.change === 'pin' ? <b className={t.added}>📌 Pin to Main Groups</b>
        : a.change === 'unpin' ? <b>Unpin from Main Groups</b>
        : a.change === 'set_village' ? <>{vName(c.village_id)} → <b className={t.added}>{vName(patch.village_id)}</b></>
        : a.change === 'rename' ? <>{c.name} → <b className={t.added}>{patch.name}</b></> : null
      title = <>{c.name}<span className={t.who}> · {vName(c.village_id) || 'No village'}</span></>
      if (!patch) question = a.change === 'add_phone' && ['phone', 'phone2', 'phone3'].every(k => (c[k] || '').trim()) ? 'All three number slots are full · this will be skipped'
        : 'Nothing to change · this will be skipped'
    } else if (found.length > 1) {
      question = `Which ${a.name}? (${found.length} in Halqa) · pick one`
      choices = found.slice(0, 6)
    } else question = `${a.name || 'This person'} isn't in Halqa · this will be skipped`
  } else if (a.type === 'event') {
    icon = <IconCalendar size={16} />; head = 'Events'; dest = a.date ? dayLabel(a.date) : 'No date'
    title = a.title || 'Untitled'; sub = [a.village, a.venue].filter(Boolean).join(' · ')
  } else if (a.type === 'list_item') {
    const known = lists.some(l => l.name.toLowerCase() === (a.list || '').trim().toLowerCase())
    icon = <IconCheck size={16} />; head = `${a.list || 'List'} list${known ? '' : ' (new)'}`; dest = a.date ? dayLabel(a.date) : ''
    title = a.title; sub = a.details
  } else if (a.type === 'contact') {
    const v = findVillage(villages, a.village)
    icon = <IconUserPlus size={16} />; head = 'New contact'; dest = v ? v.name : ''
    title = a.name || a.title; sub = [a.phone, a.details].filter(Boolean).join(' · ')
  } else {
    const v = findVillage(villages, a.village)
    icon = <IconNote size={16} />; head = v ? `Note · ${v.name}` : 'General note'; dest = ''
    title = null; sub = a.details
  }
  return (
    <div className={t.card}>
      <div className={t.head}>
        {icon}<span>{head}</span><span className={t.dest}>{dest}</span>
        <button className={t.drop} onClick={onDrop} aria-label="Leave this out"><IconX size={14} /></button>
      </div>
      <button className={t.body} onClick={onOpen}>
        {a.type === 'event' && (
          <span className={t.tags}><span className={t.tag}>{tagFor(a)}</span>{whenLabel(asEvent(a)) && <span className={t.part}>{whenLabel(asEvent(a))}</span>}</span>
        )}
        {title && <span className={t.title}>{title}</span>}
        {sub && <span className={t.sub}>{sub}</span>}
        {question && <span className={t.question}>{question}{a.type === 'project_update' || a.type === 'contact_update' ? '' : ' · tap to fix'}</span>}
      </button>
      {choices && (
        <div className={t.choices}>
          {choices.map(c => (
            <button key={c.id} className={t.choice} onClick={() => onPick(c.id)}>
              <b>{c.name}</b><span>{[villages.find(v => v.id === c.village_id)?.name, c.phone].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TellSheet({ open, onClose, onContact }) {
  const toast = useToast()
  const lists = useLiveQuery(() => db.planner_lists.toArray(), [], [])
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])
  const works = useLiveQuery(() => db.works.toArray(), [], [])
  const names = { villages, contacts, village: Object.fromEntries(villages.map(v => [v.id, v])), contact: Object.fromEntries(contacts.map(c => [c.id, c])) }
  const [said, setSaid] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)   // { reply, actions }
  const [editing, setEditing] = useState(null) // an action being changed in its full form

  function reset() { setSaid(''); setResult(null); setEditing(null); setError('') }
  function close() { onClose(); if (result && !result.actions.length) reset() }
  const drop = key => setResult(r => ({ ...r, actions: r.actions.filter(a => a.key !== key) }))

  async function send() {
    if (!said.trim() || busy) return
    setBusy(true); setError('')
    try { setResult(await tellHalqa(said)) } catch (e) { setError(describeError(e)) }
    setBusy(false)
  }

  async function save(a) {
    if (a.type === 'event') {
      const e = asEvent(a)
      await insertRow('events', {
        kind: e.kind, function: e.function || null, title: e.title || '', village: e.village || null, venue: e.venue || null,
        day: e.day || null, part: e.part, time: e.time || null, notes: e.notes || null, status: 'confirmed', source: 'tell', unsure: false,
      })
    } else if (a.type === 'list_item') {
      await insertRow('list_items', { list_id: await listIdByName(a.list), title: a.title || a.details, details: a.title ? a.details || null : null, day: a.date || null })
    } else if (a.type === 'project') {
      await saveWork(null, asProject(a, villages, contacts))
    } else if (a.type === 'project_update') {
      const work = findWork(works, a.serial)
      if (!work) return false
      if (a.change === 'done' || a.change === 'not_done') await setWorkDone(work, a.change === 'done')
      else if (a.change === 'pin' || a.change === 'unpin') await setWorkPinned(work, a.change === 'pin')
      else if (a.change === 'add_people') {
        const ids = matchPeople(contacts, a.people).filter(x => x.matches.length === 1).map(x => x.matches[0].id)
        await updateRow('works', work.id, { contact_ids: [...new Set([...(work.contact_ids || []), ...ids])] })
      } else if (a.change === 'add_villages') {
        await updateRow('works', work.id, { village_ids: [...new Set([...(work.village_ids || []), ...villageIds(villages, a.villages)])] })
      } else if (a.change === 'set_road_type' && a.road_type) await updateRow('works', work.id, { road_type: a.road_type })
      else if (a.change === 'move' && a.category) await saveWork(work.id, { category: a.category })
      else return false
    } else if (a.type === 'contact_update') {
      const found = contactsFor(a, contacts, villages)
      if (found.length !== 1) return false
      const patch = contactPatch(a, found[0], villages)
      if (!patch) return false
      await updateRow('contacts', found[0].id, patch)
    } else if (a.type === 'note') {
      const v = findVillage(villages, a.village)
      const body = (a.details || '').split('\n').map(l => `<div>${escape(l) || '<br>'}</div>`).join('')
      await insertRow(v ? 'notes' : 'general_notes', { ...(v ? { village_id: v.id } : {}), body, images: [] })
    }
  }

  async function addAll() {
    const acts = result.actions
    let n = 0
    for (const a of acts) if (a.type !== 'contact' && (await save(a)) !== false) n++
    const contact = acts.find(a => a.type === 'contact')
    if (n) toast(acts.every(a => a.type.endsWith('_update')) ? `Saved ${n} change${n > 1 ? 's' : ''}` : `Added ${n} to Halqa`)
    reset(); onClose()
    if (contact) {
      const v = findVillage(villages, contact.village)
      onContact({ name: contact.name || contact.title, phone: contact.phone, village_id: v?.id || null, description: contact.details })
    }
  }

  function openAction(a) {
    if (a.type === 'contact') {
      drop(a.key)
      const v = findVillage(villages, a.village)
      onClose()
      onContact({ name: a.name || a.title, phone: a.phone, village_id: v?.id || null, description: a.details })
    } else if (a.type === 'event' || a.type === 'list_item' || a.type === 'project') setEditing(a)
  }

  const actions = result?.actions || []
  const title = editing ? (editing.type === 'event' ? 'Event' : editing.type === 'project' ? 'New project' : 'List item') : result ? (actions.length ? "Here's what I understood" : 'Halqa') : 'Tell Halqa'

  return (
    <Sheet open={open} onClose={close} title={title}>
      {editing ? (
        <>
          <button className={t.back} onClick={() => setEditing(null)}>‹ Back</button>
          {editing.type === 'event'
            ? <EventForm initial={asEvent(editing)} onDone={() => { drop(editing.key); setEditing(null) }} />
            : editing.type === 'project'
            ? <WorkForm initial={asProject(editing, villages, contacts)} names={names} onDone={() => { drop(editing.key); setEditing(null) }} />
            : <ItemForm initial={asItem(editing, lists)} onDone={() => { drop(editing.key); setEditing(null) }} />}
        </>
      ) : result ? (
        <>
          <div className={t.you}><b>You said</b>{said}</div>
          {result.reply && <div className={t.reply}>{result.reply}</div>}
          {actions.length > 0 && <div className={t.label}>{actions.length} thing{actions.length > 1 ? 's' : ''} to {actions.every(a => a.type.endsWith('_update')) ? 'change' : 'add'}</div>}
          {actions.map(a => <ActionCard key={a.key} a={a} lists={lists} villages={villages} contacts={contacts} works={works} onOpen={() => openAction(a)} onDrop={() => drop(a.key)}
            onPick={id => setResult(r => ({ ...r, actions: r.actions.map(x => (x.key === a.key ? { ...x, contact_id: id } : x)) }))} />)}
          <div className={t.acts}>
            {actions.length > 0
              ? <button className={cx(ui.btn, ui.btnPrimary)} onClick={addAll}><IconCheck size={18} />{actions.every(a => a.type.endsWith('_update')) ? 'Save' : actions.length > 1 ? 'Add all' : 'Add'}</button>
              : <button className={cx(ui.btn, ui.btnPrimary)} onClick={() => { reset(); onClose() }}>Done</button>}
            <button className={cx(ui.btn, ui.btnSecondary)} onClick={() => { setResult(null); setEditing(null) }}>Change what I said</button>
          </div>
        </>
      ) : (
        <>
          <textarea className={cx(ui.textarea, t.say)} autoFocus value={said} onChange={e => setSaid(e.target.value)} disabled={busy}
            placeholder="e.g. Riaz Gondal's son's walima is on Sunday night at Taj Greens. Add a link road from Kotla Panah to Mela, Abid Rawalia asked for it. Mark R-17 done." />
          <p className={t.hint}>Tap the 🎙 on the keyboard to speak, in English or Urdu. Nothing is saved until you check it.</p>
          {error && <p className={t.error}>{error}</p>}
          <button className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 14 }} onClick={send} disabled={!said.trim() || busy}>
            {busy ? 'Reading…' : 'Send'}
          </button>
        </>
      )}
    </Sheet>
  )
}

// Opens Tell Halqa from any button (the home screen's teal button).
export function TellButton({ className, children }) {
  const [open, setOpen] = useState(false)
  const sheets = useContactSheets()
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children}</button>
      <TellSheet open={open} onClose={() => setOpen(false)} onContact={prefill => sheets.quickAdd(prefill)} />
      {sheets.element}
    </>
  )
}

// The "Tell Halqa" bar (top of the Planner).
export function TellBar() {
  const [open, setOpen] = useState(false)
  const sheets = useContactSheets()
  return (
    <>
      <button className={t.bar} onClick={() => setOpen(true)}>
        <span className={t.spark}><IconSparkles size={15} /></span>
        <span className={t.barText}><strong>Tell Halqa</strong></span>
      </button>
      <TellSheet open={open} onClose={() => setOpen(false)} onContact={prefill => sheets.quickAdd(prefill)} />
      {sheets.element}
    </>
  )
}
