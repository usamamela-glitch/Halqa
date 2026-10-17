// Read-only CardDAV server so Halqa contacts appear in iPhone Contacts (and so
// in Phone and WhatsApp caller ID). The iPhone adds it once under
// Settings → Contacts → Accounts → Other → CardDAV, and re-checks it every so
// often. Nothing is ever written back from the phone.
//
// Two logins, one shared password (HALQA_CONTACTS_PASSWORD on Vercel):
//   halqa-all — every contact (for colleagues)
//   halqa-new — only contacts added from NEW_SINCE on (Usama already has the
//               older ones saved on his iPhone)
import crypto from 'crypto'
import { formatTel, phonesOf, vEscape } from './phone.js'

export const NEW_SINCE = '2026-10-17T00:00:00Z'
export const USERS = { 'halqa-all': null, 'halqa-new': NEW_SINCE }
export const BASE = '/carddav'

// Style agreed with Usama: "Rana Asif - Lilliani". The whole label goes in
// the given-name field so iOS shows it exactly like that and sorts by its
// first word.
export function cardFor(c, villageName) {
  const label = villageName ? `${c.name.trim()} - ${villageName}` : c.name.trim()
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${c.id}`,
    `N:;${vEscape(label)};;;`,
    `FN:${vEscape(label)}`,
    ...phonesOf(c).map(p => `TEL;TYPE=CELL:${formatTel(p)}`),
    c.description ? `NOTE:${vEscape(c.description)}` : '',
    'CATEGORIES:Halqa',
    'END:VCARD',
  ].filter(Boolean).join('\r\n') + '\r\n'
}

const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)

// contacts + villages -> { cards: Map(id -> { vcard, etag }), ctag }
export function buildBook(contacts, villages, since) {
  const vName = new Map(villages.map(v => [v.id, v.name]))
  const cards = new Map()
  contacts
    .filter(c => c.name && c.name.trim() && (!since || (c.created_at && c.created_at >= since)))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .forEach(c => {
      const vcard = cardFor(c, vName.get(c.village_id))
      cards.set(c.id, { vcard, etag: `"${hash(vcard)}"` })
    })
  const ctag = hash([...cards].map(([id, x]) => id + x.etag).join('|'))
  return { cards, ctag }
}

// "Basic base64(user:pass)" -> user, if the password matches.
export function checkAuth(header, password) {
  if (!password || !header || !header.startsWith('Basic ')) return null
  const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':')
  const given = Buffer.from(rest.join(':'))
  const want = Buffer.from(password)
  if (!(user in USERS) || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null
  return user
}

const xmlEscape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function multistatus(responses) {
  return '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/">' +
    responses.join('') + '</d:multistatus>'
}

function response(href, props) {
  return `<d:response><d:href>${xmlEscape(href)}</d:href><d:propstat><d:prop>${props}</d:prop>` +
    '<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
}

const notFound = href => `<d:response><d:href>${xmlEscape(href)}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`

const READ_ONLY = '<d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>'

// Handles one request. `path` is the URL path, `load` returns
// { contacts, villages }. Returns { status, headers, body }.
export async function handle({ method, path, depth, body, auth, password, load }) {
  const dav = { DAV: '1, 3, addressbook', Allow: 'OPTIONS, GET, HEAD, PROPFIND, REPORT' }
  if (method === 'OPTIONS') return { status: 200, headers: dav, body: '' }

  if (!password) return { status: 503, headers: {}, body: 'Contacts password not set up yet.' }
  const user = checkAuth(auth, password)
  if (!user) return { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Halqa", charset="UTF-8"' }, body: 'Login needed' }

  const home = `${BASE}/${user}/`
  const book = `${home}book/`
  const p = path.endsWith('/') || path.endsWith('.vcf') ? path : path + '/'
  const xml = { 'Content-Type': 'application/xml; charset=utf-8', ...dav }

  if (!['PROPFIND', 'REPORT', 'GET', 'HEAD'].includes(method)) {
    return { status: 403, headers: dav, body: 'Halqa contacts are read-only. Edit them in the Halqa app.' }
  }

  const principalProps =
    `<d:current-user-principal><d:href>${home}</d:href></d:current-user-principal>` +
    `<d:principal-URL><d:href>${home}</d:href></d:principal-URL>` +
    `<card:addressbook-home-set><d:href>${home}</d:href></card:addressbook-home-set>`

  // Server root, or a stray path the phone probes while discovering.
  if (method === 'PROPFIND' && (p === '/' || p === `${BASE}/` || p === '/.well-known/carddav/')) {
    return { status: 207, headers: xml, body: multistatus([response(p, principalProps + '<d:resourcetype><d:collection/></d:resourcetype>')]) }
  }

  if (!p.startsWith(home)) return { status: 404, headers: {}, body: 'Not found' }

  const { contacts, villages } = await load()
  const { cards, ctag } = buildBook(contacts, villages, USERS[user])
  const bookProps =
    '<d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>' +
    '<d:displayname>Halqa</d:displayname>' +
    `<cs:getctag>${ctag}</cs:getctag>` + READ_ONLY +
    '<d:supported-report-set>' +
    '<d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report>' +
    '<d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report>' +
    '</d:supported-report-set>'
  const cardHref = id => `${book}${encodeURIComponent(id)}.vcf`
  const cardProps = (x, withData) =>
    `<d:getetag>${x.etag}</d:getetag><d:getcontenttype>text/vcard; charset=utf-8</d:getcontenttype><d:resourcetype/>` +
    (withData ? `<card:address-data>${xmlEscape(x.vcard)}</card:address-data>` : '')
  const idFromHref = href => {
    const m = decodeURIComponent(href).match(/\/book\/([^/]+)\.vcf$/)
    return m ? m[1] : null
  }

  if (method === 'PROPFIND') {
    if (p === home) {
      const list = [response(home, principalProps + '<d:resourcetype><d:collection/></d:resourcetype><d:displayname>Halqa</d:displayname>')]
      if (depth !== '0') list.push(response(book, bookProps))
      return { status: 207, headers: xml, body: multistatus(list) }
    }
    if (p === book) {
      const list = [response(book, bookProps)]
      if (depth !== '0') cards.forEach((x, id) => list.push(response(cardHref(id), cardProps(x, false))))
      return { status: 207, headers: xml, body: multistatus(list) }
    }
    const id = idFromHref(p)
    const x = id && cards.get(id)
    return x ? { status: 207, headers: xml, body: multistatus([response(cardHref(id), cardProps(x, false))]) } : { status: 404, headers: {}, body: 'Not found' }
  }

  if (method === 'REPORT') {
    if (p !== book) return { status: 404, headers: {}, body: 'Not found' }
    const text = String(body || '')
    if (/addressbook-multiget/.test(text)) {
      const hrefs = [...text.matchAll(/<(?:[\w-]+:)?href>([^<]+)<\/(?:[\w-]+:)?href>/g)].map(m => m[1].trim())
      return {
        status: 207, headers: xml,
        body: multistatus(hrefs.map(h => {
          const id = idFromHref(h)
          const x = id && cards.get(id)
          return x ? response(h, cardProps(x, true)) : notFound(h)
        })),
      }
    }
    // addressbook-query (or anything else): send everything.
    const list = []
    cards.forEach((x, id) => list.push(response(cardHref(id), cardProps(x, true))))
    return { status: 207, headers: xml, body: multistatus(list) }
  }

  // GET / HEAD
  const id = idFromHref(p)
  const x = id && cards.get(id)
  if (!x) return { status: 404, headers: {}, body: 'Not found' }
  return { status: 200, headers: { 'Content-Type': 'text/vcard; charset=utf-8', ETag: x.etag }, body: method === 'HEAD' ? '' : x.vcard }
}
