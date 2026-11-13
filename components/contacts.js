import { ContactTargets } from './Works'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { insertRow, updateRow, deleteRow, restoreRow, newId } from '../lib/store'
import { savePhoto } from '../lib/images'
import { telHref, waHref, phonesOf, phoneDigits, downloadVCard } from '../lib/phone'
import { TAGS, daysSince, contactedLevel, contactedLabel, byName, addedDate } from '../lib/domain'
import { useLocalStorage } from '../lib/hooks'
import { markInTouch, recordAttempt, inTouchToday } from '../lib/touch'
import { tidyToday, markDone, openInToday } from '../lib/daily'
import { numberKey, nameKey } from '../lib/importContacts'
import { queryWords, matchesWords } from '../lib/search'
import { Card, Avatar, Sheet, ActionSheet, Field, cx, ui, useToast } from './ui'
import { IconPhone, IconWhatsApp, IconPin, IconCheck, IconUserPlus, IconEdit, IconCamera } from './Icons'
import s from '../styles/contacts.module.css'

// ---------- Row ----------

// The number to WhatsApp: the one chosen before, or the only one. null = ask.
export function whatsappNumber(contact) {
  const phones = phonesOf(contact)
  if (phones.length <= 1) return phones[0] || null
  return phones.find(p => phoneDigits(p) === phoneDigits(contact.whatsapp_phone || '')) || null
}

// Opens WhatsApp on a number, records the attempt, and remembers the number when
// the contact has more than one (WhatsApp won't tell other apps which is on it).
export function openWhatsApp(contact, phone) {
  window.open(waHref(phone), '_blank', 'noopener')
  recordAttempt(contact)
  if (phonesOf(contact).length > 1 && phoneDigits(phone) !== phoneDigits(contact.whatsapp_phone || '')) {
    updateRow('contacts', contact.id, { whatsapp_phone: phone })
  }
}

export function CallButtons({ contact }) {
  const [choosing, setChoosing] = useState(false)
  const phones = phonesOf(contact)
  const phone = phones[0]
  if (!phone) return null
  const wa = whatsappNumber(contact)
  return (
    <>
      <a className={ui.iconBtn} href={telHref(phone)} onClick={() => recordAttempt(contact)} aria-label={`Call ${contact.name}`}><IconPhone size={19} /></a>
      {wa ? (
        <a className={cx(ui.iconBtn, ui.iconBtnWa)} href={waHref(wa)} onClick={() => recordAttempt(contact)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${contact.name}`}><IconWhatsApp size={20} /></a>
      ) : (
        <button className={cx(ui.iconBtn, ui.iconBtnWa)} onClick={() => setChoosing(true)} aria-label={`WhatsApp ${contact.name}`}><IconWhatsApp size={20} /></button>
      )}
      <ActionSheet open={choosing} onClose={() => setChoosing(false)} title="Which number is on WhatsApp?"
        text={`Halqa will remember it for ${contact.name}.`}
        items={phones.map(p => ({ label: p, icon: <IconWhatsApp size={20} />, onClick: () => openWhatsApp(contact, p) }))} />
    </>
  )
}

function PinButton({ contact, onUnpin }) {
  const toast = useToast()
  async function toggle() {
    if (contact.pinned && onUnpin) return onUnpin()
    await updateRow('contacts', contact.id, { pinned: !contact.pinned })
    toast(contact.pinned ? `Unpinned ${contact.name}` : `Pinned ${contact.name}`)
  }
  return (
    <button className={cx(ui.iconBtn, s.pinBtn, contact.pinned && s.pinBtnOn)} onClick={toggle}
      aria-label={`${contact.pinned ? 'Unpin' : 'Pin'} ${contact.name}`} aria-pressed={!!contact.pinned}>
      <IconPin size={18} filled={!!contact.pinned} />
    </button>
  )
}

export function ContactedBadge({ contact }) {
  const d = daysSince(contact.last_contacted)
  const level = contactedLevel(d)
  return <span className={cx(ui.badge, ui[`badge_${level}`])}>{d === null ? 'Not yet' : d === 0 ? 'Today' : `${d}d`}</span>
}

export function ContactRow({ contact, villageName, subtitle, onPress, highlight, showContacted, onUnpin, rowRef }) {
  const phones = phonesOf(contact)
  const tags = contact.tags || []
  return (
    <li ref={rowRef}>
      <Card as="div" role="button" tabIndex={0} className={cx(s.row, highlight && ui.flash)} onClick={onPress}>
        <Avatar name={contact.name} photo={contact.photo_path} size={48} />
        <div className={s.rowMain}>
          <div className={s.nameLine}>
            <span className={s.name}>{contact.name}</span>
          </div>
          {subtitle && <span className={s.sub}>{subtitle}</span>}
          <span className={s.sub}>{phones.join(' · ') || 'No number'}</span>
          {contact.description && <span className={s.desc}>{contact.description}</span>}
          {(tags.length > 0 || showContacted) && (
            <div className={s.meta}>
              {showContacted && <ContactedBadge contact={contact} />}
              {tags.map(t => <span key={t} className={ui.chip}>{t}</span>)}
            </div>
          )}
        </div>
        <div className={s.rowActions} onClick={e => e.stopPropagation()}>
          <PinButton contact={contact} onUnpin={onUnpin} />
          <CallButtons contact={contact} />
          {phonesOf(contact).length > 0 && (
            <button className={cx(ui.iconBtn, s.saveBtn)} onClick={() => downloadVCard(contact, villageName)} aria-label={`Save ${contact.name} to iPhone Contacts`}>
              <IconUserPlus size={19} />
            </button>
          )}
        </div>
      </Card>
    </li>
  )
}

// ---------- Detail sheet ----------

function ContactDetail({ id, onEdit, onClose }) {
  const toast = useToast()
  const contact = useLiveQuery(() => (id ? db.contacts.get(id) : undefined), [id])
  const village = useLiveQuery(() => (contact?.village_id ? db.villages.get(contact.village_id) : undefined), [contact?.village_id])
  // Added one by one (not in an import batch, which shares one time)?
  const oneByOne = useLiveQuery(async () => {
    if (!contact?.created_at) return false
    return (await db.contacts.filter(x => x.created_at === contact.created_at).count()) <= 3
  }, [contact?.created_at], false)
  if (!contact) return null
  const phones = phonesOf(contact)
  const touchedToday = inTouchToday(contact)

  // Met in person, or they called: record it. In the Today list this is the same as ✓ Done.
  async function confirmTouch() {
    const undo = (await openInToday(contact.id)) ? await markDone(contact.id) : await markInTouch(contact.id)
    toast(`${contact.name}: in touch today`, { label: 'Undo', onClick: undo })
  }

  async function toggleListHidden() {
    const hide = !contact.list_hidden
    await updateRow('contacts', contact.id, { list_hidden: hide })
    if (hide) tidyToday()
    toast(hide ? `${contact.name} won't appear in the daily list` : `${contact.name} is back in the daily list`)
  }

  async function togglePin() {
    await updateRow('contacts', contact.id, { pinned: !contact.pinned })
    toast(contact.pinned ? 'Removed from Main Groups' : 'Added to Main Groups')
  }

  async function remove() {
    const snapshot = { ...contact }
    onClose()
    await deleteRow('contacts', contact.id)
    tidyToday()
    toast(`Deleted ${snapshot.name}`, { label: 'Undo', onClick: () => restoreRow('contacts', snapshot) })
  }

  return (
    <>
      <div className={s.top}>
        <Avatar name={contact.name} photo={contact.photo_path} size={92} />
        <div className={s.bigName}>{contact.name}</div>
        {village && <div className={s.village}>{village.name}</div>}
        {oneByOne && <div className={s.added}>Added {addedDate(contact.created_at)}</div>}
        {contact.description && <div className={s.detailDesc}>{contact.description}</div>}
        {(contact.tags || []).length > 0 && (
          <div className={cx(ui.chips, s.detailTags)}>{contact.tags.map(t => <span key={t} className={ui.chip}>{t}</span>)}</div>
        )}
      </div>

      {touchedToday ? (
        <div className={s.touchLine}><IconCheck size={16} /><span>In touch today</span></div>
      ) : (
        <button className={s.touchButton} onClick={confirmTouch}>
          <IconCheck size={18} />
          <span>Mark as in touch today<small>Last in touch: {contactedLabel(daysSince(contact.last_contacted)).toLowerCase()}</small></span>
        </button>
      )}

      {phones.length > 0 && (
        <div className={s.phones}>
          {phones.map(p => (
            <div key={p} className={s.phoneRow}>
              <span className={s.phoneNum}>{p}</span>
              <a className={ui.iconBtn} href={telHref(p)} onClick={() => recordAttempt(contact)} aria-label="Call"><IconPhone size={19} /></a>
              <button className={cx(ui.iconBtn, ui.iconBtnWa, phones.length > 1 && whatsappNumber(contact) === p && s.waChosen)} onClick={() => openWhatsApp(contact, p)} aria-label="WhatsApp"><IconWhatsApp size={20} /></button>
            </div>
          ))}
        </div>
      )}

      <div className={s.tools}>
        <button className={cx(s.tool, contact.pinned && s.toolOn)} onClick={togglePin}>
          <IconPin size={20} filled={contact.pinned} />{contact.pinned ? 'Pinned' : 'Pin'}
        </button>
        <button className={s.tool} onClick={() => downloadVCard(contact, village?.name)}>
          <IconUserPlus size={20} />Save to iPhone
        </button>
        <button className={s.tool} onClick={() => onEdit(contact)}>
          <IconEdit size={20} />Edit
        </button>
      </div>

      <ContactTargets contactId={contact.id} />

      <button className={s.listLink} onClick={toggleListHidden}>
        {contact.list_hidden ? 'Hidden from the daily list · Show again' : "Don't show in the daily list"}
      </button>
      <button className={s.deleteLink} onClick={remove}>Delete contact</button>
    </>
  )
}

// ---------- Village picker (searchable) ----------

export function VillagePicker({ value, onChange, autoOpen }) {
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const [open, setOpen] = useState(!!autoOpen && !value)
  const [q, setQ] = useState('')
  const pickedAt = useRef(0)
  const qName = useMemo(() => Object.fromEntries(qanungos.map(x => [x.id, x.name])), [qanungos])
  const selected = villages.find(v => v.id === value)
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = t ? villages.filter(v => matchesWords(queryWords(t), v.name)) : villages
    return [...list].sort((a, b) => {
      if (t) {
        const as = (a.name || '').toLowerCase().startsWith(t) ? 0 : 1
        const bs = (b.name || '').toLowerCase().startsWith(t) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return byName(a, b)
    }).slice(0, 40)
  }, [villages, q])

  if (selected && !open) {
    return (
      <div className={s.pickerSelected}>
        <div className={s.pickerMain}>
          <div className={s.pickerName}>{selected.name}</div>
          <div className={s.pickerQ}>{qName[selected.qanungo_id] || 'No Qanungo'}</div>
        </div>
        <button type="button" className={s.pickerChange} onClick={() => {
          // The list collapsing moves this button under the finger that just picked a village; ignore that stray tap.
          if (Date.now() - pickedAt.current < 600) return
          setQ(''); setOpen(true)
        }}>Change</button>
      </div>
    )
  }
  return (
    <div className={s.picker}>
      <input className={ui.input} placeholder="Search village…" value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)} autoCorrect="off" />
      {open && (
        <div className={s.pickerList}>
          {matches.length === 0 && <div className={s.pickerItem}><span className={s.pickerQ}>No village found</span></div>}
          {matches.map(v => (
            <button type="button" key={v.id} className={s.pickerItem} onMouseDown={e => e.preventDefault()}
              onClick={() => { pickedAt.current = Date.now(); onChange(v.id); setOpen(false); setQ(''); document.activeElement?.blur?.() }}>
              <span className={s.pickerName}>{v.name}</span>
              <span className={s.pickerQ}>{qName[v.qanungo_id] || 'No Qanungo'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Duplicate number warning ----------

function useDuplicate(phones, selfId) {
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  return useMemo(() => {
    const wanted = phones.map(phoneDigits).filter(d => d.length >= 10)
    if (!wanted.length) return null
    const hit = contacts.find(c => c.id !== selfId && phonesOf(c).some(p => wanted.includes(phoneDigits(p))))
    if (!hit) return null
    return { contact: hit, village: villages.find(v => v.id === hit.village_id) }
  }, [phones.join('|'), contacts, villages, selfId])
}

// ---------- Add / edit form ----------

const EMPTY = { name: '', phone: '', phone2: '', phone3: '', description: '', tags: [], photo_path: null, village_id: null, pinned: false }

function ContactForm({ initial, onDone, onOpenExisting, quick, focus }) {
  const toast = useToast()
  const [, setLastVillage] = useLocalStorage('halqa.lastVillage', null)
  const isNew = !initial.id
  const idRef = useRef(initial.id || newId())
  const [f, setF] = useState(() => ({ ...EMPTY, ...initial, tags: initial.tags || [] }))
  const [showMore, setShowMore] = useState(!!(initial.phone2 || initial.phone3))
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const dupe = useDuplicate([f.phone, f.phone2, f.phone3], idRef.current)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  async function pickPhoto(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    const { path } = await savePhoto('contact-photos', idRef.current, file, 640)
    set('photo_path', path)
  }

  async function save() {
    const name = f.name.trim()
    if (!name || !f.village_id || saving) return
    setSaving(true)
    const data = {
      village_id: f.village_id,
      name,
      phone: f.phone.trim(), phone2: f.phone2.trim(), phone3: f.phone3.trim(),
      description: f.description.trim(),
    }
    // Only send new-feature columns when used, so saving still works before
    // the database migration has been run.
    if (f.tags.length || (initial.tags || []).length) data.tags = f.tags
    if (f.photo_path !== (initial.photo_path || null)) data.photo_path = f.photo_path
    if (isNew) await insertRow('contacts', { id: idRef.current, pinned: !!f.pinned, ...data })
    else await updateRow('contacts', idRef.current, data)
    setLastVillage(f.village_id)
    setSaving(false)
    if (isNew && phonesOf(data).length) {
      // Same flow as the old app: one tap opens the iPhone's "Create New Contact" with everything filled in.
      const village = await db.villages.get(f.village_id)
      toast(`Saved ${name}`, { label: 'Save to iPhone', onClick: () => downloadVCard(data, village?.name) }, 8000)
    } else {
      toast(isNew ? `Saved ${name}` : 'Changes saved')
    }
    onDone(idRef.current)
  }

  const photoPreview = <Avatar name={f.name || '?'} photo={f.photo_path} size={84} />

  return (
    <form onSubmit={e => { e.preventDefault(); save() }}>
      {!quick && (
        <div className={s.photoPick}>
          <button type="button" className={s.photoBtn} onClick={() => fileRef.current?.click()} aria-label="Add photo">
            {photoPreview}
            <span className={s.photoBadge}><IconCamera size={15} /></span>
          </button>
          <span className={s.photoHint}>{f.photo_path ? 'Change photo' : 'Add photo'}</span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
        </div>
      )}

      {quick && isNew && (initial.phone || '').trim() && (
        <AddToExisting name={initial.name} numbers={[initial.phone, initial.phone2, initial.phone3].filter(Boolean)} onAdded={onOpenExisting} />
      )}

      <Field label="Name">
        <input className={ui.input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Muhammad Akram" autoFocus={quick || isNew} autoCapitalize="words" autoComplete="off" />
      </Field>
      <Field label="Phone">
        <input className={ui.input} type="tel" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="0300-1234567" autoComplete="off" />
      </Field>
      {showMore && (
        <>
          <Field label="Phone 2"><input className={ui.input} type="tel" inputMode="tel" value={f.phone2} onChange={e => set('phone2', e.target.value)} placeholder="Optional" /></Field>
          <Field label="Phone 3"><input className={ui.input} type="tel" inputMode="tel" value={f.phone3} onChange={e => set('phone3', e.target.value)} placeholder="Optional" /></Field>
        </>
      )}
      {!quick && !showMore && <button type="button" className={s.addPhone} onClick={() => setShowMore(true)}>+ Add another number</button>}
      {dupe && (
        <div className={s.dupe}>
          This number is already saved as <strong>{dupe.contact.name}</strong>{dupe.village ? ` in ${dupe.village.name}` : ''}.{' '}
          <button type="button" onClick={() => onOpenExisting(dupe.contact.id)}>Open</button>
        </div>
      )}

      <Field label="Village">
        <VillagePicker value={f.village_id} onChange={v => set('village_id', v)} autoOpen={quick} />
      </Field>

      {isNew && (
        <label className={s.pinSwitch}>
          <span className={s.pinSwitchText}>
            <IconPin size={18} filled={!!f.pinned} />
            <span>Pin to Main Groups</span>
          </span>
          <input type="checkbox" className={s.switch} checked={!!f.pinned} onChange={e => set('pinned', e.target.checked)} />
        </label>
      )}

      <Field label="Description">
        <textarea className={ui.textarea} style={{ minHeight: 76 }} rows={2} value={f.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Village elder, numberdar" autoFocus={focus === 'description'} />
      </Field>

      <div className={ui.field}>
        <span className={ui.label}>Tags</span>
        <div className={s.tagGrid}>
          {TAGS.map(t => {
            const on = f.tags.includes(t)
            return (
              <button type="button" key={t} className={cx(ui.chipBtn, on && ui.chipBtnOn)}
                onClick={() => set('tags', on ? f.tags.filter(x => x !== t) : [...f.tags, t])}>{t}</button>
            )
          })}
        </div>
      </div>

      <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 22 }} disabled={!f.name.trim() || !f.village_id || saving}>
        {isNew ? 'Save contact' : 'Save changes'}
      </button>
    </form>
  )
}

// ---------- Add a new number to someone already in Halqa ----------

const PHONE_FIELDS = ['phone', 'phone2', 'phone3']

// Shown in Quick Add when it was opened with a number (Shortcuts, Back Tap):
// the number may belong to someone already saved under another number.
function AddToExisting({ name, numbers, onAdded }) {
  const toast = useToast()
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [full, setFull] = useState(null)      // contact with no free slot: ask which number to replace
  const vName = useMemo(() => Object.fromEntries(villages.map(v => [v.id, v.name])), [villages])

  // Same or very similar name to the shared one.
  const suggested = useMemo(() => {
    const k = nameKey(name || '')
    if (k.length < 4) return []
    return contacts.filter(c => {
      const ck = nameKey(c.name)
      return ck === k || (ck.length >= 5 && (ck.includes(k) || k.includes(ck)))
    }).slice(0, 3)
  }, [contacts, name])

  const results = useMemo(() => {
    if (q.trim().length < 2) return []
    const words = queryWords(q)
    const find = loose => contacts.filter(c => matchesWords(words, [c.name, vName[c.village_id]], loose))
    const exact = find(false)
    return (exact.length ? exact : find(true)).sort(byName).slice(0, 12)
  }, [contacts, q, vName])

  async function add(c, replaceField) {
    const have = new Set(phonesOf(c).map(numberKey))
    const fresh = numbers.map(n => n.trim()).filter(n => n && !have.has(numberKey(n)))
    if (!fresh.length) { toast(`${c.name} already has this number`); onAdded(c.id); return }
    const patch = {}
    const free = PHONE_FIELDS.filter(k => !(c[k] || '').trim())
    if (replaceField) patch[replaceField] = fresh[0]
    else if (!free.length) { setFull(c); return }
    else fresh.slice(0, free.length).forEach((n, i) => { patch[free[i]] = n })
    const before = Object.fromEntries(Object.keys(patch).map(k => [k, c[k] || '']))
    await updateRow('contacts', c.id, patch)
    toast(`Added ${Object.values(patch).join(', ')} to ${c.name}`, { label: 'Undo', onClick: () => updateRow('contacts', c.id, before) })
    onAdded(c.id)
  }

  const row = c => (
    <button type="button" key={c.id} className={s.attachItem} onClick={() => add(c)}>
      <Avatar name={c.name} photo={c.photo_path} size={34} />
      <span className={s.attachText}><strong>{c.name}</strong><span>{vName[c.village_id] || 'No village'} · {phonesOf(c)[0] || 'no number'}</span></span>
      <span className={s.attachAdd}>Add here</span>
    </button>
  )

  return (
    <div className={s.attach}>
      {suggested.length > 0 && (
        <>
          <div className={s.attachHead}>Already in Halqa with another number?</div>
          {suggested.map(row)}
        </>
      )}
      {!open ? (
        <button type="button" className={s.addPhone} onClick={() => setOpen(true)}>
          + Add this number to {suggested.length ? 'someone else' : 'someone already in Halqa'}
        </button>
      ) : (
        <>
          <input className={ui.input} style={{ marginTop: 8 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or village" autoFocus autoComplete="off" />
          {results.map(row)}
          {q.trim().length >= 2 && !results.length && <p className={s.attachNone}>Nobody found.</p>}
        </>
      )}
      <ActionSheet open={!!full} onClose={() => setFull(null)} title={full ? `${full.name} already has 3 numbers` : ''}
        text="Which one should the new number replace?"
        items={full ? PHONE_FIELDS.filter(k => full[k]).map(k => ({ label: `Replace ${full[k]}`, icon: <IconPhone size={20} />, onClick: () => add(full, k) })) : []} />
    </div>
  )
}

// ---------- Coordinator hook used by every screen that shows contacts ----------

export function useContactSheets() {
  const [lastVillage] = useLocalStorage('halqa.lastVillage', null)
  const [view, setView] = useState(null)       // contact id being viewed
  const [form, setForm] = useState(null)       // { initial, quick }
  const [formKey, setFormKey] = useState(0)

  const api = {
    open: id => { setForm(null); setView(id) },
    add: villageId => { setView(null); setFormKey(k => k + 1); setForm({ initial: { village_id: villageId }, quick: false }) },
    quickAdd: (prefill = {}) => { setView(null); setFormKey(k => k + 1); setForm({ initial: { village_id: lastVillage, ...prefill }, quick: true }) },
    // Edit an existing contact; focus: 'description' puts the cursor straight in the description.
    edit: (contact, focus) => { setView(null); setFormKey(k => k + 1); setForm({ initial: contact, quick: false, focus }) },
  }

  const element = (
    <>
      <Sheet open={!!view} onClose={() => setView(null)}>
        {view && <ContactDetail id={view} onClose={() => setView(null)} onEdit={c => { setView(null); setFormKey(k => k + 1); setForm({ initial: c, quick: false }) }} />}
      </Sheet>
      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.quick ? 'Quick add' : form?.initial?.id ? 'Edit contact' : 'New contact'}>
        {form && (
          <ContactForm key={formKey} initial={form.initial} quick={form.quick} focus={form.focus}
            onDone={() => setForm(null)}
            onOpenExisting={id => { setForm(null); setView(id) }} />
        )}
      </Sheet>
    </>
  )
  return { ...api, element }
}
