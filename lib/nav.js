import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

// A native-style navigation stack. Every open screen stays mounted (so scroll
// positions survive going back).
//
// 16 Nov: page changes no longer go into the browser's history. With history,
// the iPhone played its own back swipe (a photo of the page underneath) and
// then Halqa caught up a moment later, which showed as a blink. Now Halqa does
// the swipe itself: the page follows the finger and the page underneath slides
// in with it, in one movement.
//
// Each open page has its own position (a motion value, in pixels): 0 when it
// is showing, the screen's width when it is off to the right. The page
// underneath follows the top page's position (see components/Navigator.js).
import { animate, motionValue } from 'framer-motion'

const NavContext = createContext(null)
const NavStackContext = createContext(null)
const STORAGE_KEY = 'halqa.nav'
let keySeq = 0
const mk = (screen, params = {}) => ({ screen, params, key: `${screen}-${++keySeq}` })
export const EASE = [0.32, 0.72, 0, 1]
export const SLIDE = { duration: 0.32, ease: EASE }
const width = () => (typeof window !== 'undefined' ? window.innerWidth : 400)

// The pages' elements, so slides can run on the phone's graphics chip (Web
// Animations): they stay smooth even while Halqa is busy drawing the new page.
// Finger drags move the motion values directly (smooth already).
const els = new Map()   // key → { layer, dim }
export const registerLayer = (key, refs) => (refs ? els.set(key, refs) : els.delete(key))
const CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'
function run(el, prop, from, to, ms) {
  if (!el) return null
  return el.animate([{ [prop]: from }, { [prop]: to }], { duration: ms, easing: CURVE, fill: 'forwards' })
}
// After a slide: set the final positions, then drop the animation once they are on screen.
const release = anims => requestAnimationFrame(() => requestAnimationFrame(() => anims.forEach(a => a && a.cancel())))

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
  const stackRef = useRef(stack)
  stackRef.current = stack
  const xs = useRef(new Map())          // key → position of that page
  const getX = useCallback(key => {
    let v = xs.current.get(key)
    if (!v) { v = motionValue(0); xs.current.set(key, v) }
    return v
  }, [])
  const busy = useRef(false)            // a back is already sliding out

  useEffect(() => {
    const saved = loadSaved()
    if (saved && saved.length > 1) setStack(saved)
    // Back after 30+ minutes away, sitting on the home screen: show the Home tab (15 Nov).
    let hiddenAt = 0
    function onVis() {
      if (document.hidden) { hiddenAt = Date.now(); return }
      if (hiddenAt && Date.now() - hiddenAt > 30 * 60e3 && stackRef.current.length === 1)
        setStack(s => (s.length === 1 && s[0].screen === 'home' ? [{ ...s[0], params: { ...s[0].params, tab: 'Home' } }] : s))
      hiddenAt = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.map(({ screen, params }) => ({ screen, params })))) } catch {}
  }, [stack])

  const push = useCallback((screen, params) => {
    if (busy.current) return
    const entry = { ...mk(screen, params), fresh: true }
    const x = motionValue(width())
    xs.current.set(entry.key, x)
    stackRef.current = [...stackRef.current, entry]
    setStack(s => [...s, entry])
    busy.current = true
    setTimeout(() => { busy.current = false }, 900)   // never stay stuck if a slide doesn't report back
  }, [])

  // Like push, but the page it slides over is removed once it's in, so Back
  // skips it (e.g. Calendar opened from Home → "Show in Planner").
  const replace = useCallback((screen, params) => {
    if (busy.current) return
    const s = stackRef.current
    const entry = { ...mk(screen, params), fresh: true, replaces: s[s.length - 1]?.key }
    xs.current.set(entry.key, motionValue(width()))
    stackRef.current = [...s, entry]
    setStack(cur => [...cur, entry])
    busy.current = true
    setTimeout(() => { busy.current = false }, 900)
  }, [])

  // Called by the new page once it is on screen: slide it in, and the page under it a little left.
  const enter = useCallback(key => {
    const s = stackRef.current
    const i = s.findIndex(e => e.key === key)
    const under = i > 0 ? els.get(s[i - 1].key) : null
    const me = els.get(key)
    const W = width(), ms = SLIDE.duration * 1000
    const anims = [
      run(me?.layer, 'transform', `translateX(${W}px)`, 'translateX(0px)', ms),
      run(under?.layer, 'transform', 'translateX(0px)', `translateX(${-0.28 * W}px)`, ms),
      run(under?.dim, 'opacity', 0, 1, ms),
    ]
    const gone = s[i]?.replaces
    const done = () => {
      getX(key).set(0); release(anims); busy.current = false
      if (gone) {   // replace(): drop the page it slid over
        stackRef.current = stackRef.current.filter(e => e.key !== gone).map(e => (e.key === key ? { ...e, replaces: null } : e))
        setStack(cur => cur.filter(e => e.key !== gone).map(e => (e.key === key ? { ...e, replaces: null } : e)))
        xs.current.delete(gone)
      }
    }
    if (anims[0]) anims[0].onfinish = done
    else done()
  }, [getX])

  // Slide the top page out to the right, then remove it (and any others down to `keep`).
  const slideOut = useCallback(keep => {
    const s = stackRef.current
    if (busy.current || s.length <= keep) return
    busy.current = true
    const top = s[s.length - 1]
    const x = getX(top.key)
    const W = width(), from = x.get()
    const ms = SLIDE.duration * 1000 * Math.max(0.35, 1 - from / W)
    const me = els.get(top.key), under = els.get(s[keep - 1].key)
    const anims = [
      run(me?.layer, 'transform', `translateX(${from}px)`, `translateX(${W}px)`, ms),
      run(under?.layer, 'transform', `translateX(${-0.28 * (W - from)}px)`, 'translateX(0px)', ms),
      run(under?.dim, 'opacity', Math.max(0, 1 - from / W), 0, ms),
    ]
    const failsafe = setTimeout(() => finish(), ms + 400)
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(failsafe)
      x.set(W)
      const gone = stackRef.current.slice(keep)
      stackRef.current = stackRef.current.slice(0, keep)
      setStack(cur => cur.slice(0, keep))
      gone.forEach(e => xs.current.delete(e.key))
      release(anims)
      busy.current = false
    }
    if (anims[0]) anims[0].onfinish = finish
    else finish()
  }, [getX])
  const pop = useCallback(() => slideOut(stackRef.current.length - 1), [slideOut])
  const popToRoot = useCallback(() => slideOut(1), [slideOut])
  // A swipe that wasn't far enough: slide the page back.
  const settle = useCallback(key => animate(getX(key), 0, { duration: 0.25, ease: EASE }), [getX])

  // Update params of the current screen (e.g. remember the active tab).
  const setParams = useCallback((key, patch) => {
    setStack(s => s.map(e => (e.key === key ? { ...e, params: { ...e.params, ...patch } } : e)))
  }, [])

  // Two contexts (15 Nov): the actions never change, so screens that only push or
  // pop don't redraw every time a page opens or closes; only the Navigator follows the stack.
  const actions = useMemo(() => ({ push, replace, pop, popToRoot, setParams, settle, getX, enter }), [push, replace, pop, popToRoot, setParams, settle, getX, enter])
  const stackValue = useMemo(() => ({ stack }), [stack])
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
