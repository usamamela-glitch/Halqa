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
  // ⌫ at the bottom right, like the iPhone: tap deletes the last digit, hold clears the number.
  const delHold = useRef(null)
  const delDown = () => { delHold.current = setTimeout(() => { delHold.current = 'cleared'; setNum('') }, 550) }
  const delUp = () => { if (delHold.current === 'cleared') { delHold.current = null; return } clearTimeout(delHold.current); delHold.current = null; setNum(n => n.slice(0, -1)) }
  // Hold 0 for +, like the iPhone.
  const hold = useRef(null)
  const zeroDown = () => { hold.current = setTimeout(() => { hold.current = 'plus'; setNum(n => (n.length < 18 ? n + '+' : n)) }, 450) }
  const zeroUp = () => { if (hold.current === 'plus') { hold.current = null; return } clearTimeout(hold.current); hold.current = null; press('0') }
  const call = () => { if (exact) recordAttempt(exact) }
  // Hold the number area to paste a copied number (the iPhone asks to allow it).
  const pasteHold = useRef(null)
  const pasteDown = () => {
    pasteHold.current = setTimeout(async () => {
      try {
        const t = await navigator.clipboard.readText()
        const clean = (t || '').replace(/[^\d+*#]/g, '').slice(0, 18)
        if (clean) setNum(clean)
      } catch {}
    }, 500)
  }
  const pasteCancel = () => clearTimeout(pasteHold.current)

  return (
    <div className={k.wrap}>
      <div className={k.display}>
        <div className={k.numRow}>
          {/* Not a typing field (17 Nov): focusing it made iOS shift the screen and push
              the bottom bar half off. Typing is by the keys; hold the number to paste. */}
          <div className={k.number} role="textbox" aria-readonly="true" aria-label="Number"
            onPointerDown={pasteDown} onPointerUp={pasteCancel} onPointerLeave={pasteCancel} onContextMenu={e => e.preventDefault()}>
            {pretty(num) || '\u00a0'}
          </div>
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
        {num ? (
          <button className={cx(k.act, k.del)} aria-label="Delete (hold to clear)" onContextMenu={e => e.preventDefault()}
            onPointerDown={delDown} onPointerUp={delUp} onPointerLeave={() => { clearTimeout(delHold.current); delHold.current = null }}>
            <svg width="31" height="23" viewBox="0 0 31 23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.2 1.5H26.5a3 3 0 013 3v14a3 3 0 01-3 3H10.2a2.4 2.4 0 01-1.8-.8L1.9 12.6a1.6 1.6 0 010-2.2l6.5-8.1a2.4 2.4 0 011.8-.8z" />
              <path d="M14.5 7.5l8 8M22.5 7.5l-8 8" />
            </svg>
          </button>
        ) : <span />}
      </div>
    </div>
  )
}
