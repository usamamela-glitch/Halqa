import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { startSync, syncNow, subscribeSync, getSyncState } from '../lib/sync'
import { NavProvider } from '../lib/nav'
import Navigator from './Navigator'
import { ToastProvider } from './ui'
import { useSignedIn, signIn } from '../lib/auth'
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

// Shown until this device has signed in once.
function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const problem = await signIn(email, password)
    setBusy(false)
    if (problem) setError(problem)
  }

  return (
    <div className={s.boot}>
      <div className={s.mark}>H</div>
      <div className={s.name}>Halqa</div>
      <form className={s.form} onSubmit={submit}>
        <input className={s.field} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="email" required />
        <input className={s.field} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete="current-password" required />
        {error && <p className={s.error}>{error}</p>}
        <button type="submit" className={s.retry} disabled={busy || !email.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className={s.text}>Sign in once on each phone or computer. Halqa then stays signed in and works offline.</p>
    </div>
  )
}

function Main() {
  const initialized = useLiveQuery(async () => !!(await db.meta.get('initialized')), [], null)

  useEffect(() => { startSync() }, [])

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

export default function App() {
  const signedIn = useSignedIn()
  useEffect(() => { registerServiceWorker() }, [])
  if (signedIn === null) return <div className={s.boot} />
  return signedIn ? <Main /> : <SignIn />
}
