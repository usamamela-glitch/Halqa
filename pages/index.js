import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import styles from '../styles/Home.module.css'

const TABS = ['Qanungos', 'General']

export default function Home() {
  const router = useRouter()
  const [tab, setTab] = useState('Qanungos')
  const [qanungos, setQanungos] = useState([])
  const [villageCounts, setVillageCounts] = useState({})
  const [totalVillages, setTotalVillages] = useState(0)
  const [generalNotes, setGeneralNotes] = useState([])
  const [loading, setLoading] = useState(true)

  // Qanungo modals
  const [showAddQ, setShowAddQ] = useState(false)
  const [newQName, setNewQName] = useState('')
  const [savingQ, setSavingQ] = useState(false)
  const [deleteQ, setDeleteQ] = useState(null)

  // General notes
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: qs }, { data: vs }, { data: ns }] = await Promise.all([
      supabase.from('qanungos').select('*').order('name'),
      supabase.from('villages').select('id, qanungo_id'),
      supabase.from('general_notes').select('*').order('created_at', { ascending: false }),
    ])

    setQanungos(qs || [])
    setGeneralNotes(ns || [])

    // Count villages per qanungo
    const counts = {}
    let total = 0
    ;(vs || []).forEach(v => {
      total++
      if (v.qanungo_id) {
        counts[v.qanungo_id] = (counts[v.qanungo_id] || 0) + 1
      }
    })
    setVillageCounts(counts)
    setTotalVillages(total)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addQanungo() {
    const name = newQName.trim()
    if (!name) return
    setSavingQ(true)
    await supabase.from('qanungos').insert({ name })
    setNewQName('')
    setShowAddQ(false)
    setSavingQ(false)
    load()
  }

  async function deleteQanungo(q) {
    // Unassign villages from this qanungo
    await supabase.from('villages').update({ qanungo_id: null }).eq('qanungo_id', q.id)
    await supabase.from('qanungos').delete().eq('id', q.id)
    setDeleteQ(null)
    load()
  }

  async function addNote() {
    if (!newNote.trim()) return
    setSavingNote(true)
    await supabase.from('general_notes').insert({ body: newNote.trim() })
    setNewNote('')
    setSavingNote(false)
    load()
  }

  async function deleteNote(id) {
    await supabase.from('general_notes').delete().eq('id', id)
    load()
  }

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.logo}>Halqa</h1>
          <div className={styles.headerRight}>
            <span className={styles.villageCount}>{totalVillages} villages</span>
            {tab === 'Qanungos' && (
              <button className={styles.addBtn} onClick={() => setShowAddQ(true)}>+ Qanungo</button>
            )}
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t}
            className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >{t}</button>
        ))}
      </div>

      {/* CONTENT */}
      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /></div>
        ) : tab === 'Qanungos' ? (
          <>
            {qanungos.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>🏛</div>
                <h3>No Qanungos yet</h3>
                <p>Tap "+ Qanungo" to add your first one.</p>
              </div>
            ) : (
              <ul className={styles.qanungoList}>
                {qanungos.map(q => (
                  <li key={q.id} className={styles.qanungoItem}>
                    <button
                      className={styles.qanungoCard}
                      onClick={() => router.push(`/qanungo/${q.id}`)}
                    >
                      <div className={styles.qanungoCardLeft}>
                        <span className={styles.qanungoName}>{q.name}</span>
                        <span className={styles.qanungoCount}>
                          {villageCounts[q.id] || 0} village{(villageCounts[q.id] || 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className={styles.arrow}>›</span>
                    </button>
                    <button className={styles.deleteBtn} onClick={() => setDeleteQ(q)}>🗑</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          /* GENERAL NOTES */
          <div className={styles.notesPage}>
            <div className={styles.noteInputWrap}>
              <textarea
                className={styles.noteInput}
                placeholder="Add a general note…"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={3}
              />
              <button
                className={styles.noteAddBtn}
                onClick={addNote}
                disabled={savingNote || !newNote.trim()}
              >{savingNote ? '…' : 'Add'}</button>
            </div>
            {generalNotes.length === 0 ? (
              <div className={styles.empty} style={{ paddingTop: 40 }}>
                <div className={styles.emptyIcon}>📝</div>
                <h3>No notes yet</h3>
                <p>Type above and tap Add.</p>
              </div>
            ) : (
              <ul className={styles.notesList}>
                {generalNotes.map(n => (
                  <li key={n.id} className={styles.noteCard}>
                    <p className={styles.noteBody}>{n.body}</p>
                    <div className={styles.noteMeta}>
                      <span className={styles.noteDate}>
                        {new Date(n.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <button className={styles.noteDelete} onClick={() => deleteNote(n.id)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      {/* ADD QANUNGO MODAL */}
      {showAddQ && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowAddQ(false) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Add Qanungo</h2>
            <input
              className={styles.modalInput}
              type="text"
              placeholder="Qanungo name"
              value={newQName}
              onChange={e => setNewQName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addQanungo()}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => { setShowAddQ(false); setNewQName('') }}>Cancel</button>
              <button className={styles.btnSave} onClick={addQanungo} disabled={savingQ}>
                {savingQ ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE QANUNGO CONFIRM */}
      {deleteQ && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteQ(null) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Remove Qanungo?</h2>
            <p className={styles.modalBody}>
              This removes <strong>{deleteQ.name}</strong>. Its villages will become unassigned but won't be deleted.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setDeleteQ(null)}>Cancel</button>
              <button className={styles.btnDelete} onClick={() => deleteQanungo(deleteQ)}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
