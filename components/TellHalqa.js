import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { insertRow } from '../lib/store'
import { tellHalqa } from '../lib/tell'
import { describeError } from '../lib/analysis'
import { listIdByName, dayLabel, partLabel, tagFor } from '../lib/events'
import { Sheet, cx, ui, useToast } from './ui'
import { IconSparkles, IconCalendar, IconCheck, IconUserPlus, IconNote, IconX } from './Icons'
import { useContactSheets } from './contacts'
import { EventForm, ItemForm } from './screens/PlannerScreen'
import t from '../styles/tell.module.css'

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const findVillage = (villages, name) => {
  const n = norm(name)
  return n ? villages.find(v => norm(v.name) === n) || villages.find(v => norm(v.name).includes(n) || n.includes(norm(v.name))) : null
}
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// What Claude returned, in the shape the Planner forms take.
const asEvent = a => ({ kind: a.kind || 'other', function: a.function, title: a.title, village: a.village, venue: a.venue, day: a.date, part: a.part || 'afternoon', notes: a.details })
const asItem = (a, lists) => {
  const hit = lists.find(l => l.name.toLowerCase() === (a.list || '').trim().toLowerCase())
  return { title: a.title, details: a.details, day: a.date, ...(hit ? { list_id: hit.id } : { newList: (a.list || '').trim() }) }
}

function ActionCard({ a, lists, villages, onOpen, onDrop }) {
  let icon, head, dest, title, sub
  if (a.type === 'event') {
    icon = <IconCalendar size={16} />; head = 'Calendar'; dest = a.date ? dayLabel(a.date) : 'No date'
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
          <span className={t.tags}><span className={t.tag}>{tagFor(a)}</span>{a.part && <span className={t.part}>{partLabel(a.part)}</span>}</span>
        )}
        {title && <span className={t.title}>{title}</span>}
        {sub && <span className={t.sub}>{sub}</span>}
        {a.question && <span className={t.question}>{a.question} · tap to fix</span>}
      </button>
    </div>
  )
}

function TellSheet({ open, onClose, onContact }) {
  const toast = useToast()
  const lists = useLiveQuery(() => db.planner_lists.toArray(), [], [])
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
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
        day: e.day || null, part: e.part, notes: e.notes || null, status: 'confirmed', source: 'tell', unsure: false,
      })
    } else if (a.type === 'list_item') {
      await insertRow('list_items', { list_id: await listIdByName(a.list), title: a.title || a.details, details: a.title ? a.details || null : null, day: a.date || null })
    } else if (a.type === 'note') {
      const v = findVillage(villages, a.village)
      const body = (a.details || '').split('\n').map(l => `<div>${escape(l) || '<br>'}</div>`).join('')
      await insertRow(v ? 'notes' : 'general_notes', { ...(v ? { village_id: v.id } : {}), body, images: [] })
    }
  }

  async function addAll() {
    const acts = result.actions
    for (const a of acts) if (a.type !== 'contact') await save(a)
    const contact = acts.find(a => a.type === 'contact')
    const n = acts.filter(a => a.type !== 'contact').length
    if (n) toast(`Added ${n} to Halqa`)
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
    } else if (a.type === 'event' || a.type === 'list_item') setEditing(a)
  }

  const actions = result?.actions || []
  const title = editing ? (editing.type === 'event' ? 'Event' : 'List item') : result ? (actions.length ? "Here's what I understood" : 'Halqa') : 'Tell Halqa'

  return (
    <Sheet open={open} onClose={close} title={title}>
      {editing ? (
        <>
          <button className={t.back} onClick={() => setEditing(null)}>‹ Back</button>
          {editing.type === 'event'
            ? <EventForm initial={asEvent(editing)} onDone={() => { drop(editing.key); setEditing(null) }} />
            : <ItemForm initial={asItem(editing, lists)} onDone={() => { drop(editing.key); setEditing(null) }} />}
        </>
      ) : result ? (
        <>
          <div className={t.you}><b>You said</b>{said}</div>
          {result.reply && <div className={t.reply}>{result.reply}</div>}
          {actions.length > 0 && <div className={t.label}>{actions.length} thing{actions.length > 1 ? 's' : ''} to add</div>}
          {actions.map(a => <ActionCard key={a.key} a={a} lists={lists} villages={villages} onOpen={() => openAction(a)} onDrop={() => drop(a.key)} />)}
          <div className={t.acts}>
            {actions.length > 0
              ? <button className={cx(ui.btn, ui.btnPrimary)} onClick={addAll}><IconCheck size={18} />{actions.length > 1 ? 'Add all' : 'Add'}</button>
              : <button className={cx(ui.btn, ui.btnPrimary)} onClick={() => { reset(); onClose() }}>Done</button>}
            <button className={cx(ui.btn, ui.btnSecondary)} onClick={() => { setResult(null); setEditing(null) }}>Change what I said</button>
          </div>
        </>
      ) : (
        <>
          <textarea className={cx(ui.textarea, t.say)} autoFocus value={said} onChange={e => setSaid(e.target.value)} disabled={busy}
            placeholder="e.g. Riaz Gondal's son's walima is on Sunday night at Taj Greens. When I'm in Lahore, meet the Chief Secretary about the Hujjan school." />
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

// The "Tell Halqa" bar (home screen and Planner).
export function TellBar() {
  const [open, setOpen] = useState(false)
  const sheets = useContactSheets()
  return (
    <>
      <button className={t.bar} onClick={() => setOpen(true)}>
        <span className={t.spark}><IconSparkles size={18} /></span>
        <span className={t.barText}><strong>Tell Halqa</strong><span>Add an event, a to-do, a note…</span></span>
      </button>
      <TellSheet open={open} onClose={() => setOpen(false)} onContact={prefill => sheets.quickAdd(prefill)} />
      {sheets.element}
    </>
  )
}
