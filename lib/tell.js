// "Tell Halqa": Usama says or types something ("Riaz Gondal's walima is on
// Sunday night at Taj Greens; when I'm in Lahore I must meet the Chief
// Secretary"). Claude turns it into things to add: Planner events, list items,
// contacts, village notes, or an answer. Nothing is saved here: the screen
// shows what was understood and saves only when he taps Add.
import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'
import { getApiKey } from './analysis'
import { localDay } from './touch'
import { sortLists, sortEvents, addDays, tagFor, whenLabel, KINDS } from './events'
import { POLITICIAN } from './config'
import { WORK_CATEGORIES, ROAD_TYPES, categoryOf, serialLabel, roadTypeLabel } from './works'

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
          type: { type: 'string', enum: ['event', 'list_item', 'contact', 'note', 'project', 'project_update'] },
          category: { type: 'string', enum: [...WORK_CATEGORIES.map(c => c.id), ''] },
          road_type: { type: 'string', enum: [...ROAD_TYPES.map(r => r.id), ''] },
          villages: { type: 'array', items: str },
          people: { type: 'array', items: str },
          self_identified: { type: 'boolean' },
          serial: str,
          change: { type: 'string', enum: ['done', 'not_done', 'pin', 'unpin', 'add_people', 'add_villages', 'set_road_type', 'move', ''] },
          kind: { type: 'string', enum: KINDS.map(k => k.id) },
          function: str,
          title: str,
          details: str,
          village: str,
          venue: str,
          date: str,
          part: { type: 'string', enum: ['morning', 'afternoon', 'night', ''] },
          time: str,
          list: str,
          name: str,
          phone: str,
          question: str,
        },
        required: ['type', 'kind', 'function', 'title', 'details', 'village', 'venue', 'date', 'part', 'time', 'list', 'name', 'phone', 'question', 'category', 'road_type', 'villages', 'people', 'self_identified', 'serial', 'change'],
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
  const [lists, items, events, villages, works, contacts] = await Promise.all([
    db.planner_lists.toArray(), db.list_items.toArray(), db.events.toArray(), db.villages.toArray(), db.works.toArray(), db.contacts.toArray(),
  ])
  const vName = Object.fromEntries(villages.map(v => [v.id, v.name]))
  const cName = Object.fromEntries(contacts.map(c => [c.id, c.name]))
  const recentCut = new Date(Date.now() - 30 * 864e5).toISOString()
  const projects = works.filter(w => !w.done_at || w.done_at > recentCut)
    .sort((a, b) => (categoryOf(a)).localeCompare(categoryOf(b)) || (a.serial || 0) - (b.serial || 0))
    .map(w => {
      const bits = [
        serialLabel(w) || '(no number)', `[${categoryOf(w)}${w.road_type ? `, ${roadTypeLabel(w.road_type).toLowerCase()}` : ''}]`,
        w.done_at ? `DONE ${w.done_at.slice(0, 10)}` : 'open', w.pinned ? 'pinned' : '',
        (w.village_ids || []).length ? `villages: ${w.village_ids.map(id => vName[id]).filter(Boolean).join(', ')}` : '',
        (w.contact_ids || []).length ? `asked by: ${w.contact_ids.map(id => cName[id]).filter(Boolean).join(', ')}` : '',
        w.self_identified ? 'self identified' : '',
      ].filter(Boolean)
      return `- ${bits.join(' · ')}: ${(w.body || '').replace(/\s+/g, ' ').slice(0, 140)}`
    })
  const listName = Object.fromEntries(lists.map(l => [l.id, l.name]))
  const soon = sortEvents(events.filter(e => e.status !== 'review' && e.day && e.day >= today && e.day <= addDays(today, 30)))
    .map(e => `- ${e.day} ${whenLabel(e)}: ${tagFor(e)}, ${e.title}${e.venue ? `, ${e.venue}` : ''}${e.village ? `, ${e.village}` : ''}`)
  const open = items.filter(i => !i.done_at)
    .map(i => `- [${listName[i.list_id] || '?'}] ${i.title}${i.details ? ` (${i.details})` : ''}${i.day ? `, ${i.day}` : ''}`)
  return { today, text: `Today is ${weekday} ${today} (Pakistan).

Planner lists: ${sortLists(lists).map(l => l.name).join(', ') || 'none yet'}

Planner, next 30 days:
${soon.join('\n') || '(nothing)'}

Open list items:
${open.join('\n') || '(none)'}

Projects (open, and done in the last 30 days). Numbers: R roads, J jobs, E electricity, G gas, H health, Ed education, O other:
${projects.join('\n') || '(none)'}

Villages in the constituency: ${villages.map(v => v.name).sort().join(', ')}` }
}

const INSTRUCTIONS = `You are the assistant inside Halqa, the constituency app of ${POLITICIAN}. He tells you things by voice (iPhone dictation, so expect odd spellings of Urdu names) or by typing, in English, Urdu or a mix. Turn what he says into actions. Nothing is saved until he confirms, so make your best reading and mark doubts in "question".

Action types (fill the fields that apply, empty strings for the rest):
- event: something on a date (or with a date to come): a wedding function, dinner, jalsa, meeting, meet-up. kind: wedding, dinner, jalsa, meeting, meetup or other. function: for weddings Mehndi, Baraat, Walima, Nikah, Rukhsati (or the word he used); for others a short label like Dinner. title: for weddings the groom's name, or "Son of X" / "Daughter of X" if only the father is named; otherwise who or what, briefly. village, venue as said. date: YYYY-MM-DD, worked out from today (e.g. "Sunday" is the coming Sunday); empty if none. part: morning, afternoon or night (weddings with no time: Mehndi night, others afternoon). time: for events that are not weddings, the exact time if he said one, as HH:MM in 24 hours (e.g. 16:30); empty for weddings or if no time was said. details: anything else worth keeping.
- list_item: a to-do with no fixed date, usually tied to a place ("when I'm in Lahore", "in Islamabad"). list: the list's name, one of the existing lists if it fits (Islamabad, Lahore, Sargodha City, Halqa for things in the constituency), or a new short place name. title: who to meet or what to do, short. details: what about. date: only if he gave one.
- contact: a person to save, with a phone number. name, phone, village (an exact village name from the list if it matches), details: who he is.
- project: a new item for the Projects section: a road, job request, electricity, gas, health or education matter, or other. category: roads, jobs, electricity, gas, health, education or other. road_type (roads only): main (a big road), link (a rural link or farm-to-market road), small (a small street or soling), or empty if not said. title: the project's text, as he'd write it (use the name he gives it, e.g. "Kotla Panah to Mela road"). details: anything else he said about it. villages: exact village names from the list it is for (several allowed). people: the names of people who asked for it, as he said them (several allowed); they are matched to his contacts afterwards. self_identified: true if he says it's his own idea.
- project_update: a change to an existing project, named by its number (e.g. "R-17", "J-4"). serial: the number as written, e.g. R-17. change: done, not_done, pin, unpin, add_people (people: names to add), add_villages (villages: names to add), set_road_type (road_type), or move (category: the new category).
- note: something to remember about a village. village: the exact village name from the list (or empty for a general note). details: the note, in his words, tidied.
Use "question" for anything you were unsure of, in a few words (e.g. "Groom's name?", "Which Sunday?").

For fields that don't apply use empty strings, empty arrays, and false.

If he asks a question (e.g. "what do I have on Saturday?", "what's on my Islamabad list?", "what's pending in Bhabra?", "what has Abid Rawalia asked for?", "which link roads are open?"), answer it in "reply" from the data below, briefly, and return no actions for it. Otherwise "reply" is one short line saying what you understood, or empty. Never invent facts that are not in what he said or in the data.`

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
    actions: (out.actions || []).map((a, i) => ({ ...a, villages: a.villages || [], people: a.people || [], key: i, date: valid(a.date), time: a.kind !== 'wedding' && /^\d{2}:\d{2}$/.test(a.time || '') ? a.time : '' })),
  }
}
