import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { insertRow, updateRow } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { localDay } from '../../lib/touch'
import { KINDS, WEDDING_FUNCTIONS, PARTS, tagFor, partLabel, whenLabel, partFromTime, sortEvents, dayLabel, addDays, confirmEvent, removeEvent,
  sortLists, listIdByName, toggleDone, removeListItem, DONE_KEEP_DAYS } from '../../lib/events'
import { deleteRow } from '../../lib/store'
import { Screen, BarButton, Card, Sheet, ActionSheet, Empty, Field, cx, ui, useToast } from '../ui'
import { IconPlus, IconCalendar, IconChevron, IconNote, IconCheck, IconMore, IconEdit, IconTrash } from '../Icons'
import { useNav, useScreen } from '../../lib/nav'
import { TellBar } from '../TellHalqa'
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

export function EventLine({ ev, onPress, showDay }) {
  const where = [...new Set([ev.village, ev.venue].filter(Boolean))].join(' · ')
  return (
    <button className={cx(p.line, ev.unsure && ev.status === 'review' && p.lineUnsure)} onClick={onPress}>
      <span className={p.lineTop}>
        <span className={cx(p.tag, ev.kind !== 'wedding' && p.tagOther)}>{tagFor(ev)}</span>
        {showDay && <span className={p.lineDay}>{dayLabel(ev.day)}</span>}
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

  async function addAll() {
    for (const e of events) await confirmEvent(e.id)
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
  const [f, setF] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(initial || {}).filter(([, v]) => v != null)) }))
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
            {f.function && !WEDDING_FUNCTIONS.includes(f.function) && <span className={cx(ui.chipBtn, ui.chipBtnOn)}>{f.function}</span>}
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

// ---------- Lists (Islamabad, Lahore…) ----------

const recentDone = i => i.done_at && Date.now() - new Date(i.done_at).getTime() < DONE_KEEP_DAYS * 864e5

export function ItemLine({ item, onPress, listName, showDay = true }) {
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

function ListView({ list, items, onEdit, onMenu }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [showOld, setShowOld] = useState(false)
  const open = [...items.filter(i => !i.done_at)].sort((a, b) =>
    (a.day || '9999').localeCompare(b.day || '9999') || (a.created_at || '').localeCompare(b.created_at || ''))
  const done = items.filter(i => i.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at))
  const recent = done.filter(recentDone)
  const old = done.filter(i => !recentDone(i))

  async function add(e) {
    e.preventDefault()
    const title = text.trim()
    if (!title) return
    await insertRow('list_items', { list_id: list.id, title })
    setText('')
    toast(`Added to ${list.name}`)
  }

  return (
    <div className={ui.section}>
      <div className={ui.sectionHead}>
        <span>To do in {list.name}</span>
        <button className={p.listMenu} onClick={onMenu} aria-label="List options"><IconMore size={18} /></button>
      </div>
      {open.length + recent.length === 0 ? (
        <Empty icon={<IconCheck size={28} />} title="Nothing here" text={`Add people to meet and things to do in ${list.name}.`} />
      ) : (
        <div className={cx(ui.card, p.dayCard)}>
          {[...open, ...recent].map(i => <ItemLine key={i.id} item={i} onPress={() => onEdit(i)} />)}
        </div>
      )}
      <form className={p.addRow} onSubmit={add}>
        <span className={p.addPlus}><IconPlus size={18} /></span>
        <input className={p.addInput} value={text} onChange={e => setText(e.target.value)} placeholder={`Add to ${list.name}…`} enterKeyHint="done" autoCapitalize="sentences" />
        {text.trim() && <button type="submit" className={p.addBtn}>Add</button>}
      </form>
      {old.length > 0 && (
        <>
          <button className={p.pastToggle} onClick={() => setShowOld(v => !v)}>{showOld ? 'Hide done' : `Show done (${old.length})`}</button>
          {showOld && <div className={cx(ui.card, p.dayCard)}>{old.map(i => <ItemLine key={i.id} item={i} onPress={() => onEdit(i)} />)}</div>}
        </>
      )}
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
  const dayNote = useLiveQuery(() => db.day_note.get(1), [])
  const [form, setForm] = useState(null)        // {} new, or an event
  const [itemForm, setItemForm] = useState(null) // {list_id} new, or an item
  const [listSheet, setListSheet] = useState(null) // { id?, name }
  const [listMenu, setListMenu] = useState(false)
  const [confirmDropList, setConfirmDropList] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const today = localDay()
  const lists = sortLists(rawLists)
  const listName = Object.fromEntries(lists.map(l => [l.id, l.name]))
  const tab = params.tab && (params.tab === 'calendar' || listName[params.tab]) ? params.tab : 'calendar'
  const setTab = t => setParams(key, { tab: t })
  const current = lists.find(l => l.id === tab)

  const review = useMemo(() => {
    const byBatch = {}
    events.filter(e => e.status === 'review').forEach(e => { (byBatch[e.batch_id || e.id] ||= []).push(e) })
    return Object.values(byBatch).sort((a, b) => (a[0].created_at < b[0].created_at ? 1 : -1))
  }, [events])

  const confirmed = events.filter(e => e.status !== 'review')
  const upcoming = sortEvents(confirmed.filter(e => !e.day || e.day >= today))
  const past = sortEvents(confirmed.filter(e => e.day && e.day < today)).reverse()
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
  const notePreview = (dayNote?.body || '').split('\n').find(l => l.trim())
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
      actions={<BarButton onClick={() => (current ? setItemForm({ list_id: current.id }) : setForm({}))} aria-label="Add"><IconPlus size={22} /></BarButton>}>

      <TellBar />

      <div className={p.tabs}>
        <button className={cx(p.tabPill, tab === 'calendar' && p.tabOn)} onClick={() => setTab('calendar')}>Events</button>
        {lists.map(l => (
          <button key={l.id} className={cx(p.tabPill, tab === l.id && p.tabOn)} onClick={() => setTab(l.id)}>
            {l.name}{openCount(l.id) > 0 && <b>{openCount(l.id)}</b>}
          </button>
        ))}
        <button className={cx(p.tabPill, p.tabAdd)} onClick={() => setListSheet({ name: '' })}>+ New list</button>
      </div>

      {current ? (
        <ListView list={current} items={items.filter(i => i.list_id === current.id)} onEdit={setItemForm} onMenu={() => setListMenu(true)} />
      ) : (
        <>
          {review.length > 0 && (
            <div className={ui.section}>
              <div className={ui.sectionHead}><span>To review</span><span>{review.reduce((n, b) => n + b.length, 0)}</span></div>
              <div className={p.stack}>{review.map(b => <ReviewBatch key={b[0].batch_id || b[0].id} events={b} onEdit={setForm} />)}</div>
            </div>
          )}

          <div className={ui.section}>
            <div className={ui.sectionHead}><span>Upcoming</span><span>{entries.length}</span></div>
            {groups.length === 0 ? (
              <Empty icon={<IconCalendar size={28} />} title="Nothing planned yet"
                text="Share wedding cards from WhatsApp with “Add to Halqa”, or tap + to add an event." />
            ) : groups.map(g => (
              <div key={g.key} className={p.day}>
                <div className={cx(p.dayHead, g.key === today && p.dayToday)}>
                  <span>{g.label}</span><span>{g.items.length}</span>
                </div>
                <div className={cx(ui.card, p.dayCard)}>
                  {g.items.map(x => x.ev
                    ? <EventLine key={x.ev.id} ev={x.ev} onPress={() => setForm(x.ev)} />
                    : <ItemLine key={x.item.id} item={x.item} listName={listName[x.item.list_id]} showDay={false} onPress={() => setItemForm(x.item)} />)}
                </div>
              </div>
            ))}
          </div>

          <Card className={p.noteCard} onClick={() => push('dayNote')}>
            <span className={cx(ui.featureIcon, p.noteIcon)}><IconNote size={20} /></span>
            <span className={p.noteText}><strong>Day to Day notes</strong><span>{notePreview || 'Empty'}</span></span>
            <IconChevron size={18} />
          </Card>

          {past.length > 0 && (
            <div className={ui.section}>
              <button className={p.pastToggle} onClick={() => setShowPast(v => !v)}>
                {showPast ? 'Hide past events' : `Past events (${past.length})`}
              </button>
              {showPast && <div className={cx(ui.card, p.dayCard)}>{past.slice(0, 60).map(e => <EventLine key={e.id} ev={e} showDay onPress={() => setForm(e)} />)}</div>}
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

// Home screen: small cards for anything in the next 5 days, plus what's waiting for review.
export function ComingUp() {
  const { push } = useNav()
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const items = useLiveQuery(() => db.list_items.toArray(), [], [])
  const today = localDay()
  const days = Array.from({ length: 5 }, (_, i) => addDays(today, i))
  const toReview = events.filter(e => e.status === 'review').length
  const cards = days.map(d => {
    const list = events.filter(e => e.status !== 'review' && e.day === d)
    const todo = items.filter(i => i.day === d && !i.done_at).length
    return { d, list, todo }
  }).filter(c => c.list.length || c.todo)
  if (!cards.length && !toReview) return null
  return (
    <div className={p.strip}>
      {toReview > 0 && (
        <button className={cx(p.stripCard, p.stripReview)} onClick={() => push('planner')}>
          <span className={p.stripDay}>To review</span>
          <span className={p.stripMain}>{toReview} from WhatsApp</span>
        </button>
      )}
      {cards.map(({ d, list, todo }) => {
        const weddings = list.filter(e => e.kind === 'wedding').length
        const others = list.length - weddings
        const morning = list.filter(e => e.part === 'morning').length
        const night = list.filter(e => e.part === 'night').length
        const aft = list.length - morning - night  // events only; to-dos have no time
        return (
          <button key={d} className={cx(p.stripCard, d === today && p.stripToday)} onClick={() => push('planner')}>
            <span className={p.stripDay}>{dayLabel(d)}</span>
            <span className={p.stripMain}>
              {[weddings && `${weddings} wedding${weddings > 1 ? 's' : ''}`, others && `${others} event${others > 1 ? 's' : ''}`, todo && `${todo} to do`].filter(Boolean).join(' · ')}
            </span>
            <span className={p.stripSub}>{[morning && `${morning} morning`, aft && `${aft} afternoon`, night && `${night} night`].filter(Boolean).join(' · ')}</span>
          </button>
        )
      })}
    </div>
  )
}
