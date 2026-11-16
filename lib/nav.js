import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

// A native-style navigation stack. Every open screen stays mounted (so
// scroll positions survive going back) and browser history mirrors the
// stack so the hardware/gesture back action works too.

const NavContext = createContext(null)
const NavStackContext = createContext(null)
const STORAGE_KEY = 'halqa.nav'
let keySeq = 0
const mk = (screen, params = {}) => ({ screen, params, key: `${screen}-${++keySeq}` })

function loadSaved() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!Array.isArray(saved) || !saved.length) return null
    return saved.map((s, i) => mk(s.screen, i === 0 && s.screen === 'home' ? { ...s.params, tab: 'Home' } : s.params))
  } catch { return null }
}

export function NavProvider({ children }) {
  const [stack, setStack] = useState(() => [mk('home')])
  const [direction, setDirection] = useState(1)
  // iPhone edge swipe back: the phone plays its own slide, so ours is skipped (15 Nov).
  const [instant, setInstant] = useState(false)
  const ownPop = useRef(false)
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
    let edgeAt = 0
    const onTouch = e => { if (e.touches[0] && e.touches[0].clientX < 35) edgeAt = Date.now() }
    window.addEventListener('touchstart', onTouch, { passive: true })
    function onPop(e) {
      lastPop.current = Date.now()
      const depth = e.state && typeof e.state.depth === 'number' ? e.state.depth : 0
      const swiped = !ownPop.current && Date.now() - edgeAt < 2500
      ownPop.current = false
      setInstant(swiped)
      if (swiped) setTimeout(() => setInstant(false), 400)
      setDirection(-1)
      setStack(s => (depth < s.length - 1 ? s.slice(0, depth + 1) : s))
    }
    window.addEventListener('popstate', onPop)
    // Back after 30+ minutes away, sitting on the home screen: show the Home tab (15 Nov).
    let hiddenAt = 0
    function onVis() {
      if (document.hidden) { hiddenAt = Date.now(); return }
      if (hiddenAt && Date.now() - hiddenAt > 30 * 60e3 && stackRef.current.length === 1)
        setStack(s => (s.length === 1 && s[0].screen === 'home' ? [{ ...s[0], params: { ...s[0].params, tab: 'Home' } }] : s))
      hiddenAt = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('touchstart', onTouch); document.removeEventListener('visibilitychange', onVis) }
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

  // One swipe must never go back twice: ignore a back that comes right after another.
  const lastPop = useRef(0)
  const pop = useCallback(() => {
    if (Date.now() - lastPop.current < 700) return
    lastPop.current = Date.now()
    if (stackRef.current.length > 1) { ownPop.current = true; history.back() }
  }, [])

  const popToRoot = useCallback(() => {
    const n = stackRef.current.length - 1
    if (n > 0) { ownPop.current = true; history.go(-n) }
  }, [])

  // Update params of the current screen (e.g. remember the active tab).
  const setParams = useCallback((key, patch) => {
    setStack(s => s.map(e => (e.key === key ? { ...e, params: { ...e.params, ...patch } } : e)))
  }, [])

  // Two contexts (15 Nov): the actions never change, so screens that only push or
  // pop don't redraw every time a page opens or closes; only the Navigator follows the stack.
  const actions = useMemo(() => ({ push, pop, popToRoot, setParams }), [push, pop, popToRoot, setParams])
  const stackValue = useMemo(() => ({ stack, direction, instant }), [stack, direction, instant])
  return (
    <NavContext.Provider value={actions}>
      <NavStackContext.Provider value={stackValue}>
        {children}
      </NavStackContext.Provider>
    </NavContext.Provider>
  )
}

export function useNav() {
  return useContext(NavContext)
}
export function useNavStack() {
  return useContext(NavStackContext)
}

// Per-screen context so a screen knows its own key and params.
export const ScreenContext = createContext({ key: null, params: {}, isTop: true })
export function useScreen() {
  return useContext(ScreenContext)
}
