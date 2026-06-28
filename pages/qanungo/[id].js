import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import styles from '../../styles/Qanungo.module.css'

export default function QanungoPage() {
  const router = useRouter()
  const { id } = router.query

  const [qanungo, setQanungo] = useState(null)
  const [villages, setVillages] = useState([])
  const [contactCounts, setContactCounts] = useState({})
  const [allQanungos, setAllQanungos] = useState([])
  const [loading, setLoading] = useState(true)

  // Add village modal
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete village
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Reassign modal
  const [reassignTarget, setReassignTarget] = useState(null)
  const [reassignTo, setReassignTo] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [{ data: q }, { data: vs }, { data: qs }, { data: cs }] = await Promise.all([
      supabase.from('qanungos').select('*').eq('id', id).single(),
      supabase.from('villages').select('*').eq('qanungo_id', id).order('pinned', { ascending: false }).order('name'),
      supabase.from('qanungos').select('*').order('name'),
      supabase.from('contacts').select('village_id').in('village_id', (await supabase.from('villages').select('id').eq('qanungo_id', id)).data?.map(v => v.id) || []),
    ])
    setQanungo(q)
    setVillages(vs || [])
    setAllQanungos(qs || [])
    const counts = {}
    ;(cs || []).forEach(c => { counts[c.village_id] = (counts[c.village_id] || 0) + 1 })
    setContactCounts(counts)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function addVillage() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    await supabase.from('villages').insert({ name, qanungo_id: id, pinned: false })
    setNewName('')
    setShowAdd(false)
    setSaving(false)
    load()
  }

  async function togglePin(v) {
    await supabase.from('villages').update({ pinned: !v.pinned }).eq('id', v.id)
    load()
  }

  async function deleteVillage(v) {
    await supabase.from('contacts').delete().eq('village_id', v.id)
    await supabase.from('notes').delete().eq('village_id', v.id)
    await supabase.from('villages').delete().eq('id', v.id)
    setDeleteTarget(null)
    load()
  }

  async function reassignVillage() {
    if (!reassignTo) return
    await supabase.from('villages').update({ qanungo_id: reassignTo }).eq('id', reassignTarget.id)
    setReassignTarget(null)
    load()
  }

  if (loading) return <div className={styles.loadingPage}><div className={styles.spinner} /></div>
  if (!qanungo) return <div className={styles.loadingPage}><p>Not found.</p></div>

  const pinned = villages.filter(v => v.pinned)
  const unpinned = villages.filter(v => !v.pinned)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/')}>‹</button>
        <h1 className={styles.title}>{qanungo.name}</h1>
        <span className={styles.count}>{villages.length} villages</span>
      </header>

      <main className={styles.main}>
        {villages.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🏘</div>
            <h3>No villages yet</h3>
            <p>Tap + to add villages to {qanungo.name}.</p>
          </div>
        ) : (
          <ul className={styles.villageList}>
            {pinned.length > 0 && (
              <li className={styles.sectionLabel}>📌 Pinned</li>
            )}
            {pinned.map(v => <VillageRow key={v.id} v={v} router={router} togglePin={togglePin} setDeleteTarget={setDeleteTarget} setReassignTarget={setReassignTarget} setReassignTo={setReassignTo} contactCount={contactCounts[v.id] || 0} />)}
            {pinned.length > 0 && unpinned.length > 0 && (
              <li className={styles.sectionLabel}>All Villages</li>
            )}
            {unpinned.map(v => <VillageRow key={v.id} v={v} router={router} togglePin={togglePin} setDeleteTarget={setDeleteTarget} setReassignTarget={setReassignTarget} setReassignTo={setReassignTo} contactCount={contactCounts[v.id] || 0} />)}
          </ul>
        )}
      </main>

      <button className={styles.fab} onClick={() => setShowAdd(true)}>＋</button>

      {/* ADD VILLAGE */}
      {showAdd && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Add Village</h2>
            <input
              className={styles.modalInput}
              type="text"
              placeholder="Village name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addVillage()}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => { setShowAdd(false); setNewName('') }}>Cancel</button>
              <button className={styles.btnSave} onClick={addVillage} disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE VILLAGE */}
      {deleteTarget && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Delete Village?</h2>
            <p className={styles.modalBody}>Permanently delete <strong>{deleteTarget.name}</strong> and all its data?</p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className={styles.btnDelete} onClick={() => deleteVillage(deleteTarget)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* REASSIGN VILLAGE */}
      {reassignTarget && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setReassignTarget(null) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Move Village</h2>
            <p className={styles.modalBody}>Move <strong>{reassignTarget.name}</strong> to:</p>
            <select
              className={styles.modalInput}
              value={reassignTo}
              onChange={e => setReassignTo(e.target.value)}
            >
              <option value="">Select Qanungo…</option>
              {allQanungos.filter(q => q.id !== id).map(q => (
                <option key={q.id} value={q.id}>{q.name}</option>
              ))}
            </select>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setReassignTarget(null)}>Cancel</button>
              <button className={styles.btnSave} onClick={reassignVillage} disabled={!reassignTo}>Move</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VillageRow({ v, router, togglePin, setDeleteTarget, setReassignTarget, setReassignTo, contactCount }) {
  return (
    <li className={styles.villageItem}>
      <button className={`${styles.villageCard} ${v.pinned ? styles.pinnedCard : ''}`} onClick={() => router.push(`/village/${v.id}`)}>
        <div className={styles.villageCardLeft}>
          <span className={styles.villageName}>{v.pinned ? '📌 ' : ''}{v.name}</span>
          <span className={styles.villageVoters}>{contactCount} contact{contactCount !== 1 ? 's' : ''}{v.registered_voters ? ` · ${Number(v.registered_voters).toLocaleString()} voters` : ''}</span>
        </div>
        <span className={styles.arrow}>›</span>
      </button>
      <div className={styles.rowActions}>
        <button className={`${styles.pinBtn} ${v.pinned ? styles.pinActive : ''}`} onClick={() => togglePin(v)} title={v.pinned ? 'Unpin' : 'Pin'}>📌</button>
        <button className={styles.moveBtn} onClick={() => { setReassignTarget(v); setReassignTo('') }} title="Move to another Qanungo">↗</button>
        <button className={styles.deleteBtn} onClick={() => setDeleteTarget(v)} title="Delete">🗑</button>
      </div>
    </li>
  )
}
