import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { ensureToday, showMore, setAside, SPLIT } from '../../lib/daily'
import { inTouchToday } from '../../lib/touch'
import { daysSince, contactedLabel } from '../../lib/domain'
import { Screen, Avatar, Empty, cx, ui, useToast } from '../ui'
import { CallButtons, useContactSheets } from '../contacts'
import { IconPin, IconCheck, IconBolt, IconSparkles, IconChevron } from '../Icons'
import { useNav } from '../../lib/nav'
import t from '../../styles/today.module.css'

// The daily list: today's 35 people (15 pinned + 20 unpinned). Opened from the
// teal card at the top of the home page.
export default function TodayScreen() {
  const toast = useToast()
  const sheets = useContactSheets()
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const daily = useLiveQuery(async () => (await db.meta.get('daily'))?.value || null, [], null)
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const [busy, setBusy] = useState(false)
  const { push } = useNav()
  // Newest briefing, shown as a card until it has been opened.
  const briefing = useLiveQuery(async () => {
    const all = (await db.analysis_reports.toArray()).filter(r => r.scope === 'briefing' && r.target?.startsWith('month:'))
    const latest = all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
    const seen = (await db.meta.get('briefingSeen'))?.value
    const writing = (await db.meta.get('briefingRunning'))?.value
    return { latest: latest && latest.id !== seen ? latest : null, writing }
  }, [], {})

  // Build today's list on open, and again if the app is left open past midnight.
  useEffect(() => {
    ensureToday()
    const onShow = () => { if (document.visibilityState === 'visible') ensureToday() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  const byId = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts])
  const vById = useMemo(() => Object.fromEntries(villages.map(v => [v.id, v])), [villages])
  const qName = useMemo(() => Object.fromEntries(qanungos.map(q => [q.id, q.name])), [qanungos])

  const rows = (daily?.items || []).filter(it => it.state === 'open' && byId.get(it.id))
  const done = rows.filter(it => inTouchToday(byId.get(it.id)))
  const todo = rows.filter(it => !inTouchToday(byId.get(it.id)))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'pinned' ? -1 : 1))

  async function aside(c, how) {
    const undo = await setAside(c.id, how)
    toast(how === 'later' ? `${c.name} — back in about a week` : `${c.name} won't appear in the list again`, { label: 'Undo', onClick: undo })
  }

  async function more() {
    setBusy(true)
    const n = await showMore()
    setBusy(false)
    toast(n ? `${n} more people added` : 'Everyone available is already in today’s list')
  }

  const total = rows.length

  return (
    <Screen title="Today" subtitle={`${SPLIT.pinned + SPLIT.unpinned} people to be in touch with`}>
    {daily && <div className={t.wrap}>
      {briefing.writing && !briefing.latest && (
        <div className={t.briefing}><IconSparkles size={20} /><span>Writing your monthly briefing…</span></div>
      )}
      {briefing.latest && (
        <button className={cx(t.briefing, t.briefingReady)} onClick={() => push('analysis', { open: briefing.latest.id })}>
          <IconSparkles size={20} />
          <span className={t.briefingText}><strong>{briefing.latest.title.replace('Monthly briefing · ', '')} briefing is ready</strong><span>Tap to read</span></span>
          <IconChevron size={18} />
        </button>
      )}
      <div className={t.progress}>
        <div className={t.progressText}>
          <strong>{done.length}</strong> of {total} in touch today
        </div>
        <div className={t.bar}><div className={t.barFill} style={{ width: `${total ? (done.length / total) * 100 : 0}%` }} /></div>
      </div>

      {todo.length === 0 ? (
        <Empty icon={<IconCheck size={28} />} title={total ? 'All done for today' : 'Nobody to show'}
          text={total ? `You were in touch with ${done.length} people from today's list.` : 'Everyone is either in touch today, set aside for later, or hidden.'} />
      ) : (
        <ul className={t.list}>
          {todo.map(it => {
            const c = byId.get(it.id)
            const v = vById[c.village_id]
            const d = daysSince(c.last_contacted)
            return (
              <li key={it.id} className={t.card}>
                <button className={t.main} onClick={() => sheets.open(c.id)}>
                  <Avatar name={c.name} photo={c.photo_path} size={46} />
                  <span className={t.text}>
                    <span className={t.name}>
                      {c.name}
                      {c.pinned && <span className={t.pin}><IconPin size={13} filled /></span>}
                    </span>
                    <span className={t.place}>{v ? v.name : 'No village'}{v && qName[v.qanungo_id] ? ` · ${qName[v.qanungo_id]}` : ''}</span>
                    {c.description && <span className={t.desc}>{c.description}</span>}
                    <span className={t.meta}>
                      <span className={cx(t.touch, d === null && t.touchNone)}>In touch: {contactedLabel(d).toLowerCase()}</span>
                      {(c.tags || []).map(tag => <span key={tag} className={ui.chip}>{tag}</span>)}
                    </span>
                  </span>
                </button>
                <div className={t.actions}>
                  <CallButtons contact={c} />
                  <button className={t.later} onClick={() => aside(c, 'later')}>Later</button>
                  <button className={t.hide} onClick={() => aside(c, 'hidden')}>Don't show</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <button className={cx(ui.btn, ui.btnSecondary, ui.btnBlock)} style={{ marginTop: 16 }} onClick={more} disabled={busy}>
        Show me {SPLIT.pinned + SPLIT.unpinned} more
      </button>

      <button className={ui.fab} onClick={() => sheets.quickAdd()} aria-label="Quick add contact"><IconBolt size={28} className={ui.fabBolt} /></button>
    </div>}
    {sheets.element}
    </Screen>
  )
}

// Teal card at the top of the home page: today's progress, and a note when a
// new monthly briefing is ready. Tapping it opens the daily list.
export function TodayCard({ contacts }) {
  const { push } = useNav()
  const daily = useLiveQuery(async () => (await db.meta.get('daily'))?.value || null, [], null)
  const briefingReady = useLiveQuery(async () => {
    const latest = (await db.analysis_reports.toArray())
      .filter(r => r.scope === 'briefing' && r.target?.startsWith('month:'))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
    const seen = (await db.meta.get('briefingSeen'))?.value
    return latest && latest.id !== seen ? latest.title.replace('Monthly briefing · ', '') : null
  }, [], null)
  useEffect(() => { ensureToday() }, [])

  const byId = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts])
  const rows = (daily?.items || []).filter(it => it.state === 'open' && byId.get(it.id))
  const done = rows.filter(it => inTouchToday(byId.get(it.id))).length
  const total = rows.length

  return (
    <button className={t.homeCard} onClick={() => push('today')}>
      <span className={t.homeTop}>
        <span className={t.homeTitle}>Today</span>
        <span className={t.homeCount}><strong>{done}</strong> of {total || SPLIT.pinned + SPLIT.unpinned} in touch</span>
        <IconChevron size={20} />
      </span>
      <span className={t.homeBar}><span className={t.homeBarFill} style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
      {briefingReady && <span className={t.homeBrief}><IconSparkles size={15} />{briefingReady} briefing is ready</span>}
    </button>
  )
}
