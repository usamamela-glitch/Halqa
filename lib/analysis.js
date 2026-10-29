import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'
import { plainText } from './images'
import { daysSince } from './domain'
import { POLITICIAN } from './config'

export const API_KEY_STORAGE = 'halqa.anthropicKey'
const MODEL = 'claude-opus-5-5'

export function getApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || '' } catch { return '' }
}
export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key.trim())
    else localStorage.removeItem(API_KEY_STORAGE)
  } catch {}
}

const SYSTEM = `You are a political strategist advising ${POLITICIAN}. The constituency is rural and organised by Qanungo (revenue circle) → village → people.

You receive his private field data: election results (free text as he wrote them), population and registered voters, his notes on the allied group ("our group") and the opposition group in each village, development demands and schemes, the people he knows (with his descriptions, tags, whether he pinned them as key people, and how long since he last contacted them), and his own notes. His own notes and descriptions are the most valuable part — read them closely.

Write the report in clear English for a busy politician reading on a phone. Use Markdown headings and short bullet points. For each area analysed give:
1. Factual summary — vote history, group dynamics, key people, development status.
2. Strategic recommendation — who to prioritise, which issues to address, a risk level (Low / Medium / High) with the reason, and concrete next steps.

Be specific: name the villages and people from the data. Say plainly where the data is thin or missing instead of guessing, and list what he should find out next.

When he asks a specific question instead of requesting a report, or asks a follow-up, answer that question directly and concisely from the data. Use the report structure only if the question calls for it.`

function villageBlock(v, contacts, notes, period) {
  const lines = [`### Village: ${v.name}`]
  if (period) {
    const n = contacts.filter(c => inPeriod(c.last_contacted, period)).length
    lines.push(`In touch during ${period.label}: ${n} of ${contacts.length} people`)
  }
  const add = (label, val) => { if (val !== null && val !== undefined && String(val).trim() !== '') lines.push(`${label}: ${val}`) }
  add('2018 result', v.result_2018)
  add('2024 result', v.result_2024)
  add('Population', v.population)
  add('Registered voters', v.registered_voters)
  add('Our group', v.our_group)
  add('Opposition group', v.anti_group)
  add('Development', v.development)
  if (contacts.length) {
    lines.push(`People (${contacts.length}):`)
    contacts.forEach(c => {
      const d = daysSince(c.last_contacted)
      const bits = [
        c.pinned ? 'KEY PERSON' : null,
        (c.tags || []).length ? `tags: ${c.tags.join(', ')}` : null,
        d === null ? null : `last in touch ${d} day(s) ago`,
      ].filter(Boolean)
      lines.push(`- ${c.name}${c.description ? ` — ${c.description}` : ''}${bits.length ? ` [${bits.join('; ')}]` : ''}`)
    })
  } else {
    lines.push('People: none recorded')
  }
  notes.forEach(n => {
    const text = plainText(n.body).trim()
    if (text) lines.push(`Note (${(n.created_at || '').slice(0, 10)}):\n${text}`)
  })
  return lines.join('\n')
}

// Builds the data section for one village, one Qanungo or everything.
export async function buildContext(scope, id) {
  const [qanungos, villages, contacts, notes, general] = await Promise.all([
    db.qanungos.toArray(), db.villages.toArray(), db.contacts.toArray(), db.notes.toArray(), db.general_notes.toArray(),
  ])
  const qName = Object.fromEntries(qanungos.map(q => [q.id, q.name]))
  const byVillage = (list, vid) => list.filter(x => x.village_id === vid)

  const period = scope === 'briefing' ? briefingPeriod(id) : null
  let chosen = villages
  let title = period ? `Monthly briefing · ${period.label}` : 'Whole constituency'
  if (scope === 'village') {
    chosen = villages.filter(v => v.id === id)
    title = chosen[0]?.name || 'Village'
  } else if (scope === 'qanungo') {
    chosen = villages.filter(v => v.qanungo_id === id)
    title = `${qName[id] || 'Qanungo'} Qanungo`
  }

  const groups = new Map()
  chosen.forEach(v => {
    const k = qName[v.qanungo_id] || 'Unassigned'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(v)
  })
  const parts = []
  ;[...groups.keys()].sort().forEach(k => {
    parts.push(`## Qanungo: ${k}`)
    groups.get(k).sort((a, b) => a.name.localeCompare(b.name)).forEach(v => {
      parts.push(villageBlock(v, byVillage(contacts, v.id), byVillage(notes, v.id), period))
    })
  })
  if (scope === 'all' || period) {
    const g = general.map(n => plainText(n.body).trim()).filter(Boolean)
    if (g.length) parts.push(`## General notes\n${g.map(t => `- ${t.replace(/\n/g, ' ')}`).join('\n')}`)
  }
  if (!period) return { title, villages: chosen.length, text: parts.join('\n\n') }

  // Briefing: coverage figures first, so Claude (and next month's briefing) can compare.
  const inTouch = contacts.filter(c => inPeriod(c.last_contacted, period))
  const byQ = {}
  villages.forEach(v => {
    const k = qName[v.qanungo_id] || 'Unassigned'
    const people = byVillage(contacts, v.id)
    const q = byQ[k] || (byQ[k] = { total: 0, inTouch: 0 })
    q.total += people.length
    q.inTouch += people.filter(c => inPeriod(c.last_contacted, period)).length
  })
  const stats = {
    target: id, label: period.label, total: contacts.length, inTouch: inTouch.length,
    pinnedInTouch: inTouch.filter(c => c.pinned).length, pinnedTotal: contacts.filter(c => c.pinned).length,
    byQanungo: byQ,
  }
  const previous = (await db.analysis_reports.toArray())
    .filter(r => r.scope === 'briefing' && r.target !== id && r.meta && r.meta.stats)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–')
  const summary = [
    `## Coverage during ${period.label}`,
    `People in touch: ${stats.inTouch} of ${stats.total} (${pct(stats.inTouch, stats.total)}). Pinned: ${stats.pinnedInTouch} of ${stats.pinnedTotal}.`,
    previous
      ? `Previous briefing (${previous.meta.stats.label}): ${previous.meta.stats.inTouch} of ${previous.meta.stats.total} people in touch (${pct(previous.meta.stats.inTouch, previous.meta.stats.total)}).`
      : 'No previous briefing to compare with.',
    'By Qanungo:',
    ...Object.entries(byQ).sort().map(([k, q]) => `- ${k}: ${q.inTouch} of ${q.total} (${pct(q.inTouch, q.total)})`),
  ].join('\n')
  return { title, villages: chosen.length, text: `${summary}\n\n${parts.join('\n\n')}`, stats }
}

// Briefing periods: "month:2026-10" (a calendar month) or "last30:2026-10-29" (30 days to that day).
export function briefingPeriod(target) {
  const [kind, value] = String(target || '').split(':')
  if (kind === 'month') {
    const [y, m] = value.split('-').map(Number)
    const from = new Date(y, m - 1, 1)
    return { from, to: new Date(y, m, 1), label: from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
  }
  const [y, m, d] = (value || '').split('-').map(Number)
  const to = value ? new Date(y, m - 1, d + 1) : new Date()
  const from = new Date(to.getTime() - 30 * 86400000)
  return { from, to, label: `the 30 days to ${new Date(to.getTime() - 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` }
}

function inPeriod(iso, period) {
  if (!iso) return false
  const t = new Date(iso)
  return t >= period.from && t < period.to
}

function instruction(scope, title, villageCount) {
  if (scope === 'briefing') return `Write Usama's ${title.toLowerCase()}.

How "in touch" works: someone counts as in touch when Usama opened their contact card in Halqa, or called or WhatsApped them from it. This tracking started on 29 October 2026, so earlier contact isn't recorded — say so if it matters, and don't read "not yet in touch" as neglect before that date.

Use these four sections, in this order, short and practical for reading on a phone:
1. **Progress** — how many people he was in touch with this period, compared with the previous briefing if there is one, and which Qanungos were well covered or neglected.
2. **Gaps** — villages and important people (KEY PERSON / pinned, Key Voter, Wasayba Leader, Religious Leader and similar) he hasn't been in touch with for a long time, or at all.
3. **Weak spots** — villages lost or won narrowly in 2024 (use the Net figures) and how much attention they got this period.
4. **People to see this month** — about 15 named people, each with their village, why now, and a concrete talking point drawn from their description or the notes.`
  if (scope === 'village') return `Analyse the village ${title}.`
  if (scope === 'qanungo') return `Analyse ${title} (${villageCount} villages). Start with an overview of the Qanungo, then go village by village, and end with the top priorities across the Qanungo.`
  return `Analyse the whole constituency (${villageCount} villages). Start with an overall picture and the biggest risks, then a section per Qanungo with a short village-by-village assessment, and end with a ranked list of the 10 most important actions for the next election.`
}

function firstMessage(ctx, scope, question) {
  const ask = question && question.trim() ? question.trim() : instruction(scope, ctx.title, ctx.villages)
  return { role: 'user', content: `<constituency_data>\n${ctx.text}\n</constituency_data>\n\n${ask}` }
}

// Sends the conversation and streams the answer. onText(fullTextSoFar) is called as text arrives.
// Returns the answer text and the history to send with the next follow-up.
async function send(messages, onText, signal) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Add your Claude API key in Settings first.')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'],
    fallbacks: 'default',
    // If an earlier turn's reasoning can't be reused, carry on without it rather than failing.
    thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
    output_config: { effort: 'high' },
    // Follow-ups resend the same data, so cache it: they cost a fraction of the first question.
    cache_control: { type: 'ephemeral' },
    system: SYSTEM,
    messages,
  }, { signal })

  let text = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text
      onText(text)
    }
  }
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') {
    throw new Error('Claude declined to answer this. Try rephrasing, or a narrower analysis (a single village or Qanungo).')
  }
  if (final.stop_reason === 'max_tokens') {
    text += '\n\n_(Answer reached its length limit — try a narrower question or a Qanungo-level analysis.)_'
    onText(text)
  }
  // Assistant content goes back unchanged (thinking blocks included) so Claude keeps its reasoning.
  return { text, history: [...messages, { role: 'assistant', content: final.content }] }
}

// A new report, or a specific question if one is given.
export async function runAnalysis({ scope, id, question, onText, signal }) {
  const ctx = await buildContext(scope, id)
  if (!ctx.villages) throw new Error('There is no data to analyse here yet.')
  const res = await send([firstMessage(ctx, scope, question)], onText, signal)
  return { title: ctx.title, stats: ctx.stats, ...res }
}

// A follow-up question. `history` is the live conversation from this visit; for a saved report
// (history gone) the conversation is rebuilt from its text with today's data.
export async function askFollowUp({ scope, id, turns, history, question, onText, signal }) {
  let messages = history
  if (!messages) {
    const ctx = await buildContext(scope, id)
    messages = []
    turns.forEach((turn, i) => {
      messages.push(i === 0 ? firstMessage(ctx, scope, turn.q) : { role: 'user', content: turn.q })
      messages.push({ role: 'assistant', content: turn.a })
    })
  }
  return send([...messages, { role: 'user', content: question.trim() }], onText, signal)
}

export function describeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use this model.'
  if (e instanceof Anthropic.RateLimitError) return 'Too many requests right now — wait a minute and try again.'
  if (e instanceof Anthropic.APIConnectionError) return 'No connection to Claude. Analysis needs internet.'
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status}). ${e.message}`
  return e?.message || String(e)
}
