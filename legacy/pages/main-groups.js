import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import styles from '../styles/MainGroups.module.css'

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

export default function MainGroupsPage({ onBack }) {
  const router = useRouter()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('contacts')
      .select('*, villages(name)')
      .eq('pinned', true)
      .order('name')
    setContacts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function togglePin(c) {
    await supabase.from('contacts').update({ pinned: false }).eq('id', c.id)
    setContacts(prev => prev.filter(x => x.id !== c.id))
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack || (() => router.push('/'))}>‹</button>
        <h1 className={styles.title}>Main Groups</h1>
        <span className={styles.count}>{contacts.length} contacts</span>
      </header>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /></div>
        ) : contacts.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📌</div>
            <h3>No pinned contacts yet</h3>
            <p>Pin contacts inside any village and they'll appear here automatically.</p>
          </div>
        ) : (
          <ul className={styles.contactList}>
            {contacts.map(c => (
              <li key={c.id} className={styles.contactCard} onClick={() => router.push(`/village/${c.village_id}`)}>
                <div className={styles.avatar}>{c.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>
                <div className={styles.info}>
                  <span className={styles.name}>{c.name}</span>
                  <span className={styles.phone}>{[c.phone, c.phone2, c.phone3].filter(Boolean).join(' · ') || '—'}</span>
                  {c.description && <span className={styles.desc}>{c.description}</span>}
                  <span className={styles.village}>📍 {c.villages?.name || '—'}</span>
                </div>
                <div className={styles.actions} onClick={e => e.stopPropagation()}>
                  <button className={styles.unpinBtn} onClick={() => togglePin(c)} title="Unpin">📌</button>
                  {c.phone && <>
                    <a className={styles.callBtn} href={toTel(c.phone)}>📞</a>
                    <a className={styles.waBtn} href={toWhatsApp(c.phone)} target="_blank" rel="noreferrer">
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
      </main>
    </div>
  )
}
