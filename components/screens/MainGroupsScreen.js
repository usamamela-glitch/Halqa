import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useNav } from '../../lib/nav'
import { updateRow } from '../../lib/store'
import { byName, daysSince, contactedLevel } from '../../lib/domain'
import { Screen, Empty, ui, useToast } from '../ui'
import { ContactRow } from '../contacts'
import { IconStar } from '../Icons'

export default function MainGroupsScreen() {
  const { push } = useNav()
  const toast = useToast()
  const contacts = useLiveQuery(() => db.contacts.filter(c => !!c.pinned).toArray(), [], [])
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])

  const groups = useMemo(() => {
    const vById = Object.fromEntries(villages.map(v => [v.id, v]))
    const qById = Object.fromEntries(qanungos.map(q => [q.id, q]))
    const map = new Map()
    contacts.forEach(c => {
      const v = vById[c.village_id]
      const q = v && qById[v.qanungo_id]
      const k = q ? q.id : 'none'
      if (!map.has(k)) map.set(k, { name: q ? q.name : 'Other', items: [] })
      map.get(k).items.push({ c, village: v })
    })
    return [...map.values()]
      .sort((a, b) => (a.name === 'Other') - (b.name === 'Other') || a.name.localeCompare(b.name))
      .map(g => ({ ...g, items: g.items.sort((x, y) => byName(x.c, y.c)) }))
  }, [contacts, villages, qanungos])

  const levels = contacts.map(c => contactedLevel(daysSince(c.last_contacted)))
  const recent = levels.filter(l => l === 'green').length
  const overdue = levels.filter(l => l === 'red' || l === 'none').length

  async function unpin(c) {
    await updateRow('contacts', c.id, { pinned: false })
    toast(`Unpinned ${c.name}`, { label: 'Undo', onClick: () => updateRow('contacts', c.id, { pinned: true }) })
  }

  return (
    <Screen
      title="Main Groups"
      subtitle="Pinned contacts from every village"
      hero={
        <div className={ui.stats}>
          <div className={ui.stat}><div className={ui.statVal}>{contacts.length}</div><div className={ui.statLabel}>Pinned</div></div>
          <div className={ui.stat}><div className={ui.statVal} style={{ color: '#7fe0a8' }}>{recent}</div><div className={ui.statLabel}>This week</div></div>
          <div className={ui.stat}><div className={ui.statVal} style={{ color: '#ffaaa3' }}>{overdue}</div><div className={ui.statLabel}>30+ days</div></div>
        </div>
      }
    >
      {contacts.length === 0 ? (
        <Empty icon={<IconStar size={28} />} title="No pinned contacts yet" text="Tap the pin on any contact. They'll appear here, grouped by Qanungo." />
      ) : groups.map(g => (
        <div key={g.name} className={ui.section}>
          <div className={ui.sectionHead}><span>{g.name}</span><span>{g.items.length}</span></div>
          <ul className={ui.list}>
            {g.items.map(({ c, village }) => (
              <ContactRow key={c.id} contact={c} villageName={village?.name} subtitle={village?.name || 'Unknown village'} showContacted
                onPress={() => push('village', { id: c.village_id, tab: 'Contacts', highlight: c.id })}
                onUnpin={() => unpin(c)} />
            ))}
          </ul>
        </div>
      ))}
    </Screen>
  )
}
