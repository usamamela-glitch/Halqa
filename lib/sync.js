import { db, SYNCED_TABLES, INCREMENTAL_TABLES, OPTIONAL_TABLES, getMeta, setMeta } from './db'
import { supabase } from './supabase'
import { setInflight, onLocalWrite } from './store'

// Sync engine.
// push: replay the outbox (and queued photo uploads) to Supabase, in order.
// pull: download every table and replace the local copy, then re-apply any
//       changes still waiting in the outbox so nothing typed offline is lost.
// Conflicts are last-write-wins.

const PULL_EVERY_MS = 2 * 60 * 1000
const RETRY_EVERY_MS = 30 * 1000

const state = { syncing: false, online: true, lastSync: null, lastError: null, needsMigration: false }
const subscribers = new Set()

export function getSyncState() { return state }
export function subscribeSync(fn) { subscribers.add(fn); return () => subscribers.delete(fn) }
function setState(patch) {
  Object.assign(state, patch)
  subscribers.forEach(fn => fn({ ...state }))
}

let started = false
let running = null
let pushTimer = null

export function startSync() {
  if (started || typeof window === 'undefined') return
  started = true
  setState({ online: navigator.onLine })
  getMeta('lastSync').then(t => setState({ lastSync: t }))
  refreshNeedsMigration()

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {})

  window.addEventListener('online', () => { setState({ online: true }); syncNow() })
  window.addEventListener('offline', () => setState({ online: false }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow({ pullIfOlderThan: 30 * 1000 })
  })
  onLocalWrite(() => {
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => syncNow({ pushOnly: true }), 400)
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow({ pullIfOlderThan: PULL_EVERY_MS })
  }, RETRY_EVERY_MS)

  syncNow()
}

// Runs push then pull. Calls made while a sync is running wait for it and
// then run once more, so a change typed mid-sync is never skipped.
export function syncNow(opts = {}) {
  if (running) {
    running.again = { ...(running.again || {}), ...opts, pushOnly: running.again ? running.again.pushOnly && opts.pushOnly : opts.pushOnly }
    return running.promise
  }
  const job = { again: null }
  job.promise = (async () => {
    let next = opts
    while (next) {
      await runOnce(next)
      next = job.again
      job.again = null
    }
    running = null
  })()
  running = job
  return job.promise
}

async function runOnce({ pushOnly = false, pullIfOlderThan = 0 } = {}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) { setState({ online: false }); return }
  setState({ syncing: true })
  try {
    const pushed = await push()
    if (!pushed) return
    const last = state.lastSync ? Date.parse(state.lastSync) : 0
    if (!pushOnly && Date.now() - last >= pullIfOlderThan) await pull()
    setState({ lastError: null, online: true })
  } catch (e) {
    setState({ lastError: e.message || String(e) })
  } finally {
    setState({ syncing: false })
  }
}

async function refreshNeedsMigration() {
  const cols = await getMeta('missingColumns', {})
  const tables = await getMeta('missingTables', [])
  setState({ needsMigration: Object.keys(cols).length > 0 || tables.length > 0 })
}

// "Could not find the table 'public.analysis_reports' in the schema cache"
function isMissingTable(error) {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|relation .* does not exist/i.test(error.message || '')
}

async function setTableMissing(table, missing) {
  const list = await getMeta('missingTables', [])
  const next = missing ? [...new Set([...list, table])] : list.filter(t => t !== table)
  if (next.length !== list.length) { await setMeta('missingTables', next); await refreshNeedsMigration() }
}

function isTransient(error, status) {
  if (!error) return false
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (!status || status === 408 || status === 429 || status >= 500) return true
  const msg = (error.message || '').toLowerCase()
  return msg.includes('fetch') || msg.includes('network') || msg.includes('load failed') || msg.includes('timeout')
}

// "Could not find the 'tags' column of 'contacts' in the schema cache"
function missingColumnFrom(error) {
  if (!error) return null
  if (error.code !== 'PGRST204' && error.code !== '42703') return null
  const m = /'([^']+)' column/.exec(error.message || '') || /column "?([a-z_0-9]+)"? .*does not exist/i.exec(error.message || '')
  return m ? m[1] : null
}

async function stripMissing(table, data) {
  if (!data) return data
  const missing = (await getMeta('missingColumns', {}))[table] || []
  if (!missing.length) return data
  const copy = { ...data }
  missing.forEach(col => { delete copy[col] })
  return copy
}

async function sendOp(op) {
  const q = supabase.from(op.table)
  const data = await stripMissing(op.table, op.data)
  if (op.op === 'upsert') return q.upsert(data)
  if (op.op === 'update') {
    if (!data || Object.keys(data).length === 0) return { error: null, status: 204 }
    return q.update(data).eq('id', op.rowId)
  }
  if (op.op === 'delete') return q.delete().eq('id', op.rowId)
  return { error: { message: `Unknown op ${op.op}` }, status: 400 }
}

// Returns false if it stopped early because the network is unavailable.
async function push() {
  const uploads = await db.uploads.toArray()
  for (const u of uploads) {
    const { error } = await supabase.storage.from(u.bucket).upload(u.path, u.blob, { upsert: false, contentType: u.contentType })
    const status = error ? Number(error.statusCode || error.status || 0) : 0
    // "Already exists" means an earlier attempt got through before we lost signal.
    const alreadyThere = error && (status === 409 || /exists|duplicate/i.test(error.message || ''))
    if (!error || alreadyThere) { await db.uploads.delete(u.path); continue }
    if (isTransient(error, status)) return false
    // Missing bucket etc.: keep the photo locally and try again next time.
  }

  for (;;) {
    // Changes for a table the database doesn't have yet wait in the outbox
    // without holding up everything else.
    const skip = new Set(await getMeta('missingTables', []))
    const op = await db.outbox.orderBy('seq').filter(o => !skip.has(o.table)).first()
    if (!op) return true
    setInflight(op.seq)
    let res
    try {
      res = await sendOp(op)
    } catch (e) {
      res = { error: { message: e.message || String(e) }, status: 0 }
    } finally {
      setInflight(null)
    }
    const { error, status } = res
    if (!error) { await db.outbox.delete(op.seq); continue }
    if (isTransient(error, status)) return false

    if (OPTIONAL_TABLES.includes(op.table) && isMissingTable(error)) {
      await setTableMissing(op.table, true)
      continue
    }

    const col = missingColumnFrom(error)
    if (col) {
      // The database hasn't been migrated for a new feature yet. Keep the
      // value locally, send the rest, and flag it in Settings.
      const missing = await getMeta('missingColumns', {})
      const list = missing[op.table] || []
      if (!list.includes(col)) {
        missing[op.table] = [...list, col]
        await setMeta('missingColumns', missing)
        setState({ needsMigration: true })
        continue
      }
    }
    await db.transaction('rw', db.outbox, db.failed, async () => {
      await db.failed.add({ ...op, error: error.message || String(error), failedAt: new Date().toISOString() })
      await db.outbox.delete(op.seq)
    })
  }
}

async function fetchAll(table, columns = '*', since = null) {
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    let q = supabase.from(table).select(columns)
    if (since) q = q.gt(INCREMENTAL_TABLES[table], since)
    const { data, error, status } = await q.order('id').range(from, from + pageSize - 1)
    if (error) {
      const err = new Error(`${table}: ${error.message}`)
      err.transient = isTransient(error, status)
      err.missingTable = isMissingTable(error)
      throw err
    }
    rows.push(...data)
    if (data.length < pageSize) return rows
    from += pageSize
  }
}

function applyOpLocally(tableRef, op, rows) {
  if (op.op === 'delete') { rows.delete(op.rowId); return }
  const existing = rows.get(op.rowId)
  if (op.op === 'upsert') rows.set(op.rowId, { ...(existing || {}), ...op.data })
  else if (op.op === 'update' && existing) rows.set(op.rowId, { ...existing, ...op.data })
}

// For incremental tables: every id on the server, plus full rows changed since the last pull.
async function fetchIncremental(table) {
  const col = INCREMENTAL_TABLES[table]
  const since = await getMeta(`syncedThrough:${table}`, null)
  const [ids, changed] = await Promise.all([fetchAll(table, 'id'), fetchAll(table, '*', since)])
  const local = new Map((await db[table].toArray()).map(r => [r.id, r]))
  const rows = []
  const changedById = new Map(changed.map(r => [r.id, r]))
  ids.forEach(({ id }) => {
    const r = changedById.get(id) || local.get(id)
    if (r) rows.push(r)
  })
  const newest = changed.reduce((m, r) => (r[col] && (!m || r[col] > m) ? r[col] : m), since)
  return { rows, newest }
}

async function pull() {
  const fetched = {}
  const marks = {}
  const tables = []
  for (const table of SYNCED_TABLES) {
    try {
      if (INCREMENTAL_TABLES[table]) {
        const { rows, newest } = await fetchIncremental(table)
        fetched[table] = rows
        marks[table] = newest
      } else {
        fetched[table] = await fetchAll(table)
      }
      tables.push(table)
      if (OPTIONAL_TABLES.includes(table)) await setTableMissing(table, false)
    } catch (e) {
      // Before its database update, an optional table just stays local.
      if (OPTIONAL_TABLES.includes(table) && e.missingTable) { await setTableMissing(table, true); continue }
      throw e
    }
  }

  await db.transaction('rw', [...tables.map(t => db[t]), db.outbox], async () => {
    const pending = await db.outbox.orderBy('seq').toArray()
    for (const table of tables) {
      const rows = new Map(fetched[table].map(r => [r.id, r]))
      // Keep values for columns the server doesn't have yet (pre-migration).
      const local = await db[table].toArray()
      const localById = new Map(local.map(r => [r.id, r]))
      rows.forEach((r, id) => {
        const l = localById.get(id)
        if (!l) return
        Object.keys(l).forEach(k => { if (!(k in r)) r[k] = l[k] })
      })
      pending.filter(op => op.table === table).forEach(op => applyOpLocally(db[table], op, rows))
      await db[table].clear()
      await db[table].bulkPut([...rows.values()])
    }
  })
  for (const [table, mark] of Object.entries(marks)) if (mark) await setMeta(`syncedThrough:${table}`, mark)
  const now = new Date().toISOString()
  await setMeta('lastSync', now)
  await setMeta('initialized', true)
  setState({ lastSync: now })
}

export async function pendingCount() {
  return (await db.outbox.count()) + (await db.uploads.count())
}
