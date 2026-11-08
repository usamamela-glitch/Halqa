// Search that forgives how a name is remembered. Every word typed has to
// appear somewhere (in any order), so "aftab jah" and "aftab khanana" both
// find "Aftab Haider Jahankhanana". Spaces don't matter either:
// "jahan khanana" finds "Jahankhanana" and the other way round.
// Loose mode (used only when nothing matches exactly) also accepts spelling
// variants by comparing consonants: Haider/Hyder, Waseem/Wasim, Muhammad/Mohammed.

const clean = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export const queryWords = q => clean(q).split(' ').filter(Boolean)

// Consonants only, doubles collapsed: Muhammad/Mohammad/Muhammed -> mhmd, Haider/Hyder -> hdr.
const skeleton = w => w.replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1')

// Does every word appear in the given text(s)?
export function matchesWords(words, texts, loose = false) {
  if (!words.length) return true
  const text = clean([].concat(texts).join(' '))
  const joined = text.replace(/ /g, '')
  const parts = loose ? text.split(' ').map(skeleton) : []
  return words.every(w => {
    if (text.includes(w) || joined.includes(w)) return true
    if (!loose || w.length < 3) return false
    // A spelling variant must look like the start of one whole word.
    const ws = skeleton(w)
    return ws.length >= 3 && parts.some(p => p.startsWith(ws))
  })
}

// Sort order for results: name starting with the first word, then all words
// in the name itself, then everything else (matched in village or description).
export function nameRank(words, name) {
  const n = clean(name)
  if (words.length && n.startsWith(words[0])) return 0
  return matchesWords(words, name) ? 1 : 2
}
