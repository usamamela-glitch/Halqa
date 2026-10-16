import Dexie from 'dexie'

// Local mirror of the Supabase tables. Every screen reads from here, so the
// app works the same with or without signal.
export const db = new Dexie('halqa')

db.version(1).stores({
  qanungos: 'id, name',
  villages: 'id, qanungo_id, name',
  contacts: 'id, village_id, name',
  notes: 'id, village_id, created_at',
  general_notes: 'id, created_at',
  day_note: 'id',
  // Local changes not yet confirmed by Supabase, replayed in seq order.
  outbox: '++seq, [table+rowId]',
  // Photos taken offline, waiting to be uploaded to Storage.
  uploads: 'path',
  // Operations Supabase rejected permanently (kept so nothing vanishes silently).
  failed: '++id',
  meta: 'key',
})

export const SYNCED_TABLES = ['qanungos', 'villages', 'contacts', 'notes', 'general_notes', 'day_note']

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key)
  return row ? row.value : fallback
}

export function setMeta(key, value) {
  return db.meta.put({ key, value })
}
