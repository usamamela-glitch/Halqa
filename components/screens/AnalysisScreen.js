import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav } from '../../lib/nav'
import { runAnalysis, describeError, getApiKey } from '../../lib/analysis'
import { byName, shortDate } from '../../lib/domain'
import { useLocalStorage } from '../../lib/hooks'
import { Screen, Tabs, Field, Empty, cx, ui, useSyncState } from '../ui'
import { VillagePicker } from '../contacts'
import Markdown from '../Markdown'
import { IconSparkles, IconKey } from '../Icons'
import a from '../../styles/analysis.module.css'

const MODES = ['Village', 'Qanungo', 'Constituency']

export default function AnalysisScreen() {
  const { push } = useNav()
  const { online } = useSyncState()
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const [mode, setMode] = useState('Village')
  const [villageId, setVillageId] = useState(null)
  const [qanungoId, setQanungoId] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null)
  const [saved, setSaved] = useLocalStorage('halqa.reports', [])
  const [hasKey, setHasKey] = useState(true)
  const abortRef = useRef(null)

  useEffect(() => { setHasKey(!!getApiKey()) }, [])
  useEffect(() => () => abortRef.current?.abort(), [])

  const sortedQ = useMemo(() => [...qanungos].sort(byName), [qanungos])
  const scope = mode === 'Village' ? 'village' : mode === 'Qanungo' ? 'qanungo' : 'all'
  const target = scope === 'village' ? villageId : scope === 'qanungo' ? qanungoId : 'all'
  const ready = hasKey && online && !!target && !running

  async function run() {
    setError(null)
    setRunning(true)
    setReport({ title: '', text: '', at: new Date().toISOString() })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await runAnalysis({ scope, id: target, signal: ctrl.signal, onText: text => setReport(r => ({ ...r, text })) })
      const entry = { ...res, at: new Date().toISOString(), id: Date.now() }
      setReport(entry)
      setSaved([entry, ...(saved || [])].slice(0, 12))
    } catch (e) {
      if (e?.name !== 'AbortError' && !ctrl.signal.aborted) setError(describeError(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Screen title="Analysis" subtitle="Strategic reports written by Claude from your data">
      {!hasKey && (
        <div className={a.notice}>
          <IconKey size={20} />
          <div>
            <strong>Add your Claude API key</strong>
            <p>Reports are written by Claude using your own API key.</p>
            <button className={cx(ui.btn, ui.btnPrimary)} style={{ height: 42, marginTop: 10 }} onClick={() => push('settings')}>Open Settings</button>
          </div>
        </div>
      )}

      <Tabs id="analysis" tabs={MODES} value={mode} onChange={m => { setMode(m); setError(null) }} />

      <div className={a.panel}>
        {mode === 'Village' && <Field label="Village"><VillagePicker value={villageId} onChange={setVillageId} /></Field>}
        {mode === 'Qanungo' && (
          <Field label="Qanungo">
            <select className={ui.select} value={qanungoId} onChange={e => setQanungoId(e.target.value)}>
              <option value="">Choose a Qanungo…</option>
              {sortedQ.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </Field>
        )}
        {mode === 'Constituency' && <p className={a.hint}>Every village, contact and note goes into one report. This takes a few minutes and uses more of your API credit.</p>}

        {!online && <p className={a.warn}>Analysis needs internet. Your data is safe on this phone — try again when you have signal.</p>}

        {running ? (
          <button className={cx(ui.btn, ui.btnSecondary, ui.btnBlock)} style={{ marginTop: 16 }} onClick={() => abortRef.current?.abort()}>Stop</button>
        ) : (
          <button className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 16 }} disabled={!ready} onClick={run}>
            <IconSparkles size={19} />Write report
          </button>
        )}
      </div>

      {error && <p className={a.error}>{error}</p>}

      {report && (report.text || running) && (
        <div className={a.report}>
          {running && !report.text && <div className={a.thinking}><span className={a.pulse} />Claude is reading your data…</div>}
          <Markdown text={report.text} className={a.md} />
          {running && report.text && <span className={a.caret} />}
        </div>
      )}

      {!running && (saved || []).length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Recent reports</span></div>
          <ul className={a.saved}>
            {saved.map(r => (
              <li key={r.id}>
                <button className={a.savedItem} onClick={() => setReport(r)}>
                  <span className={a.savedTitle}>{r.title}</span>
                  <span className={a.savedDate}>{shortDate(r.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!report && !(saved || []).length && hasKey && (
        <Empty icon={<IconSparkles size={28} />} title="No reports yet" text="Pick a village, a Qanungo or the whole constituency and tap Write report." />
      )}
    </Screen>
  )
}
