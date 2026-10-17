import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav } from '../../lib/nav'
import { runAnalysis, askFollowUp, describeError, getApiKey } from '../../lib/analysis'
import { byName, shortDate } from '../../lib/domain'
import { insertRow, updateRow, deleteRow, restoreRow, newId } from '../../lib/store'
import { Screen, Tabs, Field, Empty, cx, ui, useSyncState, useToast } from '../ui'
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
  // report: { id, title, scope, target, created_at, turns: [{ q, a }] } — q is null for a standard report.
  // Saved in the analysis_reports table, so every report is kept and appears on every device.
  const [report, setReport] = useState(null)
  const historyRef = useRef(null)   // live API conversation for the report on screen
  const saved = useLiveQuery(() => db.analysis_reports.orderBy('created_at').reverse().toArray(), [], [])
  const toast = useToast()
  const [hasKey, setHasKey] = useState(true)
  const abortRef = useRef(null)

  useEffect(() => { setHasKey(!!getApiKey()) }, [])
  useEffect(() => { importOldReports() }, [])
  useEffect(() => () => abortRef.current?.abort(), [])

  const sortedQ = useMemo(() => [...qanungos].sort(byName), [qanungos])
  const scope = mode === 'Village' ? 'village' : mode === 'Qanungo' ? 'qanungo' : 'all'
  const target = scope === 'village' ? villageId : scope === 'qanungo' ? qanungoId : 'all'
  const ready = hasKey && online && !!target && !running

  async function save(entry) {
    const data = { title: entry.title, turns: entry.turns }
    if (await db.analysis_reports.get(entry.id)) await updateRow('analysis_reports', entry.id, data)
    else await insertRow('analysis_reports', { id: entry.id, scope: entry.scope, target: entry.target, created_at: entry.created_at, ...data })
  }

  function remove() {
    const row = saved.find(r => r.id === report.id)
    historyRef.current = null
    setReport(null)
    if (!row) return
    deleteRow('analysis_reports', row.id)
    toast('Report deleted', { label: 'Undo', onClick: () => restoreRow('analysis_reports', row) })
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
    const entry = { id: newId(), title: '', scope, target, created_at: new Date().toISOString(), turns: [{ q, a: '' }] }
    stream(entry, (signal, onText) => runAnalysis({ scope, id: target, question: q, signal, onText }))
      .then(ok => { if (ok) setQuestion('') })
  }

  function ask() {
    const q = followUp.trim()
    if (!q || !report) return
    const prior = report.turns
    const history = historyRef.current
    const entry = { ...report, turns: [...prior, { q, a: '' }] }
    setFollowUp('')
    stream(entry, (signal, onText) => askFollowUp({ scope: report.scope, id: report.target, turns: prior, history, question: q, signal, onText }))
      .then(ok => { if (!ok) setFollowUp(q) })
  }

  function openSaved(r) {
    historyRef.current = null
    setError(null)
    setReport(r)
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

          {!running && saved.some(r => r.id === report.id) && (
            <button className={a.delete} onClick={remove}>Delete this report</button>
          )}

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

      {!running && saved.length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Saved reports</span><span>{saved.length}</span></div>
          <ul className={a.saved}>
            {saved.map(r => (
              <li key={r.id}>
                <button className={a.savedItem} onClick={() => openSaved(r)}>
                  <span className={a.savedMain}>
                    <span className={a.savedTitle}>{r.title || 'Report'}{r.turns.length > 1 ? ` · ${r.turns.length} answers` : ''}</span>
                    {r.turns[0]?.q && <span className={a.savedQ}>{r.turns[0].q}</span>}
                  </span>
                  <span className={a.savedDate}>{shortDate(r.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!report && !saved.length && hasKey && (
        <Empty icon={<IconSparkles size={28} />} title="No reports yet" text="Pick a village, a Qanungo or the whole constituency and tap Write report." />
      )}
    </Screen>
  )
}

// Reports used to be kept only on the phone (last 12). Move them into the database once.
async function importOldReports() {
  let old
  try { old = JSON.parse(localStorage.getItem('halqa.reports') || '[]') } catch { return }
  if (!Array.isArray(old) || !old.length) return
  try { localStorage.removeItem('halqa.reports') } catch { return }   // first, so it can only run once
  for (const r of old) {
    await insertRow('analysis_reports', {
      id: newId(),
      title: r.title || 'Report',
      scope: r.scope || null,
      target: r.target || null,
      turns: r.turns || [{ q: null, a: r.text || '' }],
      created_at: r.at || new Date().toISOString(),
    })
  }
}
