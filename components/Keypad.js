import { useMemo, useRef, useState } from 'react'
import { phoneDigits, phonesOf, telHref, waHref } from '../lib/phone'
import { recordAttempt } from '../lib/touch'
import { byName } from '../lib/domain'
import { cx } from './ui'
import { IconPhone, IconWhatsApp, IconUserPlus } from './Icons'
import k from '../styles/keypad.module.css'

// The Keypad tab (17 Nov): type a number; people in Halqa with that number (or
// part of it, 3+ digits) show above the keys. Tap one to open their card. Call
// and WhatsApp work for any number; a number not in Halqa can be added.
// Laid out like the iPhone's keypad (17 Nov): * 0 #, and holding 0 types +.
const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']]

const pretty = d => (/^0\d{10}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4)}` : d)

export function KeypadTab({ contacts, vById, sheets }) {
  const [num, setNum] = useState('')
  const digits = phoneDigits(num)
  const matches = useMemo(() => {
    if (digits.length < 3) return []
    return contacts.filter(c => phonesOf(c).some(p => phoneDigits(p).includes(digits))).sort(byName).slice(0, 30)
  }, [contacts, digits])
  const exact = matches.find(c => phonesOf(c).some(p => phoneDigits(p) === digits))
  const press = key => setNum(n => (n.length < 18 ? n + key : n))
  const back = () => setNum(n => n.slice(0, -1))
  // Hold 0 for +, like the iPhone.
  const hold = useRef(null)
  const zeroDown = () => { hold.current = setTimeout(() => { hold.current = 'plus'; setNum(n => (n.length < 18 ? n + '+' : n)) }, 450) }
  const zeroUp = () => { if (hold.current === 'plus') { hold.current = null; return } clearTimeout(hold.current); hold.current = null; press('0') }
  const call = () => { if (exact) recordAttempt(exact) }

  return (
    <div className={k.wrap}>
      <div className={k.display}>
        <div className={k.numRow}>
          <input className={k.number} value={pretty(num)} onChange={e => setNum(e.target.value.replace(/[^\d+*#]/g, ''))}
            inputMode="none" aria-label="Number" />
          {num && <button className={k.back} onClick={back} aria-label="Delete"><svg width="30" height="22" viewBox="0 0 30 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M9 1h18a2 2 0 012 2v16a2 2 0 01-2 2H9L1 11z" /><path d="M14 7l8 8M22 7l-8 8" strokeLinecap="round" /></svg></button>}
        </div>
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
          <button key={key} className={cx(k.key, (key === '*' || key === '#') && k.sym)} onContextMenu={e => e.preventDefault()} aria-label={key}
            {...(key === '0' ? { onPointerDown: zeroDown, onPointerUp: zeroUp, onPointerLeave: () => { clearTimeout(hold.current); hold.current = null } } : { onClick: () => press(key) })}>
            <span className={k.digit}>{key}</span>{letters && <span className={cx(k.letters, key === '0' && k.plusSign)}>{letters}</span>}
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
