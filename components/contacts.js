import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { insertRow, updateRow, deleteRow, restoreRow, newId } from '../lib/store'
import { savePhoto } from '../lib/images'
import { telHref, waHref, phonesOf, phoneDigits, downloadVCard } from '../lib/phone'
import { TAGS, daysSince, contactedLevel, contactedLabel, byName } from '../lib/domain'
import { useLocalStorage } from '../lib/hooks'
import { Card, Avatar, Sheet, Field, cx, ui, useToast } from './ui'
import { IconPhone, IconWhatsApp, IconPin, IconCheck, IconUserPlus, IconEdit, IconCamera } from './Icons'
import s from '../styles/contacts.module.css'

// ---------- Row ----------

export function CallButtons({ contact }) {
  const phone = phonesOf(contact)[0]
  if (!phone) return null
  return (
    <div className={s.rowActions} onClick={e => e.stopPropagation()}>
      <a className={ui.iconBtn} href={telHref(phone)} aria-label={`Call ${contact.name}`}><IconPhone size={19} /></a>
      <a className={cx(ui.iconBtn, ui.iconBtnWa)} href={waHref(phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${contact.name}`}><IconWhatsApp size={20} /></a>
    </div>
  )
}

export function ContactedBadge({ contact }) {
  const d = daysSince(contact.last_contacted)
  const level = contactedLevel(d)
  return <span className={cx(ui.badge, ui[`badge_${level}`])}>{d === null ? 'Never' : d === 0 ? 'Today' : `${d}d`}</span>
}

export function ContactRow({ contact, subtitle, onPress, highlight, showContacted, onUnpin, rowRef }) {
  const phones = phonesOf(contact)
  const tags = contact.tags || []
  return (
    <li ref={rowRef}>
      <Card as="div" role="button" tabIndex={0} className={cx(s.row, highlight && ui.flash)} onClick={onPress}>
        <Avatar name={contact.name} photo={contact.photo_path} size={48} />
        <div className={s.rowMain}>
          <div className={s.nameLine}>
            <span className={s.name}>{contact.name}</span>
            {contact.pinned && !onUnpin && <span className={s.pinMark}><IconPin size={14} filled /></span>}
            {onUnpin && (
              <button className={s.unpin} onClick={e => { e.stopPropagation(); onUnpin() }} aria-label={`Unpin ${contact.name}`}>
                <IconPin size={15} filled />
              </button>
            )}
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
        <CallButtons contact={contact} />
      </Card>
    </li>
  )
}

// ---------- Detail sheet ----------

function ContactDetail({ id, onEdit, onClose }) {
  const toast = useToast()
  const contact = useLiveQuery(() => (id ? db.contacts.get(id) : undefined), [id])
  const village = useLiveQuery(() => (contact?.village_id ? db.villages.get(contact.village_id) : undefined), [contact?.village_id])
  if (!contact) return null
  const phones = phonesOf(contact)
  const d = daysSince(contact.last_contacted)
  const level = contactedLevel(d)

  async function markContacted() {
    await updateRow('contacts', contact.id, { last_contacted: new Date().toISOString() })
    toast(`Marked ${contact.name.split(' ')[0]} as contacted today`)
  }

  async function togglePin() {
    await updateRow('contacts', contact.id, { pinned: !contact.pinned })
    toast(contact.pinned ? 'Removed from Main Groups' : 'Added to Main Groups')
  }

  async function remove() {
    const snapshot = { ...contact }
    onClose()
    await deleteRow('contacts', contact.id)
    toast(`Deleted ${snapshot.name}`, { label: 'Undo', onClick: () => restoreRow('contacts', snapshot) })
  }

  return (
    <>
      <div className={s.top}>
        <Avatar name={contact.name} photo={contact.photo_path} size={92} />
        <div className={s.bigName}>{contact.name}</div>
        {village && <div className={s.village}>{village.name}</div>}
        {contact.description && <div className={s.detailDesc}>{contact.description}</div>}
        {(contact.tags || []).length > 0 && (
          <div className={cx(ui.chips, s.detailTags)}>{contact.tags.map(t => <span key={t} className={ui.chip}>{t}</span>)}</div>
        )}
      </div>

      <div className={s.contactedBox}>
        <div className={s.contactedText}>
          <span className={s.contactedLabel}>Last contacted</span>
          <span className={s.contactedVal} style={{ color: level === 'none' ? 'var(--muted)' : `var(--${level})` }}>{contactedLabel(d)}</span>
        </div>
        <button className={cx(s.contactedBtn, d === 0 && s.contactedDone)} onClick={markContacted}>
          <IconCheck size={17} />{d === 0 ? 'Done' : 'Contacted'}
        </button>
      </div>

      {phones.length > 0 && (
        <div className={s.phones}>
          {phones.map(p => (
            <div key={p} className={s.phoneRow}>
              <span className={s.phoneNum}>{p}</span>
              <a className={ui.iconBtn} href={telHref(p)} aria-label="Call"><IconPhone size={19} /></a>
              <a className={cx(ui.iconBtn, ui.iconBtnWa)} href={waHref(p)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><IconWhatsApp size={20} /></a>
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
  const qName = useMemo(() => Object.fromEntries(qanungos.map(x => [x.id, x.name])), [qanungos])
  const selected = villages.find(v => v.id === value)
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = t ? villages.filter(v => (v.name || '').toLowerCase().includes(t)) : villages
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
        <button type="button" className={s.pickerChange} onClick={() => { setQ(''); setOpen(true) }}>Change</button>
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
            <button type="button" key={v.id} className={s.pickerItem} onClick={() => { onChange(v.id); setOpen(false) }}>
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

const EMPTY = { name: '', phone: '', phone2: '', phone3: '', description: '', tags: [], photo_path: null, village_id: null }

function ContactForm({ initial, onDone, onOpenExisting, quick }) {
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
    if (isNew) await insertRow('contacts', { id: idRef.current, pinned: false, ...data })
    else await updateRow('contacts', idRef.current, data)
    setLastVillage(f.village_id)
    setSaving(false)
    toast(isNew ? `Saved ${name}` : 'Changes saved')
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

      <Field label="Name">
        <input className={ui.input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Muhammad Akram" autoFocus={quick || isNew} autoCapitalize="words" autoComplete="off" />
      </Field>
      <Field label="Phone">
        <input className={ui.input} type="tel" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="0300-1234567" autoComplete="off" />
      </Field>
      {!quick && showMore && (
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

      <Field label="Description">
        <textarea className={ui.textarea} style={{ minHeight: 76 }} rows={2} value={f.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Village elder, numberdar" />
      </Field>

      {!quick && (
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
      )}

      <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 22 }} disabled={!f.name.trim() || !f.village_id || saving}>
        {isNew ? 'Save contact' : 'Save changes'}
      </button>
    </form>
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
    quickAdd: () => { setView(null); setFormKey(k => k + 1); setForm({ initial: { village_id: lastVillage }, quick: true }) },
  }

  const element = (
    <>
      <Sheet open={!!view} onClose={() => setView(null)}>
        {view && <ContactDetail id={view} onClose={() => setView(null)} onEdit={c => { setView(null); setFormKey(k => k + 1); setForm({ initial: c, quick: false }) }} />}
      </Sheet>
      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.quick ? 'Quick add' : form?.initial?.id ? 'Edit contact' : 'New contact'}>
        {form && (
          <ContactForm key={formKey} initial={form.initial} quick={form.quick}
            onDone={() => setForm(null)}
            onOpenExisting={id => { setForm(null); setView(id) }} />
        )}
      </Sheet>
    </>
  )
  return { ...api, element }
}
