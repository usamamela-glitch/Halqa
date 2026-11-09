import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { insertRow, updateRow } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { localDay } from '../../lib/touch'
import { KINDS, WEDDING_FUNCTIONS, PARTS, tagFor, partLabel, sortEvents, dayLabel, addDays, confirmEvent, removeEvent } from '../../lib/events'
import { Screen, BarButton, Card, Sheet, ActionSheet, Empty, Field, cx, ui, useToast } from '../ui'
import { IconPlus, IconCalendar, IconChevron, IconNote, IconCheck } from '../Icons'
import { useNav } from '../../lib/nav'
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

export function EventLine({ ev, onPress, showDay }) {
  const where = [...new Set([ev.village, ev.venue].filter(Boolean))].join(' · ')
  return (
    <button className={cx(p.line, ev.unsure && ev.status === 'review' && p.lineUnsure)} onClick={onPress}>
      <span className={p.lineTop}>
        <span className={cx(p.tag, ev.kind !== 'wedding' && p.tagOther)}>{tagFor(ev)}</span>
        {showDay && <span className={p.lineDay}>{dayLabel(ev.day)}</span>}
        <span className={cx(p.part, p[`part_${ev.part}`])}>{partLabel(ev.part) || '—'}</span>
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
  const img = useCardImage(events.find(e => e.image_path)?.image_path)
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
    <Card className={p.batch}>
      <div className={p.batchTop}>
        {img ? <img src={img} alt="Card" className={p.thumb} onClick={() => setBig(true)} /> : <span className={p.thumbEmpty}><IconCalendar size={22} /></span>}
        <span className={p.batchText}>
          <strong>From WhatsApp</strong>
          <span>{events.length} function{events.length !== 1 ? 's' : ''} read · tap one to fix it</span>
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
    </Card>
  )
}

const EMPTY = { kind: 'wedding', function: 'Baraat', title: '', village: '', venue: '', day: '', part: 'afternoon', notes: '' }

function EventForm({ initial, onDone }) {
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
      day: f.day || null, part: f.part, notes: (f.notes || '').trim() || null,
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
      <div className={ui.field}>
        <span className={ui.label}>Time</span>
        <div className={p.seg}>
          {PARTS.map(pt => (
            <button type="button" key={pt.id} className={cx(p.segBtn, f.part === pt.id && p.segOn)} onClick={() => set('part', pt.id)}>{pt.label}</button>
          ))}
        </div>
      </div>
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
  return url ? <img src={url} alt="Card" className={p.preview} /> : null
}

export default function PlannerScreen() {
  const { push } = useNav()
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const dayNote = useLiveQuery(() => db.day_note.get(1), [])
  const [form, setForm] = useState(null)        // {} new, or an event
  const [showPast, setShowPast] = useState(false)
  const today = localDay()

  const review = useMemo(() => {
    const byBatch = {}
    events.filter(e => e.status === 'review').forEach(e => { (byBatch[e.batch_id || e.id] ||= []).push(e) })
    return Object.values(byBatch).sort((a, b) => (a[0].created_at < b[0].created_at ? 1 : -1))
  }, [events])

  const confirmed = events.filter(e => e.status !== 'review')
  const upcoming = sortEvents(confirmed.filter(e => !e.day || e.day >= today))
  const past = sortEvents(confirmed.filter(e => e.day && e.day < today)).reverse()

  // Group by day: Today, Tomorrow, Sat 14 Nov…
  const groups = []
  upcoming.forEach(e => {
    const key = e.day || 'none'
    const g = groups[groups.length - 1]
    if (g && g.key === key) g.items.push(e)
    else groups.push({ key, label: dayLabel(e.day), items: [e] })
  })
  const notePreview = (dayNote?.body || '').split('\n').find(l => l.trim())

  return (
    <Screen title="Planner" subtitle="Weddings, meetings and events"
      actions={<BarButton onClick={() => setForm({})} aria-label="Add event"><IconPlus size={22} /></BarButton>}>

      {review.length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>To review</span><span>{review.reduce((n, b) => n + b.length, 0)}</span></div>
          <div className={p.stack}>{review.map(b => <ReviewBatch key={b[0].batch_id || b[0].id} events={b} onEdit={setForm} />)}</div>
        </div>
      )}

      <div className={ui.section}>
        <div className={ui.sectionHead}><span>Upcoming</span><span>{upcoming.length}</span></div>
        {groups.length === 0 ? (
          <Empty icon={<IconCalendar size={28} />} title="Nothing planned yet"
            text="Share wedding cards from WhatsApp with “Add to Halqa”, or tap + to add an event." />
        ) : groups.map(g => (
          <div key={g.key} className={p.day}>
            <div className={cx(p.dayHead, g.key === today && p.dayToday)}>
              <span>{g.label}</span><span>{g.items.length}</span>
            </div>
            <Card className={p.dayCard}>
              {g.items.map(e => <EventLine key={e.id} ev={e} onPress={() => setForm(e)} />)}
            </Card>
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
          {showPast && <Card className={p.dayCard}>{past.slice(0, 60).map(e => <EventLine key={e.id} ev={e} showDay onPress={() => setForm(e)} />)}</Card>}
        </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? (form.status === 'review' ? 'Check event' : 'Edit event') : 'New event'}>
        {form && <EventForm key={form.id || 'new'} initial={form} onDone={() => setForm(null)} />}
      </Sheet>
    </Screen>
  )
}

// Home screen: small cards for anything in the next 5 days, plus what's waiting for review.
export function ComingUp() {
  const { push } = useNav()
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const today = localDay()
  const days = Array.from({ length: 5 }, (_, i) => addDays(today, i))
  const toReview = events.filter(e => e.status === 'review').length
  const cards = days.map(d => {
    const list = events.filter(e => e.status !== 'review' && e.day === d)
    return { d, list }
  }).filter(c => c.list.length)
  if (!cards.length && !toReview) return null
  return (
    <div className={p.strip}>
      {toReview > 0 && (
        <button className={cx(p.stripCard, p.stripReview)} onClick={() => push('planner')}>
          <span className={p.stripDay}>To review</span>
          <span className={p.stripMain}>{toReview} from WhatsApp</span>
        </button>
      )}
      {cards.map(({ d, list }) => {
        const weddings = list.filter(e => e.kind === 'wedding').length
        const others = list.length - weddings
        const morning = list.filter(e => e.part === 'morning').length
        const night = list.filter(e => e.part === 'night').length
        const aft = list.length - morning - night
        return (
          <button key={d} className={cx(p.stripCard, d === today && p.stripToday)} onClick={() => push('planner')}>
            <span className={p.stripDay}>{dayLabel(d)}</span>
            <span className={p.stripMain}>
              {[weddings && `${weddings} wedding${weddings > 1 ? 's' : ''}`, others && `${others} event${others > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
            </span>
            <span className={p.stripSub}>{[morning && `${morning} morning`, aft && `${aft} afternoon`, night && `${night} night`].filter(Boolean).join(' · ')}</span>
          </button>
        )
      })}
    </div>
  )
}
