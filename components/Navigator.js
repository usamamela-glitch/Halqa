import { memo, useMemo } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { useNav, useNavStack, ScreenContext } from '../lib/nav'
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

// iOS-like push: 300ms, decelerating.
const EASE = [0.32, 0.72, 0, 1]
const T = { duration: 0.3, ease: EASE }
const NOW = { duration: 0 }
// The page leaving reads `custom` from AnimatePresence at the moment it leaves.
const VARIANTS = { out: instant => (instant ? { opacity: 0, transition: NOW } : { x: '100%', transition: T }) }

// On the iPhone (web app), the iPhone's own edge swipe already goes back. Halqa's
// own edge drag on top of it made one swipe go back twice (16 Nov), so it is off
// there; it stays for other browsers and for the native app shell.
const IOS_WEB = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) && !(typeof window !== 'undefined' && window.Capacitor)

const layerStyle = { position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--bg)', willChange: 'transform' }

function Layer({ entry, index, top, onBack, instant }) {
  const t = instant ? NOW : T
  const Comp = SCREENS[entry.screen] || HomeScreen
  const isTop = index === top
  const canSwipe = isTop && index > 0 && !IOS_WEB
  const controls = useDragControls()
  // The screen itself only redraws when its own params change, not when another page opens on top.
  const screenValue = useMemo(() => ({ key: entry.key, params: entry.params }), [entry.key, entry.params])
  const body = useMemo(() => <Comp />, [Comp])

  return (
    <motion.div
      style={{ ...layerStyle, zIndex: index + 1, visibility: index < top - 1 ? 'hidden' : 'visible', boxShadow: index > 0 ? '-8px 0 30px rgba(0,0,0,0.12)' : 'none' }}
      initial={index === 0 ? false : { x: '100%' }}
      animate={{ x: isTop ? 0 : '-28%' }}
      custom={instant}
      variants={VARIANTS}
      exit="out"
      transition={t}
      drag={canSwipe ? 'x' : false}
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 1 }}
      dragMomentum={false}
      onDragEnd={(_, info) => { if (info.offset.x > 90 || info.velocity.x > 500) onBack() }}
      onPointerDown={e => { if (canSwipe && e.clientX < 28) controls.start(e) }}
      aria-hidden={!isTop}
    >
      <ScreenContext.Provider value={screenValue}>
        {body}
      </ScreenContext.Provider>
      <motion.div
        style={{ position: 'absolute', inset: 0, background: 'rgba(5,20,24,0.18)', pointerEvents: isTop ? 'none' : 'auto', zIndex: 100 }}
        initial={false}
        animate={{ opacity: isTop ? 0 : 1 }}
        transition={t}
      />
    </motion.div>
  )
}

export default function Navigator() {
  const { pop } = useNav()
  const { stack, instant } = useNavStack()
  const top = stack.length - 1
  return (
    <AnimatePresence initial={false} custom={instant}>
      {stack.map((entry, i) => <Layer key={entry.key} entry={entry} index={i} top={top} onBack={pop} instant={instant} />)}
    </AnimatePresence>
  )
}
