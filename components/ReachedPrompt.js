// "Reached Rana Asif?  ✓ Yes  ✗ No" — shown when Usama comes back to Halqa
// after a WhatsApp or call from anywhere except the Today list. Yes records
// "in touch today"; No, or no answer within 5 seconds, records nothing.
import { useEffect, useRef, useState } from 'react'
import { takeReachedQuestion, markInTouch } from '../lib/touch'
import { useToast } from './ui'
import s from '../styles/reached.module.css'

const SHOW_MS = 5000

export default function ReachedPrompt() {
  const [q, setQ] = useState(null)
  const timer = useRef(null)
  const toast = useToast()

  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const next = takeReachedQuestion()
      if (!next) return
      clearTimeout(timer.current)
      setQ(next)
      timer.current = setTimeout(() => setQ(null), SHOW_MS)
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => { document.removeEventListener('visibilitychange', check); clearTimeout(timer.current) }
  }, [])

  if (!q) return null
  const close = () => { clearTimeout(timer.current); setQ(null) }
  return (
    <div className={s.bar} role="dialog" aria-label={`Reached ${q.name}?`}>
      <span className={s.q}>Reached <strong>{q.name}</strong>?</span>
      <button className={s.yes} onClick={async () => {
        close()
        const undo = await markInTouch(q.id)
        toast(`${q.name}: in touch today`, { label: 'Undo', onClick: undo })
      }}>✓ Yes</button>
      <button className={s.no} onClick={close}>✗ No</button>
      <span className={s.timer} style={{ animationDuration: `${SHOW_MS}ms` }} />
    </div>
  )
}
