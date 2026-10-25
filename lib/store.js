import { db } from './db'

// All writes go through here: the local table changes immediately and the
// change is queued in the outbox for the sync engine to send to Supabase.

let inflightSeq = null
export function setInflight(seq) { inflightSeq = seq }

const listeners = new Set()
export function onLocalWrite(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function notify() { listeners.forEach(fn => fn()) }

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback for very old browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

async function lastPendingOp(table, rowId) {
  const ops = await db.outbox.where('[table+rowId]').equals([table, rowId]).sortBy('seq')
  const last = ops[ops.length - 1]
  return last && last.seq !== inflightSeq ? last : null
}

export async function insertRow(table, row) {
  const full = { id: newId(), created_at: new Date().toISOString(), ...row }
  await db.transaction('rw', db[table], db.outbox, async () => {
    await db[table].put(full)
    await db.outbox.add({ table, rowId: full.id, op: 'upsert', data: full, ts: Date.now() })
  })
  notify()
  return full
}

// Many new rows at once (contact import): one queued upload per 200 rows.
export async function insertRows(table, rows) {
  const now = new Date().toISOString()
  const full = rows.map(r => ({ id: newId(), created_at: now, ...r }))
  await db.transaction('rw', db[table], db.outbox, async () => {
    await db[table].bulkPut(full)
    for (let i = 0; i < full.length; i += 200) {
      await db.outbox.add({ table, rowId: `batch:${newId()}`, op: 'upsertMany', data: full.slice(i, i + 200), ts: Date.now() })
    }
  })
  notify()
  return full
}

export async function updateRow(table, id, patch) {
  await db.transaction('rw', db[table], db.outbox, async () => {
    await db[table].update(id, patch)
    const last = await lastPendingOp(table, id)
    if (last && (last.op === 'upsert' || last.op === 'update')) {
      // Fold rapid edits (e.g. autosave while typing) into one pending change.
      await db.outbox.update(last.seq, { data: { ...last.data, ...patch }, ts: Date.now() })
    } else {
      await db.outbox.add({ table, rowId: id, op: 'update', data: patch, ts: Date.now() })
    }
  })
  notify()
}

// Single-row tables such as day_note (id = 1).
export async function upsertRow(table, row) {
  await db.transaction('rw', db[table], db.outbox, async () => {
    await db[table].put(row)
    const last = await lastPendingOp(table, row.id)
    if (last && last.op === 'upsert') await db.outbox.update(last.seq, { data: row, ts: Date.now() })
    else await db.outbox.add({ table, rowId: row.id, op: 'upsert', data: row, ts: Date.now() })
  })
  notify()
}

export async function deleteRow(table, id) {
  await db.transaction('rw', db[table], db.outbox, async () => {
    await db[table].delete(id)
    const ops = await db.outbox.where('[table+rowId]').equals([table, id]).toArray()
    const createdLocally = ops.some(o => o.op === 'upsert' && o.seq !== inflightSeq)
    const anyInflight = ops.some(o => o.seq === inflightSeq)
    // Drop queued changes for this row; Supabase never needs to hear about them.
    await db.outbox.bulkDelete(ops.filter(o => o.seq !== inflightSeq).map(o => o.seq))
    if (!createdLocally || anyInflight) {
      await db.outbox.add({ table, rowId: id, op: 'delete', data: null, ts: Date.now() })
    }
  })
  notify()
}

// Put a deleted row back (used by Undo). Queued as a fresh upsert.
export async function restoreRow(table, row) {
  await db.transaction('rw', db[table], db.outbox, async () => {
    await db[table].put(row)
    await db.outbox.add({ table, rowId: row.id, op: 'upsert', data: row, ts: Date.now() })
  })
  notify()
}

export async function queueUpload(bucket, path, blob) {
  await db.uploads.put({ path, bucket, blob, contentType: blob.type || 'image/jpeg', ts: Date.now() })
  notify()
}
