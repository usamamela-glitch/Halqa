// Invitation cards (pictures and PDFs in the private event-cards bucket) are
// only needed until the event has passed. Once a day, when the Planner opens:
//  - a card whose events are all in the past is deleted, and the events keep
//    their details (image_path is cleared);
//  - a card no event uses any more (deleted or dismissed) is deleted after a day.
// The live database is asked directly, so a card that has just arrived from
// WhatsApp (not yet on the phone) is never touched. (15 Nov)
import { supabase } from './supabase'
import { updateRow } from './store'
import { localDay } from './touch'

const BUCKET = 'event-cards'
const KEY = 'halqa.cardsTidied'

async function listAll() {
  const paths = []
  const { data: top, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) throw error
  for (const x of top || []) {
    if (x.id) { paths.push({ path: x.name, at: x.created_at }); continue }   // a file at the top
    const { data: inner, error: e2 } = await supabase.storage.from(BUCKET).list(x.name, { limit: 1000 })
    if (e2) throw e2
    for (const f of inner || []) if (f.id) paths.push({ path: `${x.name}/${f.name}`, at: f.created_at })
  }
  return paths
}

export async function tidyEventCards({ force = false } = {}) {
  const today = localDay()
  try {
    if (!force && localStorage.getItem(KEY) === today) return null
  } catch {}
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null
  const { data: rows, error } = await supabase.from('events').select('id, day, status, image_path').not('image_path', 'is', null)
  if (error) return null
  const keep = new Set(), used = new Set()
  rows.forEach(e => {
    used.add(e.image_path)
    if (!e.day || e.day >= today || e.status === 'review') keep.add(e.image_path)
  })
  const past = [...used].filter(p => !keep.has(p))
  let orphans = []
  try {
    const dayAgo = new Date(Date.now() - 864e5).toISOString()
    orphans = (await listAll()).filter(f => !used.has(f.path) && (!f.at || f.at < dayAgo)).map(f => f.path)
  } catch {}
  const gone = [...past, ...orphans]
  if (gone.length) {
    const { error: e3 } = await supabase.storage.from(BUCKET).remove(gone)
    if (e3) return null
    for (const e of rows.filter(r => past.includes(r.image_path))) await updateRow('events', e.id, { image_path: null })
  }
  try { localStorage.setItem(KEY, today) } catch {}
  return { past: past.length, orphans: orphans.length }
}
