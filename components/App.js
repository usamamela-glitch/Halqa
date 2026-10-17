import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { startSync, syncNow, subscribeSync, getSyncState } from '../lib/sync'
import { NavProvider } from '../lib/nav'
import Navigator from './Navigator'
import { ToastProvider } from './ui'
import s from '../styles/boot.module.css'

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

// First launch on a device: download everything before showing the app.
function FirstLoad() {
  const [st, setSt] = useState(getSyncState)
  useEffect(() => subscribeSync(setSt), [])
  const offline = !st.online
  return (
    <div className={s.boot}>
      <div className={s.mark}>H</div>
      <div className={s.name}>Halqa</div>
      {offline ? (
        <>
          <p className={s.text}>Connect to the internet once so Halqa can download your constituency data to this phone. After that it works offline.</p>
          <button className={s.retry} onClick={() => syncNow()}>Try again</button>
        </>
      ) : st.lastError ? (
        <>
          <p className={s.text}>Couldn't reach the database. {st.lastError}</p>
          <button className={s.retry} onClick={() => syncNow()}>Try again</button>
        </>
      ) : (
        <>
          <div className={s.bar}><div className={s.barFill} /></div>
          <p className={s.text}>Downloading your data to this phone…</p>
        </>
      )}
    </div>
  )
}

export default function App() {
  const initialized = useLiveQuery(async () => !!(await db.meta.get('initialized')), [], null)

  useEffect(() => {
    startSync()
    registerServiceWorker()
  }, [])

  if (initialized === null) return <div className={s.boot} />
  if (!initialized) return <FirstLoad />

  return (
    <ToastProvider>
      <NavProvider>
        <Navigator />
      </NavProvider>
    </ToastProvider>
  )
}
