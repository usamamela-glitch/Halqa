import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// A native-style navigation stack. Every open screen stays mounted (so
// scroll positions survive going back) and browser history mirrors the
// stack so the hardware/gesture back action works too.

const NavContext = createContext(null)
const STORAGE_KEY = 'halqa.nav'
let keySeq = 0
const mk = (screen, params = {}) => ({ screen, params, key: `${screen}-${++keySeq}` })

function loadSaved() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!Array.isArray(saved) || !saved.length) return null
    return saved.map(s => mk(s.screen, s.params))
  } catch { return null }
}

export function NavProvider({ children }) {
  const [stack, setStack] = useState(() => [mk('home')])
  const [direction, setDirection] = useState(1)
  const stackRef = useRef(stack)
  stackRef.current = stack

  useEffect(() => {
    const saved = loadSaved()
    if (saved && saved.length > 1) {
      setStack(saved)
      history.replaceState({ depth: 0 }, '')
      for (let i = 1; i < saved.length; i++) history.pushState({ depth: i }, '')
    } else {
      history.replaceState({ depth: 0 }, '')
    }
    function onPop(e) {
      const depth = e.state && typeof e.state.depth === 'number' ? e.state.depth : 0
      setDirection(-1)
      setStack(s => (depth < s.length - 1 ? s.slice(0, depth + 1) : s))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.map(({ screen, params }) => ({ screen, params })))) } catch {}
  }, [stack])

  const push = useCallback((screen, params) => {
    setDirection(1)
    const entry = mk(screen, params)
    history.pushState({ depth: stackRef.current.length }, '')
    stackRef.current = [...stackRef.current, entry]
    setStack(s => [...s, entry])
  }, [])

  const pop = useCallback(() => {
    if (stackRef.current.length > 1) history.back()
  }, [])

  const popToRoot = useCallback(() => {
    const n = stackRef.current.length - 1
    if (n > 0) history.go(-n)
  }, [])

  // Update params of the current screen (e.g. remember the active tab).
  const setParams = useCallback((key, patch) => {
    setStack(s => s.map(e => (e.key === key ? { ...e, params: { ...e.params, ...patch } } : e)))
  }, [])

  return (
    <NavContext.Provider value={{ stack, direction, push, pop, popToRoot, setParams }}>
      {children}
    </NavContext.Provider>
  )
}

export function useNav() {
  return useContext(NavContext)
}

// Per-screen context so a screen knows its own key and params.
export const ScreenContext = createContext({ key: null, params: {}, isTop: true })
export function useScreen() {
  return useContext(ScreenContext)
}
