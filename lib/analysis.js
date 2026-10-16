import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'
import { plainText } from './images'
import { daysSince } from './domain'

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

const SYSTEM = `You are a political strategist advising Usama Mela, Member of the National Assembly for NA-83 Sargodha-II, Punjab, Pakistan. The constituency is rural and organised by Qanungo (revenue circle) → village → people.

You receive his private field data: election results (free text as he wrote them), population and registered voters, his notes on the allied group ("our group") and the opposition group in each village, development demands and schemes, the people he knows (with his descriptions, tags, whether he pinned them as key people, and how long since he last contacted them), and his own notes. His own notes and descriptions are the most valuable part — read them closely.

Write the report in clear English for a busy politician reading on a phone. Use Markdown headings and short bullet points. For each area analysed give:
1. Factual summary — vote history, group dynamics, key people, development status.
2. Strategic recommendation — who to prioritise, which issues to address, a risk level (Low / Medium / High) with the reason, and concrete next steps.

Be specific: name the villages and people from the data. Say plainly where the data is thin or missing instead of guessing, and list what he should find out next.`

function villageBlock(v, contacts, notes) {
  const lines = [`### Village: ${v.name}`]
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
        d === null ? null : `last contacted ${d} day(s) ago`,
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

  let chosen = villages
  let title = 'Whole constituency'
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
      parts.push(villageBlock(v, byVillage(contacts, v.id), byVillage(notes, v.id)))
    })
  })
  if (scope === 'all') {
    const g = general.map(n => plainText(n.body).trim()).filter(Boolean)
    if (g.length) parts.push(`## General notes\n${g.map(t => `- ${t.replace(/\n/g, ' ')}`).join('\n')}`)
  }
  return { title, villages: chosen.length, text: parts.join('\n\n') }
}

function instruction(scope, title, villageCount) {
  if (scope === 'village') return `Analyse the village ${title}.`
  if (scope === 'qanungo') return `Analyse ${title} (${villageCount} villages). Start with an overview of the Qanungo, then go village by village, and end with the top priorities across the Qanungo.`
  return `Analyse the whole constituency (${villageCount} villages). Start with an overall picture and the biggest risks, then a section per Qanungo with a short village-by-village assessment, and end with a ranked list of the 10 most important actions for the next election.`
}

// Streams the report. onText(fullTextSoFar) is called as text arrives.
export async function runAnalysis({ scope, id, onText, signal }) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Add your Claude API key in Settings first.')
  const ctx = await buildContext(scope, id)
  if (!ctx.villages) throw new Error('There is no data to analyse here yet.')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `<constituency_data>\n${ctx.text}\n</constituency_data>\n\n${instruction(scope, ctx.title, ctx.villages)}`,
    }],
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
    throw new Error('Claude declined to produce this report. Try a narrower analysis (a single village or Qanungo).')
  }
  if (final.stop_reason === 'max_tokens') {
    text += '\n\n_(Report reached its length limit — try a Qanungo-level analysis for more detail.)_'
    onText(text)
  }
  return { title: ctx.title, text }
}

export function describeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use this model.'
  if (e instanceof Anthropic.RateLimitError) return 'Too many requests right now — wait a minute and try again.'
  if (e instanceof Anthropic.APIConnectionError) return 'No connection to Claude. Analysis needs internet.'
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status}). ${e.message}`
  return e?.message || String(e)
}
