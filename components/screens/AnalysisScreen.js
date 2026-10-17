import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav } from '../../lib/nav'
import { runAnalysis, askFollowUp, describeError, getApiKey } from '../../lib/analysis'
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
  const [question, setQuestion] = useState('')
  const [followUp, setFollowUp] = useState('')
  // report: { id, title, scope, target, at, turns: [{ q, a }] } — q is null for a standard report
  const [report, setReport] = useState(null)
  const historyRef = useRef(null)   // live API conversation for the report on screen
  const [saved, setSaved] = useLocalStorage('halqa.reports', [])
  const [hasKey, setHasKey] = useState(true)
  const abortRef = useRef(null)

  useEffect(() => { setHasKey(!!getApiKey()) }, [])
  useEffect(() => () => abortRef.current?.abort(), [])

  const sortedQ = useMemo(() => [...qanungos].sort(byName), [qanungos])
  const scope = mode === 'Village' ? 'village' : mode === 'Qanungo' ? 'qanungo' : 'all'
  const target = scope === 'village' ? villageId : scope === 'qanungo' ? qanungoId : 'all'
  const ready = hasKey && online && !!target && !running

  const turnsOf = r => r.turns || [{ q: null, a: r.text || '' }]   // older saved reports had just text

  function save(entry) {
    setSaved(list => [entry, ...(list || []).filter(r => r.id !== entry.id)].slice(0, 12))
  }

  // Streams one answer into the last turn of the report on screen.
  async function stream(entry, ask) {
    setError(null)
    setRunning(true)
    setReport(entry)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const onText = text => setReport(r => ({ ...r, turns: [...r.turns.slice(0, -1), { ...r.turns[r.turns.length - 1], a: text }] }))
    try {
      const res = await ask(ctrl.signal, onText)
      historyRef.current = res.history
      const done = { ...entry, title: res.title || entry.title, turns: [...entry.turns.slice(0, -1), { ...entry.turns[entry.turns.length - 1], a: res.text }] }
      setReport(done)
      save(done)
      return true
    } catch (e) {
      if (e?.name !== 'AbortError' && !ctrl.signal.aborted) setError(describeError(e))
      setReport(r => (r && r.turns[r.turns.length - 1].a ? r : { ...r, turns: r.turns.slice(0, -1) }))
      return false
    } finally {
      setRunning(false)
    }
  }

  function run() {
    const q = question.trim() || null
    historyRef.current = null
    const entry = { id: Date.now(), title: '', scope, target, at: new Date().toISOString(), turns: [{ q, a: '' }] }
    stream(entry, (signal, onText) => runAnalysis({ scope, id: target, question: q, signal, onText }))
      .then(ok => { if (ok) setQuestion('') })
  }

  function ask() {
    const q = followUp.trim()
    if (!q || !report) return
    const prior = turnsOf(report)
    const history = historyRef.current
    const entry = { ...report, at: new Date().toISOString(), turns: [...prior, { q, a: '' }] }
    setFollowUp('')
    stream(entry, (signal, onText) => askFollowUp({ scope: report.scope, id: report.target, turns: prior, history, question: q, signal, onText }))
      .then(ok => { if (!ok) setFollowUp(q) })
  }

  function openSaved(r) {
    historyRef.current = null
    setError(null)
    setReport({ ...r, turns: turnsOf(r) })
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

        <Field label="Your question (optional)">
          <textarea className={ui.textarea} rows={2} style={{ minHeight: 64 }} value={question} onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. Who are the key people here I haven't contacted in a month?" />
        </Field>

        {!online && <p className={a.warn}>Analysis needs internet. Your data is safe on this phone — try again when you have signal.</p>}

        {running ? (
          <button className={cx(ui.btn, ui.btnSecondary, ui.btnBlock)} style={{ marginTop: 16 }} onClick={() => abortRef.current?.abort()}>Stop</button>
        ) : (
          <button className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 16 }} disabled={!ready} onClick={run}>
            <IconSparkles size={19} />{question.trim() ? 'Ask' : 'Write report'}
          </button>
        )}
      </div>

      {error && <p className={a.error}>{error}</p>}

      {report && (
        <div className={a.report}>
          {report.title && <div className={a.reportTitle}>{report.title}</div>}
          {report.turns.map((turn, i) => (
            <div key={i} className={a.turn}>
              {turn.q && <div className={a.question}>{turn.q}</div>}
              {running && i === report.turns.length - 1 && !turn.a
                ? <div className={a.thinking}><span className={a.pulse} />Claude is reading your data…</div>
                : <Markdown text={turn.a} className={a.md} />}
              {running && i === report.turns.length - 1 && turn.a && <span className={a.caret} />}
            </div>
          ))}

          {!running && report.scope && (
            <div className={a.followUp}>
              <textarea className={ui.textarea} rows={2} style={{ minHeight: 60 }} value={followUp} onChange={e => setFollowUp(e.target.value)}
                placeholder="Ask a follow-up question…" />
              <button className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 10 }} disabled={!followUp.trim() || !online || !hasKey} onClick={ask}>
                <IconSparkles size={19} />Ask
              </button>
            </div>
          )}
        </div>
      )}

      {!running && (saved || []).length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Recent reports</span></div>
          <ul className={a.saved}>
            {saved.map(r => (
              <li key={r.id}>
                <button className={a.savedItem} onClick={() => openSaved(r)}>
                  <span className={a.savedTitle}>{r.title}{r.turns && r.turns.length > 1 ? ` · ${r.turns.length} answers` : ''}</span>
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
