// Importing contacts exported from the iPhone (a .vcf file). Everything here
// runs on the phone; only the contacts the user adds ever reach Supabase.
import { phoneDigits } from './phone.js'

// Undo vCard line folding and escaping.
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '')
}
function unescape(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()
}

// -> [{ name, phones: [..], org, note }]
export function parseVCards(text) {
  const cards = []
  let cur = null
  for (const raw of unfold(text).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VCARD') { cur = { fn: '', n: '', phones: [], org: '', note: '' }; continue }
    if (upper === 'END:VCARD') { if (cur) cards.push(cur); cur = null; continue }
    if (!cur) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    // "item1.TEL;type=CELL" -> "TEL"
    const key = line.slice(0, colon).split(';')[0].split('.').pop().toUpperCase()
    const value = line.slice(colon + 1)
    if (key === 'FN') cur.fn = unescape(value)
    else if (key === 'N') {
      const [last = '', first = '', middle = '', prefix = '', suffix = ''] = value.split(';').map(unescape)
      cur.n = [prefix, first, middle, last, suffix].filter(Boolean).join(' ')
    } else if (key === 'TEL') {
      const tel = unescape(value).replace(/^tel:/i, '')
      if (phoneDigits(tel).length >= 7 && !cur.phones.some(p => phoneDigits(p) === phoneDigits(tel))) cur.phones.push(tel)
    } else if (key === 'ORG') cur.org = unescape(value.split(';')[0])
    else if (key === 'NOTE') cur.note = unescape(value)
  }
  return cards
    .map(c => ({ name: (c.fn || c.n || c.org || '').replace(/\s+/g, ' ').trim(), phones: c.phones.slice(0, 3), org: c.org, note: c.note }))
    .filter(c => c.name && c.phones.length)
}

// ---------- Village suggestions ----------

const norm = s => ` ${(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim()} `
const compact = s => (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '')

// Ways a village might be written inside a contact's name: "Chak 41 SB",
// "41SB", "chak41sb". Very short plain words are skipped (too many false matches).
function variantsOf(village) {
  const base = norm(village.name).trim()
  const out = new Set([base])
  const noChak = base.replace(/^chak\s+/, '')
  if (noChak !== base) out.add(noChak)
  return [...out].filter(v => v.length >= 4 || /\d/.test(v))
}

export function buildMatcher(villages) {
  const list = villages
    .flatMap(v => variantsOf(v).map(variant => ({ village: v, variant, compact: compact(variant) })))
    .sort((a, b) => b.variant.length - a.variant.length)   // longest (most specific) first
  return function suggest(contact) {
    for (const field of [contact.name, contact.org, contact.note]) {
      if (!field) continue
      const text = norm(field)
      const tight = compact(field)
      const hit = list.find(x => text.includes(` ${x.variant} `) || (/\d/.test(x.compact) && x.compact.length >= 3 && tight.includes(x.compact)))
      if (hit) return { village: hit.village, fromName: field === contact.name }
    }
    return null
  }
}

// "Rana Asif Lilliani" / "Rana Asif (Chak 41 SB)" / "Kashif Bhabra wala" -> "Rana Asif", "Kashif"
export function nameWithoutVillage(name, village) {
  let out = name
  for (const v of variantsOf(village).sort((a, b) => b.length - a.length)) {
    // Any spacing or punctuation between the letters: "41sb" also matches "41 SB" and "41-sb".
    const loose = compact(v).split('').map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]*')
    const re = new RegExp(`(^|[^a-z0-9])(chak[^a-z0-9]*)?${loose}([^a-z0-9]*(wala|wale|wali|walay|vala))?(?=$|[^a-z0-9])`, 'i')
    if (re.test(out)) { out = out.replace(re, '$1'); break }
  }
  out = out.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/^[\s\-–,:/|]+|[\s\-–,:/|]+$/g, '').replace(/\s{2,}/g, ' ').trim()
  return out || name
}

// One key per number, however it was written: "0300-1234567", "+92 300 1234567"
// and "3001234567" all give "3001234567" (the last 10 digits).
export function numberKey(phone) {
  const d = phoneDigits(phone)
  return d.length >= 10 ? d.slice(-10) : d
}

export const nameKey = name => compact(name)

// ---------- A shared text message ("03007100764 rana Shahbaz") ----------

// Phone numbers as people write them: 0300-7100764, +92 300 7100764, 03007100764.
const NUMBER_RE = /(?:\+|00)?\d[\d\s\-().]{8,16}\d/g

// -> { name, phones: [..], villageId } for the first number in the message.
export function parseSharedText(text, villages) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const numbersIn = l => (l.match(NUMBER_RE) || []).map(n => n.trim()).filter(n => phoneDigits(n).length >= 10)
  const at = Math.max(0, lines.findIndex(l => numbersIn(l).length))
  const phones = numbersIn(lines[at] || '').slice(0, 3)
  const clean = l => l.replace(NUMBER_RE, ' ').replace(/^(contact|number|no\.?|name)( (no\.?|number))?( of)?\b/i, ' ')
    .replace(/[,:;|/\-–]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  // The name is on the number's line, or else on the line just before it.
  let name = clean(lines[at] || '') || clean(lines[at - 1] || '')
  // A village can be mentioned anywhere in the message.
  const suggest = buildMatcher(villages)
  const s = suggest({ name }) || suggest({ name: lines.join(' ') })
  if (s) name = nameWithoutVillage(name, s.village)
  // "rana shahbaz" -> "Rana Shahbaz" (words in capitals are left alone).
  name = name.replace(/(^|\s)([a-z])/g, (_, sp, ch) => sp + ch.toUpperCase())
  return { name, phones, villageId: s ? s.village.id : null }
}
