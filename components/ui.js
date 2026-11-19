import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, usePresence } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { getSyncState, subscribeSync, syncNow } from '../lib/sync'
import { imageUrl } from '../lib/images'
import { initials } from '../lib/domain'
import { useNav } from '../lib/nav'
import { IconBack, IconHome, IconX, IconSearch, IconCloudOff } from './Icons'
import s from '../styles/ui.module.css'

export const cx = (...c) => c.filter(Boolean).join(' ')
export const ui = s

const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.9 }

// ---------- Screen ----------

export function Screen({ title, subtitle, hero, actions, back = true, home = false, tabs, children, barTitle, onBack, bodyClassName, scrollRef }) {
  const { pop, popToRoot } = useNav()
  const [collapsed, setCollapsed] = useState(false)
  const ownRef = useRef(null)
  const ref = scrollRef || ownRef

  function onScroll(e) {
    const c = e.currentTarget.scrollTop > 44
    if (c !== collapsed) setCollapsed(c)
  }

  return (
    <div className={s.screen} ref={ref} onScroll={onScroll} data-scroll>
      {/* Tap the top bar (not its buttons) to scroll back to the top, like tapping the iPhone's status bar (16 Nov). */}
      <header className={s.bar} onClick={e => { if (!e.target.closest('button, a, input')) ref.current?.scrollTo({ top: 0, behavior: 'smooth' }) }}>
        <div className={s.barSide}>
          {back && (
            <button className={cx(s.barBtn, s.barBtnBack)} onClick={onBack || pop} aria-label="Back">
              <IconBack size={26} />
            </button>
          )}
          {home && (
            <button className={s.barBtn} onClick={popToRoot} aria-label="Home"><IconHome size={21} /></button>
          )}
        </div>
        <div className={cx(s.barTitle, (collapsed || !title) && s.barTitleShown)}>{barTitle ?? (collapsed ? title : '')}</div>
        <div className={cx(s.barSide, s.barSideRight)}>{actions}</div>
      </header>
      {(title || hero) && (
        <div className={s.hero}>
          {title && <h1 className={s.heroTitle}>{title}</h1>}
          {subtitle && <div className={s.heroSub}>{subtitle}</div>}
          {hero}
        </div>
      )}
      {tabs}
      <div className={bodyClassName || s.body}>{children}</div>
    </div>
  )
}

export function BarButton({ children, ...rest }) {
  return <button className={s.barBtn} {...rest}>{children}</button>
}

// ---------- Segmented tabs ----------

export function Tabs({ tabs, value, onChange, id }) {
  return (
    <div className={s.tabsWrap}>
      <div className={s.tabs} role="tablist">
        {tabs.map(t => (
          <button key={t} role="tab" aria-selected={value === t} className={cx(s.tab, value === t && s.tabActive)} onClick={() => onChange(t)}>
            {value === t && <motion.span layoutId={`tab-${id}`} className={s.tabPill} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className={s.tabLabel}>{t}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Pressable card ----------

export function Card({ as = 'button', className, children, ...rest }) {
  // Plain element with a CSS press effect (15 Nov): a framer-motion card per row
  // made long lists (Main Groups, 800+ rows) slow to open and close.
  const C = as === 'div' ? 'div' : 'button'
  return (
    <C className={cx(s.card, s.press, className)} {...rest}>
      {children}
    </C>
  )
}

// ---------- Avatar ----------

export function useImageUrl(bucket, path) {
  const [url, setUrl] = useState(null)
  const pending = useLiveQuery(() => (path ? db.uploads.get(path) : undefined), [path])
  useEffect(() => {
    let live = true
    if (!path) { setUrl(null); return }
    imageUrl(bucket, path).then(u => { if (live) setUrl(u) })
    return () => { live = false }
  }, [bucket, path, pending])
  return url
}

export function Avatar({ name, photo, size = 48 }) {
  const url = useImageUrl('contact-photos', photo)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [url])
  return (
    <div className={s.avatar} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {url && !broken ? <img src={url} alt="" onError={() => setBroken(true)} /> : initials(name)}
    </div>
  )
}

// A photo full screen, over everything. Pinch to zoom, drag to look around
// when zoomed, double-tap to zoom in or out. Not zoomed: tap or swipe down to
// close. (Holding the photo still gives the iPhone's Share / Save menu.)
const MAX_ZOOM = 5
const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
const mid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 })

export function PhotoView({ bucket, path, onClose }) {
  const url = useImageUrl(bucket, path)
  const img = useRef(null)
  const [v, setV] = useState({ s: 1, x: 0, y: 0, drop: 0, anim: false })
  const cur = useRef(v); cur.current = v
  const g = useRef(null)          // the gesture in progress
  const lastTap = useRef(0)
  const tapTimer = useRef(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(tapTimer.current) }
  }, [onClose])

  // The picture's centre and size as shown before any zoom.
  const base = () => {
    const r = img.current.getBoundingClientRect(), { s, x, y } = cur.current
    return { cx: r.left + r.width / 2 - x, cy: r.top + r.height / 2 - y, w: r.width / s, h: r.height / s }
  }
  // Keep a zoomed picture from being dragged off screen.
  const clamp = (s, x, y, b) => {
    const mx = Math.max(0, (b.w * s - window.innerWidth) / 2), my = Math.max(0, (b.h * s - window.innerHeight) / 2)
    return { s, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
  }
  // Zoom to s keeping the screen point (px, py) still.
  const zoomAt = (s, px, py, from, b) => {
    const ix = (px - b.cx - from.x) / from.s, iy = (py - b.cy - from.y) / from.s
    return { s, x: px - b.cx - s * ix, y: py - b.cy - s * iy }
  }

  function start(e) {
    if (!img.current) return
    const t = e.touches, b = base(), { s, x, y } = cur.current
    if (t.length >= 2) g.current = { kind: 'pinch', d0: dist(t[0], t[1]), m0: mid(t[0], t[1]), from: { s, x, y }, b, moved: true }
    else g.current = { kind: s > 1.01 ? 'pan' : 'drop', x0: t[0].clientX, y0: t[0].clientY, from: { s, x, y }, b, moved: false }
  }
  function move(e) {
    const G = g.current, t = e.touches
    if (!G) return
    if (G.kind === 'pinch' && t.length >= 2) {
      const m = mid(t[0], t[1])
      const s = Math.min(MAX_ZOOM * 1.3, Math.max(0.6, G.from.s * dist(t[0], t[1]) / G.d0))
      const z = zoomAt(s, G.m0.x, G.m0.y, G.from, G.b)
      setV({ s, x: z.x + m.x - G.m0.x, y: z.y + m.y - G.m0.y, drop: 0, anim: false })
      return
    }
    if (t.length >= 2) { start(e); return }   // a second finger came down: now a pinch
    const dx = t[0].clientX - G.x0, dy = t[0].clientY - G.y0
    if (Math.abs(dx) + Math.abs(dy) > 8) G.moved = true
    if (G.kind === 'pan') setV({ ...G.from, x: G.from.x + dx, y: G.from.y + dy, drop: 0, anim: false })
    else if (G.kind === 'drop') setV(o => ({ ...o, drop: Math.max(0, dy), anim: false }))
  }
  function end(e) {
    const G = g.current
    if (!G || e.touches.length) { if (G && e.touches.length === 1) start(e); return }
    g.current = null
    const { s, x, y, drop } = cur.current
    if (G.kind === 'drop' && drop > 90) { onClose(); return }
    if (s < 1.01) { setV({ s: 1, x: 0, y: 0, drop: 0, anim: true }); }
    else {
      const k = Math.min(MAX_ZOOM, s)
      const z = k !== s ? zoomAt(k, window.innerWidth / 2, window.innerHeight / 2, { s, x, y }, G.b) : { s, x, y }
      setV({ ...clamp(z.s, z.x, z.y, G.b), drop: 0, anim: true })
    }
    if (G.moved) return
    // A tap: two quick ones zoom in or out; one alone (not zoomed) closes.
    const touch = e.changedTouches[0], now = Date.now()
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current); lastTap.current = 0
      if (cur.current.s > 1.01) setV({ s: 1, x: 0, y: 0, drop: 0, anim: true })
      else { const z = zoomAt(2.5, touch.clientX, touch.clientY, { s: 1, x: 0, y: 0 }, G.b); setV({ ...clamp(z.s, z.x, z.y, G.b), drop: 0, anim: true }) }
      return
    }
    lastTap.current = now
    if (cur.current.s <= 1.01) tapTimer.current = setTimeout(onClose, 300)
  }

  if (typeof document === 'undefined') return null
  const { s: sc, x, y, drop, anim } = v
  return createPortal(
    <div className={s.photoView} role="dialog" aria-label="Photo" style={{ background: `rgba(0,0,0,${Math.max(0.3, 0.94 - drop / 500)})` }}
      onClick={e => { if (e.detail && !('ontouchstart' in window)) onClose() }}
      onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
      <button className={s.photoClose} aria-label="Close" onTouchEnd={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onClose() }}><IconX size={20} /></button>
      {url && <img ref={img} src={url} alt="" draggable={false}
        style={{ transform: `translate(${x}px, ${y + drop}px) scale(${sc})`, transition: anim ? 'transform .22s ease-out' : 'none' }} />}
    </div>,
    document.body,
  )
}

// ---------- Keyboard-aware bottom sheet ----------

// How far the on-screen keyboard covers the page, so sheets sit above it.
// iPhone sometimes doesn't report that the keyboard has closed, which left
// sheets floating half-way up the screen. So the space only counts while
// something is actually being typed in, and it's re-checked a few times after
// focus changes (iPhone reports the keyboard's size late).
const isTyping = el => !!el && (el.isContentEditable || (el.tagName === 'TEXTAREA') ||
  (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'submit', 'date', 'time', 'file', 'range', 'color'].includes(el.type)))

function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window !== 'undefined' && window.visualViewport
    if (!vv) return
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setInset(isTyping(document.activeElement) && kb > 80 ? kb : 0)
    }
    const timers = []
    const later = () => { timers.forEach(clearTimeout); timers.length = 0; [0, 150, 400, 800].forEach(ms => timers.push(setTimeout(update, ms))) }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('focusin', later)
    window.addEventListener('focusout', later)
    window.addEventListener('resize', later)
    update()
    return () => {
      timers.forEach(clearTimeout)
      vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update)
      window.removeEventListener('focusin', later); window.removeEventListener('focusout', later); window.removeEventListener('resize', later)
    }
  }, [])
  return inset
}

function Portal({ children }) {
  const [el, setEl] = useState(null)
  useEffect(() => setEl(document.body), [])
  return el ? createPortal(children, el) : null
}

// The sheet itself. Its slide up and down runs on the graphics chip (Web
// Animations), so it stays smooth while the page behind is busy (16 Nov).
// Dragging it down by the handle still uses framer-motion.
const SHEET_IN = 'cubic-bezier(0.32, 0.72, 0, 1)'
function SheetPanel({ inset, onClose, children }) {
  const [isPresent, safeToRemove] = usePresence()
  const ref = useRef(null)
  const y = useMotionValue(0)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useLayoutEffect(() => {
    ref.current?.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0px)' }], { duration: 320, easing: SHEET_IN })
  }, [])
  useEffect(() => {
    if (isPresent || !ref.current) return
    const a = ref.current.animate([{ transform: `translateY(${y.get()}px)` }, { transform: 'translateY(100%)' }], { duration: 240, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' })
    a.onfinish = () => safeToRemove()
  }, [isPresent])

  // Swipe down to close, starting anywhere in the top third of the sheet (17 Nov),
  // when its content is scrolled to the top. Typing fields are left alone.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let st = null
    const onStart = e => {
      const t = e.touches[0]
      if (!t || e.touches.length > 1 || e.target.closest('input, textarea, select, [contenteditable="true"]')) { st = null; return }
      const r = el.getBoundingClientRect()
      const body = el.querySelector('[data-sheet-body]')
      const inZone = t.clientY - r.top < r.height / 3 || !!e.target.closest('[data-sheet-grab]')
      st = inZone && (!body || body.scrollTop <= 0) ? { x0: t.clientX, y0: t.clientY, drag: false, lastY: t.clientY, lastT: performance.now(), v: 0 } : null
    }
    const onMove = e => {
      if (!st) return
      const t = e.touches[0], dy = t.clientY - st.y0, dx = t.clientX - st.x0
      if (!st.drag) {
        if (dy > 8 && dy > Math.abs(dx)) st.drag = true
        else { if (dy < -4 || Math.abs(dx) > 10) st = null; return }
      }
      e.preventDefault()
      y.set(Math.max(0, dy))
      const now = performance.now()
      if (now > st.lastT) st.v = (t.clientY - st.lastY) / (now - st.lastT)
      st.lastY = t.clientY; st.lastT = now
    }
    const onEnd = () => {
      if (!st || !st.drag) { st = null; return }
      const far = y.get() > 110 || st.v > 0.6
      st = null
      if (far) closeRef.current()
      else animate(y, 0, { duration: 0.22, ease: [0.32, 0.72, 0, 1] })
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return (
    <motion.div ref={ref} className={s.sheet} role="dialog" aria-modal="true"
      style={{ y, bottom: inset, maxHeight: `calc(100dvh - ${inset}px - var(--safe-top) - 24px)` }}>
      {children}
    </motion.div>
  )
}

export function Sheet({ open, onClose, title, children, headerRight }) {
  const inset = useKeyboardInset()
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div key="bd" className={s.backdrop} onClick={onClose}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} />
            <SheetPanel key="sh" inset={inset} onClose={onClose}>
              <div className={s.sheetGrab} data-sheet-grab>
                <div className={s.handle} />
                {(title || headerRight) && (
                  <div className={s.sheetHead}>
                    <div className={s.sheetTitle}>{title}</div>
                    {headerRight}
                    <button className={s.sheetClose} onClick={onClose} aria-label="Close"><IconX size={18} /></button>
                  </div>
                )}
              </div>
              <div className={s.sheetBody} data-sheet-body>{children}</div>
            </SheetPanel>
          </>
        )}
      </AnimatePresence>
    </Portal>
  )
}

// Menu of actions; items: { label, icon, onClick, danger }
export function ActionSheet({ open, onClose, title, text, items }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {text && <p className={s.sheetText}>{text}</p>}
      <div className={s.actions} style={{ marginTop: text ? 14 : 0 }}>
        {(items || []).filter(Boolean).map(it => (
          <button key={it.label} className={cx(s.action, it.danger && s.actionDanger)} onClick={() => { onClose(); it.onClick() }}>
            {it.icon}{it.label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

// ---------- Toast with optional Undo ----------

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const show = useCallback((message, action, duration = action ? 5000 : 2200) => {
    clearTimeout(timer.current)
    const id = Date.now()
    setToast({ id, message, action })
    timer.current = setTimeout(() => setToast(t => (t && t.id === id ? null : t)), duration)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Portal>
        <AnimatePresence>
          {toast && (
            <motion.div key={toast.id} className={s.toast} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={SPRING}>
              <span className={s.toastMsg}>{toast.message}</span>
              {toast.action && (
                <button className={s.toastAction} onClick={() => { toast.action.onClick(); setToast(null) }}>{toast.action.label}</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </ToastContext.Provider>
  )
}

// ---------- Small pieces ----------

export function Empty({ icon, title, text, children }) {
  return (
    <div className={s.empty}>
      {icon && <div className={s.emptyIcon}>{icon}</div>}
      <div className={s.emptyTitle}>{title}</div>
      {text && <div className={s.emptyText}>{text}</div>}
      {children}
    </div>
  )
}

export function Spinner() {
  return <div className={s.center}><div className={s.spinner} /></div>
}

export function Field({ label, children }) {
  return <label className={s.field}><span className={s.label}>{label}</span>{children}</label>
}

export function SearchBox({ value, onChange, placeholder, autoFocus }) {
  return (
    <div className={s.search}>
      <IconSearch size={19} />
      <input type="search" enterKeyHint="search" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} autoCorrect="off" autoCapitalize="off" spellCheck={false} />
      {value && <button className={s.searchClear} onClick={() => onChange('')} aria-label="Clear"><IconX size={14} /></button>}
    </div>
  )
}

export function useSyncState() {
  const [st, setSt] = useState(getSyncState)
  useEffect(() => subscribeSync(setSt), [])
  const pending = useLiveQuery(async () => (await db.outbox.count()) + (await db.uploads.count()), [], 0)
  return { ...st, pending }
}

export function SyncPill() {
  const st = useSyncState()
  let dot = <span className={s.syncDot} />
  let label = 'Synced'
  if (!st.online) { dot = <IconCloudOff size={14} />; label = st.pending ? `Offline · ${st.pending} waiting` : 'Offline' }
  else if (st.syncing) { dot = <span className={s.syncSpin} />; label = st.pending ? `Syncing ${st.pending}` : 'Syncing' }
  else if (st.pending) { dot = <span className={cx(s.syncDot, s.syncDotPending)} />; label = `${st.pending} waiting` }
  else if (st.lastError) { dot = <span className={cx(s.syncDot, s.syncDotOff)} />; label = 'Sync issue' }
  return (
    <button className={s.syncPill} onClick={() => syncNow()} aria-label="Sync now">
      {dot}{label}
    </button>
  )
}

export function SaveStatus({ status }) {
  const label = status === 'saving' ? 'Saving…' : status === 'unsaved' ? 'Editing…' : 'Saved ✓'
  return <span className={cx(s.saveStatus, status !== 'saved' && s.saveStatusOn)}>{label}</span>
}
