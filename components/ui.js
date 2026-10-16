import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
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
      <header className={s.bar}>
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
  const C = as === 'div' ? motion.div : motion.button
  return (
    <C whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }} className={cx(s.card, className)} {...rest}>
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

// ---------- Keyboard-aware bottom sheet ----------

function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window !== 'undefined' && window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])
  return inset
}

function Portal({ children }) {
  const [el, setEl] = useState(null)
  useEffect(() => setEl(document.body), [])
  return el ? createPortal(children, el) : null
}

export function Sheet({ open, onClose, title, children, headerRight }) {
  const controls = useDragControls()
  const inset = useKeyboardInset()
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div key="bd" className={s.backdrop} onClick={onClose}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} />
            <motion.div key="sh" className={s.sheet} role="dialog" aria-modal="true"
              style={{ bottom: inset, maxHeight: `calc(100dvh - ${inset}px - var(--safe-top) - 24px)` }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.9 }}
              drag="y" dragListener={false} dragControls={controls}
              dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.05, bottom: 0.7 }}
              onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose() }}>
              <div className={s.sheetGrab} onPointerDown={e => controls.start(e)}>
                <div className={s.handle} />
                {(title || headerRight) && (
                  <div className={s.sheetHead}>
                    <div className={s.sheetTitle}>{title}</div>
                    {headerRight}
                    <button className={s.sheetClose} onClick={onClose} aria-label="Close"><IconX size={18} /></button>
                  </div>
                )}
              </div>
              <div className={s.sheetBody}>{children}</div>
            </motion.div>
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
