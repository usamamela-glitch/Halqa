// Catches a crash anywhere in the app. Instead of a white "client-side
// exception" page, Halqa quietly reloads itself once. The usual causes are
// harmless and fixed by a reload: iOS dropping the phone's database connection
// after the app has sat in the background, or a new version arriving while
// the old one was open. Nothing is lost: unsent changes wait in the outbox.
// The last problem is kept on this phone and shown at the bottom of Settings.
import { Component } from 'react'
import s from '../styles/boot.module.css'

const KEY = 'halqa:lastError'
const RELOADED = 'halqa:recoveredAt'

export function lastProblem() {
  try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
}

export default class Recover extends Component {
  state = { error: null, reloading: false }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error) {
    const message = String(error?.message || error).slice(0, 300)
    try { localStorage.setItem(KEY, JSON.stringify({ message, at: new Date().toISOString() })) } catch {}
    // Reload once by itself; if it fails again straight away, show a button.
    let last = 0
    try { last = Number(sessionStorage.getItem(RELOADED)) || 0 } catch {}
    if (Date.now() - last > 30000) {
      try { sessionStorage.setItem(RELOADED, String(Date.now())) } catch {}
      this.setState({ reloading: true })
      setTimeout(() => window.location.reload(), 300)
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className={s.boot}>
        <div className={s.mark}>H</div>
        <div className={s.name}>Halqa</div>
        {this.state.reloading ? (
          <p className={s.text}>Reopening…</p>
        ) : (
          <>
            <p className={s.text}>Halqa hit a problem. Your data is safe on this phone.</p>
            <button className={s.retry} onClick={() => window.location.reload()}>Reopen Halqa</button>
            <p className={s.text} style={{ fontSize: 12, opacity: 0.6 }}>{String(this.state.error?.message || this.state.error).slice(0, 200)}</p>
          </>
        )}
      </div>
    )
  }
}
