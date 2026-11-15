import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav } from '../../lib/nav'
import { localDay } from '../../lib/touch'
import { tagFor, whenLabel, sortEvents, sortLists } from '../../lib/events'
import { Screen, BarButton, Sheet, cx } from '../ui'
import { IconPlus } from '../Icons'
import { EventForm } from './PlannerScreen'
import c from '../../styles/calendar.module.css'

// The Planner as a month calendar (15 Nov). The same events and dated to-dos
// as the Events list, nothing stored twice. Scroll through the months; tap a
// day to see it, jump to the card in the Planner, or add an event on that day.

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const pad = n => String(n).padStart(2, '0')
const monthKey = (y, m) => `${y}-${pad(m + 1)}`
const longDay = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: day.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' }).replace(',', '')

// What a day shows: events first (in time order), then dated to-dos.
function chipOf(x) {
  if (x.item) return { cls: x.item.done_at ? c.chipDone : c.chipItem, text: x.item.title || 'To do' }
  const e = x.ev
  if (e.status === 'review') return { cls: c.chipReview, text: tagFor(e) }
  const text = e.kind === 'wedding' ? tagFor(e) : (e.title || tagFor(e))
  if (e.pinned) return { cls: c.chipPin, text: `📌 ${text}` }
  return { cls: e.kind === 'wedding' ? c.chipWedding : c.chipOther, text }
}

export default function CalendarScreen() {
  const { pop } = useNav()
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const items = useLiveQuery(() => db.list_items.toArray(), [], [])
  const lists = sortLists(useLiveQuery(() => db.planner_lists.toArray(), [], []))
  const listName = Object.fromEntries(lists.map(l => [l.id, l.name]))
  const today = localDay()
  const [sel, setSel] = useState(null)       // a day 'YYYY-MM-DD'
  const [form, setForm] = useState(null)     // new event { day }
  const scrollRef = useRef(null)

  const byDay = useMemo(() => {
    const m = {}
    sortEvents(events.filter(e => e.day)).forEach(e => (m[e.day] ||= []).push({ ev: e }))
    items.filter(i => i.day).forEach(i => (m[i.day] ||= []).push({ item: i }))
    return m
  }, [events, items])

  // From the earliest month with something (at most 2 years back) to a year after the last, and at least a year ahead.
  const months = useMemo(() => {
    const now = new Date()
    const days = Object.keys(byDay).sort()
    const first = days[0] ? new Date(`${days[0]}T12:00:00`) : now
    const last = days[days.length - 1] ? new Date(`${days[days.length - 1]}T12:00:00`) : now
    let y = Math.max(Math.min(first.getFullYear() * 12 + first.getMonth(), now.getFullYear() * 12 + now.getMonth()), now.getFullYear() * 12 + now.getMonth() - 24)
    const end = Math.max(last.getFullYear() * 12 + last.getMonth() + 2, now.getFullYear() * 12 + now.getMonth() + 12)
    const out = []
    for (; y <= end; y++) out.push({ y: Math.floor(y / 12), m: y % 12 })
    return out
  }, [byDay])

  const nowKey = monthKey(new Date().getFullYear(), new Date().getMonth())
  const toToday = smooth => document.getElementById(`cal-${nowKey}`)?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  const jumped = useRef(false)
  useEffect(() => { if (!jumped.current && months.length) { jumped.current = true; requestAnimationFrame(() => toToday(false)) } })

  const showInPlanner = x => {
    const detail = x.ev ? { id: x.ev.id, day: x.ev.day } : { id: x.item.id, day: x.item.day, listId: x.item.list_id, isItem: true }
    setSel(null)
    pop()
    setTimeout(() => window.dispatchEvent(new CustomEvent('halqa:planner-show', { detail })), 340)
  }
  const selItems = sel ? byDay[sel] || [] : []

  return (
    <Screen barTitle="Calendar" scrollRef={scrollRef} bodyClassName={c.body}
      actions={<BarButton onClick={() => setForm({ day: sel || today })} aria-label="New event"><IconPlus size={22} /></BarButton>}>
      {months.map(({ y, m }) => {
        const first = new Date(y, m, 1).getDay()
        const n = new Date(y, m + 1, 0).getDate()
        const cells = []
        for (let i = 0; i < first; i++) cells.push(<div key={`b${i}`} className={c.blank} />)
        for (let d = 1; d <= n; d++) {
          const day = `${y}-${pad(m + 1)}-${pad(d)}`
          const list = byDay[day] || []
          const chips = list.map(chipOf)
          cells.push(
            <button key={day} className={cx(c.day, day < today && c.past)} onClick={() => setSel(day)}>
              <span className={cx(c.num, day === today && c.today, day === sel && c.sel)}>{d}</span>
              {chips.slice(0, 3).map((ch, i) => <span key={i} className={cx(c.chip, ch.cls)}>{ch.text}</span>)}
              {chips.length > 3 && <span className={c.more}>+{chips.length - 3}</span>}
            </button>
          )
        }
        const label = new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
        return (
          <section key={monthKey(y, m)} id={`cal-${monthKey(y, m)}`} className={c.month}>
            <h2 className={c.monthName}>{label}</h2>
            <div className={c.week}>{WEEK.map((w, i) => <span key={i}>{w}</span>)}</div>
            <div className={c.grid}>{cells}</div>
          </section>
        )
      })}

      <button className={c.todayBtn} onClick={() => toToday(true)}>Today</button>

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? longDay(sel) : ''}>
        {sel && (
          <div className={c.sheet}>
            {selItems.length === 0 && <p className={c.none}>Nothing on this day.</p>}
            {selItems.map(x => {
              const ch = chipOf(x)
              return (
                <button key={x.ev?.id || x.item.id} className={c.row} onClick={() => showInPlanner(x)}>
                  <span className={c.rowTop}>
                    <span className={cx(c.rowTag, ch.cls)}>{x.ev ? (x.ev.status === 'review' ? 'To review' : tagFor(x.ev)) : listName[x.item.list_id] || 'To do'}</span>
                    {x.ev?.pinned && <span>📌</span>}
                    {x.ev && <span className={c.rowWhen}>{whenLabel(x.ev)}</span>}
                    {x.item?.done_at && <span className={c.rowWhen}>Done</span>}
                  </span>
                  <span className={c.rowTitle}>{x.ev ? x.ev.title || 'Untitled' : x.item.title}</span>
                  {x.ev && (x.ev.venue || x.ev.village) && <span className={c.rowSub}>{[x.ev.village, x.ev.venue].filter(Boolean).join(' · ')}</span>}
                  <span className={c.rowGo}>Show in Planner ›</span>
                </button>
              )
            })}
            <button className={c.add} onClick={() => { setForm({ day: sel }); setSel(null) }}>
              <IconPlus size={18} />Add an event on {longDay(sel)}
            </button>
          </div>
        )}
      </Sheet>
      <Sheet open={!!form} onClose={() => setForm(null)} title="New event">
        {form && <EventForm key={form.day} initial={form} onDone={() => setForm(null)} />}
      </Sheet>
    </Screen>
  )
}
