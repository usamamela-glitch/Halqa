import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import NoteEditor from '../components/NoteEditor'
import SearchPage from './search'
import styles from '../styles/Home.module.css'

const TABS = ['Qanungos', 'General', 'Search']

export default function Home() {
  const router = useRouter()
  const [tab, setTab] = useState('Qanungos')
  const [qanungos, setQanungos] = useState([])
  const [villageCounts, setVillageCounts] = useState({})
  const [totalVillages, setTotalVillages] = useState(0)
  const [generalNotes, setGeneralNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [openNote, setOpenNote] = useState(null)

  const [showAddQ, setShowAddQ] = useState(false)
  const [newQName, setNewQName] = useState('')
  const [savingQ, setSavingQ] = useState(false)
  const [deleteQ, setDeleteQ] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: qs }, { data: vs }, { data: ns }] = await Promise.all([
      supabase.from('qanungos').select('*').order('name'),
      supabase.from('villages').select('id, qanungo_id'),
      supabase.from('general_notes').select('*').order('created_at', { ascending: false }),
    ])
    setQanungos(qs || [])
    setGeneralNotes(ns || [])
    const counts = {}; let total = 0
    ;(vs || []).forEach(v => { total++; if (v.qanungo_id) counts[v.qanungo_id] = (counts[v.qanungo_id] || 0) + 1 })
    setVillageCounts(counts); setTotalVillages(total)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addQanungo() {
    const name = newQName.trim(); if (!name) return
    setSavingQ(true)
    await supabase.from('qanungos').insert({ name })
    setNewQName(''); setShowAddQ(false); setSavingQ(false); load()
  }

  async function deleteQanungo(q) {
    await supabase.from('villages').update({ qanungo_id: null }).eq('qanungo_id', q.id)
    await supabase.from('qanungos').delete().eq('id', q.id)
    setDeleteQ(null); load()
  }

  async function createNote() {
    const { data } = await supabase.from('general_notes').insert({ body: '', images: [] }).select().single()
    if (data) { setGeneralNotes(prev => [data, ...prev]); setOpenNote(data) }
  }

  function handleNoteClose() { load(); setOpenNote(null) }
  function handleNoteDelete(noteId) { setGeneralNotes(prev => prev.filter(n => n.id !== noteId)); setOpenNote(null) }

  function stripHtml(html) {
    if (!html) return ''
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  function noteTitle(body) {
    if (!body) return 'New Note'
    const text = stripHtml(body)
    const lines = text.split('\n').filter(l => l.trim())
    return lines[0]?.slice(0, 50) || text.slice(0, 50) || 'New Note'
  }
  function notePreview(body) {
    if (!body) return 'No additional text'
    const text = stripHtml(body)
    const lines = text.split('\n').filter(l => l.trim())
    return lines[1]?.slice(0, 60) || 'No additional text'
  }

  if (openNote) {
    return <NoteEditor note={openNote} onClose={handleNoteClose} onDelete={handleNoteDelete} table="general_notes" />
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.logo}>Halqa</h1>
          <div className={styles.headerRight}>
            <span className={styles.villageCount}>{totalVillages} villages</span>
            {tab === 'Qanungos' && <button className={styles.addBtn} onClick={() => setShowAddQ(true)}>+ Qanungo</button>}
            <a className={styles.mapBtn} href="https://zietsuiuzkfjjgbdybdd.supabase.co/storage/v1/object/public/maps/DISTRICT%20MAP%2021-09%20-2023%2005.pdf" target="_blank" rel="noreferrer" title="District Map">🗺</a>
          </div>
        </div>
      </header>

      <div className={styles.tabBar}>
        {TABS.map(t => <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /></div>
        ) : tab === 'Qanungos' ? (
          qanungos.length === 0 ? (
            <div className={styles.empty}><div className={styles.emptyIcon}>🏛</div><h3>No Qanungos yet</h3><p>Tap "+ Qanungo" to add your first one.</p></div>
          ) : (
            <ul className={styles.qanungoList}>
              {qanungos.map(q => (
                <li key={q.id} className={styles.qanungoItem}>
                  <button className={styles.qanungoCard} onClick={() => router.push(`/qanungo/${q.id}`)}>
                    <div className={styles.qanungoCardLeft}>
                      <span className={styles.qanungoName}>{q.name}</span>
                      <span className={styles.qanungoCount}>{villageCounts[q.id] || 0} village{(villageCounts[q.id] || 0) !== 1 ? 's' : ''}</span>
                    </div>
                    <span className={styles.arrow}>›</span>
                  </button>
                  <button className={styles.deleteBtn} onClick={() => setDeleteQ(q)}>🗑</button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className={styles.notesListPage}>
            {generalNotes.length === 0 ? (
              <div className={styles.empty}><div className={styles.emptyIcon}>📝</div><h3>No notes yet</h3><p>Tap the pencil to create your first note.</p></div>
            ) : (
              <ul className={styles.iosNotesList}>
                {generalNotes.map(n => (
                  <li key={n.id} className={styles.iosNoteItem} onClick={() => setOpenNote(n)}>
                    <div className={styles.iosNoteTitle}>{noteTitle(n.body)}</div>
                    <div className={styles.iosNoteMeta}>
                      <span className={styles.iosNoteDate}>{new Date(n.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</span>
                      <span className={styles.iosNotePreview}>{n.images?.length ? `📷 ${n.images.length} photo${n.images.length > 1 ? 's' : ''}  ` : ''}{notePreview(n.body)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button className={styles.fab} onClick={createNote}>✏️</button>
          </div>
        )}

        {tab === 'Search' && <SearchPage />}
      </main>

      {showAddQ && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowAddQ(false) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Add Qanungo</h2>
            <input className={styles.modalInput} type="text" placeholder="Qanungo name" value={newQName} onChange={e => setNewQName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addQanungo()} autoFocus />
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => { setShowAddQ(false); setNewQName('') }}>Cancel</button>
              <button className={styles.btnSave} onClick={addQanungo} disabled={savingQ}>{savingQ ? 'Saving…' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteQ && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteQ(null) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Remove Qanungo?</h2>
            <p className={styles.modalBody}>This removes <strong>{deleteQ.name}</strong>. Its villages won't be deleted.</p>
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
