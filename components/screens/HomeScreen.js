import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav, useScreen } from '../../lib/nav'
import { insertRow, updateRow, deleteRow } from '../../lib/store'
import { villageCompletion, byName, shortDate, TAGS, bulkAddTimes, addedLabel } from '../../lib/domain'
import { plainText } from '../../lib/images'
import { phoneDigits, phonesOf } from '../../lib/phone'
import { Screen, BarButton, Tabs, Card, Sheet, ActionSheet, Empty, Field, SearchBox, SyncPill, cx, ui, useToast, useSyncState } from '../ui'
import { maybeAutoBriefing } from '../../lib/briefing'
import { ContactRow, useContactSheets } from '../contacts'
import { IconMap, IconSparkles, IconSettings, IconStar, IconCalendar, IconChevron, IconMore, IconPlus, IconBolt, IconEdit, IconTrash, IconNote, IconSearch, IconLayers, IconDownload } from '../Icons'
import { CONSTITUENCY, SHOW_MAP } from '../../lib/config'
import { TodayCard } from './TodayScreen'
import { NextLines } from './PlannerScreen'
import { TellButton } from '../TellHalqa'
import { WorksTab } from '../Works'
import { parseSharedText, numberKey } from '../../lib/importContacts'
import { queryWords, matchesWords, nameRank } from '../../lib/search'
import h from '../../styles/home.module.css'

const TABS = ['Qanungos', 'Works', 'Search']

export default function HomeScreen() {
  const { push, setParams } = useNav()
  const { key, params } = useScreen()
  // Notes was a tab until 13 Nov; an old saved 'Notes' tab opens Qanungos.
  const tab = TABS.includes(params.tab) ? params.tab : 'Qanungos'
  const sheets = useContactSheets()
  const toast = useToast()

  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])
  const pinnedCount = contacts.filter(c => c.pinned).length

  // On the first open of a new month, write last month's briefing in the background.
  const { lastSync } = useSyncState()
  useEffect(() => { if (lastSync) maybeAutoBriefing() }, [lastSync])

  // The "Save to Halqa" Shortcuts (iPhone share menu, or Back Tap with a copied
  // number) open Quick Add filled in:
  //   /?add=1&name=…&phone=…  a shared contact card (numbers one per line)
  //   /?add=1&text=…          a shared message such as "03007100764 rana Shahbaz"
  // If one of the numbers is already in Halqa, that person's profile opens instead.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (!p.has('add')) return
    window.history.replaceState(null, '', window.location.pathname)
    ;(async () => {
      let name = (p.get('name') || '').trim()
      let phones = (p.get('phone') || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
      let villageId = null
      if (p.has('text')) ({ name, phones, villageId } = parseSharedText(p.get('text'), await db.villages.toArray()))
      const keys = phones.map(numberKey).filter(k => k.length >= 10)
      if (keys.length) {
        const known = (await db.contacts.toArray()).filter(c => phonesOf(c).some(ph => keys.includes(numberKey(ph))))
        if (known.length) {
          sheets.open(known[0].id)
          if (known.length > 1) toast(`${known.length} people in Halqa have this number`)
          return
        }
      }
      sheets.quickAdd({ village_id: villageId, name, phone: phones[0] || '', phone2: phones[1] || '', phone3: phones[2] || '' })
    })()
  }, [])

  return (
    <Screen
      back={false}
      barTitle={null}
      actions={
        <>
          {SHOW_MAP && <BarButton onClick={() => push('map')} aria-label="District map"><IconMap size={21} /></BarButton>}
          <BarButton onClick={() => push('analysis')} aria-label="AI analysis"><IconSparkles size={21} /></BarButton>
          <BarButton onClick={() => push('settings')} aria-label="Settings"><IconSettings size={21} /></BarButton>
        </>
      }
      hero={
        <>
          <div className={h.heroTop}>
            <div className={h.brand}>
              <div className={h.brandTitle}>Halqa</div>
              <div className={h.brandSub}>{CONSTITUENCY}</div>
            </div>
            <SyncPill />
          </div>
          <div className={h.miniStats}>
            <span><b>{villages.length.toLocaleString()}</b> village{villages.length === 1 ? '' : 's'}</span>
            <span><b>{contacts.length.toLocaleString()}</b> contact{contacts.length === 1 ? '' : 's'}</span>
            <span><b>{pinnedCount.toLocaleString()}</b> pinned</span>
          </div>
        </>
      }
      tabs={<Tabs id="home" tabs={TABS} value={tab} onChange={t => setParams(key, { tab: t })} />}
    >
      {tab === 'Qanungos' && <QanungosTab villages={villages} contacts={contacts} pinnedCount={pinnedCount} onQuickAdd={() => sheets.quickAdd()} />}
      {tab === 'Works' && <WorksTab category={params.workCategory} onCategory={c => setParams(key, { workCategory: c })} sheets={sheets} />}
      {tab === 'Search' && <SearchTab villages={villages} contacts={contacts} sheets={sheets} />}
      {sheets.element}
    </Screen>
  )
}

// ---------- Qanungos ----------

function QanungosTab({ villages, contacts, pinnedCount, onQuickAdd }) {
  const { push } = useNav()
  const toast = useToast()
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const plannerSub = useLiveQuery(async () => {
    const all = await db.events.toArray()
    const review = all.filter(e => e.status === 'review').length
    const today = new Date().toLocaleDateString('en-CA')
    const ahead = all.filter(e => e.status !== 'review' && e.day && e.day >= today).length
    return review ? `${review} to review` : ahead ? `${ahead} upcoming` : ''
  }, [], '')
  const toSort = useLiveQuery(() => db.import_queue.count(), [], 0)
  const noteCount = useLiveQuery(() => db.general_notes.count(), [], 0)
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
      <div className={h.hub}>
        <TodayCard contacts={contacts} className={h.hubToday} />
        <div className={h.hubLower}>
          <NextLines className={h.hubNext} />
          <div className={h.hubBtns}>
            <TellButton className={h.hubBtn}>
              <IconSparkles size={20} /><span className={h.hubBtnLabel}>Tell Halqa</span><span className={h.hubBtnSub}>&nbsp;</span>
            </TellButton>
            <button className={h.hubBtn} onClick={() => push('mainGroups')}>
              <IconStar size={20} filled className={h.hubStar} /><span className={h.hubBtnLabel}>Main Groups</span><span className={h.hubBtnSub}>{pinnedCount}</span>
            </button>
            <button className={h.hubBtn} onClick={() => push('planner')}>
              <IconCalendar size={20} className={h.hubCal} /><span className={h.hubBtnLabel}>Planner</span><span className={h.hubBtnSub}>{plannerSub || '\u00a0'}</span>
            </button>
          </div>
          <button className={h.notesLink} onClick={() => push('notes')}>
            <IconNote size={16} />Notes · {noteCount}
          </button>
        </div>
      </div>
      {toSort > 0 && (
        <Card className={h.importCard} onClick={() => push('import')}>
          <span className={cx(ui.featureIcon, h.importIcon)}><IconDownload size={21} /></span>
          <span className={h.featureText}>
            <span className={h.featureTitle}>{toSort.toLocaleString()} iPhone contacts to sort</span>
            <span className={h.featureSub}>Continue importing</span>
          </span>
          <IconChevron size={18} />
        </Card>
      )}

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

// Notes moved off the home tabs (13 Nov): a slim "Notes · N" link under the
// three teal buttons opens this screen.
export function NotesScreen() {
  const { push } = useNav()
  const notes = useLiveQuery(() => db.general_notes.orderBy('created_at').reverse().toArray(), [], [])
  async function create() {
    const n = await insertRow('general_notes', { body: '', images: [] })
    push('note', { table: 'general_notes', id: n.id, isNew: true })
  }
  return (
    <Screen title="Notes" home>
      {notes.length === 0
        ? <Empty icon={<IconNote size={28} />} title="No notes yet" text="General notes for the whole constituency live here." />
        : <NoteList notes={notes} onOpen={n => push('note', { table: 'general_notes', id: n.id })} />}
      <button className={ui.fab} onClick={create} aria-label="New note"><IconEdit size={26} /></button>
    </Screen>
  )
}

// ---------- Global search ----------

function SearchTab({ villages, contacts, sheets }) {
  const { push } = useNav()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const vById = useMemo(() => Object.fromEntries(villages.map(v => [v.id, v])), [villages])
  const qName = useMemo(() => Object.fromEntries(qanungos.map(x => [x.id, x.name])), [qanungos])

  const term = q.trim().toLowerCase()
  const digits = phoneDigits(q)
  const active = term.length > 0 || tag

  const words = useMemo(() => queryWords(q), [q])

  // Every word must appear in the name, village or description, in any order.
  // If nothing matches, try again allowing spelling variants.
  const { contactHits, similar } = useMemo(() => {
    if (!active) return { contactHits: [], similar: false }
    const find = loose => contacts.filter(c => {
      if (tag && !(c.tags || []).includes(tag)) return false
      if (!words.length) return true
      if (digits.length >= 3 && digits.length === q.replace(/[\s+()-]/g, '').length && phonesOf(c).some(p => phoneDigits(p).includes(digits))) return true
      return matchesWords(words, [c.name, vById[c.village_id]?.name, c.description], loose)
    })
    let hits = find(false)
    const similar = !hits.length && words.length > 0
    if (similar) hits = find(true)
    hits.sort((a, b) => nameRank(words, a.name) - nameRank(words, b.name) || byName(a, b))
    return { contactHits: hits.slice(0, 80), similar: similar && hits.length > 0 }
  }, [contacts, words, digits, q, tag, active, vById])

  const villageHits = useMemo(() => {
    if (!words.length || tag) return []
    return villages.filter(v => matchesWords(words, v.name)).sort(byName).slice(0, 30)
  }, [villages, words, tag])

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Name, number or village" />
      <div className={ui.chipScroll} style={{ marginTop: 12 }}>
        {TAGS.map(t => (
          <button key={t} className={cx(ui.chipBtn, tag === t && ui.chipBtnOn)} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
        ))}
      </div>

      {!active && <RecentlyAdded contacts={contacts} vById={vById} sheets={sheets} />}
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
          <div className={ui.sectionHead}><span>{similar ? 'Similar spellings' : 'Contacts'}</span><span className={h.resultCount}>{contactHits.length}</span></div>
          <ul className={ui.list}>
            {contactHits.map(c => (
              <ContactRow key={c.id} contact={c} villageName={vById[c.village_id]?.name} subtitle={vById[c.village_id]?.name || 'Unknown village'}
                onPress={() => push('village', { id: c.village_id, tab: 'Contacts', highlight: c.id })} />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

// The last 15 people added one by one (not the iPhone import), so a quick add
// in the field can get its description later at home.
function RecentlyAdded({ contacts, vById, sheets }) {
  const recent = useMemo(() => {
    const bulk = bulkAddTimes(contacts)
    return contacts.filter(c => c.created_at && !bulk.has(c.created_at))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 15)
  }, [contacts])
  if (!recent.length) return <Empty icon={<IconSearch size={28} />} title="Search everything" text="Contacts, phone numbers and villages — works offline." />
  return (
    <div className={ui.section}>
      <div className={ui.sectionHead}><span>Recently added</span></div>
      <ul className={h.recentList}>
        {recent.map(c => (
          <li key={c.id} className={h.recentRow}>
            <button className={h.recentMain} onClick={() => sheets.open(c.id)}>
              <span className={h.recentName}>{c.name}</span>
              <span className={h.recentSub}>{vById[c.village_id]?.name || 'No village'} · {addedLabel(c.created_at)}</span>
              {c.description
                ? <span className={h.recentDesc}>{c.description}</span>
                : null}
            </button>
            {!c.description && (
              <button className={h.recentAdd} onClick={() => sheets.edit(c, 'description')}>Add description</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
