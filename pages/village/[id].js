import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import NoteEditor from '../../components/NoteEditor'
import styles from '../../styles/Village.module.css'

const TABS = ['Contacts', 'Dynamics', 'Development', 'Notes']

function formatTel(phone) {
  if (!phone) return null
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('0')) n = '+92' + n.slice(1)
  return n
}
function toWhatsApp(phone) {
  const n = formatTel(phone)
  return n ? `https://wa.me/${n.replace('+','')}` : null
}
function toTel(phone) {
  const n = formatTel(phone)
  return n ? `tel:${n}` : null
}

function downloadVCard(c) {
  const tels = [c.phone, c.phone2, c.phone3].filter(Boolean).map(formatTel)
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${c.name}`,
    ...tels.map(t => `TEL;TYPE=CELL:${t}`),
    c.description ? `NOTE:${c.description}` : '',
    'END:VCARD'
  ].filter(Boolean).join('\n')
  const blob = new Blob([vcf], { type: 'text/vcard' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${c.name}.vcf`
  a.click()
  URL.revokeObjectURL(url)
}

export default function VillagePage() {
  const router = useRouter()
  const { id } = router.query

  const [village, setVillage] = useState(null)
  const [contacts, setContacts] = useState([])
  const [notes, setNotes] = useState([])
  const [tab, setTab] = useState('Contacts')
  const [loading, setLoading] = useState(true)
  const [openNote, setOpenNote] = useState(null)

  const [editInfo, setEditInfo] = useState(false)
  const [infoForm, setInfoForm] = useState({})
  const [contactModal, setContactModal] = useState(null)
  const [contactForm, setContactForm] = useState({ name: '', phone: '', phone2: '', phone3: '', description: '' })
  const [savingContact, setSavingContact] = useState(false)
  const [dynForm, setDynForm] = useState({ our_group: '', anti_group: '' })
  const [devForm, setDevForm] = useState({ development: '' })
  const [savingDyn, setSavingDyn] = useState(false)
  const [savingDev, setSavingDev] = useState(false)
  const [dynSaved, setDynSaved] = useState(false)
  const [devSaved, setDevSaved] = useState(false)
  const [deleteContact, setDeleteContact] = useState(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [{ data: v }, { data: c }, { data: n }] = await Promise.all([
      supabase.from('villages').select('*').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('village_id', id).order('name'),
      supabase.from('notes').select('*').eq('village_id', id).order('created_at', { ascending: false }),
    ])
    setVillage(v)
    setContacts(c || [])
    setNotes(n || [])
    if (v) {
      setInfoForm({ result_2018: v.result_2018 || '', result_2024: v.result_2024 || '', population: v.population || '', registered_voters: v.registered_voters || '' })
      setDynForm({ our_group: v.our_group || '', anti_group: v.anti_group || '' })
      setDevForm({ development: v.development || '' })
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function saveInfo() {
    await supabase.from('villages').update({
      result_2018: infoForm.result_2018, result_2024: infoForm.result_2024,
      population: infoForm.population ? parseInt(infoForm.population) : null,
      registered_voters: infoForm.registered_voters ? parseInt(infoForm.registered_voters) : null,
    }).eq('id', id)
    setEditInfo(false); load()
  }

  function openAddContact() { setContactForm({ name: '', phone: '', phone2: '', phone3: '', description: '' }); setContactModal('add') }
  async function importFromContacts() {
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
      alert('Contact import is not supported on this device.')
      return
    }
    try {
      const selected = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      if (!selected || selected.length === 0) return
      setSavingContact(true)
      for (const c of selected) {
        const name = (c.name && c.name[0]) || 'Unknown'
        const phone = (c.tel && c.tel[0]) || ''
        const phone2 = (c.tel && c.tel[1]) || ''
        const phone3 = (c.tel && c.tel[2]) || ''
        await supabase.from('contacts').insert({ village_id: id, name: name.trim(), phone: phone.trim(), phone2: phone2.trim(), phone3: phone3.trim(), description: '' })
      }
      setSavingContact(false)
      load()
    } catch (err) {
      setSavingContact(false)
      alert('Import failed: ' + err.message)
    }
  }
  function openEditContact(c) { setContactForm({ name: c.name, phone: c.phone || '', phone2: c.phone2 || '', phone3: c.phone3 || '', description: c.description || '' }); setContactModal(c) }

  async function saveContact() {
    const { name, phone, phone2, phone3, description } = contactForm
    if (!name.trim()) return
    setSavingContact(true)
    if (contactModal === 'add') {
      await supabase.from('contacts').insert({ village_id: id, name: name.trim(), phone: phone.trim(), phone2: phone2.trim(), phone3: phone3.trim(), description: description.trim() })
    } else {
      await supabase.from('contacts').update({ name: name.trim(), phone: phone.trim(), phone2: phone2.trim(), phone3: phone3.trim(), description: description.trim() }).eq('id', contactModal.id)
    }
    setSavingContact(false); setContactModal(null); load()
  }

  async function confirmDeleteContact() {
    await supabase.from('contacts').delete().eq('id', deleteContact.id)
    setDeleteContact(null); setContactModal(null); load()
  }

  async function createNote() {
    const { data } = await supabase.from('notes').insert({ village_id: id, body: '', images: [] }).select().single()
    if (data) { setNotes(prev => [data, ...prev]); setOpenNote(data) }
  }

  function handleNoteClose() {
    load()
    setOpenNote(null)
  }

  function handleNoteDelete(noteId) {
    setNotes(prev => prev.filter(n => n.id !== noteId))
    setOpenNote(null)
  }

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

  async function saveDynamics() {
    setSavingDyn(true)
    await supabase.from('villages').update({ our_group: dynForm.our_group, anti_group: dynForm.anti_group }).eq('id', id)
    setSavingDyn(false); setDynSaved(true); setTimeout(() => setDynSaved(false), 2000)
  }
  async function saveDevelopment() {
    setSavingDev(true)
    await supabase.from('villages').update({ development: devForm.development }).eq('id', id)
    setSavingDev(false); setDevSaved(true); setTimeout(() => setDevSaved(false), 2000)
  }

  if (loading) return <div className={styles.loadingPage}><div className={styles.spinner} /></div>
  if (!village) return <div className={styles.loadingPage}><p>Village not found.</p></div>

  if (openNote) {
    return <NoteEditor note={openNote} onClose={handleNoteClose} onDelete={handleNoteDelete} table="notes" />
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>‹</button>
        <h1 className={styles.villageName}>{village.name}</h1>
        <button className={styles.editInfoBtn} onClick={() => setEditInfo(true)}>Edit</button>
      </header>

      <div className={styles.statsStrip}>
        <div className={styles.statBox}><span className={styles.statLabel}>2018</span><span className={styles.statVal}>{village.result_2018 || '—'}</span></div>
        <div className={styles.statDivider} />
        <div className={styles.statBox}><span className={styles.statLabel}>2024</span><span className={styles.statVal}>{village.result_2024 || '—'}</span></div>
        <div className={styles.statDivider} />
        <div className={styles.statBox}><span className={styles.statLabel}>Population</span><span className={styles.statVal}>{village.population ? Number(village.population).toLocaleString() : '—'}</span></div>
        <div className={styles.statDivider} />
        <div className={styles.statBox}><span className={styles.statLabel}>Voters</span><span className={styles.statVal}>{village.registered_voters ? Number(village.registered_voters).toLocaleString() : '—'}</span></div>
      </div>

      <div className={styles.tabBar}>
        {TABS.map(t => <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      <main className={styles.main}>
        {tab === 'Contacts' && (
          <>
            {contacts.length === 0 ? (
              <div className={styles.empty}><div className={styles.emptyIcon}>👤</div><h3>No contacts yet</h3><p>Tap + to add your first contact.</p></div>
            ) : (
              <ul className={styles.contactList}>
                {contacts.map(c => (
                  <li key={c.id} className={styles.contactCard} onClick={() => openEditContact(c)}>
                    <div className={styles.avatar}>{c.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>
                    <div className={styles.contactInfo}>
                      <span className={styles.contactName}>{c.name}</span>
                      <span className={styles.contactPhone}>{[c.phone, c.phone2, c.phone3].filter(Boolean).join(' · ') || '—'}</span>
                      {c.description && <span className={styles.contactDesc}>{c.description}</span>}
                    </div>
                    <div className={styles.contactActions} onClick={e => e.stopPropagation()}>
                      <button className={styles.actionBtnVcf} onClick={() => downloadVCard(c)} title="Save to Contacts">👤+</button>
                      {(c.phone || c.phone2 || c.phone3) && <>
                        <a className={styles.actionBtn} href={toTel(c.phone || c.phone2 || c.phone3)}>📞</a>
                        <a className={styles.actionBtnWa} href={toWhatsApp(c.phone || c.phone2 || c.phone3)} target="_blank" rel="noreferrer">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.118 1.531 5.845L.057 23.547a.5.5 0 0 0 .609.625l5.842-1.53A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.893 9.893 0 0 1-5.031-1.375l-.361-.214-3.733.978.997-3.645-.236-.374A9.865 9.865 0 0 1 2.1 12C2.1 6.533 6.533 2.1 12 2.1S21.9 6.533 21.9 12 17.467 21.9 12 21.9z"/>
                          </svg>
                        </a>
                      </>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.fabGroup}>
              <div className={styles.fabGroup}>
  <button className={styles.fabSecondary} onClick={importFromContacts} title="Import from Contacts">📥</button>
  <button className={styles.fab} onClick={openAddContact}>＋</button>
</div>
            </div>
          </>
        )}

        {tab === 'Dynamics' && (
          <div className={styles.formPage}>
            <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Our Group</label><textarea className={styles.textarea} placeholder="Describe the allied group…" value={dynForm.our_group} onChange={e => setDynForm(f => ({...f, our_group: e.target.value}))} rows={6} /></div>
            <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Opposition Group</label><textarea className={styles.textarea} placeholder="Describe the opposing group…" value={dynForm.anti_group} onChange={e => setDynForm(f => ({...f, anti_group: e.target.value}))} rows={6} /></div>
            <button className={`${styles.saveTabBtn} ${dynSaved ? styles.savedBtn : ''}`} onClick={saveDynamics} disabled={savingDyn}>{dynSaved ? '✓ Saved' : savingDyn ? 'Saving…' : 'Save'}</button>
          </div>
        )}

        {tab === 'Development' && (
          <div className={styles.formPage}>
            <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Development Notes</label><textarea className={styles.textarea} placeholder="Ongoing schemes, demands, infrastructure…" value={devForm.development} onChange={e => setDevForm({ development: e.target.value })} rows={14} /></div>
            <button className={`${styles.saveTabBtn} ${devSaved ? styles.savedBtn : ''}`} onClick={saveDevelopment} disabled={savingDev}>{devSaved ? '✓ Saved' : savingDev ? 'Saving…' : 'Save'}</button>
          </div>
        )}

        {tab === 'Notes' && (
          <div className={styles.notesListPage}>
            {notes.length === 0 ? (
              <div className={styles.empty}><div className={styles.emptyIcon}>📝</div><h3>No notes yet</h3><p>Tap the pencil to create your first note.</p></div>
            ) : (
              <ul className={styles.iosNotesList}>
                {notes.map(n => (
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
      </main>

      {editInfo && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setEditInfo(false) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Village Info</h2>
            {[
              { key: 'result_2018', label: '2018 Election Result', placeholder: 'e.g. PTI win — 3,200 votes' },
              { key: 'result_2024', label: '2024 Election Result', placeholder: 'e.g. Independent — 2,800 votes' },
              { key: 'population', label: 'Population', placeholder: 'e.g. 4500', type: 'number' },
              { key: 'registered_voters', label: 'Registered Voters', placeholder: 'e.g. 1800', type: 'number' },
            ].map(f => (
              <div key={f.key} className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{f.label}</label>
                <input className={styles.modalInput} type={f.type || 'text'} placeholder={f.placeholder} value={infoForm[f.key]} onChange={e => setInfoForm(x => ({...x, [f.key]: e.target.value}))} />
              </div>
            ))}
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setEditInfo(false)}>Cancel</button>
              <button className={styles.btnSave} onClick={saveInfo}>Save</button>
            </div>
          </div>
        </div>
      )}

      {contactModal && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setContactModal(null) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>{contactModal === 'add' ? 'Add Contact' : 'Edit Contact'}</h2>
            {[
              { key: 'name', label: 'Full Name', placeholder: 'e.g. Muhammad Akram', type: 'text' },
              { key: 'phone', label: 'Phone 1', placeholder: 'e.g. 0300-1234567', type: 'tel' },
              { key: 'phone2', label: 'Phone 2 (optional)', placeholder: 'e.g. 0301-7654321', type: 'tel' },
              { key: 'phone3', label: 'Phone 3 (optional)', placeholder: 'e.g. 0321-1122334', type: 'tel' },
              { key: 'description', label: 'Description (optional)', placeholder: 'e.g. Village elder', type: 'text' },
            ].map(f => (
              <div key={f.key} className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{f.label}</label>
                <input className={styles.modalInput} type={f.type} placeholder={f.placeholder} value={contactForm[f.key]} onChange={e => setContactForm(x => ({...x, [f.key]: e.target.value}))} />
              </div>
            ))}
            <div className={styles.modalActions}>
              {contactModal !== 'add' && <button className={styles.btnDeleteSmall} onClick={() => setDeleteContact(contactModal)}>Delete</button>}
              <button className={styles.btnCancel} onClick={() => setContactModal(null)}>Cancel</button>
              <button className={styles.btnSave} onClick={saveContact} disabled={savingContact}>{savingContact ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteContact && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteContact(null) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Delete Contact?</h2>
            <p className={styles.modalBody}>Remove <strong>{deleteContact.name}</strong> permanently?</p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setDeleteContact(null)}>Cancel</button>
              <button className={styles.btnDelete} onClick={confirmDeleteContact}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
