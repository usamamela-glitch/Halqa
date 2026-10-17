// Vercel function behind /carddav/* (see vercel.json). The logic lives in
// lib/carddav.js; this file only adapts the request and loads the data.
import { supabase } from '../lib/supabase.js'
import { handle } from '../lib/carddav.js'

async function fetchAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

async function load() {
  const [contacts, villages] = await Promise.all([
    fetchAll('contacts', 'id, village_id, name, phone, phone2, phone3, description, created_at'),
    fetchAll('villages', 'id, name'),
  ])
  return { contacts, villages }
}

function readBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body)
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'))
  return new Promise(resolve => {
    let s = ''
    req.on('data', c => { s += c })
    req.on('end', () => resolve(s))
    req.on('error', () => resolve(s))
  })
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x')
  // vercel.json rewrites /carddav/<rest> to /api/carddav?p=<rest>
  const rest = url.searchParams.get('p')
  const path = rest !== null ? `/carddav/${rest}` : url.pathname
  try {
    const out = await handle({
      method: req.method,
      path,
      depth: req.headers.depth,
      body: ['REPORT', 'PROPFIND'].includes(req.method) ? await readBody(req) : '',
      auth: req.headers.authorization,
      password: process.env.HALQA_CONTACTS_PASSWORD,
      load,
    })
    res.writeHead(out.status, { 'Cache-Control': 'no-store', ...out.headers })
    res.end(out.body)
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Halqa contacts error: ' + e.message)
  }
}
