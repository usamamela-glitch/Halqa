// "Tell Halqa": Usama says or types something ("Riaz Gondal's walima is on
// Sunday night at Taj Greens; when I'm in Lahore I must meet the Chief
// Secretary"). Claude turns it into things to add: Planner events, list items,
// contacts, village notes, or an answer, or changes anything already in Halqa
// (see components/tellPlans.js). Nothing is saved here: the screen
// shows what was understood and saves only when he taps Add.
import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'
import { getApiKey } from './analysis'
import { localDay } from './touch'
import { sortLists, sortEvents, addDays, tagFor, whenLabel, KINDS } from './events'
import { POLITICIAN } from './config'
import { TAGS } from './domain'
import { ROAD_TYPES, categoryOf, serialLabel, roadTypeLabel, allCategories, getExtraCategories } from './works'

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
          type: { type: 'string', enum: ['event', 'event_update', 'list_item', 'list_item_update', 'list_update', 'contact', 'contact_update', 'note', 'note_update', 'project', 'project_update', 'village_update', 'qanungo_update'] },
          field: { type: 'string', enum: ['our_group', 'anti_group', 'development', 'result_2018', 'result_2024', 'population', 'registered_voters', ''] },
          old_value: str,
          qanungo: str,
          ref: str,
          category: str,
          road_type: { type: 'string', enum: [...ROAD_TYPES.map(r => r.id), ''] },
          villages: { type: 'array', items: str },
          people: { type: 'array', items: str },
          self_identified: { type: 'boolean' },
          serial: str,
          change: { type: 'string', enum: ['done', 'not_done', 'pin', 'unpin', 'add_people', 'add_villages', 'set_road_type', 'move', 'add_description', 'replace_description', 'add_phone', 'add_tags', 'set_village', 'rename', 'add_details', 'replace_details', 'set_date', 'set_time', 'set_venue', 'delete', 'in_touch', 'hide_daily', 'show_daily', 'remove_phone', 'replace_phone', 'remove_tags', 'set_kind', 'approve', 'discard', 'remove_people', 'remove_villages', 'create', 'set_value', 'set_qanungo', ''] },
          tags: { type: 'array', items: { type: 'string', enum: TAGS } },
          new_name: str,
          new_village: str,
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
        required: ['type', 'ref', 'kind', 'function', 'title', 'details', 'village', 'venue', 'date', 'part', 'time', 'list', 'name', 'phone', 'question', 'category', 'road_type', 'villages', 'people', 'self_identified', 'serial', 'change', 'tags', 'new_name', 'new_village', 'field', 'old_value', 'qanungo'],
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
  const [lists, items, events, villages, works, contacts, extraCats, qanungos] = await Promise.all([
    db.planner_lists.toArray(), db.list_items.toArray(), db.events.toArray(), db.villages.toArray(), db.works.toArray(), db.contacts.toArray(), getExtraCategories(), db.qanungos.toArray(),
  ])
  const cats = allCategories(works, extraCats)
  const ownCats = cats.filter(c => c.custom)
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
  // Each event and open list item gets a short reference (E1, L1…) so Claude
  // can say exactly which one to change; refs maps them back to ids.
  const refs = {}
  const clip = (x, n) => (x || '').replace(/\s+/g, ' ').trim().slice(0, n)
  const evLine = (e, n) => {
    refs[`E${n}`] = e.id
    return `- E${n} · ${e.day || 'no date'} ${whenLabel(e)}: ${tagFor(e)}, ${e.title}${e.venue ? `, ${e.venue}` : ''}${e.village ? `, ${e.village}` : ''}${e.pinned ? ' · pinned' : ''}${e.notes ? ` · note: ${clip(e.notes, 160)}` : ''}`
  }
  const soonEv = sortEvents(events.filter(e => e.status !== 'review' && e.day && e.day >= today && e.day <= addDays(today, 90)))
  const soon = soonEv.map((e, i) => evLine(e, i + 1))
  const reviewEv = sortEvents(events.filter(e => e.status === 'review'))
  const cardNo = {}
  const review = reviewEv.map((e, i) => {
    const b = e.batch_id || e.id
    cardNo[b] ||= Object.keys(cardNo).length + 1
    return `${evLine(e, soonEv.length + i + 1)} · card ${cardNo[b]}`
  })
  const doneCut = new Date(Date.now() - 30 * 864e5).toISOString()
  const open = items.filter(i => !i.done_at || i.done_at > doneCut)
    .map((i, n) => {
      refs[`L${n + 1}`] = i.id
      return `- L${n + 1} · [${listName[i.list_id] || '?'}] ${i.title}${i.details ? ` (${clip(i.details, 160)})` : ''}${i.day ? `, ${i.day}` : ''}${i.pinned ? ' · pinned' : ''}${i.done_at ? ' · DONE' : ''}`
    })
  const qName = Object.fromEntries(qanungos.map(q => [q.id, q.name]))
  const byQ = {}
  for (const v of villages) (byQ[qName[v.qanungo_id] || 'No qanungo'] ||= []).push(v.name + (v.pinned ? ' (pinned)' : ''))
  return { today, cats, refs, text: `Today is ${weekday} ${today} (Pakistan).

Planner lists: ${sortLists(lists).map(l => l.name).join(', ') || 'none yet'}

Planner events, next 90 days (E numbers are for event_update):
${soon.join('\n') || '(nothing)'}

WhatsApp cards waiting for review (same card number = one card):
${review.join('\n') || '(none)'}

List items, open and done in the last 30 days (L numbers are for list_item_update):
${open.join('\n') || '(none)'}

Project categories: ${cats.map(c => c.id).join(', ')}${ownCats.length ? ` (his own lists: ${ownCats.map(c => c.id).join(', ')})` : ''}

Projects (open, and done in the last 30 days). Numbers: ${cats.map(c => `${c.prefix} ${c.label.toLowerCase()}`).join(', ')}:
${projects.join('\n') || '(none)'}

Villages in the constituency, by qanungo:
${Object.keys(byQ).sort().map(q => `- ${q}: ${byQ[q].sort().join(', ')}`).join('\n')}` }
}

const INSTRUCTIONS = `You are the assistant inside Halqa, the constituency app of ${POLITICIAN}. He tells you things by voice (iPhone dictation, so expect odd spellings of Urdu names) or by typing, in English, Urdu or a mix. Turn what he says into actions. Nothing is saved until he confirms, so make your best reading and mark doubts in "question".

Action types (fill the fields that apply, empty strings for the rest):
- event: something on a date (or with a date to come): a wedding function, dinner, jalsa, meeting, meet-up. kind: wedding, dinner, jalsa, meeting, meetup or other. function: for weddings Mehndi, Baraat, Walima, Nikah, Rukhsati (or the word he used); for others a short label like Dinner. title: for weddings the groom's name, or "Son of X" / "Daughter of X" if only the father is named; otherwise who or what, briefly. village, venue as said. date: YYYY-MM-DD, worked out from today (e.g. "Sunday" is the coming Sunday); empty if none. part: morning, afternoon or night (weddings with no time: Mehndi night, others afternoon). time: for events that are not weddings, the exact time if he said one, as HH:MM in 24 hours (e.g. 16:30); empty for weddings or if no time was said. details: anything else worth keeping.
- list_item: a to-do with no fixed date, usually tied to a place ("when I'm in Lahore", "in Islamabad"). list: the list's name, one of the existing lists if it fits (Islamabad, Lahore, Sargodha City, Halqa for things in the constituency), or a new short place name. title: who to meet or what to do, short. details: what about. date: only if he gave one.
- contact: a person to save, with a phone number. name, phone, village (an exact village name from the list if it matches), details: who he is.
- project: a new item for the Projects section: a road, job request, electricity, gas, health or education matter, or other. category: one of the project categories in the data (roads, jobs, electricity, gas, health, education, other, or one of his own lists, written exactly as listed). road_type (roads only): main (a big road), link (a rural link or farm-to-market road), small (a small street or soling), or empty if not said. title: the project's text, as he'd write it (use the name he gives it, e.g. "Kotla Panah to Mela road"). details: anything else he said about it. villages: exact village names from the list it is for (several allowed). people: the names of people who asked for it, as he said them (several allowed); they are matched to his contacts afterwards. self_identified: true if he says it's his own idea.
- project_update: a change to an existing project, named by its number (e.g. "R-17", "J-4"). serial: the number as written, e.g. R-17. change: done, not_done, pin, unpin, add_people (people: names to add), add_villages (villages: names to add), set_road_type (road_type), move (category: the new category), or add_details (details: text to add to its description).
- contact_update: a change to someone ALREADY in his contacts (not a new person). name: the person as he named them (with any place he used to say which one). village: the village if he mentioned it, to tell people with the same name apart. One action per change; change is one of:
  - add_description: details = the new sentence(s) to add to their description, in his words, tidied (keep what's there; this is added after it).
  - replace_description: only if he says to replace or rewrite it. details = the whole new description.
  - add_phone: phone = the number to add.
  - add_tags: tags = tags to add, from: ${TAGS.join(', ')}.
  - pin / unpin: put them in or take them out of Main Groups.
  - set_village: new_village = the exact village name from the list they now belong to.
  - rename: new_name = the new name as he wants it written.
  - in_touch: he met or spoke to them today (marks them "in touch today").
  - hide_daily / show_daily: take them out of, or put them back in, the daily Today list.
  - remove_phone: phone = the number to remove. replace_phone: old_value = the number to replace, phone = the new one.
  - remove_tags: tags = the tags to take off.
  - delete: only if he clearly says to delete or remove the person from Halqa.
  Use contact (not contact_update) only for a new person with a phone number.
- event_update: a change to an event ALREADY in the Planner (listed in the data with an E number). ref: its E number, e.g. E4. One action per change; change is one of:
  - add_details: details = what to add to its note, in his words, tidied (added after what's there).
  - replace_details: only if he says to replace or rewrite the note. details = the whole new note.
  - set_date: date = the new date (YYYY-MM-DD).
  - set_time: time = the new exact time (HH:MM, 24 hours) if he gave one, else part = morning, afternoon or night.
  - set_venue: venue = the new venue.
  - rename: new_name = the new title.
  - pin / unpin.
  - delete: only if he clearly says it is cancelled or to remove it.
  - set_kind: kind (and function) = what it should be, e.g. a Walima instead of a Baraat.
  - set_village: village = the village it's in (an exact name from the list if it is one).
  - approve / discard: for events listed under WhatsApp cards waiting for review. approve adds the whole card to the Planner; discard throws the whole card away. One action per card is enough.
  If he means an event that isn't in the list, say so in "reply" and don't guess.
- list_item_update: a change to a list item ALREADY in the Planner (listed with an L number). ref: its L number, e.g. L7. change is one of: add_details, replace_details (details as for events), set_date (date), done (he did it / tick it off), not_done (un-tick a DONE one), move (list = the list to move it to), rename (new_name), pin, unpin, delete.
- project_update can also be: add_details (details = text to add to its description), replace_details (details = the whole new description; only if he says to rewrite it), remove_people (people: names to take off), remove_villages (villages: names to take off), delete (only if he clearly says to delete it).
- Use event or list_item (new) only for something new; to change something already there, use the _update types.
- note: something to remember about a village. village: the exact village name from the list (or empty for a general note). details: the note, in his words, tidied.
- note_update: a change to a note ALREADY written. village: the village whose note it is (empty for a general Planner note). old_value: a few words from that note or what it's about, to find it. change: add_details (details = text to add at the end), replace_details (details = the whole new note), or delete.
- list_update: Planner lists themselves. list: the existing list's name. change: create (new_name = the new list's name; list empty), rename (new_name), or delete (the list and everything on it).
- village_update: a village's own page. village: the exact village name from the list. change is one of:
  - add_details / replace_details with field = our_group (who is with us there), anti_group (the opposition), or development (development notes); details = the text.
  - set_value with field = result_2018, result_2024, population or registered_voters; details = the new value as he said it.
  - pin / unpin; rename (new_name); set_qanungo (qanungo = the qanungo to move it to).
  - create: a new village. new_name = its name, qanungo = which qanungo it's under. village empty.
  - delete: only if he clearly says to delete the village (its contacts and notes go too).
- qanungo_update: qanungos. qanungo: the existing one's name. change: create (new_name; qanungo empty), rename (new_name), or delete (its villages stay, without a qanungo).
- Things only his hands can do (photos, calling, sharing, saving to the iPhone) can't be done here: say so briefly in "reply".
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
  // A category must be one that exists (matched without caring about case); otherwise Other.
  const category = c => (!c ? '' : (ctx.cats.find(x => x.id.toLowerCase() === c.trim().toLowerCase() || x.label.toLowerCase() === c.trim().toLowerCase()) || { id: 'other' }).id)
  return {
    reply: (out.reply || '').trim(),
    actions: (out.actions || []).map((a, i) => ({ ...a, target_id: ctx.refs[(a.ref || '').trim().toUpperCase()] || null, category: category(a.category), villages: a.villages || [], people: a.people || [], key: i, date: valid(a.date), time: (a.kind !== 'wedding' || a.type === 'event_update') && /^\d{2}:\d{2}$/.test(a.time || '') ? a.time : '' })),
  }
}
