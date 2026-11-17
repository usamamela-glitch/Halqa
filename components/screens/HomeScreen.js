import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav, useScreen } from '../../lib/nav'
import { insertRow, updateRow, deleteRow } from '../../lib/store'
import { villageCompletion, byName, shortDate, TAGS, bulkAddTimes, addedLabel } from '../../lib/domain'
import { plainText } from '../../lib/images'
import { phoneDigits, phonesOf, cleanText } from '../../lib/phone'
import { Screen, BarButton, Tabs, Card, Sheet, ActionSheet, Empty, Field, SearchBox, SyncPill, cx, ui, useToast, useSyncState } from '../ui'
import { maybeAutoBriefing } from '../../lib/briefing'
import { ContactRow, useContactSheets } from '../contacts'
import { IconMap, IconSparkles, IconSettings, IconStar, IconCalendar, IconChevron, IconMore, IconPlus, IconBolt, IconEdit, IconTrash, IconNote, IconSearch, IconLayers, IconDownload, IconHome } from '../Icons'
import { CONSTITUENCY, SHOW_MAP } from '../../lib/config'
import { TodayCard } from './TodayScreen'
import { NextLines, ItemForm } from './PlannerScreen'
import { TellButton } from '../TellHalqa'
import { WorksTab, WorkList } from '../Works'
import { KeypadTab } from '../Keypad'
import kp from '../../styles/keypad.module.css'
import { parseSharedText, numberKey } from '../../lib/importContacts'
import { queryWords, matchesWords, nameRank } from '../../lib/search'
import h from '../../styles/home.module.css'

const TABS = ['Home', 'Projects', 'Keypad', 'Search']

export default function HomeScreen() {
  const { push, setParams } = useNav()
  const { key, params } = useScreen()
  // Notes was a tab until 13 Nov; an old saved 'Notes' tab opens Qanungos.
  const tab = TABS.includes(params.tab) ? params.tab : 'Home'
  const sheets = useContactSheets()
  const toast = useToast()

  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])
  const pinnedCount = contacts.filter(c => c.pinned).length
  const vById = useMemo(() => Object.fromEntries(villages.map(v => [v.id, v])), [villages])

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
      let name = cleanText(p.get('name')).trim()
      let phones = cleanText(p.get('phone')).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
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
      bodyClassName={tab === 'Keypad' ? kp.page : undefined}
      actions={
        <>
          {SHOW_MAP && <BarButton onClick={() => push('map')} aria-label="District map"><IconMap size={21} /></BarButton>}
          <BarButton onClick={() => push('analysis')} aria-label="AI analysis"><IconSparkles size={21} /></BarButton>
          <BarButton onClick={() => push('settings')} aria-label="Settings"><IconSettings size={21} /></BarButton>
        </>
      }
      hero={tab === 'Keypad' ? null : (
        <>
          <div className={h.heroTop}>
            <div className={h.brand}>
              <button className={h.brandTitle} onClick={() => setParams(key, { tab: 'Home' })}>Halqa</button>
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
      )}
    >
      {tab === 'Home' && <QanungosTab villages={villages} contacts={contacts} pinnedCount={pinnedCount} onQuickAdd={() => sheets.quickAdd()} />}
      {tab === 'Projects' && <WorksTab category={params.workCategory} onCategory={c => setParams(key, { workCategory: c })} sheets={sheets} />}
      {tab === 'Search' && <SearchTab villages={villages} contacts={contacts} sheets={sheets} />}
      {tab === 'Keypad' && <KeypadTab contacts={contacts} vById={vById} sheets={sheets} />}
      <TabBar tab={tab} onTab={t => setParams(key, { tab: t })} onQuickAdd={() => sheets.quickAdd()} />
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
  // The Halqa list (people to see, things to do in the constituency), one tap from home (14 Nov).
  const halqaList = useLiveQuery(async () => {
    const list = (await db.planner_lists.toArray()).find(l => (l.name || '').trim().toLowerCase() === 'halqa')
    if (!list) return null
    const open = (await db.list_items.where('list_id').equals(list.id).toArray()).filter(i => !i.done_at)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.day || '9999').localeCompare(b.day || '9999') || (a.created_at || '').localeCompare(b.created_at || ''))
    return { list, open }
  }, [], null)
  const [addHalqa, setAddHalqa] = useState(0)
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
          {halqaList && (
            <div className={h.halqaBar}>
              <button className={h.halqaOpen} onClick={() => push('planner', { tab: halqaList.list.id })}>
                <b>{halqaList.list.name} list · {halqaList.open.length}</b>
                {halqaList.open[0] && <span className={h.halqaFirst}> · {halqaList.open[0].title}</span>}
              </button>
              <button className={h.halqaPlus} onClick={() => setAddHalqa(k => k + 1)} aria-label={`Add to ${halqaList.list.name}`}><IconPlus size={18} /></button>
            </div>
          )}
        </div>
      </div>
      <Sheet open={!!addHalqa && !!halqaList} onClose={() => setAddHalqa(0)} title={`Add to ${halqaList?.list.name || 'Halqa'}`}>
        {!!addHalqa && halqaList && <ItemForm key={addHalqa} initial={{ list_id: halqaList.list.id }} onDone={() => setAddHalqa(0)} />}
      </Sheet>
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
export async function newGeneralNote(push) {
  const n = await insertRow('general_notes', { body: '', images: [] })
  push('note', { table: 'general_notes', id: n.id, isNew: true })
}

// The general notes list. Since 15 Nov it lives in the Planner's Notes tab.
export function NotesPanel() {
  const { push } = useNav()
  const notes = useLiveQuery(() => db.general_notes.orderBy('created_at').reverse().toArray(), [], [])
  return notes.length === 0
    ? <Empty icon={<IconNote size={28} />} title="No notes yet" text="General notes for the whole constituency. Tap + to write one." />
    : <NoteList notes={notes} onOpen={n => push('note', { table: 'general_notes', id: n.id })} />
}

export function NotesScreen() {
  const { push } = useNav()
  return (
    <Screen title="Notes" home>
      <NotesPanel />
      <button className={ui.fab} onClick={() => newGeneralNote(push)} aria-label="New note"><IconEdit size={26} /></button>
    </Screen>
  )
}

// ---------- Bottom bar (17 Nov), on the main page only ----------
const KeypadIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {[5, 12, 19].flatMap(y => [5, 12, 19].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" />))}
  </svg>
)
function TabBar({ tab, onTab, onQuickAdd }) {
  const item = (id, label, icon) => (
    <button className={cx(h.tbItem, tab === id && h.tbOn)} onClick={() => onTab(id)} aria-current={tab === id ? 'page' : undefined}>
      {icon}<span>{label}</span>
    </button>
  )
  return (
    <nav className={h.tabBar} aria-label="Main">
      {item('Home', 'Home', <IconHome size={22} />)}
      {item('Projects', 'Projects', <IconLayers size={22} />)}
      <button className={h.tbQuick} onClick={onQuickAdd} aria-label="Quick add contact">
        <span className={h.tbBolt}><IconBolt size={26} /></span><span>Quick add</span>
      </button>
      {item('Keypad', 'Keypad', <KeypadIcon />)}
      {item('Search', 'Search', <IconSearch size={22} />)}
    </nav>
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

  // 17 Nov: results in groups.
  //  1. Contacts whose name (or village, or number) matches: every word, in any order.
  //  2. Contacts whose description mentions the exact words, in that order
  //     ("Mian Ilyas's nephew"), with the words highlighted.
  //  3. Projects, and 4. notes and the Planner, that mention the exact words.
  // If nothing matches by name, try again allowing spelling variants.
  const phrase = useMemo(() => phraseMatcher(q), [q])
  const { contactHits, similar, descHits } = useMemo(() => {
    if (!active) return { contactHits: [], similar: false, descHits: [] }
    const find = loose => contacts.filter(c => {
      if (tag && !(c.tags || []).includes(tag)) return false
      if (!words.length) return true
      if (digits.length >= 3 && digits.length === q.replace(/[\s+()-]/g, '').length && phonesOf(c).some(p => phoneDigits(p).includes(digits))) return true
      return matchesWords(words, [c.name, vById[c.village_id]?.name], loose)
    })
    let hits = find(false)
    const named = new Set(hits.map(c => c.id))
    const descHits = phrase ? contacts.filter(c => !named.has(c.id) && (!tag || (c.tags || []).includes(tag)) && phrase.test(c.description || '')).sort(byName).slice(0, 80) : []
    const similar = !hits.length && !descHits.length && words.length > 0
    if (similar) hits = find(true)
    hits.sort((a, b) => nameRank(words, a.name) - nameRank(words, b.name) || byName(a, b))
    return { contactHits: hits.slice(0, 80), similar: similar && hits.length > 0, descHits }
  }, [contacts, words, digits, q, tag, active, vById, phrase])

  // Everything else that mentions the exact words.
  const works = useLiveQuery(() => db.works.toArray(), [], [])
  const vNotes = useLiveQuery(() => db.notes.toArray(), [], [])
  const gNotes = useLiveQuery(() => db.general_notes.toArray(), [], [])
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const listItems = useLiveQuery(() => db.list_items.toArray(), [], [])
  const lists = useLiveQuery(() => db.planner_lists.toArray(), [], [])
  const elsewhere = useMemo(() => {
    if (!phrase || tag) return { projects: [], other: [] }
    const listName = Object.fromEntries(lists.map(l => [l.id, l.name]))
    const projects = works.filter(x => phrase.test(x.body || '')).sort((a, b) => (a.done_at ? 1 : 0) - (b.done_at ? 1 : 0) || (b.created_at || '').localeCompare(a.created_at || ''))
    const other = [
      ...vNotes.filter(n => phrase.test(plainText(n.body || ''))).map(n => ({ key: n.id, where: `Note · ${vById[n.village_id]?.name || 'Village'}`, text: plainText(n.body || ''), go: () => push('note', { table: 'notes', id: n.id }) })),
      ...gNotes.filter(n => phrase.test(plainText(n.body || ''))).map(n => ({ key: n.id, where: 'Note', text: plainText(n.body || ''), go: () => push('note', { table: 'general_notes', id: n.id }) })),
      ...events.filter(e => phrase.test([e.title, e.notes, e.venue, e.village].filter(Boolean).join(' · '))).map(e => ({ key: e.id, where: `Planner · ${e.function || 'Event'}${e.day ? ` · ${shortDate(e.day)}` : ''}`, text: [e.title, e.notes, e.venue].filter(Boolean).join(' · '), go: () => push('planner', { tab: 'calendar', day: e.day }) })),
      ...listItems.filter(i => phrase.test([i.title, i.details].filter(Boolean).join(' · '))).map(i => ({ key: i.id, where: `Planner · ${listName[i.list_id] || 'List'}${i.done_at ? ' · done' : ''}`, text: [i.title, i.details].filter(Boolean).join(' · '), go: () => push('planner', { tab: i.list_id }) })),
    ]
    return { projects, other }
  }, [phrase, tag, works, vNotes, gNotes, events, listItems, lists, vById, push])

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

      {descHits.length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Mentioned in a description</span><span className={h.resultCount}>{descHits.length}</span></div>
          <ul className={ui.list}>
            {descHits.map(c => (
              <ContactRow key={c.id} contact={c} villageName={vById[c.village_id]?.name} subtitle={vById[c.village_id]?.name || 'Unknown village'} mark={phrase}
                onPress={() => push('village', { id: c.village_id, tab: 'Contacts', highlight: c.id })} />
            ))}
          </ul>
        </div>
      )}

      {elsewhere.projects.length > 0 && (
        <WorkList list={elsewhere.projects} heading="Projects" headRight={elsewhere.projects.length} className={ui.section} />
      )}

      {elsewhere.other.length > 0 && (
        <div className={ui.section}>
          <div className={ui.sectionHead}><span>Notes and Planner</span><span className={h.resultCount}>{elsewhere.other.length}</span></div>
          <div className={h.elseList}>
            {elsewhere.other.map(x => (
              <button key={x.key} className={h.elseRow} onClick={x.go}>
                <span className={h.elseWhere}>{x.where}</span>
                <span className={h.elseText}><Marked text={x.text} phrase={phrase} /></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// The exact words typed, in order, as whole words (capitals don't matter):
// "mian ilyas" matches "Mian Ilyas's nephew" and "mian  ilyas ka", not "Mian Ilyasabad".
function phraseMatcher(q) {
  const parts = (q || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length || parts.join('').length < 2) return null
  const esc = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  try { return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'iu') } catch { return null }
}

// Text with the matched words highlighted.
export function Marked({ text, phrase }) {
  if (!phrase || !text) return text || null
  const g = new RegExp(phrase.source, 'giu')
  const out = []
  let last = 0, m
  while ((m = g.exec(text)) && out.length < 20) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<mark key={m.index} className={h.mark}>{m[0]}</mark>)
    last = m.index + m[0].length
    if (!m[0].length) g.lastIndex++
  }
  out.push(text.slice(last))
  return out
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
