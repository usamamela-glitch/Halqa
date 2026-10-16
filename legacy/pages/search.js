import { useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import styles from '../styles/Search.module.css'

export default function SearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState([])
  const [villages, setVillages] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const search = useCallback(async (q) => {
    if (!q.trim()) { setContacts([]); setVillages([]); setSearched(false); return }
    setLoading(true)
    setSearched(true)
    const [{ data: cs }, { data: vs }] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, name, phone, phone2, phone3, description, village_id, villages(id, name)')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,phone2.ilike.%${q}%,phone3.ilike.%${q}%`)
        .limit(30),
      supabase
        .from('villages')
        .select('id, name, qanungo_id, qanungos(name)')
        .ilike('name', `%${q}%`)
        .limit(20),
    ])
    setContacts(cs || [])
    setVillages(vs || [])
    setLoading(false)
  }, [])

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    search(q)
  }

  function allPhones(c) {
    return [c.phone, c.phone2, c.phone3].filter(Boolean).join(' · ')
  }

  const hasResults = contacts.length > 0 || villages.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.searchBar}>
        <span className={styles.searchIcon}>⌕</span>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search contacts or villages…"
          value={query}
          onChange={handleChange}
          autoFocus
        />
        {query && <button className={styles.clearBtn} onClick={() => { setQuery(''); setContacts([]); setVillages([]); setSearched(false) }}>×</button>}
      </div>

      <div className={styles.results}>
        {loading && <div className={styles.loading}><div className={styles.spinner} /></div>}

        {!loading && searched && !hasResults && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🔍</div>
            <h3>No results</h3>
            <p>Try a different name or number.</p>
          </div>
        )}

        {!loading && !searched && (
          <div className={styles.hint}>
            <div className={styles.hintIcon}>🔍</div>
            <p>Search across all your contacts and villages</p>
          </div>
        )}

        {/* CONTACTS */}
        {!loading && contacts.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Contacts <span>{contacts.length}</span></div>
            <ul className={styles.list}>
              {contacts.map(c => (
                <li
                  key={c.id}
                  className={styles.contactCard}
                  onClick={() => router.push(`/village/${c.village_id}`)}
                >
                  <div className={styles.avatar}>
                    {c.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                  </div>
                  <div className={styles.info}>
                    <span className={styles.name}>{c.name}</span>
                    <span className={styles.phone}>{allPhones(c) || '—'}</span>
                    {c.description && <span className={styles.desc}>{c.description}</span>}
                    <span className={styles.village}>📍 {c.villages?.name || 'Unknown village'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* VILLAGES */}
        {!loading && villages.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Villages <span>{villages.length}</span></div>
            <ul className={styles.list}>
              {villages.map(v => (
                <li
                  key={v.id}
                  className={styles.villageCard}
                  onClick={() => router.push(`/village/${v.id}`)}
                >
                  <div className={styles.villageInfo}>
                    <span className={styles.villageName}>{v.name}</span>
                    {v.qanungos?.name && <span className={styles.qanungoName}>{v.qanungos.name}</span>}
                  </div>
                  <span className={styles.arrow}>›</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
