import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { insertRow, updateRow } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { localDay } from '../../lib/touch'
import { KINDS, WEDDING_FUNCTIONS, normalizeFunction, PARTS, tagFor, partLabel, whenLabel, partFromTime, sortEvents, dayLabel, addDays, confirmEvent, removeEvent,
  sortLists, listIdByName, toggleDone, removeListItem, DONE_KEEP_DAYS } from '../../lib/events'
import { deleteRow } from '../../lib/store'
import { Screen, BarButton, Card, Sheet, ActionSheet, Empty, Field, cx, ui, useToast } from '../ui'
import { IconPlus, IconCalendar, IconChevron, IconNote, IconCheck, IconMore, IconEdit, IconTrash, IconShare, IconMove, IconPin } from '../Icons'
import { useNav, useScreen } from '../../lib/nav'
import { TellBar } from '../TellHalqa'
import { NotesPanel, newGeneralNote } from './HomeScreen'
import { tidyEventCards } from '../../lib/cards'
import p from '../../styles/planner.module.css'

// The card photo (private bucket): a short-lived link, fetched when online.
function useCardImage(path) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    if (!path) return
    supabase.storage.from('event-cards').createSignedUrl(path, 3600)
      .then(({ data }) => { if (live && data) setUrl(data.signedUrl) }).catch(() => {})
    return () => { live = false }
  }, [path])
  return url
}

const isPdf = path => /\.pdf$/i.test(path || '')

// Small pin button (grey off, amber on), as in Projects.
function PinButton({ pinned, onClick }) {
  return (
    <button className={cx(p.pinBtn, pinned && p.pinBtnOn)} onClick={onClick} aria-label={pinned ? 'Unpin' : 'Pin to the top'}>
      <IconPin size={16} filled={!!pinned} />
    </button>
  )
}
async function togglePin(table, row, toast) {
  await updateRow(table, row.id, { pinned: !row.pinned })
  toast(row.pinned ? 'Unpinned' : 'Pinned to the top', { label: 'Undo', onClick: () => updateRow(table, row.id, { pinned: !!row.pinned }) })
}

export function EventLine({ ev, onPress, showDay }) {
  const where = [...new Set([ev.village, ev.venue].filter(Boolean))].join(' · ')
  return (
    <button className={cx(p.line, ev.unsure && ev.status === 'review' && p.lineUnsure)} onClick={onPress}>
      <span className={p.lineTop}>
        <span className={cx(p.tag, ev.kind !== 'wedding' && p.tagOther)}>{tagFor(ev)}</span>
        {showDay && <span className={p.lineDay}>{dayLabel(ev.day)}</span>}
        {ev.notes && <span className={p.lineNote}>{ev.notes.split('\n')[0]}</span>}
        <span className={cx(p.part, p[`part_${ev.part}`])}>{whenLabel(ev) || '—'}</span>
      </span>
      <span className={p.title}>{ev.title || 'Untitled'}</span>
      {where && <span className={p.where}>{where}</span>}
      {ev.unsure && ev.status === 'review' && <span className={p.check}>Please check</span>}
    </button>
  )
}

function ReviewBatch({ events, onEdit }) {
  const toast = useToast()
  const [confirmDrop, setConfirmDrop] = useState(false)
  const path = events.find(e => e.image_path)?.image_path
  const img = useCardImage(path)
  const pdf = isPdf(path)
  const [big, setBig] = useState(false)

  const [note, setNote] = useState('')
  async function addAll() {
    const n = note.trim()
    for (const e of events) {
      await updateRow('events', e.id, { status: 'confirmed', unsure: false, ...(n ? { notes: e.notes ? `${n}\n${e.notes}` : n } : {}) })
    }
    toast(`Added ${events.length} to the Planner`)
  }
  async function discard() {
    for (const e of events) await removeEvent(e.id)
    toast('Discarded')
  }

  return (
    <div className={cx(ui.card, p.batch)}>
      <div className={p.batchTop}>
        {img && pdf ? <a href={img} target="_blank" rel="noreferrer" className={cx(p.thumbEmpty, p.thumbPdf)}>PDF</a>
          : img ? <img src={img} alt="Card" className={p.thumb} onClick={() => setBig(true)} />
          : <span className={p.thumbEmpty}><IconCalendar size={22} /></span>}
        <span className={p.batchText}>
          <strong>From WhatsApp</strong>
          <span>{events.length} function{events.length !== 1 ? 's' : ''} read · tap one to fix it</span>
          {pdf && img && <a href={img} target="_blank" rel="noreferrer" className={p.openPdf}>Open the PDF</a>}
        </span>
      </div>
      <div className={p.batchLines}>
        {sortEvents(events).map(e => <EventLine key={e.id} ev={e} showDay onPress={() => onEdit(e)} />)}
      </div>
      <form className={p.batchNote} onSubmit={e => { e.preventDefault(); addAll() }}>
        <input className={ui.input} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Note, e.g. who invited (optional)" autoCapitalize="words" enterKeyHint="done" />
      </form>
      <div className={p.batchActions}>
        <button className={cx(ui.btn, ui.btnPrimary)} onClick={addAll}><IconCheck size={18} />Add {events.length > 1 ? 'all' : ''}</button>
        <button className={cx(ui.btn, ui.btnSecondary)} onClick={() => setConfirmDrop(true)}>Discard</button>
      </div>
      <ActionSheet open={confirmDrop} onClose={() => setConfirmDrop(false)} title="Discard these?"
        text="They won't be added to the Planner." items={[{ label: 'Discard', danger: true, onClick: discard }]} />
      <Sheet open={big} onClose={() => setBig(false)} title="Card">
        {img && <img src={img} alt="Card" className={p.full} />}
      </Sheet>
    </div>
  )
}

const EMPTY = { kind: 'wedding', function: 'Baraat', title: '', village: '', venue: '', day: '', part: 'afternoon', time: '', notes: '' }

export function EventForm({ initial, onDone }) {
  const toast = useToast()
  const [f, setF] = useState(() => { const x = { ...EMPTY, ...Object.fromEntries(Object.entries(initial || {}).filter(([, v]) => v != null)) }; return { ...x, function: normalizeFunction(x.function) } })
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const isNew = !initial?.id
  const wedding = f.kind === 'wedding'
  const card = initial?.image_path

  async function save(e) {
    e.preventDefault()
    const data = {
      kind: f.kind, function: (f.function || '').trim() || null, title: f.title.trim(),
      village: f.village.trim() || null, venue: f.venue.trim() || null,
      day: f.day || null, notes: (f.notes || '').trim() || null,
      time: !wedding && f.time ? f.time.slice(0, 5) : null,
      part: !wedding && f.time ? partFromTime(f.time) : f.part,
    }
    if (isNew) await insertRow('events', { ...data, status: 'confirmed', source: 'manual', unsure: false })
    else await updateRow('events', initial.id, { ...data, status: 'confirmed', unsure: false })
    toast(isNew ? 'Added to the Planner' : 'Saved')
    onDone()
  }

  async function remove() {
    await removeEvent(initial.id)
    toast('Deleted')
    onDone()
  }

  return (
    <form onSubmit={save}>
      <div className={ui.field}>
        <span className={ui.label}>Type</span>
        <div className={p.chips}>
          {KINDS.map(k => (
            <button type="button" key={k.id} className={cx(ui.chipBtn, f.kind === k.id && ui.chipBtnOn)}
              onClick={() => setF(x => ({ ...x, kind: k.id, function: k.id === 'wedding' ? (WEDDING_FUNCTIONS.includes(x.function) ? x.function : 'Baraat') : '' }))}>{k.label}</button>
          ))}
        </div>
      </div>
      {wedding && (
        <div className={ui.field}>
          <span className={ui.label}>Function</span>
          <div className={p.chips}>
            {WEDDING_FUNCTIONS.map(fn => (
              <button type="button" key={fn} className={cx(ui.chipBtn, f.function === fn && ui.chipBtnOn)} onClick={() => set('function', fn)}>{fn}</button>
            ))}
          </div>
        </div>
      )}
      <Field label={wedding ? 'Groom' : 'What'}>
        <input className={ui.input} value={f.title} onChange={e => set('title', e.target.value)} placeholder={wedding ? 'e.g. Malik Rustam Ali Thaheem' : 'e.g. Meeting at PM House'} autoCapitalize="words" />
      </Field>
      <Field label="Date">
        <input className={ui.input} type="date" value={f.day || ''} onChange={e => set('day', e.target.value)} />
      </Field>
      {!wedding && (
        <Field label="Time">
          <div className={p.timeRow}>
            <input className={ui.input} type="time" value={f.time || ''} onChange={e => set('time', e.target.value)} />
            {f.time && <button type="button" className={p.timeClear} onClick={() => set('time', '')}>Clear</button>}
          </div>
        </Field>
      )}
      {(wedding || !f.time) && (
      <div className={ui.field}>
        <span className={ui.label}>{wedding ? 'Time' : 'Or roughly'}</span>
        <div className={p.seg}>
          {PARTS.map(pt => (
            <button type="button" key={pt.id} className={cx(p.segBtn, f.part === pt.id && p.segOn)} onClick={() => set('part', pt.id)}>{pt.label}</button>
          ))}
        </div>
      </div>
      )}
      <Field label="Village">
        <input className={ui.input} value={f.village} onChange={e => set('village', e.target.value)} placeholder="Optional" autoCapitalize="words" />
      </Field>
      <Field label="Venue">
        <input className={ui.input} value={f.venue} onChange={e => set('venue', e.target.value)} placeholder="e.g. Victoria Palace, Bhagtanwala" autoCapitalize="words" />
      </Field>
      <Field label="Notes">
        <textarea className={ui.textarea} rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
      </Field>
      {card && <CardPreview path={card} />}
      <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 18 }} disabled={!f.title.trim() && !f.venue.trim()}>
        {isNew ? 'Add to Planner' : initial.status === 'review' ? 'Save and add' : 'Save'}
      </button>
      {!isNew && <button type="button" className={p.delete} onClick={() => setConfirmDel(true)}>Delete</button>}
      <ActionSheet open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this event?"
        items={[{ label: 'Delete', danger: true, onClick: remove }]} />
    </form>
  )
}

function CardPreview({ path }) {
  const url = useCardImage(path)
  if (!url) return null
  return isPdf(path) ? <a href={url} target="_blank" rel="noreferrer" className={p.openPdf} style={{ display: 'block', marginTop: 14 }}>Open the card (PDF)</a>
    : <img src={url} alt="Card" className={p.preview} />
}

// ---------- Swipe left for actions (like the iPhone Notes app) ----------

let closeOpenRow = null   // only one row open at a time

// Swipe left on a row for its actions (Share, Move, Delete). Own touch handling
// (19 Nov): the row only moves once the finger is clearly going sideways, so
// scrolling up and down never wobbles rows, and a tap is always a tap.
const LOCK = 8          // px of movement before deciding sideways or up/down
export function SwipeRow({ actions, children, rowId }) {
  const front = useRef(null)
  const g = useRef({ x: 0, swipedAt: 0 })
  const width = actions.length * 74
  const setX = (x, anim) => {
    const el = front.current
    if (!el) return
    el.style.transition = anim ? 'transform .3s cubic-bezier(.32,.72,0,1)' : 'none'
    el.style.transform = x ? `translateX(${x}px)` : ''
    g.current.x = x
  }
  const close = () => { setX(0, true); if (closeOpenRow === close) closeOpenRow = null }
  const closeRef = useRef(close); closeRef.current = close
  const open = () => {
    if (closeOpenRow && closeOpenRow !== closeRef.current) closeOpenRow()
    closeOpenRow = closeRef.current
    setX(-width, true)
  }
  useEffect(() => {
    const el = front.current
    if (!el) return
    let t = null
    const start = e => {
      if (e.touches.length !== 1) { t = null; return }
      const p0 = e.touches[0]
      t = { x0: p0.clientX, y0: p0.clientY, base: g.current.x, lock: null, lastX: p0.clientX, lastT: e.timeStamp, v: 0 }
    }
    const move = e => {
      if (!t) return
      const p1 = e.touches[0], dx = p1.clientX - t.x0, dy = p1.clientY - t.y0
      if (!t.lock) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return
        t.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
        if (t.lock === 'y') { if (g.current.x) closeRef.current(); return }
        if (closeOpenRow && closeOpenRow !== closeRef.current) closeOpenRow()
      }
      if (t.lock !== 'x') return
      e.preventDefault()
      let x = t.base + dx
      if (x > 0) x *= 0.15
      if (x < -width) x = -width + (x + width) * 0.15
      const dt = e.timeStamp - t.lastT
      if (dt > 0) t.v = (p1.clientX - t.lastX) / dt * 1000
      t.lastX = p1.clientX; t.lastT = e.timeStamp
      setX(x, false)
    }
    const end = () => {
      if (t?.lock === 'x') {
        g.current.swipedAt = Date.now()
        const x = g.current.x
        if (t.v < -350 || (x < -width / 2 && t.v < 350)) open()
        else close()
      }
      t = null
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end)
      if (closeOpenRow === closeRef.current) closeOpenRow = null
    }
  }, [width])
  return (
    <div className={p.swipe} id={rowId}>
      <div className={p.swipeActions} style={{ width }}>
        {actions.map(a => (
          <button key={a.label} className={cx(p.swipeBtn, p[`swipe_${a.tone}`])} onClick={() => { close(); a.onClick() }}>
            {a.icon}<span>{a.label}</span>
          </button>
        ))}
      </div>
      <div ref={front} className={p.swipeFront}
        onClickCapture={e => {
          // A swipe that just ended, or a tap on an open row (closes it), is not a tap on the row.
          if (Date.now() - g.current.swipedAt < 350 || g.current.x < -4) { e.stopPropagation(); e.preventDefault(); if (g.current.x) close() }
        }}>
        {children}
      </div>
    </div>
  )
}

const longDay = day => (day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') : '')

export async function shareText(text, toast) {
  try {
    if (navigator.share) { await navigator.share({ text }); return }
  } catch (e) { if (e?.name === 'AbortError') return }
  try { await navigator.clipboard.writeText(text); toast('Copied, ready to paste') } catch { toast('Could not share') }
}

function SwipeEvent({ ev, onPress, showDay }) {
  const toast = useToast()
  const share = () => shareText([
    `${tagFor(ev)}: ${ev.title || ''}`.trim(),
    [ev.village, ev.venue].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '),
    [longDay(ev.day), whenLabel(ev)].filter(Boolean).join(', '),
  ].filter(Boolean).join('\n'), toast)
  async function del() {
    await removeEvent(ev.id)
    toast('Event deleted', { label: 'Undo', onClick: () => insertRow('events', ev) })
  }
  return (
    <SwipeRow rowId={`row-${ev.id}`} actions={[
      { label: 'Share', tone: 'share', icon: <IconShare size={19} />, onClick: share },
      { label: 'Delete', tone: 'delete', icon: <IconTrash size={19} />, onClick: del },
    ]}>
      <div className={p.pinRow}>
        <EventLine ev={ev} onPress={onPress} showDay={showDay} />
        <PinButton pinned={ev.pinned} onClick={() => togglePin('events', ev, toast)} />
      </div>
    </SwipeRow>
  )
}

function SwipeItem({ item, onPress, listName, showDay, onMove }) {
  const toast = useToast()
  const share = () => shareText([item.title, item.details, item.day ? longDay(item.day) : ''].filter(Boolean).join('\n'), toast)
  async function del() {
    await removeListItem(item.id)
    toast('Deleted', { label: 'Undo', onClick: () => insertRow('list_items', item) })
  }
  return (
    <SwipeRow rowId={`row-${item.id}`} actions={[
      { label: 'Share', tone: 'share', icon: <IconShare size={19} />, onClick: share },
      { label: 'Move', tone: 'move', icon: <IconMove size={19} />, onClick: () => onMove(item) },
      { label: 'Delete', tone: 'delete', icon: <IconTrash size={19} />, onClick: del },
    ]}>
      <ItemLine item={item} onPress={onPress} listName={listName} showDay={showDay} onPin={() => togglePin('list_items', item, toast)} />
    </SwipeRow>
  )
}

// "Move to…" sheet for a list item.
function MoveSheet({ item, onClose }) {
  const toast = useToast()
  const lists = sortLists(useLiveQuery(() => db.planner_lists.toArray(), [], []))
  return (
    <ActionSheet open={!!item} onClose={onClose} title="Move to…"
      items={lists.filter(l => l.id !== item?.list_id).map(l => ({
        label: l.name,
        onClick: async () => { await updateRow('list_items', item.id, { list_id: l.id }); toast(`Moved to ${l.name}`) },
      }))} />
  )
}

// ---------- Lists (Islamabad, Lahore…) ----------

const recentDone = i => i.done_at && Date.now() - new Date(i.done_at).getTime() < DONE_KEEP_DAYS * 864e5

export function ItemLine({ item, onPress, listName, showDay = true, onPin }) {
  const done = !!item.done_at
  return (
    <div className={cx(p.item, done && p.itemDone)}>
      <button className={cx(p.box, done && p.boxOn)} onClick={() => toggleDone(item)} aria-label={done ? 'Not done' : 'Done'}>
        {done && <IconCheck size={15} />}
      </button>
      <button className={p.itemText} onClick={onPress}>
        {listName && <span className={p.lineTop}><span className={cx(p.tag, p.tagList)}>{listName}</span></span>}
        <span className={p.itemTitle}>{item.title || 'Untitled'}</span>
        {item.details && <span className={p.where}>{item.details}</span>}
        {done ? <span className={p.where}>Done {dayLabel(item.done_at.slice(0, 10))}</span>
          : showDay && item.day && <span className={p.pill}>{dayLabel(item.day)}</span>}
      </button>
      {onPin && !done && <PinButton pinned={item.pinned} onClick={onPin} />}
    </div>
  )
}

export function ItemForm({ initial, onDone }) {
  const toast = useToast()
  const lists = sortLists(useLiveQuery(() => db.planner_lists.toArray(), [], []))
  const [f, setF] = useState(() => ({ title: '', details: '', day: '', list_id: null, newList: '', ...Object.fromEntries(Object.entries(initial || {}).filter(([, v]) => v != null)) }))
  const [adding, setAdding] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const isNew = !initial?.id
  const listId = f.list_id || (!f.newList && lists[0]?.id) || null

  async function save(e) {
    e.preventDefault()
    const list_id = f.newList.trim() ? await listIdByName(f.newList) : listId
    const data = { list_id, title: f.title.trim(), details: f.details.trim() || null, day: f.day || null }
    if (isNew) await insertRow('list_items', data)
    else await updateRow('list_items', initial.id, data)
    toast(isNew ? 'Added' : 'Saved')
    onDone()
  }
  async function remove() {
    await removeListItem(initial.id)
    toast('Deleted')
    onDone()
  }

  return (
    <form onSubmit={save}>
      <Field label="What / who">
        <input className={ui.input} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Meet Secretary Petroleum" autoCapitalize="sentences" />
      </Field>
      <Field label="Details">
        <input className={ui.input} value={f.details} onChange={e => set('details', e.target.value)} placeholder="Optional" autoCapitalize="sentences" />
      </Field>
      <div className={ui.field}>
        <span className={ui.label}>List</span>
        <div className={p.chips}>
          {lists.map(l => (
            <button type="button" key={l.id} className={cx(ui.chipBtn, !f.newList && listId === l.id && ui.chipBtnOn)}
              onClick={() => setF(x => ({ ...x, list_id: l.id, newList: '' }))}>{l.name}</button>
          ))}
          {adding || f.newList
            ? <input className={cx(ui.input, p.newListInput)} autoFocus value={f.newList} onChange={e => set('newList', e.target.value)} placeholder="New list name" autoCapitalize="words" />
            : <button type="button" className={cx(ui.chipBtn, p.chipNew)} onClick={() => setAdding(true)}>+ New list</button>}
        </div>
      </div>
      <Field label="Date (optional)">
        <input className={ui.input} type="date" value={f.day || ''} onChange={e => set('day', e.target.value)} />
      </Field>
      <p className={p.hint}>With a date, it also shows under Events.</p>
      <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 18 }} disabled={!f.title.trim() || (!listId && !f.newList.trim())}>
        {isNew ? 'Add' : 'Save'}
      </button>
      {!isNew && <button type="button" className={p.delete} onClick={() => setConfirmDel(true)}>Delete</button>}
      <ActionSheet open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this?"
        items={[{ label: 'Delete', danger: true, onClick: remove }]} />
    </form>
  )
}

function ListView({ list, items, onEdit, onAdd, onMenu }) {
  const [showOld, setShowOld] = useState(false)
  const [moving, setMoving] = useState(null)
  const open = [...items.filter(i => !i.done_at)].sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.day || '9999').localeCompare(b.day || '9999') || (a.created_at || '').localeCompare(b.created_at || ''))
  const done = items.filter(i => i.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at))
  const recent = done.filter(recentDone)
  const old = done.filter(i => !recentDone(i))

  return (
    <div className={ui.section}>
      <div className={ui.sectionHead}>
        <span>To do in {list.name}</span>
        <span className={p.listHeadBtns}>
          <button className={p.listAdd} onClick={onAdd} aria-label={`Add to ${list.name}`}><IconPlus size={17} /></button>
          <button className={p.listMenu} onClick={onMenu} aria-label="List options"><IconMore size={18} /></button>
        </span>
      </div>
      {open.length + recent.length === 0 ? (
        <Empty icon={<IconCheck size={28} />} title="Nothing here" text={`Tap + to add people to meet and things to do in ${list.name}.`} />
      ) : (
        <div className={cx(ui.card, p.dayCard)}>
          {[...open, ...recent].map(i => <SwipeItem key={i.id} item={i} onPress={() => onEdit(i)} onMove={setMoving} />)}
        </div>
      )}
      {old.length > 0 && (
        <>
          <button className={p.pastToggle} onClick={() => setShowOld(v => !v)}>{showOld ? 'Hide done' : `Show done (${old.length})`}</button>
          {showOld && <div className={cx(ui.card, p.dayCard)}>{old.map(i => <SwipeItem key={i.id} item={i} onPress={() => onEdit(i)} onMove={setMoving} />)}</div>}
        </>
      )}
      <MoveSheet item={moving} onClose={() => setMoving(null)} />
    </div>
  )
}

export default function PlannerScreen() {
  const { push, setParams } = useNav()
  const { key, params } = useScreen()
  const toast = useToast()
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const rawLists = useLiveQuery(() => db.planner_lists.toArray(), [], [])
  const items = useLiveQuery(() => db.list_items.toArray(), [], [])
  const [form, setForm] = useState(null)        // {} new, or an event
  const [itemForm, setItemForm] = useState(null) // {list_id} new, or an item
  const [listSheet, setListSheet] = useState(null) // { id?, name }
  const [listMenu, setListMenu] = useState(false)
  const [confirmDropList, setConfirmDropList] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [moving, setMoving] = useState(null)
  const today = localDay()
  const lists = sortLists(rawLists)
  const listName = Object.fromEntries(lists.map(l => [l.id, l.name]))
  const tab = params.tab && (params.tab === 'calendar' || params.tab === 'notes' || listName[params.tab]) ? params.tab : 'calendar'
  const setTab = t => setParams(key, { tab: t })
  const current = lists.find(l => l.id === tab)

  // Opened from a home-screen line: scroll to that day once the events have loaded.
  const scrolledTo = useRef(null)
  useEffect(() => {
    const day = params.day
    if (!day || scrolledTo.current === day || tab !== 'calendar') return
    const el = document.getElementById(`planner-day-${day}`)
    if (!el) return
    scrolledTo.current = day
    el.scrollIntoView({ block: 'start' })
  })

  // Past invitation cards are deleted once a day (lib/cards.js).
  useEffect(() => { tidyEventCards().catch(() => {}) }, [])

  // "Show in Planner" from the calendar: open the right tab, scroll to the card and flash it.
  const showRef = useRef(null)
  showRef.current = ({ id, day, listId, isItem }) => {
    const pastDay = day && day < today
    if (isItem && (pastDay || !day)) setTab(listId)
    else setTab('calendar')
    if (!isItem && pastDay) setShowPast(true)
    let tries = 0
    const find = () => {
      const el = document.getElementById(`row-${id}`)
      if (!el) {
        if (++tries < 20) return setTimeout(find, 60)
        // Not in the list (e.g. an event more than 15 days old): open it instead.
        const ev = events.find(e => e.id === id)
        if (ev) setForm(ev)
        return
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add(p.flashRow)
      setTimeout(() => el.classList.remove(p.flashRow), 1800)
    }
    setTimeout(find, 80)
  }
  // Opened by the calendar from elsewhere (Home): show that card once the page is in.
  const shownParam = useRef(false)
  useEffect(() => {
    if (!params.show || shownParam.current) return
    shownParam.current = true
    const t = setTimeout(() => showRef.current(params.show), 380)
    return () => clearTimeout(t)
  }, [params.show])
  useEffect(() => {
    const on = e => showRef.current(e.detail)
    window.addEventListener('halqa:planner-show', on)
    return () => window.removeEventListener('halqa:planner-show', on)
  }, [])

  const review = useMemo(() => {
    const byBatch = {}
    events.filter(e => e.status === 'review').forEach(e => { (byBatch[e.batch_id || e.id] ||= []).push(e) })
    return Object.values(byBatch).sort((a, b) => (a[0].created_at < b[0].created_at ? 1 : -1))
  }, [events])

  const confirmed = events.filter(e => e.status !== 'review')
  const upcoming = sortEvents(confirmed.filter(e => !e.day || e.day >= today))
  // Past events show for 15 days after their date (17 Nov); older ones stay in
  // the calendar and Search, and nothing is deleted.
  const pastFrom = addDays(today, -15)
  const past = sortEvents(confirmed.filter(e => e.day && e.day < today && e.day >= pastFrom)).reverse()
  // Pinned events show in their own section at the top, and also in their place below.
  const pinnedEvents = upcoming.filter(e => e.pinned)
  // List items with a date also show under Events (until done).
  const datedItems = items.filter(i => i.day && !i.done_at && i.day >= today)

  // Group by day: Today, Tomorrow, Sat 14 Nov…
  const entries = [
    ...upcoming.map(e => ({ day: e.day, ev: e })),
    ...datedItems.map(i => ({ day: i.day, item: i })),
  ].sort((a, b) => (a.day || '9999').localeCompare(b.day || '9999'))
  const groups = []
  entries.forEach(x => {
    const k = x.day || 'none'
    const g = groups[groups.length - 1]
    if (g && g.key === k) g.items.push(x)
    else groups.push({ key: k, label: dayLabel(x.day), items: [x] })
  })
  const openCount = id => items.filter(i => i.list_id === id && !i.done_at).length

  async function saveList(e) {
    e.preventDefault()
    const name = (listSheet.name || '').trim()
    if (!name) return
    if (listSheet.id) await updateRow('planner_lists', listSheet.id, { name })
    else {
      const id = await listIdByName(name)
      setTab(id)
    }
    setListSheet(null)
  }
  async function dropList() {
    for (const i of items.filter(i => i.list_id === current.id)) await deleteRow('list_items', i.id)
    await deleteRow('planner_lists', current.id)
    toast(`Deleted ${current.name}`)
    setTab('calendar')
  }

  return (
    <Screen title="Planner" subtitle="Weddings, meetings and lists"
      actions={<BarButton onClick={() => (tab === 'notes' ? newGeneralNote(push) : current ? setItemForm({ list_id: current.id }) : setForm({}))} aria-label="Add"><IconPlus size={22} /></BarButton>}>

      <TellBar />

      <div className={p.tabs}>
        <button className={cx(p.tabPill, tab === 'calendar' && p.tabOn)} onClick={() => setTab('calendar')}>Events</button>
        {lists.map(l => (
          <button key={l.id} className={cx(p.tabPill, tab === l.id && p.tabOn)} onClick={() => setTab(l.id)}>
            {l.name}{openCount(l.id) > 0 && <b>{openCount(l.id)}</b>}
          </button>
        ))}
        <button className={cx(p.tabPill, tab === 'notes' && p.tabOn)} onClick={() => setTab('notes')}>Notes</button>
        <button className={cx(p.tabPill, p.tabAdd)} onClick={() => setListSheet({ name: '' })}>+ New list</button>
      </div>

      {tab === 'notes' ? (
        <div className={ui.section}>
          <div className={ui.sectionHead}>
            <span>Notes</span>
            <span className={p.listHeadBtns}>
              <button className={p.listAdd} onClick={() => newGeneralNote(push)} aria-label="New note"><IconPlus size={17} /></button>
            </span>
          </div>
          <NotesPanel />
        </div>
      ) : current ? (
        <ListView list={current} items={items.filter(i => i.list_id === current.id)} onEdit={setItemForm} onAdd={() => setItemForm({ list_id: current.id })} onMenu={() => setListMenu(true)} />
      ) : (
        <>
          {pinnedEvents.length > 0 && (
            <div className={ui.section}>
              <div className={ui.sectionHead}><span>📌 Pinned</span><span>{pinnedEvents.length}</span></div>
              <div className={p.pinnedBox}>
                {pinnedEvents.map(e => (
                  <button key={e.id} className={p.pinnedLine} onClick={() =>
                    document.getElementById(`planner-day-${e.day || 'none'}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    <span className={p.pinnedDay}>{!e.day ? 'No date' : e.day === today ? 'Today' : shortDay(e.day)}</span>
                    <span className={p.pinnedWhat}>{tagFor(e)}<span> · {e.title || 'Untitled'}</span></span>
                    <span className={cx(p.pinnedWhen, p[`part_${e.part}`])}>{whenLabel(e)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {review.length > 0 && (
            <div className={ui.section}>
              <div className={ui.sectionHead}><span>To review</span><span>{review.reduce((n, b) => n + b.length, 0)}</span></div>
              <div className={p.stack}>{review.map(b => <ReviewBatch key={b[0].batch_id || b[0].id} events={b} onEdit={setForm} />)}</div>
            </div>
          )}

          <div className={ui.section}>
            <div className={ui.sectionHead}>
              <span>Upcoming · {entries.length}</span>
              <button className={p.calBtn} onClick={() => push('calendar')} aria-label="Calendar"><IconCalendar size={17} /></button>
            </div>
            {groups.length === 0 ? (
              <Empty icon={<IconCalendar size={28} />} title="Nothing planned yet"
                text="Share wedding cards from WhatsApp with “Add to Halqa”, or tap + to add an event." />
            ) : groups.map(g => (
              <div key={g.key} className={p.day} id={`planner-day-${g.key}`}>
                <div className={cx(p.dayHead, g.key === today && p.dayToday)}>
                  <span>{g.label}</span><span>{g.items.length}</span>
                </div>
                <div className={cx(ui.card, p.dayCard)}>
                  {g.items.map(x => x.ev
                    ? <SwipeEvent key={x.ev.id} ev={x.ev} onPress={() => setForm(x.ev)} />
                    : <SwipeItem key={x.item.id} item={x.item} listName={listName[x.item.list_id]} showDay={false} onPress={() => setItemForm(x.item)} onMove={setMoving} />)}
                </div>
              </div>
            ))}
          </div>

          {past.length > 0 && (
            <div className={ui.section}>
              <button className={p.pastToggle} onClick={() => setShowPast(v => !v)}>
                {showPast ? 'Hide past events' : `Past events (${past.length})`}
              </button>
              {showPast && <div className={cx(ui.card, p.dayCard)}>{past.slice(0, 60).map(e => <SwipeEvent key={e.id} ev={e} showDay onPress={() => setForm(e)} />)}</div>}
            </div>
          )}
        </>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? (form.status === 'review' ? 'Check event' : 'Edit event') : 'New event'}>
        {form && <EventForm key={form.id || 'new'} initial={form} onDone={() => setForm(null)} />}
      </Sheet>
      <Sheet open={!!itemForm} onClose={() => setItemForm(null)} title={itemForm?.id ? 'Edit' : `Add to ${listName[itemForm?.list_id] || 'a list'}`}>
        {itemForm && <ItemForm key={itemForm.id || 'new'} initial={itemForm} onDone={() => setItemForm(null)} />}
      </Sheet>
      <Sheet open={!!listSheet} onClose={() => setListSheet(null)} title={listSheet?.id ? 'Rename list' : 'New list'}>
        {listSheet && (
          <form onSubmit={saveList}>
            <Field label="Name">
              <input className={ui.input} autoFocus value={listSheet.name} onChange={e => setListSheet(x => ({ ...x, name: e.target.value }))} placeholder="e.g. Faisalabad" autoCapitalize="words" />
            </Field>
            <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 18 }} disabled={!listSheet.name.trim()}>{listSheet.id ? 'Save' : 'Add list'}</button>
          </form>
        )}
      </Sheet>
      <MoveSheet item={moving} onClose={() => setMoving(null)} />
      <ActionSheet open={listMenu} onClose={() => setListMenu(false)} title={current?.name}
        items={[
          { label: 'Rename list', icon: <IconEdit size={20} />, onClick: () => setListSheet({ id: current.id, name: current.name }) },
          { label: 'Delete list', icon: <IconTrash size={20} />, danger: true, onClick: () => setConfirmDropList(true) },
        ]} />
      <ActionSheet open={confirmDropList} onClose={() => setConfirmDropList(false)} title={`Delete ${current?.name}?`}
        text={`Everything on this list (${items.filter(i => i.list_id === current?.id).length}) is deleted too.`}
        items={[{ label: 'Delete list', danger: true, onClick: dropList }]} />
    </Screen>
  )
}

// Home screen: the next two days that have something on, one short line each.
// "Fri 13 · Mehndi · Halalpur · Night", or for a busy day
// "Fri 13 · 7 events · 3 afternoon · Jalsa 4:30 PM · 3 night". Tapping opens that day in the Planner.
const place = e => e.village || (e.venue || '').split(',').map(x => x.trim()).filter(Boolean).pop() || ''
const shortDay = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }).replace(',', '')

function daySummary(entries) {
  // In time order: weddings grouped by part ("3 afternoon"), others one by one ("Jalsa 4:30 PM").
  const parts = []
  for (const x of entries) {
    if (x.item) { parts.push({ key: 'todo', label: 'to do' }); continue }
    const e = x.ev
    if (e.kind === 'wedding') {
      const last = parts[parts.length - 1]
      if (last && last.part === e.part) last.n++
      else parts.push({ part: e.part, n: 1 })
    } else parts.push({ label: `${tagFor(e)} ${whenLabel(e)}`.trim() })
  }
  const todo = parts.filter(x => x.key === 'todo').length
  return [...parts.filter(x => x.key !== 'todo').map(x => x.label || `${x.n} wedding${x.n > 1 ? 's' : ''} ${(partLabel(x.part) || 'afternoon').toLowerCase()}`),
    todo ? `${todo} to do` : ''].filter(Boolean).join(' · ')
}

export function NextLines({ className }) {
  const { push } = useNav()
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const items = useLiveQuery(() => db.list_items.toArray(), [], [])
  const today = localDay()
  const toReview = events.filter(e => e.status === 'review').length
  const entries = [
    ...sortEvents(events.filter(e => e.status !== 'review' && e.day && e.day >= today)).map(e => ({ day: e.day, ev: e })),
    ...items.filter(i => i.day && !i.done_at && i.day >= today).map(i => ({ day: i.day, item: i })),
  ]
  const days = [...new Set(entries.map(x => x.day))].sort().slice(0, 2)
  if (!days.length && !toReview) return null
  const open = day => push('planner', { tab: 'calendar', day })
  return (
    <div className={className}>
      {toReview > 0 && (
        <button className={p.nextLine} onClick={() => push('planner', { tab: 'calendar' })}>
          <span className={cx(p.nextDay, p.nextReview)}>Review</span>
          <span className={p.nextWhat}>{toReview} from WhatsApp <span>· tap to check</span></span>
        </button>
      )}
      {days.map(day => {
        const list = entries.filter(x => x.day === day)
        const single = list.length === 1 ? list[0] : null
        return (
          <button key={day} className={p.nextLine} onClick={() => open(day)}>
            <span className={p.nextDay}>{day === today ? 'Today' : day === addDays(today, 1) ? 'Tmrw' : shortDay(day)}</span>
            {single?.ev ? (
              <>
                <span className={p.nextWhat}>{tagFor(single.ev)}{place(single.ev) && <span> · {place(single.ev)}</span>}</span>
                <span className={cx(p.nextWhen, p[`part_${single.ev.part}`])}>{whenLabel(single.ev)}</span>
              </>
            ) : single?.item ? (
              <span className={p.nextWhat}>{single.item.title} <span>· to do</span></span>
            ) : (
              <span className={p.nextWhat}>{daySummary(list)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
