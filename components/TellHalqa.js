import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { insertRow } from '../lib/store'
import { categoryLabel, categoryIcon, roadTypeLabel, saveWork } from '../lib/works'
import { WorkForm } from './Works'
import { tellHalqa } from '../lib/tell'
import { describeError } from '../lib/analysis'
import { listIdByName, dayLabel, whenLabel, partFromTime, tagFor } from '../lib/events'
import { Sheet, cx, ui, useToast } from './ui'
import { IconSparkles, IconCalendar, IconCheck, IconUserPlus, IconNote, IconX, IconEdit, IconMap } from './Icons'
import { useContactSheets } from './contacts'
import { EventForm, ItemForm } from './screens/PlannerScreen'
import { PLANS, isChange, recorder, findVillage, matchPeople, villageIds } from './tellPlans'
import t from '../styles/tell.module.css'

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

const PLAN_ICON = { contact: <IconEdit size={15} />, event: <IconCalendar size={16} />, item: <IconCheck size={16} />, project: <IconCheck size={16} />, note: <IconNote size={16} />, village: <IconMap size={16} /> }

function ActionCard({ a, D, onOpen, onDrop, onPick }) {
  const { lists, villages, contacts } = D
  let icon, head, dest, title, sub, question = a.question, choices = null, danger = false
  if (isChange(a)) {
    const d = PLANS[a.type].describe(a, D)
    icon = PLAN_ICON[d.icon]; head = d.head; dest = d.dest; title = d.title; sub = d.sub; choices = d.choices || null; danger = !!d.danger
    question = d.question || (d.ok ? a.question : '')
  } else if (a.type === 'project') {
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
    <div className={cx(t.card, danger && t.cardDanger)}>
      <div className={t.head}>
        {icon}<span>{head}</span><span className={cx(t.dest, danger && t.danger)}>{dest}</span>
        <button className={t.drop} onClick={onDrop} aria-label="Leave this out"><IconX size={14} /></button>
      </div>
      <button className={t.body} onClick={onOpen}>
        {a.type === 'event' && (
          <span className={t.tags}><span className={t.tag}>{tagFor(a)}</span>{whenLabel(asEvent(a)) && <span className={t.part}>{whenLabel(asEvent(a))}</span>}</span>
        )}
        {title && <span className={t.title}>{title}</span>}
        {sub && <span className={t.sub}>{sub}</span>}
        {question && <span className={t.question}>{question}{isChange(a) ? '' : ' · tap to fix'}</span>}
      </button>
      {choices && (
        <div className={t.choices}>
          {choices.map(c => (
            <button key={c.id} className={t.choice} onClick={() => onPick(c.id)}>
              <b>{c.label}</b>{c.sub && <span>{c.sub}</span>}
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
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const items = useLiveQuery(() => db.list_items.toArray(), [], [])
  const notes = useLiveQuery(() => db.notes.toArray(), [], [])
  const generalNotes = useLiveQuery(() => db.general_notes.toArray(), [], [])
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const D = { lists, villages, contacts, works, events, items, notes, generalNotes, qanungos }
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

  async function save(a, rec) {
    if (isChange(a)) return PLANS[a.type].run(a, D, rec)
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
    } else if (a.type === 'note') {
      const v = findVillage(villages, a.village)
      const body = (a.details || '').split('\n').map(l => `<div>${escape(l) || '<br>'}</div>`).join('')
      await insertRow(v ? 'notes' : 'general_notes', { ...(v ? { village_id: v.id } : {}), body, images: [] })
    }
  }

  async function addAll() {
    const acts = result.actions
    const rec = recorder()
    let n = 0
    for (const a of acts) if (a.type !== 'contact' && (await save(a, rec)) !== false) n++
    const contact = acts.find(a => a.type === 'contact')
    const undo = rec.undos.length ? { label: 'Undo', onClick: () => rec.undo() } : undefined
    if (n) toast(acts.every(isChange) ? `Saved ${n} change${n > 1 ? 's' : ''}` : `Added ${n} to Halqa`, undo)
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
          {actions.length > 0 && <div className={t.label}>{actions.length} thing{actions.length > 1 ? 's' : ''} to {actions.every(isChange) ? 'change' : 'add'}</div>}
          {actions.map(a => <ActionCard key={a.key} a={a} D={D} onOpen={() => openAction(a)} onDrop={() => drop(a.key)}
            onPick={id => setResult(r => ({ ...r, actions: r.actions.map(x => (x.key === a.key ? { ...x, pick_id: id } : x)) }))} />)}
          <div className={t.acts}>
            {actions.length > 0
              ? <button className={cx(ui.btn, ui.btnPrimary)} onClick={addAll}><IconCheck size={18} />{actions.every(isChange) ? 'Save' : actions.length > 1 ? 'Add all' : 'Add'}</button>
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
