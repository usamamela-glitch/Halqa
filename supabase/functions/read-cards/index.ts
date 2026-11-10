// Halqa: read wedding cards and invitations shared from WhatsApp.
//
// The "Add to Halqa" iPhone Shortcut POSTs the shared images here (base64,
// separated by commas or newlines), with the header x-halqa-key. Claude reads
// every function on the cards; each one is saved in public.events with
// status 'review', and the card photo in the private event-cards bucket.
// Usama confirms or fixes them in Halqa's Planner.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   his Claude API key
//   HALQA_SHARE_KEY     the private code the Shortcut sends
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0'
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const MODEL = 'claude-opus-5-5'
const MAX_IMAGES = 10
const MAX_BYTES = 8 * 1024 * 1024

const SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['wedding', 'dinner', 'jalsa', 'meeting', 'meetup', 'other'] },
          function: { type: 'string' },
          title: { type: 'string' },
          village: { type: 'string' },
          venue: { type: 'string' },
          date: { type: 'string' },
          part: { type: 'string', enum: ['morning', 'afternoon', 'night'] },
          unsure: { type: 'boolean' },
          image_index: { type: 'integer' },
        },
        required: ['kind', 'function', 'title', 'village', 'venue', 'date', 'part', 'unsure', 'image_index'],
        additionalProperties: false,
      },
    },
  },
  required: ['events'],
  additionalProperties: false,
}

function instructions(today: string) {
  return `You read invitation cards sent to a Pakistani politician: mostly wedding cards (Urdu or English, printed; sometimes handwritten notes), sometimes invitations to dinners, jalsas, meetings or meet-ups. Several images may be pages of the same card. Today is ${today} (Pakistan).

Return one entry for every function the images invite him to, one per function per day.
- kind: wedding, dinner, jalsa, meeting, meetup or other.
- function: for weddings the function's name, e.g. Mehndi, Baraat, Walima, Nikah, Rukhsati, Sangeet, Dholki (use the card's own word if it's another). For other kinds, a short label (e.g. Dinner, Jalsa, Meeting).
- title: for weddings the groom's name in English letters (transliterate Urdu names, e.g. ملک رستم علی تھہیم → Malik Rustam Ali Thaheem). Two grooms: join with " & ". A daughter's wedding with no groom named: "Daughter of <father's name>". For other kinds: who or what it is, briefly.
- village: only if the card names a village or chak; "74 جنوبی" means Chak 74SB, "شمالی" means NB. Otherwise an empty string.
- venue: the hall or place and its town, short, in English letters (e.g. "Victoria Palace, Kanda Mor, Bhagtanwala"). Empty string if none.
- date: YYYY-MM-DD. If the year is missing, the next such date from today. If unreadable, an empty string.
- part: "afternoon" if the main time (baraat, lunch, reception) is before 5 PM, "night" if 5 PM or later, "morning" before noon only for non-wedding events. With no time printed, Mehndi is night, others afternoon.
- unsure: true if any field is a guess, unreadable, or a date was corrected by hand.
- image_index: the 0-based number of the image the function was read from.
If an image is not an invitation at all, return nothing for it.`
}

function mediaType(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png'
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp'
  return null
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const reply = (status: number, text: string) =>
  new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

Deno.serve(async req => {
  if (req.method !== 'POST') return reply(405, 'Send cards with the Add to Halqa Shortcut.')
  // Spaces or a line break around the code (easy to add when pasting) don't count.
  const key = (Deno.env.get('HALQA_SHARE_KEY') || '').trim()
  if (!key || (req.headers.get('x-halqa-key') || '').trim() !== key) return reply(401, 'Wrong Halqa code in the Shortcut.')
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return reply(500, 'Halqa has no Claude API key yet (Supabase secret ANTHROPIC_API_KEY).')

  // Images arrive as base64, separated by commas or line breaks (or as JSON {"images": [...]}).
  let raw = await req.text()
  try { const j = JSON.parse(raw); if (Array.isArray(j.images)) raw = j.images.join(',') } catch { /* plain text */ }
  // Images are separated by commas; line breaks inside an image's text are ignored. Without commas,
  // split where a new image starts (JPEG /9j/, PNG iVBOR, WebP UklGR, GIF R0lGOD).
  const chunks = raw.includes(',') ? raw.split(',') : raw.split(/\s+(?=\/9j\/|iVBOR|UklGR|R0lGOD)/)
  const parts = chunks.map(c => c.replace(/^\s*data:[^;]+;base64/, '').replace(/\s+/g, '')).filter(c => c.length > 200)
  if (!parts.length) return reply(400, 'No pictures received. Share the card images, not a link.')

  const images: { bytes: Uint8Array; type: string; b64: string }[] = []
  for (const b64 of parts.slice(0, MAX_IMAGES)) {
    let bytes: Uint8Array
    try { bytes = decode(b64) } catch { continue }
    const type = mediaType(bytes)
    if (!type || bytes.length > MAX_BYTES) continue
    images.push({ bytes, type, b64 })
  }
  if (!images.length) return reply(400, 'The pictures could not be opened. Try sharing them again.')

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const batchId = crypto.randomUUID()
  const paths = await Promise.all(images.map(async (img, i) => {
    const ext = img.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `${batchId}/${i + 1}.${ext}`
    const { error } = await supabase.storage.from('event-cards').upload(path, img.bytes, { contentType: img.type })
    return error ? null : path
  }))

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
  const client = new Anthropic({ apiKey })
  let found: any[] = []
  try {
    const res: any = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          ...images.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.b64 } })),
          { type: 'text', text: instructions(today) },
        ],
      }],
    } as any)
    if (res.stop_reason === 'refusal') return reply(200, 'Claude could not read these pictures. Add them in Halqa by hand.')
    const text = (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    found = JSON.parse(text).events || []
  } catch (e) {
    return reply(502, `Reading the cards failed: ${(e as Error).message.slice(0, 160)}`)
  }
  if (!found.length) return reply(200, 'No invitation found in these pictures.')

  const rows = found.map(ev => ({
    kind: ev.kind,
    function: ev.function || null,
    title: ev.title || '',
    village: ev.village || null,
    venue: ev.venue || null,
    day: /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? ev.date : null,
    part: ev.part,
    unsure: !!ev.unsure || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date),
    status: 'review',
    source: 'whatsapp',
    batch_id: batchId,
    image_path: paths[ev.image_index] ?? paths[0] ?? null,
  }))
  const { error } = await supabase.from('events').insert(rows)
  if (error) return reply(500, `Saving failed: ${error.message.slice(0, 160)}`)

  const n = rows.length
  return reply(200, `${n} function${n === 1 ? '' : 's'} found. Open Halqa → Planner to check ${n === 1 ? 'it' : 'them'}.`)
})
