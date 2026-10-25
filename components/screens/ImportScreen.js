import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { insertRows, newId } from '../../lib/store'
import { phonesOf } from '../../lib/phone'
import { TAGS } from '../../lib/domain'
import { parseVCards, buildMatcher, nameWithoutVillage, numberKey, nameKey } from '../../lib/importContacts'
import { Screen, Tabs, Sheet, Field, SearchBox, Empty, cx, ui, useToast } from '../ui'
import { VillagePicker } from '../contacts'
import { IconDownload, IconCheck, IconUsers } from '../Icons'
import im from '../../styles/import.module.css'

const TABS = ['Suggested', 'No suggestion']
const PAGE = 100

// One-time import of the contacts saved in the iPhone's Contacts app.
// Contacts already in Halqa (any matching number) are left out.
export default function ImportScreen() {
  const toast = useToast()
  const queue = useLiveQuery(() => db.import_queue.toArray(), [], null)
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const [tab, setTab] = useState('Suggested')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [limit, setLimit] = useState(PAGE)
  const [reading, setReading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const [assign, setAssign] = useState(null)   // { villageId, tags, pinned } while choosing a village
  const fileRef = useRef(null)

  const vById = useMemo(() => Object.fromEntries(villages.map(v => [v.id, v])), [villages])
  const qName = useMemo(() => Object.fromEntries(qanungos.map(x => [x.id, x.name])), [qanungos])

  const shown = useMemo(() => {
    if (!queue) return []
    const t = q.trim().toLowerCase()
    return queue
      .filter(r => (tab === 'Suggested' ? !!r.villageId : !r.villageId))
      .filter(r => !t || r.name.toLowerCase().includes(t) || r.phones.some(p => p.replace(/\D/g, '').includes(t.replace(/\D/g, '') || '§')) || (r.villageId && (vById[r.villageId]?.name || '').toLowerCase().includes(t)))
      .sort((a, b) => (tab === 'Suggested' ? (vById[a.villageId]?.name || '').localeCompare(vById[b.villageId]?.name || '') : 0) || a.name.localeCompare(b.name))
  }, [queue, tab, q, vById])

  const counts = useMemo(() => {
    const s = (queue || []).filter(r => r.villageId).length
    return { Suggested: s, 'No suggestion': (queue || []).length - s }
  }, [queue])

  async function readFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setReading(true)
    try {
      const cards = parseVCards(await file.text())
      const contacts = await db.contacts.toArray()
      const inHalqa = new Set(contacts.flatMap(c => phonesOf(c).map(numberKey)))
      const namesInHalqa = new Set(contacts.map(c => nameKey(c.name)))
      const ignored = new Set((await db.import_ignored.toArray()).map(r => r.key))
      const queued = new Set(((await db.import_queue.toArray()) || []).flatMap(r => r.phones.map(numberKey)))
      const suggest = buildMatcher(await db.villages.toArray())

      let already = 0
      let hidden = 0
      const rows = []
      for (const c of cards) {
        const keys = c.phones.map(numberKey)
        if (keys.some(k => inHalqa.has(k))) { already++; continue }
        if (keys.some(k => ignored.has(k))) { hidden++; continue }
        if (keys.some(k => queued.has(k))) continue
        keys.forEach(k => queued.add(k))
        const s = suggest(c)
        const name = s && s.fromName ? nameWithoutVillage(c.name, s.village) : c.name
        rows.push({
          id: newId(), key: keys[0], name, original: c.name, phones: c.phones, note: c.note || '',
          villageId: s ? s.village.id : null,
          nameInHalqa: namesInHalqa.has(nameKey(name)) || namesInHalqa.has(nameKey(c.name)),
        })
      }
      await db.import_queue.bulkPut(rows)
      setSummary({ total: cards.length, already, hidden, added: rows.length })
      setSelected(new Set())
      setTab(rows.some(r => r.villageId) || !(queue || []).length ? 'Suggested' : 'No suggestion')
    } catch (err) {
      toast(`Couldn't read that file: ${err.message || err}`)
    } finally {
      setReading(false)
    }
  }

  function toggle(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const allShownSelected = shown.length > 0 && shown.every(r => selected.has(r.id))
  function toggleAll() {
    setSelected(allShownSelected ? new Set() : new Set(shown.map(r => r.id)))
  }

  async function addToHalqa(rows, villageFor, { tags = [], pinned = false } = {}) {
    const ok = rows.filter(r => villageFor(r))
    if (!ok.length) return
    setBusy(true)
    try {
      await insertRows('contacts', ok.map(r => ({
        village_id: villageFor(r),
        name: r.name,
        phone: r.phones[0] || '', phone2: r.phones[1] || '', phone3: r.phones[2] || '',
        description: r.note,
        pinned, tags,
      })))
      await db.import_queue.bulkDelete(ok.map(r => r.id))
      setSelected(new Set())
      toast(`Added ${ok.length.toLocaleString()} contact${ok.length !== 1 ? 's' : ''} to Halqa`)
    } finally {
      setBusy(false)
    }
  }

  const selectedRows = () => (queue || []).filter(r => selected.has(r.id))

  async function notForHalqa() {
    const rows = selectedRows()
    await db.import_ignored.bulkPut(rows.flatMap(r => r.phones.map(p => ({ key: numberKey(p) }))))
    await db.import_queue.bulkDelete(rows.map(r => r.id))
    setSelected(new Set())
    toast(`Hidden ${rows.length.toLocaleString()} — they won't be offered again`)
  }

  async function clearAll() {
    if (!window.confirm('Remove all remaining contacts from this list? Nothing is deleted from your iPhone or from Halqa.')) return
    await db.import_queue.clear()
    setSelected(new Set())
    setSummary(null)
  }

  if (queue === null) return <Screen title="Import contacts" />

  const nSel = selected.size

  return (
    <Screen title="Import contacts" subtitle="Bring in the contacts saved on your iPhone">
      <div className={im.panel}>
        {queue.length === 0 && !summary && (
          <ol className={im.steps}>
            <li>Open the iPhone <strong>Contacts</strong> app, tap <strong>Lists</strong>, press and hold <strong>All Contacts</strong>, and choose <strong>Export</strong>.</li>
            <li>Choose <strong>Save to Files</strong> (for example in Downloads).</li>
            <li>Come back here and tap <strong>Choose contacts file</strong>.</li>
          </ol>
        )}
        <button className={cx(ui.btn, queue.length ? ui.btnSecondary : ui.btnPrimary, ui.btnBlock)} onClick={() => fileRef.current?.click()} disabled={reading}>
          <IconDownload size={19} />{reading ? 'Reading…' : 'Choose contacts file'}
        </button>
        <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard,text/directory" hidden onChange={readFile} />
        {summary && (
          <p className={im.summary}>
            Read <strong>{summary.total.toLocaleString()}</strong> contacts. <strong>{summary.already.toLocaleString()}</strong> {summary.already === 1 ? 'is' : 'are'} already in Halqa and {summary.already === 1 ? 'was' : 'were'} left out
            {summary.hidden ? <>, {summary.hidden.toLocaleString()} you hid before</> : null}. <strong>{summary.added.toLocaleString()}</strong> new to sort.
          </p>
        )}
        <p className={im.note}>The file is read on this phone. Only the contacts you add go into Halqa.</p>
      </div>

      {queue.length > 0 && (
        <>
          <div className={im.left}><strong>{queue.length.toLocaleString()}</strong> left to sort</div>
          <Tabs id="import" tabs={TABS.map(t => `${t} (${counts[t].toLocaleString()})`)} value={`${tab} (${counts[tab].toLocaleString()})`}
            onChange={t => { setTab(t.startsWith('Suggested') ? 'Suggested' : 'No suggestion'); setSelected(new Set()); setLimit(PAGE) }} />
          <div style={{ marginTop: 12 }}>
            <SearchBox value={q} onChange={v => { setQ(v); setLimit(PAGE) }} placeholder={tab === 'Suggested' ? 'Search name, number or village' : 'Search name or number'} />
          </div>

          {tab === 'Suggested' && shown.length > 0 && (
            <p className={im.hint}>Each contact shows the village found in its name, already removed from the name. Check the list, select, and add.</p>
          )}
          {tab === 'No suggestion' && shown.length > 0 && (
            <p className={im.hint}>Select people from the same village (search helps), then tap <strong>Choose village</strong>. Personal contacts: <strong>Not for Halqa</strong>.</p>
          )}

          {shown.length > 0 && (
            <button className={im.selectAll} onClick={toggleAll}>
              <span className={cx(im.box, allShownSelected && im.boxOn)}>{allShownSelected && <IconCheck size={14} />}</span>
              {allShownSelected ? 'Unselect all' : `Select all ${shown.length.toLocaleString()}${q ? ' shown' : ''}`}
            </button>
          )}

          {shown.length === 0 ? (
            <Empty icon={<IconUsers size={28} />} title={q ? 'No matches' : 'Nothing here'} text={q ? 'Try another search.' : tab === 'Suggested' ? 'No contacts with a village in their name. See the other tab.' : 'All sorted in this tab.'} />
          ) : (
            <ul className={im.list}>
              {shown.slice(0, limit).map(r => (
                <li key={r.id}>
                  <button className={cx(im.row, selected.has(r.id) && im.rowOn)} onClick={() => toggle(r.id)}>
                    <span className={cx(im.box, selected.has(r.id) && im.boxOn)}>{selected.has(r.id) && <IconCheck size={14} />}</span>
                    <span className={im.main}>
                      <span className={im.name}>{r.name}</span>
                      {r.original !== r.name && <span className={im.orig}>Saved as “{r.original}”</span>}
                      <span className={im.phone}>{r.phones.join(' · ')}</span>
                      {r.nameInHalqa && <span className={im.warn}>Name already in Halqa (different number) — check</span>}
                    </span>
                    {r.villageId && (
                      <span className={im.village}>{vById[r.villageId]?.name || '?'}<small>{qName[vById[r.villageId]?.qanungo_id] || ''}</small></span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shown.length > limit && (
            <button className={cx(ui.btn, ui.btnSecondary, ui.btnBlock)} style={{ marginTop: 12 }} onClick={() => setLimit(l => l + PAGE)}>
              Show {Math.min(PAGE, shown.length - limit)} more ({(shown.length - limit).toLocaleString()} left)
            </button>
          )}

          <button className={im.clear} onClick={clearAll}>Clear this list</button>
          {nSel > 0 && <div style={{ height: 150 }} />}
        </>
      )}

      {nSel > 0 && (
        <div className={im.bar}>
          <div className={im.barCount}>{nSel.toLocaleString()} selected</div>
          <div className={im.barBtns}>
            {tab === 'Suggested' && (
              <button className={cx(ui.btn, ui.btnPrimary)} disabled={busy} onClick={() => addToHalqa(selectedRows(), r => r.villageId)}>
                Add to their villages
              </button>
            )}
            <button className={cx(ui.btn, tab === 'Suggested' ? ui.btnSecondary : ui.btnPrimary)} disabled={busy} onClick={() => setAssign({ villageId: null, tags: [], pinned: false })}>
              Choose village…
            </button>
            <button className={cx(ui.btn, ui.btnSecondary)} disabled={busy} onClick={notForHalqa}>Not for Halqa</button>
          </div>
        </div>
      )}

      <Sheet open={!!assign} onClose={() => setAssign(null)} title={`Add ${nSel.toLocaleString()} to a village`}>
        {assign && (
          <>
            <Field label="Village">
              <VillagePicker value={assign.villageId} onChange={v => setAssign(a => ({ ...a, villageId: v }))} autoOpen />
            </Field>
            <div className={ui.field}>
              <span className={ui.label}>Tags (optional, for all of them)</span>
              <div className={im.tags}>
                {TAGS.map(t => {
                  const on = assign.tags.includes(t)
                  return <button type="button" key={t} className={cx(ui.chipBtn, on && ui.chipBtnOn)}
                    onClick={() => setAssign(a => ({ ...a, tags: on ? a.tags.filter(x => x !== t) : [...a.tags, t] }))}>{t}</button>
                })}
              </div>
            </div>
            <label className={im.pin}>
              <span>Pin to Main Groups</span>
              <input type="checkbox" checked={assign.pinned} onChange={e => setAssign(a => ({ ...a, pinned: e.target.checked }))} />
            </label>
            <button className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 18 }} disabled={!assign.villageId || busy}
              onClick={async () => { const a = assign; setAssign(null); await addToHalqa(selectedRows(), () => a.villageId, a) }}>
              Add {nSel.toLocaleString()} contact{nSel !== 1 ? 's' : ''}
            </button>
          </>
        )}
      </Sheet>
    </Screen>
  )
}
