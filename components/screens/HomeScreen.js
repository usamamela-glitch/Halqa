import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav, useScreen } from '../../lib/nav'
import { insertRow, updateRow, deleteRow } from '../../lib/store'
import { villageCompletion, byName, shortDate, TAGS } from '../../lib/domain'
import { plainText } from '../../lib/images'
import { phoneDigits, phonesOf } from '../../lib/phone'
import { Screen, BarButton, Tabs, Card, Sheet, ActionSheet, Empty, Field, SearchBox, SyncPill, cx, ui, useToast } from '../ui'
import { ContactRow, useContactSheets } from '../contacts'
import { IconMap, IconSparkles, IconSettings, IconStar, IconCalendar, IconChevron, IconMore, IconPlus, IconBolt, IconEdit, IconTrash, IconNote, IconSearch, IconLayers } from '../Icons'
import h from '../../styles/home.module.css'

const TABS = ['Qanungos', 'Notes', 'Search']

export default function HomeScreen() {
  const { push, setParams } = useNav()
  const { key, params } = useScreen()
  const tab = params.tab || 'Qanungos'
  const sheets = useContactSheets()

  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])
  const pinnedCount = contacts.filter(c => c.pinned).length

  return (
    <Screen
      back={false}
      barTitle={null}
      actions={
        <>
          <BarButton onClick={() => push('map')} aria-label="District map"><IconMap size={21} /></BarButton>
          <BarButton onClick={() => push('analysis')} aria-label="AI analysis"><IconSparkles size={21} /></BarButton>
          <BarButton onClick={() => push('settings')} aria-label="Settings"><IconSettings size={21} /></BarButton>
        </>
      }
      hero={
        <>
          <div className={h.heroTop}>
            <div className={h.brand}>
              <div className={h.brandTitle}>Halqa<span className={h.brandUrdu}>حلقہ</span></div>
              <div className={h.brandSub}>NA-83 Sargodha-II</div>
            </div>
            <SyncPill />
          </div>
          <div className={ui.stats}>
            <div className={ui.stat}><div className={ui.statVal}>{villages.length.toLocaleString()}</div><div className={ui.statLabel}>Villages</div></div>
            <div className={ui.stat}><div className={ui.statVal}>{contacts.length.toLocaleString()}</div><div className={ui.statLabel}>Contacts</div></div>
            <div className={ui.stat}><div className={ui.statVal}>{pinnedCount}</div><div className={ui.statLabel}>Pinned</div></div>
          </div>
        </>
      }
      tabs={<Tabs id="home" tabs={TABS} value={tab} onChange={t => setParams(key, { tab: t })} />}
    >
      {tab === 'Qanungos' && <QanungosTab villages={villages} contacts={contacts} pinnedCount={pinnedCount} onQuickAdd={sheets.quickAdd} />}
      {tab === 'Notes' && <NotesTab />}
      {tab === 'Search' && <SearchTab villages={villages} contacts={contacts} />}
      {sheets.element}
    </Screen>
  )
}

// ---------- Qanungos ----------

function QanungosTab({ villages, contacts, pinnedCount, onQuickAdd }) {
  const { push } = useNav()
  const toast = useToast()
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const dayNote = useLiveQuery(() => db.day_note.get(1), [])
  const [menu, setMenu] = useState(null)
  const [nameSheet, setNameSheet] = useState(null) // { id?, name }
  const [confirmDelete, setConfirmDelete] = useState(null)

  const stats = useMemo(() => {
    const perVillage = {}
    contacts.forEach(c => { perVillage[c.village_id] = (perVillage[c.village_id] || 0) + 1 })
    const byQ = {}
    villages.forEach(v => {
      const k = v.qanungo_id || 'none'
      const b = byQ[k] || (byQ[k] = { villages: 0, contacts: 0, green: 0, amber: 0, red: 0 })
      b.villages++
      b.contacts += perVillage[v.id] || 0
      b[villageCompletion(v, perVillage[v.id] || 0).level]++
    })
    return byQ
  }, [villages, contacts])

  const qIds = new Set(qanungos.map(q => q.id))
  const orphanCount = villages.filter(v => !v.qanungo_id || !qIds.has(v.qanungo_id)).length
  const sorted = [...qanungos].sort(byName)
  const dayPreview = (dayNote?.body || '').split('\n').find(l => l.trim())

  async function saveName() {
    const name = (nameSheet.name || '').trim()
    if (!name) return
    if (nameSheet.id) await updateRow('qanungos', nameSheet.id, { name })
    else await insertRow('qanungos', { name })
    setNameSheet(null)
  }

  async function removeQanungo(q) {
    const affected = villages.filter(v => v.qanungo_id === q.id)
    for (const v of affected) await updateRow('villages', v.id, { qanungo_id: null })
    await deleteRow('qanungos', q.id)
    toast(`Removed ${q.name}`)
  }

  return (
    <>
      <div className={h.featureRow}>
        <Card className={h.feature} onClick={() => push('mainGroups')}>
          <span className={cx(ui.featureIcon, h.featureStar)}><IconStar size={22} filled /></span>
          <span className={h.featureText}>
            <span className={h.featureTitle}>Main Groups</span>
            <span className={h.featureSub}>{pinnedCount} pinned</span>
          </span>
        </Card>
        <Card className={h.feature} onClick={() => push('dayNote')}>
          <span className={cx(ui.featureIcon, h.featureDay)}><IconCalendar size={22} /></span>
          <span className={h.featureText}>
            <span className={h.featureTitle}>Day to Day</span>
            <span className={h.featureSub}>{dayPreview || 'Empty'}</span>
          </span>
        </Card>
      </div>

      <div className={ui.section}>
        <div className={ui.sectionHead}><span>Qanungos</span><span>{qanungos.length}</span></div>
        {sorted.length === 0 && orphanCount === 0 ? (
          <Empty icon={<IconLayers size={28} />} title="No Qanungos yet" text="Add your first Qanungo to start organising villages." />
        ) : (
          <ul className={ui.list}>
            {sorted.map(q => {
              const b = stats[q.id] || { villages: 0, contacts: 0, green: 0, amber: 0, red: 0 }
              const total = b.villages || 1
              return (
                <li key={q.id}>
                  <Card as="div" role="button" tabIndex={0} className={h.qRow} onClick={() => push('qanungo', { id: q.id })}>
                    <span className={cx(ui.dot, ui.dotTeal)} />
                    <div className={h.qMain}>
                      <span className={h.qName}>{q.name}</span>
                      <span className={h.qMeta}>{b.villages} village{b.villages !== 1 ? 's' : ''} · {b.contacts.toLocaleString()} contact{b.contacts !== 1 ? 's' : ''}</span>
                      {b.villages > 0 && (
                        <div className={h.progress} aria-label="Data completeness">
                          <span style={{ width: `${(b.green / total) * 100}%`, background: 'var(--green)' }} />
                          <span style={{ width: `${(b.amber / total) * 100}%`, background: 'var(--amber)' }} />
                          <span style={{ width: `${(b.red / total) * 100}%`, background: '#e9b3b3' }} />
                        </div>
                      )}
                    </div>
                    <button className={h.moreBtn} onClick={e => { e.stopPropagation(); setMenu(q) }} aria-label="More"><IconMore size={20} /></button>
                    <IconChevron className={ui.chev} />
                  </Card>
                </li>
              )
            })}
            {orphanCount > 0 && (
              <li>
                <Card as="div" role="button" tabIndex={0} className={h.qRow} onClick={() => push('qanungo', { id: null })}>
                  <span className={cx(ui.dot, ui.dot_amber)} />
                  <div className={h.qMain}>
                    <span className={h.qName}>Unassigned villages</span>
                    <span className={h.qMeta}>{orphanCount} village{orphanCount !== 1 ? 's' : ''} without a Qanungo</span>
                  </div>
                  <IconChevron className={ui.chev} />
                </Card>
              </li>
            )}
          </ul>
        )}
        <button className={ui.addRow} style={{ width: 'calc(100% - 78px)' }} onClick={() => setNameSheet({ name: '' })}><IconPlus size={18} />Add Qanungo</button>
      </div>

      <button className={cx(ui.fab)} onClick={onQuickAdd} aria-label="Quick add contact"><IconBolt size={28} className={ui.fabBolt} /></button>

      <ActionSheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name} items={menu && [
        { label: 'Rename', icon: <IconEdit size={20} />, onClick: () => setNameSheet({ id: menu.id, name: menu.name }) },
        { label: 'Remove Qanungo', icon: <IconTrash size={20} />, danger: true, onClick: () => setConfirmDelete(menu) },
      ]} />

      <ActionSheet open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove Qanungo?"
        text={confirmDelete && `${confirmDelete.name} will be removed. Its villages are kept and moved to “Unassigned villages”.`}
        items={confirmDelete && [{ label: `Remove ${confirmDelete.name}`, icon: <IconTrash size={20} />, danger: true, onClick: () => removeQanungo(confirmDelete) }]} />

      <Sheet open={!!nameSheet} onClose={() => setNameSheet(null)} title={nameSheet?.id ? 'Rename Qanungo' : 'New Qanungo'}>
        {nameSheet && (
          <form onSubmit={e => { e.preventDefault(); saveName() }}>
            <Field label="Name">
              <input className={ui.input} value={nameSheet.name} onChange={e => setNameSheet(x => ({ ...x, name: e.target.value }))} autoFocus placeholder="Qanungo name" autoCapitalize="words" />
            </Field>
            <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 20 }} disabled={!nameSheet.name.trim()}>Save</button>
          </form>
        )}
      </Sheet>
    </>
  )
}

// ---------- General notes ----------

export function NoteList({ notes, onOpen }) {
  return (
    <ul className={h.notes}>
      {notes.map(n => {
        const text = plainText(n.body).split('\n').map(l => l.trim()).filter(Boolean)
        const imgs = (n.body || '').match(/\[IMG:|<img/gi)?.length || 0
        return (
          <li key={n.id}>
            <button className={h.note} onClick={() => onOpen(n)}>
              <span className={h.noteTitle}>{text[0] || 'New Note'}</span>
              <span className={h.noteMeta}>
                <span className={h.noteDate}>{shortDate(n.created_at)}</span>
                <span className={h.notePreview}>{imgs ? `📷 ${imgs}  ` : ''}{text[1] || 'No additional text'}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function NotesTab() {
  const { push } = useNav()
  const notes = useLiveQuery(() => db.general_notes.orderBy('created_at').reverse().toArray(), [], [])
  async function create() {
    const n = await insertRow('general_notes', { body: '', images: [] })
    push('note', { table: 'general_notes', id: n.id, isNew: true })
  }
  return (
    <>
      {notes.length === 0
        ? <Empty icon={<IconNote size={28} />} title="No notes yet" text="General notes for the whole constituency live here." />
        : <NoteList notes={notes} onOpen={n => push('note', { table: 'general_notes', id: n.id })} />}
      <button className={ui.fab} onClick={create} aria-label="New note"><IconEdit size={26} /></button>
    </>
  )
}

// ---------- Global search ----------

function SearchTab({ villages, contacts }) {
  const { push } = useNav()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const vById = useMemo(() => Object.fromEntries(villages.map(v => [v.id, v])), [villages])
  const qName = useMemo(() => Object.fromEntries(qanungos.map(x => [x.id, x.name])), [qanungos])

  const term = q.trim().toLowerCase()
  const digits = phoneDigits(q)
  const active = term.length > 0 || tag

  const contactHits = useMemo(() => {
    if (!active) return []
    return contacts.filter(c => {
      if (tag && !(c.tags || []).includes(tag)) return false
      if (!term) return true
      if ((c.name || '').toLowerCase().includes(term)) return true
      if ((c.description || '').toLowerCase().includes(term)) return true
      if (digits.length >= 3 && phonesOf(c).some(p => phoneDigits(p).includes(digits))) return true
      return false
    }).sort((a, b) => {
      const as = (a.name || '').toLowerCase().startsWith(term) ? 0 : 1
      const bs = (b.name || '').toLowerCase().startsWith(term) ? 0 : 1
      return as - bs || byName(a, b)
    }).slice(0, 80)
  }, [contacts, term, digits, tag, active])

  const villageHits = useMemo(() => {
    if (!term || tag) return []
    return villages.filter(v => (v.name || '').toLowerCase().includes(term)).sort(byName).slice(0, 30)
  }, [villages, term, tag])

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Name, number or village" />
      <div className={ui.chipScroll} style={{ marginTop: 12 }}>
        {TAGS.map(t => (
          <button key={t} className={cx(ui.chipBtn, tag === t && ui.chipBtnOn)} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
        ))}
      </div>

      {!active && <Empty icon={<IconSearch size={28} />} title="Search everything" text="Contacts, phone numbers and villages — works offline." />}
      {active && contactHits.length === 0 && villageHits.length === 0 && <Empty title="No results" text="Try a different name or number." />}

      {villageHits.length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Villages</span><span className={h.resultCount}>{villageHits.length}</span></div>
          <ul className={ui.list}>
            {villageHits.map(v => (
              <li key={v.id}>
                <Card className={h.villageRow} onClick={() => push('village', { id: v.id })}>
                  <div className={ui.cardMain}>
                    <span className={ui.cardTitle}>{v.name}</span>
                    <span className={ui.cardSub}>{qName[v.qanungo_id] || 'No Qanungo'}</span>
                  </div>
                  <IconChevron className={ui.chev} />
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      {contactHits.length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Contacts</span><span className={h.resultCount}>{contactHits.length}</span></div>
          <ul className={ui.list}>
            {contactHits.map(c => (
              <ContactRow key={c.id} contact={c} subtitle={vById[c.village_id]?.name || 'Unknown village'}
                onPress={() => push('village', { id: c.village_id, tab: 'Contacts', highlight: c.id })} />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
