import { useMemo, useState } from 'react'
import { phoneDigits, phonesOf, telHref, waHref } from '../lib/phone'
import { recordAttempt } from '../lib/touch'
import { byName } from '../lib/domain'
import { cx } from './ui'
import { IconPhone, IconWhatsApp, IconUserPlus } from './Icons'
import k from '../styles/keypad.module.css'

// The Keypad tab (17 Nov): type a number; people in Halqa with that number (or
// part of it, 3+ digits) show above the keys. Tap one to open their card. Call
// and WhatsApp work for any number; a number not in Halqa can be added.
const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['+', ''], ['0', ''], ['⌫', '']]

const pretty = d => (/^0\d{10}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4)}` : d)

export function KeypadTab({ contacts, vById, sheets }) {
  const [num, setNum] = useState('')
  const digits = phoneDigits(num)
  const matches = useMemo(() => {
    if (digits.length < 3) return []
    return contacts.filter(c => phonesOf(c).some(p => phoneDigits(p).includes(digits))).sort(byName).slice(0, 30)
  }, [contacts, digits])
  const exact = matches.find(c => phonesOf(c).some(p => phoneDigits(p) === digits))
  const press = key => {
    if (key === '⌫') setNum(n => n.slice(0, -1))
    else if (key === '+') setNum(n => (n ? n : '+'))
    else setNum(n => (n.length < 16 ? n + key : n))
  }
  const call = () => { if (exact) recordAttempt(exact) }

  return (
    <div className={k.wrap}>
      <div className={k.display}>
        <input className={k.number} value={pretty(num)} onChange={e => setNum(e.target.value.replace(/[^\d+]/g, ''))}
          inputMode="none" placeholder="Enter a number" aria-label="Number" />
        {exact && <div className={k.who}>{exact.name}{vById[exact.village_id] ? ` · ${vById[exact.village_id].name}` : ''}</div>}
      </div>

      <div className={k.matchArea}>
      {matches.length > 0 && (
        <div className={k.matches}>
          {matches.map(c => (
            <button key={c.id} className={k.match} onClick={() => sheets.open(c.id)}>
              <span className={k.mName}>{c.name}</span>
              <span className={k.mSub}>{vById[c.village_id]?.name || 'Unknown village'} · {phonesOf(c).find(p => phoneDigits(p).includes(digits))}</span>
            </button>
          ))}
        </div>
      )}
      {digits.length >= 10 && !matches.length && (
        <button className={k.addNew} onClick={() => sheets.quickAdd({ phone: num })}><IconUserPlus size={18} />Not in Halqa · Add</button>
      )}
      </div>

      <div className={k.pad}>
        {KEYS.map(([key, letters]) => (
          <button key={key} className={cx(k.key, key === '⌫' && k.del, key === '+' && k.plus)} onClick={() => press(key)}
            onContextMenu={e => e.preventDefault()} aria-label={key === '⌫' ? 'Delete' : key}>
            <span className={k.digit}>{key}</span>{letters && <span className={k.letters}>{letters}</span>}
          </button>
        ))}
      </div>

      <div className={k.actions}>
        <a className={cx(k.act, k.wa, digits.length < 10 && k.off)} href={digits.length >= 10 ? waHref(num) : undefined} onClick={call} target="_blank" rel="noreferrer" aria-label="WhatsApp"><IconWhatsApp size={24} /></a>
        <a className={cx(k.act, k.call, digits.length < 2 && k.off)} href={digits.length >= 2 ? telHref(num) : undefined} onClick={call} aria-label="Call"><IconPhone size={28} /></a>
        <button className={cx(k.act, k.clear, !num && k.off)} onClick={() => setNum('')} aria-label="Clear">Clear</button>
      </div>
    </div>
  )
}
