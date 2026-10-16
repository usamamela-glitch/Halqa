import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav, useScreen } from '../../lib/nav'
import { insertRow, updateRow } from '../../lib/store'
import { useAutosave } from '../../lib/hooks'
import { sortContacts } from '../../lib/domain'
import { phoneDigits, phonesOf } from '../../lib/phone'
import { Screen, BarButton, Tabs, Sheet, Empty, Field, SearchBox, cx, ui } from '../ui'
import { ContactRow, useContactSheets } from '../contacts'
import { NoteList } from './HomeScreen'
import { IconPlus, IconEdit, IconUsers, IconNote } from '../Icons'
import v from '../../styles/village.module.css'

const TABS = ['Contacts', 'Dynamics', 'Development', 'Notes']

export default function VillageScreen() {
  const { key, params } = useScreen()
  const { setParams } = useNav()
  const id = params.id
  const tab = params.tab || 'Contacts'
  const village = useLiveQuery(() => db.villages.get(id), [id])
  const qanungo = useLiveQuery(() => (village?.qanungo_id ? db.qanungos.get(village.qanungo_id) : null), [village?.qanungo_id])
  const [editing, setEditing] = useState(false)
  const scrollRef = useRef(null)

  if (village === undefined) return null
  if (!village) {
    return <Screen title="Village" home><Empty title="Village not found" text="It may have been deleted on another phone." /></Screen>
  }

  return (
    <Screen
      title={village.name}
      subtitle={qanungo ? `${qanungo.name} Qanungo` : undefined}
      home
      scrollRef={scrollRef}
      actions={<BarButton onClick={() => setEditing(true)}>Edit</BarButton>}
      hero={<VillageStats village={village} />}
      tabs={<Tabs id={`village-${key}`} tabs={TABS} value={tab} onChange={t => setParams(key, { tab: t })} />}
    >
      {tab === 'Contacts' && <ContactsTab village={village} highlight={params.highlight} scrollRef={scrollRef} clearHighlight={() => setParams(key, { highlight: null })} />}
      {tab === 'Dynamics' && (
        <div className={v.form}>
          <AutoField label="Our group" value={village.our_group} placeholder="Who is with us here, and how strong are they?" onSave={t => updateRow('villages', id, { our_group: t })} />
          <AutoField label="Opposition group" value={village.anti_group} placeholder="Who leads the opposition here?" onSave={t => updateRow('villages', id, { anti_group: t })} />
        </div>
      )}
      {tab === 'Development' && (
        <div className={v.form}>
          <AutoField label="Development notes" value={village.development} minRows={10} placeholder="Ongoing schemes, demands, roads, gas, electricity…" onSave={t => updateRow('villages', id, { development: t })} />
        </div>
      )}
      {tab === 'Notes' && <NotesTab villageId={id} />}

      <Sheet open={editing} onClose={() => setEditing(false)} title="Village info">
        {editing && <InfoForm village={village} onDone={() => setEditing(false)} />}
      </Sheet>
    </Screen>
  )
}

function VillageStats({ village }) {
  const num = n => (n ? Number(n).toLocaleString() : '—')
  return (
    <div className={v.stats}>
      <div className={v.result}><span className={v.resultLabel}>2018</span><span className={v.resultVal}>{village.result_2018 || '—'}</span></div>
      <div className={v.result}><span className={v.resultLabel}>2024</span><span className={v.resultVal}>{village.result_2024 || '—'}</span></div>
      <div className={v.result}><span className={v.resultLabel}>Population</span><span className={v.resultNum}>{num(village.population)}</span></div>
      <div className={v.result}><span className={v.resultLabel}>Voters</span><span className={v.resultNum}>{num(village.registered_voters)}</span></div>
    </div>
  )
}

function InfoForm({ village, onDone }) {
  const [f, setF] = useState({
    name: village.name || '', result_2018: village.result_2018 || '', result_2024: village.result_2024 || '',
    population: village.population ?? '', registered_voters: village.registered_voters ?? '',
  })
  const set = (k, val) => setF(x => ({ ...x, [k]: val }))
  const toInt = s => { const n = parseInt(String(s).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null }

  async function save() {
    await updateRow('villages', village.id, {
      name: f.name.trim() || village.name,
      result_2018: f.result_2018.trim(), result_2024: f.result_2024.trim(),
      population: toInt(f.population), registered_voters: toInt(f.registered_voters),
    })
    onDone()
  }

  return (
    <form onSubmit={e => { e.preventDefault(); save() }}>
      <Field label="Village name"><input className={ui.input} value={f.name} onChange={e => set('name', e.target.value)} autoCapitalize="words" /></Field>
      <Field label="2018 result"><input className={ui.input} value={f.result_2018} onChange={e => set('result_2018', e.target.value)} placeholder="e.g. PTI win — 3,200 votes" /></Field>
      <Field label="2024 result"><input className={ui.input} value={f.result_2024} onChange={e => set('result_2024', e.target.value)} placeholder="e.g. Independent — 2,800 votes" /></Field>
      <div className={v.twoCol}>
        <Field label="Population"><input className={ui.input} inputMode="numeric" value={f.population} onChange={e => set('population', e.target.value)} placeholder="4500" /></Field>
        <Field label="Registered voters"><input className={ui.input} inputMode="numeric" value={f.registered_voters} onChange={e => set('registered_voters', e.target.value)} placeholder="1800" /></Field>
      </div>
      <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 22 }}>Save</button>
    </form>
  )
}

// Textarea that saves itself while you type and grows with its content.
function AutoField({ label, value, onSave, placeholder, minRows = 6 }) {
  const [draft, setDraft] = useState(value || '')
  const focused = useRef(false)
  const ref = useRef(null)
  const { status, change, flush } = useAutosave(onSave, 800)

  useEffect(() => {
    if (!focused.current && status === 'saved') setDraft(value || '')
  }, [value])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [draft])

  return (
    <div className={v.autoField}>
      <div className={v.autoHead}>
        <span className={ui.label}>{label}</span>
        <span className={cx(v.autoStatus, status !== 'saved' && v.autoStatusOn)}>{status === 'saved' ? 'Saved ✓' : status === 'saving' ? 'Saving…' : 'Editing…'}</span>
      </div>
      <textarea ref={ref} className={cx(ui.textarea, v.bigText)} rows={minRows} value={draft} placeholder={placeholder}
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; flush() }}
        onChange={e => { setDraft(e.target.value); change(e.target.value) }} />
    </div>
  )
}

function ContactsTab({ village, highlight, scrollRef, clearHighlight }) {
  const sheets = useContactSheets()
  const contacts = useLiveQuery(() => db.contacts.where('village_id').equals(village.id).toArray(), [village.id], [])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const rowRefs = useRef({})

  const tagsHere = useMemo(() => [...new Set(contacts.flatMap(c => c.tags || []))].sort(), [contacts])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const d = phoneDigits(q)
    return sortContacts(contacts.filter(c => {
      if (tag && !(c.tags || []).includes(tag)) return false
      if (!t) return true
      return (c.name || '').toLowerCase().includes(t)
        || (c.description || '').toLowerCase().includes(t)
        || (d.length >= 3 && phonesOf(c).some(p => phoneDigits(p).includes(d)))
    }))
  }, [contacts, q, tag])

  // Arriving from search: scroll to the contact and flash it.
  useEffect(() => {
    if (!highlight || !contacts.length) return
    const t = setTimeout(() => {
      const el = rowRefs.current[highlight]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 340)
    const clear = setTimeout(clearHighlight, 2600)
    return () => { clearTimeout(t); clearTimeout(clear) }
  }, [highlight, contacts.length])

  return (
    <>
      {contacts.length > 4 && <SearchBox value={q} onChange={setQ} placeholder={`Search ${contacts.length} contacts`} />}
      {tagsHere.length > 0 && (
        <div className={ui.chipScroll} style={{ marginTop: 12 }}>
          {tagsHere.map(t => <button key={t} className={cx(ui.chipBtn, tag === t && ui.chipBtnOn)} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
        </div>
      )}
      {contacts.length === 0 ? (
        <Empty icon={<IconUsers size={28} />} title="No contacts yet" text="Tap + to add the first person you know here." />
      ) : list.length === 0 ? (
        <Empty title="No match" text="Nobody here matches that search." />
      ) : (
        <ul className={ui.list} style={{ marginTop: 12 }}>
          {list.map(c => (
            <ContactRow key={c.id} contact={c} highlight={c.id === highlight} showContacted={!!c.last_contacted}
              rowRef={el => { rowRefs.current[c.id] = el }} onPress={() => sheets.open(c.id)} />
          ))}
        </ul>
      )}
      <button className={ui.fab} onClick={() => sheets.add(village.id)} aria-label="Add contact"><IconPlus size={28} /></button>
      {sheets.element}
    </>
  )
}

function NotesTab({ villageId }) {
  const { push } = useNav()
  const notes = useLiveQuery(() => db.notes.where('village_id').equals(villageId).toArray(), [villageId], [])
  const sorted = [...notes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  async function create() {
    const n = await insertRow('notes', { village_id: villageId, body: '', images: [] })
    push('note', { table: 'notes', id: n.id, isNew: true })
  }
  return (
    <>
      {sorted.length === 0
        ? <Empty icon={<IconNote size={28} />} title="No notes yet" text="Meeting notes, photos and anything else about this village." />
        : <NoteList notes={sorted} onOpen={n => push('note', { table: 'notes', id: n.id })} />}
      <button className={ui.fab} onClick={create} aria-label="New note"><IconEdit size={26} /></button>
    </>
  )
}
