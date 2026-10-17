import { useCallback, useEffect, useRef, useState } from 'react'

// Debounced save with a status for the UI ('saved' | 'unsaved' | 'saving').
// Flushes immediately when the app is backgrounded or the screen closes.
export function useAutosave(saveFn, delay = 800) {
  const [status, setStatus] = useState('saved')
  const timer = useRef(null)
  const pending = useRef(undefined)
  const fnRef = useRef(saveFn)
  fnRef.current = saveFn

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (pending.current === undefined) return
    const value = pending.current
    pending.current = undefined
    setStatus('saving')
    try { await fnRef.current(value) } finally {
      if (pending.current === undefined) setStatus('saved')
    }
  }, [])

  const change = useCallback(value => {
    pending.current = value
    setStatus('unsaved')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }, [flush, delay])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return { status, change, flush }
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v !== null) setValue(JSON.parse(v)) } catch {}
  }, [key])
  const set = useCallback(v => {
    setValue(prev => {
      const next = typeof v === 'function' ? v(prev) : v
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }, [key])
  return [value, set]
}
