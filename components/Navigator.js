import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { useNav, ScreenContext } from '../lib/nav'
import HomeScreen from './screens/HomeScreen'
import QanungoScreen from './screens/QanungoScreen'
import VillageScreen from './screens/VillageScreen'
import MainGroupsScreen from './screens/MainGroupsScreen'
import DayNoteScreen from './screens/DayNoteScreen'
import NoteScreen from './screens/NoteScreen'
import MapScreen from './screens/MapScreen'
import SettingsScreen from './screens/SettingsScreen'
import AnalysisScreen from './screens/AnalysisScreen'
import ImportScreen from './screens/ImportScreen'

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
}

// iOS-like push: 300ms, decelerating.
const EASE = [0.32, 0.72, 0, 1]
const T = { duration: 0.3, ease: EASE }

const layerStyle = { position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--bg)', willChange: 'transform' }

function Layer({ entry, index, top, onBack }) {
  const Comp = SCREENS[entry.screen] || HomeScreen
  const isTop = index === top
  const canSwipe = isTop && index > 0
  const controls = useDragControls()

  return (
    <motion.div
      style={{ ...layerStyle, zIndex: index + 1, visibility: index < top - 1 ? 'hidden' : 'visible', boxShadow: index > 0 ? '-8px 0 30px rgba(0,0,0,0.12)' : 'none' }}
      initial={index === 0 ? false : { x: '100%' }}
      animate={{ x: isTop ? 0 : '-28%' }}
      exit={{ x: '100%', transition: T }}
      transition={T}
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
      <ScreenContext.Provider value={{ key: entry.key, params: entry.params, isTop }}>
        <Comp />
      </ScreenContext.Provider>
      <motion.div
        style={{ position: 'absolute', inset: 0, background: 'rgba(5,20,24,0.18)', pointerEvents: isTop ? 'none' : 'auto', zIndex: 100 }}
        initial={false}
        animate={{ opacity: isTop ? 0 : 1 }}
        transition={T}
      />
    </motion.div>
  )
}

export default function Navigator() {
  const { stack, pop } = useNav()
  const top = stack.length - 1
  return (
    <AnimatePresence initial={false}>
      {stack.map((entry, i) => <Layer key={entry.key} entry={entry} index={i} top={top} onBack={pop} />)}
    </AnimatePresence>
  )
}
