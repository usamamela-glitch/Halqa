import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useNav } from '../lib/nav'
import { savePhoto } from '../lib/images'
import { queryWords, matchesWords, nameRank } from '../lib/search'
import { byName } from '../lib/domain'
import { WORK_CATEGORIES, categoryOf, categoryLabel, categoryIcon, serialLabel, splitWorks, saveWork, setWorkDone, removeWork, workShareText } from '../lib/works'
import { useContactSheets } from './contacts'
import { Sheet, ActionSheet, Empty, Field, cx, ui, useToast, useImageUrl } from './ui'
import { SwipeRow, shareText } from './screens/PlannerScreen'
import { IconCheck, IconPlus, IconShare, IconMove, IconTrash, IconX, IconCamera, IconLayers, IconChevron } from './Icons'
import p from '../styles/planner.module.css'
import w from '../styles/works.module.css'

const BUCKET = 'note-images'

// Names for ids, so rows can show 📍 villages and 👤 people.
function useNames() {
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])
  return useMemo(() => {
    const village = Object.fromEntries(villages.map(v => [v.id, v]))
    const contact = Object.fromEntries(contacts.map(c => [c.id, c]))
    return { village, contact, villages, contacts }
  }, [villages, contacts])
}
const namesOf = (ids, map) => (ids || []).map(id => map[id]?.name).filter(Boolean)

// ---------- The Works tab on the home page ----------

export function WorksTab({ category, onCategory, sheets }) {
  const toast = useToast()
  const works = useLiveQuery(() => db.works.toArray(), [], [])
  const names = useNames()
  const [view, setView] = useState(null)       // id of the work open in the detail sheet
  const [form, setForm] = useState(null)       // {} new, or a work
  const [formKey, setFormKey] = useState(0)
  const [moving, setMoving] = useState(null)
  const [showOld, setShowOld] = useState(false)

  const cat = WORK_CATEGORIES.some(c => c.id === category) ? category : 'roads'
  const counts = useMemo(() => {
    const n = {}
    works.forEach(x => { if (!x.done_at) n[categoryOf(x)] = (n[categoryOf(x)] || 0) + 1 })
    return n
  }, [works])
  const { open, recent, old } = useMemo(() => splitWorks(works.filter(x => categoryOf(x) === cat)), [works, cat])
  const viewing = view && works.find(x => x.id === view)

  const openForm = initial => { setView(null); setFormKey(k => k + 1); setForm(initial) }

  async function toggle(work) {
    const done = !work.done_at
    const undo = await setWorkDone(work, done)
    toast(done ? 'Marked as done' : 'Marked as not done', { label: 'Undo', onClick: undo })
  }
  async function del(work) {
    const undo = await removeWork(work)
    toast('Deleted', { label: 'Undo', onClick: undo })
  }
  const share = work => shareText(workShareText(work, namesOf(work.village_ids, names.village), namesOf(work.contact_ids, names.contact)), toast)

  const row = work => (
    <SwipeRow key={work.id} actions={[
      { label: 'Share', tone: 'share', icon: <IconShare size={19} />, onClick: () => share(work) },
      { label: 'Move', tone: 'move', icon: <IconMove size={19} />, onClick: () => setMoving(work) },
      { label: 'Delete', tone: 'delete', icon: <IconTrash size={19} />, onClick: () => del(work) },
    ]}>
      <WorkLine work={work} names={names} onToggle={() => toggle(work)} onPress={() => setView(work.id)} />
    </SwipeRow>
  )

  return (
    <>
      <div className={p.tabs} style={{ marginTop: 0 }}>
        {WORK_CATEGORIES.map(c => (
          <button key={c.id} className={cx(p.tabPill, cat === c.id && p.tabOn)} onClick={() => { setShowOld(false); onCategory(c.id) }}>
            {c.label}{counts[c.id] ? <b>{counts[c.id]}</b> : null}
          </button>
        ))}
      </div>

      <div className={ui.section} style={{ marginTop: 14 }}>
        {open.length + recent.length === 0 ? (
          <Empty icon={<IconLayers size={28} />} title={`No ${categoryLabel(cat).toLowerCase()} works`} text="Tap + to add one." />
        ) : (
          <div className={cx(ui.card, p.dayCard)}>{[...open, ...recent].map(row)}</div>
        )}
        {old.length > 0 && (
          <>
            <button className={p.pastToggle} onClick={() => setShowOld(v => !v)}>{showOld ? 'Hide done' : `Show done (${old.length})`}</button>
            {showOld && <div className={cx(ui.card, p.dayCard)}>{old.map(row)}</div>}
          </>
        )}
      </div>

      <button className={ui.fab} onClick={() => openForm({ category: cat })} aria-label="Add work"><IconPlus size={28} /></button>

      <Sheet open={!!viewing} onClose={() => setView(null)} title={viewing ? `${categoryLabel(categoryOf(viewing))}${viewing.serial ? ` · ${serialLabel(viewing)}` : ''}` : ''}
        headerRight={viewing && <button className={w.editBtn} onClick={() => openForm(viewing)}>Edit</button>}>
        {viewing && (
          <WorkDetail work={viewing} names={names}
            onVillage={() => setView(null)}
            onPerson={id => { setView(null); sheets.open(id) }}
            onToggle={async () => { await toggle(viewing); if (!viewing.done_at) setView(null) }} />
        )}
      </Sheet>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit work' : 'New work'}>
        {form && <WorkForm key={formKey} initial={form} names={names} onDone={() => setForm(null)} />}
      </Sheet>

      <ActionSheet open={!!moving} onClose={() => setMoving(null)} title="Move to…"
        items={moving && WORK_CATEGORIES.filter(c => c.id !== categoryOf(moving)).map(c => ({
          label: c.label,
          onClick: async () => {
            const before = { category: moving.category, serial: moving.serial ?? null }
            await saveWork(moving.id, { category: c.id })
            toast(`Moved to ${c.label}`, { label: 'Undo', onClick: () => saveWork(moving.id, before) })
          },
        }))} />
    </>
  )
}

// ---------- One row ----------

function Thumb({ path, className }) {
  const url = useImageUrl(BUCKET, path)
  const [broken, setBroken] = useState(false)
  if (!url || broken) return <span className={cx(w.thumb, w.thumbEmpty, className)} />
  return <img src={url} alt="" className={cx(w.thumb, className)} onError={() => setBroken(true)} />
}

function Tags({ work, names }) {
  const villages = namesOf(work.village_ids, names.village)
  const people = namesOf(work.contact_ids, names.contact)
  if (!villages.length && !people.length && !work.self_identified) return null
  return (
    <span className={w.tags}>
      {villages.map((n, i) => <span key={`v${i}`} className={cx(w.tag, w.tagVillage)}>📍 {n}</span>)}
      {people.map((n, i) => <span key={`c${i}`} className={cx(w.tag, w.tagPerson)}>👤 {n}</span>)}
      {work.self_identified && <span className={cx(w.tag, w.tagSelf)}>★ Self identified</span>}
    </span>
  )
}

function WorkLine({ work, names, onToggle, onPress }) {
  const done = !!work.done_at
  const first = (work.images || [])[0]
  return (
    <div className={cx(p.item, done && p.itemDone)}>
      <button className={cx(p.box, done && p.boxOn)} onClick={onToggle} aria-label={done ? 'Not done' : 'Done'}>
        {done && <IconCheck size={15} />}
      </button>
      <button className={w.rowMain} onClick={onPress}>
        <span className={cx(w.body, done && w.bodyDone)}>{(work.body || '').trim() || 'No text'}</span>
        <Tags work={work} names={names} />
        {done && <span className={p.where}>Done {new Date(work.done_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
      </button>
      {work.serial ? <span className={w.serial}>{serialLabel(work)}</span> : null}
      {first && (
        <button className={w.thumbBtn} onClick={onPress} aria-label="Open">
          <Thumb path={first} />
          {work.images.length > 1 && <span className={w.thumbCount}>{work.images.length}</span>}
        </button>
      )}
    </div>
  )
}

// ---------- Detail sheet ----------

function BigPicture({ path }) {
  const url = useImageUrl(BUCKET, path)
  if (!url) return <div className={cx(w.big, w.bigEmpty)} />
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className={w.big} /></a>
}

function WorkDetail({ work, names, onVillage, onPerson, onToggle }) {
  const { push } = useNav()
  const villages = (work.village_ids || []).map(id => names.village[id]).filter(Boolean)
  const people = (work.contact_ids || []).map(id => names.contact[id]).filter(Boolean)
  const done = !!work.done_at
  return (
    <div>
      <p className={w.detailText}>{(work.body || '').trim() || 'No text'}</p>
      {work.self_identified && <div className={w.selfLine}>★ Self identified</div>}

      {villages.length > 0 && (
        <div className={w.group}>
          <div className={ui.label}>Villages</div>
          <div className={w.linkList}>
            {villages.map(v => (
              <button key={v.id} className={w.linkRow} onClick={() => { onVillage(); push('village', { id: v.id }) }}>
                <span>📍 {v.name}</span><IconChevron size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
      {people.length > 0 && (
        <div className={w.group}>
          <div className={ui.label}>Asked by</div>
          <div className={w.linkList}>
            {people.map(c => (
              <button key={c.id} className={w.linkRow} onClick={() => onPerson(c.id)}>
                <span>👤 {c.name}{names.village[c.village_id] ? <small> · {names.village[c.village_id].name}</small> : null}</span><IconChevron size={16} />
              </button>
            ))}
          </div>
        </div>
      )}

      {(work.images || []).length > 0 && (
        <div className={w.group}>
          {work.images.map(path => <BigPicture key={path} path={path} />)}
        </div>
      )}

      <button className={cx(ui.btn, ui.btnBlock, done ? ui.btnSecondary : ui.btnPrimary)} style={{ marginTop: 20 }} onClick={onToggle}>
        {done ? 'Mark as not done' : <><IconCheck size={18} /> Mark as done</>}
      </button>
      {done && <p className={w.doneNote}>Done {new Date(work.done_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>}
    </div>
  )
}

// ---------- Add / Edit ----------

// Search-and-tap list that builds up a selection of several (villages or people).
function MultiPick({ items, value, onChange, placeholder, icon }) {
  const [q, setQ] = useState('')
  const byId = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const words = useMemo(() => queryWords(q), [q])
  const matches = useMemo(() => {
    if (!words.length) return []
    return items.filter(i => !value.includes(i.id) && matchesWords(words, [i.name, i.sub]))
      .sort((a, b) => nameRank(words, a.name) - nameRank(words, b.name) || byName(a, b))
      .slice(0, 30)
  }, [items, words, value])
  return (
    <div>
      {value.length > 0 && (
        <div className={w.picked}>
          {value.map(id => (
            <span key={id} className={w.pickedChip}>
              {icon} {byId[id]?.name || 'Unknown'}
              <button type="button" onClick={() => onChange(value.filter(x => x !== id))} aria-label="Remove"><IconX size={13} /></button>
            </span>
          ))}
        </div>
      )}
      <input className={ui.input} placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} autoCorrect="off" autoCapitalize="off" spellCheck={false} />
      {words.length > 0 && (
        <div className={w.pickList}>
          {matches.length === 0 && <div className={w.pickItem}><span className={w.pickSub}>No match</span></div>}
          {matches.map(i => (
            <button type="button" key={i.id} className={w.pickItem} onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange([...value, i.id]); setQ('') }}>
              <span className={w.pickName}>{i.name}</span>
              {i.sub && <span className={w.pickSub}>{i.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FormThumb({ path, onRemove }) {
  return (
    <span className={w.formThumb}>
      <Thumb path={path} className={w.formThumbImg} />
      <button type="button" className={w.formThumbX} onClick={onRemove} aria-label="Remove picture"><IconX size={13} /></button>
    </span>
  )
}

export function WorkForm({ initial, names, onDone }) {
  const toast = useToast()
  const isNew = !initial?.id
  const [f, setF] = useState(() => ({
    category: categoryOf({ category: initial?.category }),
    body: initial?.body || '',
    village_ids: initial?.village_ids || [],
    contact_ids: initial?.contact_ids || [],
    self_identified: !!initial?.self_identified,
    images: initial?.images || [],
  }))
  const [adding, setAdding] = useState(0)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  const villageItems = useMemo(() => names.villages.map(v => ({ id: v.id, name: v.name })), [names.villages])
  const contactItems = useMemo(() => names.contacts.map(c => ({ id: c.id, name: c.name, sub: names.village[c.village_id]?.name || '' })), [names.contacts, names.village])

  async function addPictures(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setAdding(files.length)
    const paths = []
    for (const file of files) {
      try { paths.push((await savePhoto(BUCKET, 'works', file)).path) } catch { toast('A picture could not be added') }
    }
    setF(x => ({ ...x, images: [...x.images, ...paths] }))
    setAdding(0)
  }

  async function save(e) {
    e.preventDefault()
    await saveWork(initial?.id, { ...f, body: f.body.trim() })
    toast(isNew ? `Added to ${categoryLabel(f.category)}` : 'Saved')
    onDone()
  }
  async function remove() {
    const undo = await removeWork(initial)
    toast('Deleted', { label: 'Undo', onClick: undo })
    onDone()
  }

  return (
    <form onSubmit={save}>
      <div className={ui.field}>
        <span className={ui.label}>Category</span>
        <div className={p.chips}>
          {WORK_CATEGORIES.map(c => (
            <button type="button" key={c.id} className={cx(ui.chipBtn, f.category === c.id && ui.chipBtnOn)} onClick={() => set('category', c.id)}>{c.label}</button>
          ))}
        </div>
      </div>
      <Field label="What needs doing">
        <textarea className={ui.textarea} value={f.body} onChange={e => set('body', e.target.value)} autoFocus={isNew}
          placeholder="e.g. Road from Lilliani to Kot Momin, 3 km" autoCapitalize="sentences" rows={4} />
      </Field>
      <div className={ui.field}>
        <span className={ui.label}>Villages</span>
        <MultiPick items={villageItems} value={f.village_ids} onChange={v => set('village_ids', v)} placeholder="Add a village…" icon="📍" />
      </div>
      <div className={ui.field}>
        <span className={ui.label}>People who asked</span>
        <MultiPick items={contactItems} value={f.contact_ids} onChange={v => set('contact_ids', v)} placeholder="Add a person (name or village)…" icon="👤" />
      </div>
      <label className={w.switchRow}>
        <span className={w.switchText}>★ Self identified</span>
        <input type="checkbox" className={w.switch} checked={f.self_identified} onChange={e => set('self_identified', e.target.checked)} />
      </label>
      <div className={ui.field}>
        <span className={ui.label}>Pictures</span>
        <div className={w.formThumbs}>
          {f.images.map(path => <FormThumb key={path} path={path} onRemove={() => set('images', f.images.filter(x => x !== path))} />)}
          {adding > 0 && <span className={cx(w.formThumb, w.formThumbBusy)}>…</span>}
          <label className={w.addPic}>
            <IconCamera size={22} />
            <span>Add</span>
            <input type="file" accept="image/*" multiple onChange={addPictures} hidden />
          </label>
        </div>
      </div>
      <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 22 }} disabled={!f.body.trim() || adding > 0}>
        {isNew ? 'Add' : 'Save'}
      </button>
      {!isNew && <button type="button" className={p.delete} onClick={() => setConfirmDel(true)}>Delete</button>}
      <ActionSheet open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this work?"
        items={[{ label: 'Delete', danger: true, onClick: remove }]} />
    </form>
  )
}

// ---------- On a village's Development tab ----------

// Everything in Works tagged with this village, by category: open first, then done.
// It's a live view of Works, so edits there show here straight away.
export function VillageWorks({ village }) {
  const toast = useToast()
  const sheets = useContactSheets()
  const works = useLiveQuery(() => db.works.toArray(), [], [])
  const names = useNames()
  const [view, setView] = useState(null)
  const [form, setForm] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const mine = useMemo(() => works.filter(x => (x.village_ids || []).includes(village.id)), [works, village.id])
  const viewing = view && works.find(x => x.id === view)
  const openForm = initial => { setView(null); setFormKey(k => k + 1); setForm(initial) }
  const openCount = mine.filter(x => !x.done_at).length
  const doneCount = mine.length - openCount

  async function toggle(work) {
    const done = !work.done_at
    const undo = await setWorkDone(work, done)
    toast(done ? 'Marked as done' : 'Marked as not done', { label: 'Undo', onClick: undo })
  }

  return (
    <div className={w.village}>
      <div className={w.villageHead}>
        <span>From Works</span>
        {mine.length > 0 && <span>{openCount} open{doneCount ? ` · ${doneCount} done` : ''}</span>}
      </div>
      {mine.length > 0 && (
        <div className={cx(ui.card, p.dayCard)}>
          {WORK_CATEGORIES.map(c => {
            const list = mine.filter(x => categoryOf(x) === c.id)
            if (!list.length) return null
            const { open, recent, old } = splitWorks(list)
            return (
              <div key={c.id}>
                <div className={w.villageCat}>{c.icon} {c.label}</div>
                {[...open, ...recent, ...old].map(x => {
                  const done = !!x.done_at
                  const people = namesOf(x.contact_ids, names.contact)
                  const pics = (x.images || []).length
                  return (
                    <button key={x.id} className={cx(w.vLine, done && w.vLineDone)} onClick={() => setView(x.id)}>
                      <span className={cx(w.vDot, done && w.vDotDone)}>{done && <IconCheck size={11} />}</span>
                      <span className={w.vText}>
                        <span className={w.vTitle}>{((x.body || '').trim().split('\n')[0]) || 'No text'}</span>
                        {done ? <span className={w.vSub}>Done {new Date(x.done_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                          : (people.length > 0 || x.self_identified || pics > 0) && (
                            <span className={w.tags}>
                              {x.self_identified && <span className={cx(w.tag, w.tagSelf)}>★ Self identified</span>}
                              {people.slice(0, 2).map((n, i) => <span key={i} className={cx(w.tag, w.tagPerson)}>👤 {n}</span>)}
                              {people.length > 2 && <span className={cx(w.tag, w.tagPerson)}>+{people.length - 2}</span>}
                              {pics > 0 && <span className={cx(w.tag, w.tagPics)}>📷 {pics}</span>}
                            </span>
                          )}
                      </span>
                      {x.serial ? <span className={w.serial}>{serialLabel(x)}</span> : null}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      <button className={w.villageAdd} onClick={() => openForm({ category: 'roads', village_ids: [village.id] })}>
        <span className={w.villageAddPlus}><IconPlus size={16} /></span>Add to Works for {village.name}
      </button>

      <Sheet open={!!viewing} onClose={() => setView(null)} title={viewing ? `${categoryLabel(categoryOf(viewing))}${viewing.serial ? ` · ${serialLabel(viewing)}` : ''}` : ''}
        headerRight={viewing && <button className={w.editBtn} onClick={() => openForm(viewing)}>Edit</button>}>
        {viewing && (
          <WorkDetail work={viewing} names={names}
            onVillage={() => setView(null)}
            onPerson={id => { setView(null); sheets.open(id) }}
            onToggle={async () => { await toggle(viewing); if (!viewing.done_at) setView(null) }} />
        )}
      </Sheet>
      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit work' : 'New work'}>
        {form && <WorkForm key={formKey} initial={form} names={names} onDone={() => setForm(null)} />}
      </Sheet>
      {sheets.element}
    </div>
  )
}
