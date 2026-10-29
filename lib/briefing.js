// Monthly AI briefing: written automatically the first time Halqa is opened in
// a new month (covering the month just ended), or on demand (the last 30 days).
// Saved in analysis_reports with scope 'briefing', so it syncs and can be continued.
import { db, getMeta, setMeta } from './db'
import { insertRow, newId } from './store'
import { runAnalysis, getApiKey } from './analysis'
import { getSyncState } from './sync'
import { localDay } from './touch'

export function lastMonthTarget(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `month:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

let running = null

// Writes and saves a briefing. Returns the saved report.
export function writeBriefing(target, { onText = () => {}, signal } = {}) {
  if (running) return running
  running = (async () => {
    await setMeta('briefingRunning', { target, at: Date.now() })
    try {
      const res = await runAnalysis({ scope: 'briefing', id: target, onText, signal })
      return await insertRow('analysis_reports', {
        id: newId(),
        title: res.title,
        scope: 'briefing',
        target,
        turns: [{ q: null, a: res.text }],
        meta: { stats: res.stats },
      })
    } finally {
      await setMeta('briefingRunning', null)
      running = null
    }
  })()
  return running
}

export const onDemandTarget = () => `last30:${localDay()}`

// "In touch" tracking began in October 2026, so the first automatic briefing is October's.
const FIRST_MONTH = 'month:2026-10'

// Called when the home screen opens. Quietly writes last month's briefing if
// it doesn't exist yet. It waits for a fresh sync so two phones don't both write it.
export async function maybeAutoBriefing() {
  const target = lastMonthTarget()
  if (target < FIRST_MONTH || !getApiKey() || running) return
  const st = getSyncState()
  if (!st.online || !st.lastSync || Date.now() - Date.parse(st.lastSync) > 5 * 60 * 1000) return
  const existing = (await db.analysis_reports.toArray()).some(r => r.scope === 'briefing' && r.target === target)
  if (existing) return
  const busy = await getMeta('briefingRunning', null)
  if (busy && Date.now() - busy.at < 15 * 60 * 1000) return
  try { await writeBriefing(target) } catch { /* tried again next time Halqa opens */ }
}
