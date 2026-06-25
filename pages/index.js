import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import styles from '../styles/Home.module.css'

export default function Home() {
  const router = useRouter()
  const [villages, setVillages] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('villages')
      .select('*')
      .order('name')
    setVillages(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = villages.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase())
  )

  async function addVillage() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    await supabase.from('villages').insert({ name })
    setNewName('')
    setShowAdd(false)
    setSaving(false)
    load()
  }

  async function deleteVillage(v) {
    await supabase.from('contacts').delete().eq('village_id', v.id)
    await supabase.from('villages').delete().eq('id', v.id)
    setDeleteTarget(null)
    load()
  }

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.logo}>Halqa</h1>
          <button className={styles.addBtn} onClick={() => setShowAdd(true)}>+ Village</button>
        </div>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search villages…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className={styles.clearSearch} onClick={() => setSearch('')}>×</button>}
        </div>
      </header>

      {/* LIST */}
      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🏘</div>
            <h3>{villages.length ? 'No villages match your search' : 'No villages yet'}</h3>
            <p>{villages.length ? 'Try a different name.' : 'Tap "+ Village" to get started.'}</p>
          </div>
        ) : (
          <ul className={styles.villageList}>
            {filtered.map(v => (
              <li key={v.id} className={styles.villageItem}>
                <button
                  className={styles.villageCard}
                  onClick={() => router.push(`/village/${v.id}`)}
                >
                  <div className={styles.villageCardLeft}>
                    <span className={styles.villageName}>{v.name}</span>
                    {v.registered_voters && (
                      <span className={styles.villageVoters}>{Number(v.registered_voters).toLocaleString()} voters</span>
                    )}
                  </div>
                  <span className={styles.villageArrow}>›</span>
                </button>
                <button
                  className={styles.deleteVillageBtn}
                  onClick={() => setDeleteTarget(v)}
                  title="Remove village"
                >🗑</button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* ADD VILLAGE MODAL */}
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
              <button className={styles.btnSave} onClick={addVillage} disabled={saving}>
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteTarget && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Remove Village?</h2>
            <p className={styles.modalBody}>
              This will permanently delete <strong>{deleteTarget.name}</strong> and all its contacts, notes, and data. This cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className={styles.btnDelete} onClick={() => deleteVillage(deleteTarget)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
