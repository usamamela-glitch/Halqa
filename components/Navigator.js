import { useLayoutEffect, useMemo, useRef } from 'react'
import { motion, useTransform } from 'framer-motion'
import { useNav, useNavStack, ScreenContext, registerLayer } from '../lib/nav'
import HomeScreen, { NotesScreen } from './screens/HomeScreen'
import QanungoScreen from './screens/QanungoScreen'
import VillageScreen from './screens/VillageScreen'
import MainGroupsScreen from './screens/MainGroupsScreen'
import DayNoteScreen from './screens/DayNoteScreen'
import NoteScreen from './screens/NoteScreen'
import MapScreen from './screens/MapScreen'
import SettingsScreen from './screens/SettingsScreen'
import AnalysisScreen from './screens/AnalysisScreen'
import ImportScreen from './screens/ImportScreen'
import TodayScreen from './screens/TodayScreen'
import PlannerScreen from './screens/PlannerScreen'
import CalendarScreen from './screens/CalendarScreen'

const SCREENS = {
  home: HomeScreen,
  qanungo: QanungoScreen,
  village: VillageScreen,
  mainGroups: MainGroupsScreen,
  dayNote: DayNoteScreen,
  note: NoteScreen,
  map: MapScreen,
  settings: SettingsScreen,
  analysis: AnalysisScreen,
  import: ImportScreen,
  today: TodayScreen,
  planner: PlannerScreen,
  calendar: CalendarScreen,
  notes: NotesScreen,
}

// Pages slide like an iPhone app (16 Nov): the top page follows its position; the
// page underneath sits 28% to the left, dimmed, and follows the top page in. A
// swipe from the left edge drags the top page; let go past a third of the screen
// (or with a flick) and it goes back, otherwise it slides back into place.
const layerStyle = { position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--bg)', willChange: 'transform' }
const edgeStyle = { position: 'absolute', left: 0, top: 'calc(var(--safe-top) + 54px)', bottom: 0, width: 22, zIndex: 90, touchAction: 'none' }
const W = () => (typeof window !== 'undefined' ? window.innerWidth : 400)

function EdgeSwipe({ x, onBack, onSettle }) {
  const start = e => {
    const el = e.currentTarget
    const x0 = e.clientX, y0 = e.clientY
    let dragging = false, lastX = x0, lastT = performance.now(), v = 0
    el.setPointerCapture?.(e.pointerId)
    const move = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0
      if (!dragging) {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) dragging = true
        else return
      }
      x.set(Math.max(0, dx))
      const now = performance.now()
      if (now > lastT) v = (ev.clientX - lastX) / (now - lastT)
      lastX = ev.clientX; lastT = now
    }
    const up = ev => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
      if (!dragging) {
        // A tap on the thin edge strip: pass it on to what's underneath.
        el.style.pointerEvents = 'none'
        const under = document.elementFromPoint(ev.clientX, ev.clientY)
        el.style.pointerEvents = ''
        under?.click?.()
        return
      }
      if (x.get() > W() / 3 || v > 0.45) onBack()
      else onSettle()
    }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
  }
  return <div style={edgeStyle} onPointerDown={start} aria-hidden />
}

function Layer({ entry, index, top, topX }) {
  const { getX, pop, settle, enter } = useNav()
  const layerRef = useRef(null), dimRef = useRef(null)
  useLayoutEffect(() => {
    registerLayer(entry.key, { layer: layerRef.current, dim: dimRef.current })
    if (entry.fresh) enter(entry.key)
    return () => registerLayer(entry.key, null)
  }, [])
  const Comp = SCREENS[entry.screen] || HomeScreen
  const isTop = index === top
  const own = getX(entry.key)
  // The page underneath: 28% to the left and dimmed, moving in as the top page moves out.
  const underX = useTransform(topX, v => -0.28 * (W() - v))
  const dim = useTransform(topX, v => Math.max(0, 1 - v / W()))
  // The screen itself only redraws when its own params change, not when another page opens on top.
  const screenValue = useMemo(() => ({ key: entry.key, params: entry.params }), [entry.key, entry.params])
  const body = useMemo(() => <Comp />, [Comp])

  return (
    <motion.div
      ref={layerRef}
      style={{ ...layerStyle, x: isTop ? own : underX, zIndex: index + 1, visibility: index < top - 1 ? 'hidden' : 'visible', boxShadow: index > 0 ? '-8px 0 30px rgba(0,0,0,0.12)' : 'none' }}
      aria-hidden={!isTop}
    >
      <ScreenContext.Provider value={screenValue}>
        {body}
      </ScreenContext.Provider>
      {isTop && index > 0 && <EdgeSwipe x={own} onBack={pop} onSettle={() => settle(entry.key)} />}
      <motion.div
        ref={dimRef}
        style={{ position: 'absolute', inset: 0, background: 'rgba(5,20,24,0.18)', pointerEvents: isTop ? 'none' : 'auto', zIndex: 100, opacity: isTop ? 0 : index === top - 1 ? dim : 1 }}
      />
    </motion.div>
  )
}

export default function Navigator() {
  const { getX } = useNav()
  const { stack } = useNavStack()
  const top = stack.length - 1
  const topX = getX(stack[top].key)
  return stack.map((entry, i) => <Layer key={entry.key} entry={entry} index={i} top={top} topX={topX} />)
}
