import { useEffect, useRef, useState } from 'react'
import { Screen, BarButton } from '../ui'
import { IconPlus, IconDownload } from '../Icons'
import m from '../../styles/map.module.css'

const MIN = 1
const MAX = 8

// District map, stored with the app so it opens offline. Pinch or use the
// buttons to zoom; drag to pan.
export default function MapScreen() {
  const boxRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  zoomRef.current = zoom

  function zoomTo(next, cx, cy) {
    const box = boxRef.current
    if (!box) return
    const z = Math.min(MAX, Math.max(MIN, next))
    const ratio = z / zoomRef.current
    const px = cx ?? box.clientWidth / 2
    const py = cy ?? box.clientHeight / 2
    const left = (box.scrollLeft + px) * ratio - px
    const top = (box.scrollTop + py) * ratio - py
    setZoom(z)
    requestAnimationFrame(() => { box.scrollLeft = left; box.scrollTop = top })
  }

  // iOS Safari pinch gestures.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    let start = 1
    const onStart = e => { e.preventDefault(); start = zoomRef.current }
    const onChange = e => {
      e.preventDefault()
      const r = box.getBoundingClientRect()
      zoomTo(start * e.scale, e.clientX - r.left, e.clientY - r.top)
    }
    box.addEventListener('gesturestart', onStart)
    box.addEventListener('gesturechange', onChange)
    return () => { box.removeEventListener('gesturestart', onStart); box.removeEventListener('gesturechange', onChange) }
  }, [])

  return (
    <Screen
      barTitle="District map"
      bodyClassName={m.body}
      actions={<BarButton onClick={() => window.open('/district-map.pdf', '_blank')} aria-label="Open PDF"><IconDownload size={20} /></BarButton>}
    >
      <div ref={boxRef} className={m.box} onDoubleClick={e => {
        const r = boxRef.current.getBoundingClientRect()
        zoomTo(zoom >= 3 ? 1 : zoom * 2, e.clientX - r.left, e.clientY - r.top)
      }}>
        <img src="/district-map.jpg" alt="District Sargodha map" className={m.img} style={{ width: `${zoom * 100}%` }} draggable={false} />
      </div>
      <div className={m.controls}>
        <button className={m.ctl} onClick={() => zoomTo(zoom / 1.6)} aria-label="Zoom out" disabled={zoom <= MIN}><span className={m.minus} /></button>
        <button className={m.ctl} onClick={() => zoomTo(zoom * 1.6)} aria-label="Zoom in" disabled={zoom >= MAX}><IconPlus size={22} /></button>
      </div>
    </Screen>
  )
}
