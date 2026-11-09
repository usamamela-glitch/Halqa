// "Tell Halqa": Usama says or types something ("Riaz Gondal's walima is on
// Sunday night at Taj Greens; when I'm in Lahore I must meet the Chief
// Secretary"). Claude turns it into things to add: Planner events, list items,
// contacts, village notes, or an answer. Nothing is saved here: the screen
// shows what was understood and saves only when he taps Add.
import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'
import { getApiKey } from './analysis'
import { localDay } from './touch'
import { sortLists, sortEvents, addDays, tagFor, KINDS } from './events'
import { POLITICIAN } from './config'

const MODEL = 'claude-opus-5-5'

const str = { type: 'string' }
const SCHEMA = {
  type: 'object',
  properties: {
    reply: str,
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['event', 'list_item', 'contact', 'note'] },
          kind: { type: 'string', enum: KINDS.map(k => k.id) },
          function: str,
          title: str,
          details: str,
          village: str,
          venue: str,
          date: str,
          part: { type: 'string', enum: ['morning', 'afternoon', 'night', ''] },
          list: str,
          name: str,
          phone: str,
          question: str,
        },
        required: ['type', 'kind', 'function', 'title', 'details', 'village', 'venue', 'date', 'part', 'list', 'name', 'phone', 'question'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'actions'],
  additionalProperties: false,
}

async function context() {
  const today = localDay()
  const weekday = new Date(`${today}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
  const [lists, items, events, villages] = await Promise.all([
    db.planner_lists.toArray(), db.list_items.toArray(), db.events.toArray(), db.villages.toArray(),
  ])
  const listName = Object.fromEntries(lists.map(l => [l.id, l.name]))
  const soon = sortEvents(events.filter(e => e.status !== 'review' && e.day && e.day >= today && e.day <= addDays(today, 30)))
    .map(e => `- ${e.day} ${e.part || ''}: ${tagFor(e)}, ${e.title}${e.venue ? `, ${e.venue}` : ''}${e.village ? `, ${e.village}` : ''}`)
  const open = items.filter(i => !i.done_at)
    .map(i => `- [${listName[i.list_id] || '?'}] ${i.title}${i.details ? ` (${i.details})` : ''}${i.day ? `, ${i.day}` : ''}`)
  return { today, text: `Today is ${weekday} ${today} (Pakistan).

Planner lists: ${sortLists(lists).map(l => l.name).join(', ') || 'none yet'}

Planner, next 30 days:
${soon.join('\n') || '(nothing)'}

Open list items:
${open.join('\n') || '(none)'}

Villages in the constituency: ${villages.map(v => v.name).sort().join(', ')}` }
}

const INSTRUCTIONS = `You are the assistant inside Halqa, the constituency app of ${POLITICIAN}. He tells you things by voice (iPhone dictation, so expect odd spellings of Urdu names) or by typing, in English, Urdu or a mix. Turn what he says into actions. Nothing is saved until he confirms, so make your best reading and mark doubts in "question".

Action types (fill the fields that apply, empty strings for the rest):
- event: something on a date (or with a date to come): a wedding function, dinner, jalsa, meeting, meet-up. kind: wedding, dinner, jalsa, meeting, meetup or other. function: for weddings Mehndi, Baraat, Walima, Nikah, Rukhsati (or the word he used); for others a short label like Dinner. title: for weddings the groom's name, or "Son of X" / "Daughter of X" if only the father is named; otherwise who or what, briefly. village, venue as said. date: YYYY-MM-DD, worked out from today (e.g. "Sunday" is the coming Sunday); empty if none. part: morning, afternoon or night (weddings with no time: Mehndi night, others afternoon). details: anything else worth keeping.
- list_item: a to-do with no fixed date, usually tied to a place ("when I'm in Lahore", "in Islamabad"). list: the list's name, one of the existing lists if it fits (Islamabad, Lahore, Sargodha City, Halqa for things in the constituency), or a new short place name. title: who to meet or what to do, short. details: what about. date: only if he gave one.
- contact: a person to save, with a phone number. name, phone, village (an exact village name from the list if it matches), details: who he is.
- note: something to remember about a village. village: the exact village name from the list (or empty for a general note). details: the note, in his words, tidied.
Use "question" for anything you were unsure of, in a few words (e.g. "Groom's name?", "Which Sunday?").

If he asks a question (e.g. "what do I have on Saturday?", "what's on my Islamabad list?"), answer it in "reply" from the data below, briefly, and return no actions for it. Otherwise "reply" is one short line saying what you understood, or empty. Never invent facts that are not in what he said or in the data.`

export async function tellHalqa(said) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Add your Claude API key in Settings first.')
  const ctx = await context()
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: INSTRUCTIONS,
    messages: [{ role: 'user', content: `<halqa_data>\n${ctx.text}\n</halqa_data>\n\nHe said:\n${said.trim()}` }],
  })
  if (res.stop_reason === 'refusal') throw new Error('Claude could not handle this. Try saying it differently.')
  const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  const out = JSON.parse(text)
  const valid = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '')
  return {
    reply: (out.reply || '').trim(),
    actions: (out.actions || []).map((a, i) => ({ ...a, key: i, date: valid(a.date) })),
  }
}
