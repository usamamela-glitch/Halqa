import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav, useScreen } from '../../lib/nav'
import { insertRow, updateRow, deleteRow } from '../../lib/store'
import { villageCompletion, byName } from '../../lib/domain'
import { Screen, Card, Sheet, ActionSheet, Empty, Field, cx, ui, useToast } from '../ui'
import { IconChevron, IconMore, IconPlus, IconPin, IconMove, IconTrash, IconLayers } from '../Icons'
import q from '../../styles/qanungo.module.css'

export default function QanungoScreen() {
  const { push } = useNav()
  const { params } = useScreen()
  const toast = useToast()
  const qid = params.id || null
  const qanungo = useLiveQuery(() => (qid ? db.qanungos.get(qid) : null), [qid])
  const allQ = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const allVillages = useLiveQuery(() => db.villages.toArray(), [], [])
  const contacts = useLiveQuery(() => db.contacts.toArray(), [], [])

  const [menu, setMenu] = useState(null)
  const [moving, setMoving] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [adding, setAdding] = useState(null)

  const qIds = useMemo(() => new Set(allQ.map(x => x.id)), [allQ])
  const villages = useMemo(() => allVillages.filter(v =>
    qid ? v.qanungo_id === qid : !v.qanungo_id || !qIds.has(v.qanungo_id)), [allVillages, qid, qIds])
  const counts = useMemo(() => {
    const m = {}
    contacts.forEach(c => { m[c.village_id] = (m[c.village_id] || 0) + 1 })
    return m
  }, [contacts])

  const pinned = villages.filter(v => v.pinned).sort(byName)
  const rest = villages.filter(v => !v.pinned).sort(byName)
  const voters = villages.reduce((n, v) => n + (Number(v.registered_voters) || 0), 0)
  const complete = villages.filter(v => villageCompletion(v, counts[v.id] || 0).level === 'green').length
  const title = qid ? qanungo?.name || '' : 'Unassigned villages'

  async function addVillage() {
    const name = (adding || '').trim()
    if (!name) return
    await insertRow('villages', { name, qanungo_id: qid, pinned: false })
    setAdding(null)
    toast(`Added ${name}`)
  }

  async function togglePin(v) {
    await updateRow('villages', v.id, { pinned: !v.pinned })
  }

  async function moveTo(v, target) {
    await updateRow('villages', v.id, { qanungo_id: target.id })
    setMoving(null)
    toast(`Moved ${v.name} to ${target.name}`)
  }

  async function removeVillage(v) {
    const [cs, ns] = await Promise.all([
      db.contacts.where('village_id').equals(v.id).toArray(),
      db.notes.where('village_id').equals(v.id).toArray(),
    ])
    for (const c of cs) await deleteRow('contacts', c.id)
    for (const n of ns) await deleteRow('notes', n.id)
    await deleteRow('villages', v.id)
    toast(`Deleted ${v.name}`)
  }

  const row = v => {
    const n = counts[v.id] || 0
    const c = villageCompletion(v, n)
    return (
      <li key={v.id}>
        <Card as="div" role="button" tabIndex={0} className={q.row} onClick={() => push('village', { id: v.id })}>
          <span className={cx(ui.dot, ui[`dot_${c.level}`])} aria-label={`${c.pct}% complete`} />
          <div className={q.main}>
            <span className={q.name}>{v.name}{v.pinned && <span className={q.pin}><IconPin size={13} filled /></span>}</span>
            <span className={q.meta}>
              {n} contact{n !== 1 ? 's' : ''}
              {v.registered_voters ? ` · ${Number(v.registered_voters).toLocaleString()} voters` : ''}
            </span>
          </div>
          <span className={cx(q.pct, q[`pct_${c.level}`])}>{c.pct}%</span>
          <button className={q.more} onClick={e => { e.stopPropagation(); setMenu(v) }} aria-label="More"><IconMore size={20} /></button>
          <IconChevron className={ui.chev} />
        </Card>
      </li>
    )
  }

  if (qid && qanungo === undefined) return null

  return (
    <Screen
      title={title}
      home
      hero={
        <div className={ui.stats}>
          <div className={ui.stat}><div className={ui.statVal}>{villages.length}</div><div className={ui.statLabel}>Villages</div></div>
          <div className={ui.stat}><div className={ui.statVal}>{voters ? voters.toLocaleString() : '—'}</div><div className={ui.statLabel}>Voters</div></div>
          <div className={ui.stat}><div className={ui.statVal}>{villages.length ? Math.round((complete / villages.length) * 100) : 0}%</div><div className={ui.statLabel}>Complete</div></div>
        </div>
      }
    >
      {villages.length === 0 ? (
        <Empty icon={<IconLayers size={28} />} title="No villages yet" text={qid ? `Tap + to add villages to ${title}.` : 'Every village has a Qanungo.'} />
      ) : (
        <>
          {pinned.length > 0 && (
            <div className={ui.section}>
              <div className={ui.sectionHead}><span>Pinned</span></div>
              <ul className={ui.list}>{pinned.map(row)}</ul>
            </div>
          )}
          <div className={ui.section}>
            {pinned.length > 0 && <div className={ui.sectionHead}><span>All villages</span></div>}
            <ul className={ui.list}>{rest.map(row)}</ul>
          </div>
          <div className={q.legend}>
            <span><i className={cx(ui.dot, ui.dot_green)} />Complete</span>
            <span><i className={cx(ui.dot, ui.dot_amber)} />Partial</span>
            <span><i className={cx(ui.dot, ui.dot_red)} />Empty</span>
          </div>
        </>
      )}

      {qid && <button className={ui.fab} onClick={() => setAdding('')} aria-label="Add village"><IconPlus size={28} /></button>}

      <ActionSheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name} items={menu && [
        { label: menu.pinned ? 'Unpin' : 'Pin to top', icon: <IconPin size={20} filled={menu.pinned} />, onClick: () => togglePin(menu) },
        { label: 'Move to another Qanungo', icon: <IconMove size={20} />, onClick: () => setMoving(menu) },
        { label: 'Delete village', icon: <IconTrash size={20} />, danger: true, onClick: () => setConfirmDel(menu) },
      ]} />

      <ActionSheet open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete village?"
        text={confirmDel && `${confirmDel.name} and all its contacts and notes will be permanently deleted.`}
        items={confirmDel && [{ label: `Delete ${confirmDel.name}`, icon: <IconTrash size={20} />, danger: true, onClick: () => removeVillage(confirmDel) }]} />

      <ActionSheet open={!!moving} onClose={() => setMoving(null)} title={moving && `Move ${moving.name}`}
        items={moving && [...allQ].sort(byName).filter(x => x.id !== moving.qanungo_id).map(x => ({ label: x.name, icon: <span className={cx(ui.dot, ui.dotTeal)} />, onClick: () => moveTo(moving, x) }))} />

      <Sheet open={adding !== null} onClose={() => setAdding(null)} title="New village">
        <form onSubmit={e => { e.preventDefault(); addVillage() }}>
          <Field label="Village name">
            <input className={ui.input} value={adding || ''} onChange={e => setAdding(e.target.value)} autoFocus placeholder="e.g. Chak 53/SB" autoCapitalize="words" />
          </Field>
          <button type="submit" className={cx(ui.btn, ui.btnPrimary, ui.btnBlock)} style={{ marginTop: 20 }} disabled={!(adding || '').trim()}>Add village</button>
        </form>
      </Sheet>
    </Screen>
  )
}
