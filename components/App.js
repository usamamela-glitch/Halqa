import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { startSync, syncNow, subscribeSync, getSyncState } from '../lib/sync'
import { NavProvider } from '../lib/nav'
import Navigator from './Navigator'
import { ToastProvider } from './ui'
import s from '../styles/boot.module.css'

// New versions install in the background. Once one has taken over, Halqa
// reloads the next time it goes into the background, so coming back to it
// always shows the latest version (iPhone often keeps the old one running
// for days otherwise). It also checks for a new version each time it's reopened.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return
  const sw = navigator.serviceWorker
  const hadVersion = !!sw.controller
  sw.register('/sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
  }).catch(() => {})
  if (!hadVersion) return   // the very first install: nothing old to replace
  sw.addEventListener('controllerchange', () => {
    const reloadWhenHidden = () => { if (document.visibilityState === 'hidden') window.location.reload() }
    if (document.visibilityState === 'hidden') window.location.reload()
    else document.addEventListener('visibilitychange', reloadWhenHidden)
  })
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
