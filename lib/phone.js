// Pakistani numbers: 0300-1234567 -> +923001234567
export function formatTel(phone) {
  if (!phone) return null
  let n = phone.replace(/[^\d+]/g, '')
  if (n.startsWith('+')) return n
  if (n.startsWith('0092')) return '+' + n.slice(2)
  if (n.startsWith('92') && n.length === 12) return '+' + n
  if (n.startsWith('0')) return '+92' + n.slice(1)
  if (n.length === 10 && n.startsWith('3')) return '+92' + n
  return n
}

export function telHref(phone) {
  const n = formatTel(phone)
  return n ? `tel:${n}` : null
}

export function waHref(phone) {
  const n = formatTel(phone)
  return n ? `https://wa.me/${n.replace('+', '')}` : null
}

// Digits only, with +92 folded to a leading 0, so any written form matches.
export function phoneDigits(phone) {
  let d = (phone || '').replace(/\D/g, '')
  if (d.startsWith('0092')) d = '0' + d.slice(4)
  else if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2)
  return d
}

export function phonesOf(c) {
  return [c.phone, c.phone2, c.phone3].filter(p => p && p.trim())
}

function vEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;')
}

// FN and N are both required for iOS to pre-fill the name reliably.
export function vCard(c, villageName) {
  const parts = c.name.trim().split(/\s+/)
  const last = parts.length > 1 ? parts[parts.length - 1] : ''
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0]
  const note = [c.description, villageName ? `Village: ${villageName}` : ''].filter(Boolean).join(' — ')
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${vEscape(last)};${vEscape(first)};;;`,
    `FN:${vEscape(c.name.trim())}`,
    ...phonesOf(c).map(p => `TEL;TYPE=CELL:${formatTel(p)}`),
    note ? `NOTE:${vEscape(note)}` : '',
    'END:VCARD',
  ].filter(Boolean).join('\r\n')
}

export function downloadVCard(c, villageName) {
  const blob = new Blob([vCard(c, villageName)], { type: 'text/vcard' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${c.name.trim().replace(/[\\/:*?"<>|]/g, '')}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
