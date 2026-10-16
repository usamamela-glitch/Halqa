import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { syncNow } from '../../lib/sync'
import { getApiKey, setApiKey } from '../../lib/analysis'
import { shortDate } from '../../lib/domain'
import { Screen, Field, cx, ui, useSyncState, useToast } from '../ui'
import { IconRefresh } from '../Icons'
import st from '../../styles/settings.module.css'

const APP_VERSION = '2.0.0'

export default function SettingsScreen() {
  const toast = useToast()
  const sync = useSyncState()
  const failed = useLiveQuery(() => db.failed.toArray(), [], [])
  const missing = useLiveQuery(async () => (await db.meta.get('missingColumns'))?.value || {}, [], {})
  const [key, setKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [persisted, setPersisted] = useState(null)

  useEffect(() => {
    const k = getApiKey()
    setSavedKey(k)
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(setPersisted).catch(() => {})
  }, [])

  function saveKey() {
    setApiKey(key)
    setSavedKey(key.trim())
    setKey('')
    toast('API key saved on this phone')
  }

  function removeKey() {
    setApiKey('')
    setSavedKey('')
    toast('API key removed')
  }

  const missingList = Object.entries(missing).flatMap(([t, cols]) => cols.map(c => `${t}.${c}`))

  return (
    <Screen title="Settings">
      <div className={ui.section}>
        <div className={ui.sectionHead}><span>Sync</span></div>
        <div className={st.group}>
          <Row label="Connection" value={sync.online ? 'Online' : 'Offline'} tone={sync.online ? 'green' : 'amber'} />
          <Row label="Waiting to upload" value={sync.pending ? `${sync.pending} change${sync.pending !== 1 ? 's' : ''}` : 'Nothing'} tone={sync.pending ? 'amber' : 'green'} />
          <Row label="Last synced" value={sync.lastSync ? `${shortDate(sync.lastSync)}` : 'Never'} />
          <Row label="Protected storage" value={persisted === null ? '—' : persisted ? 'Yes' : 'Standard'} tone={persisted ? 'green' : undefined} />
          {sync.lastError && <Row label="Last problem" value={sync.lastError} tone="red" />}
        </div>
        <button className={cx(ui.btn, ui.btnSecondary, ui.btnBlock)} style={{ marginTop: 12 }} onClick={() => syncNow()} disabled={sync.syncing || !sync.online}>
          <IconRefresh size={18} />{sync.syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <p className={st.note}>Everything you add is saved on this phone first and uploaded automatically whenever there's signal. Changes from your team download every couple of minutes.</p>
      </div>

      {missingList.length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Database update needed</span></div>
          <div className={st.alert}>
            The online database doesn't have these new fields yet: <strong>{missingList.join(', ')}</strong>. They're kept on this phone until the update is run, then upload normally.
          </div>
        </div>
      )}

      {failed.length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Changes the database rejected</span><span>{failed.length}</span></div>
          <div className={st.group}>
            {failed.slice(-10).reverse().map(f => (
              <Row key={f.id} label={`${f.op} ${f.table}`} value={f.error} tone="red" />
            ))}
          </div>
        </div>
      )}

      <div className={ui.section}>
        <div className={ui.sectionHead}><span>Claude API key</span></div>
        <div className={st.card}>
          {savedKey ? (
            <div className={st.keyRow}>
              <span className={st.keyMask}>{savedKey.slice(0, 10)}••••{savedKey.slice(-4)}</span>
              <button className={st.link} onClick={removeKey}>Remove</button>
            </div>
          ) : (
            <p className={st.note} style={{ marginTop: 0 }}>Needed for AI analysis. Create one at console.anthropic.com → API Keys.</p>
          )}
          <form onSubmit={e => { e.preventDefault(); if (key.trim()) saveKey() }}>
            <Field label={savedKey ? 'Replace key' : 'API key'}>
              <input className={ui.input} type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            </Field>
            <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 14 }} disabled={!key.trim()}>Save key</button>
          </form>
          <p className={st.note}>Stored only on this phone, never in the shared database.</p>
        </div>
      </div>

      <p className={st.version}>Halqa {APP_VERSION}</p>
    </Screen>
  )
}

function Row({ label, value, tone }) {
  return (
    <div className={st.row}>
      <span className={st.rowLabel}>{label}</span>
      <span className={cx(st.rowVal, tone && st[`tone_${tone}`])}>{value}</span>
    </div>
  )
}
