import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useVirtualizer } from '@tanstack/react-virtual'
import { db } from '../../lib/db'
import { updateRow } from '../../lib/store'
import { byName, daysSince, contactedLevel } from '../../lib/domain'
import { Screen, Empty, ui, useToast } from '../ui'
import { ContactRow, useContactSheets } from '../contacts'
import { IconStar } from '../Icons'
import m from '../../styles/maingroups.module.css'

// Main Groups has 800+ pinned people. Only the rows on screen (and a few
// either side) are drawn; rows are swapped in and out while scrolling (15 Nov).
// Opening, closing and scrolling cost the same however many are pinned.
export default function MainGroupsScreen() {
  const toast = useToast()
  // Tapping a person opens their card (the card's village name goes to the village).
  const sheets = useContactSheets()
  const sheetsRef = useRef(sheets); sheetsRef.current = sheets
  const openCard = useCallback(id => sheetsRef.current.open(id), [])
  const contacts = useLiveQuery(() => db.contacts.filter(c => !!c.pinned).toArray(), [], [])
  const villages = useLiveQuery(() => db.villages.toArray(), [], [])
  const qanungos = useLiveQuery(() => db.qanungos.toArray(), [], [])
  const scrollRef = useRef(null)
  const listRef = useRef(null)
  const jumpRef = useRef(null)

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

  // One flat list: a heading per qanungo, then its people.
  const { rows, headAt } = useMemo(() => {
    const rows = [], headAt = {}
    groups.forEach((g, gi) => {
      headAt[g.name] = rows.length
      rows.push({ key: `h-${g.name}`, head: g, first: gi === 0 })
      g.items.forEach(it => rows.push({ key: it.c.id, item: it }))
    })
    return { rows, headAt }
  }, [groups])

  // Where the list starts inside the page, and how much the top bar + jump strip cover.
  const [layout, setLayout] = useState({ margin: 0, pad: 0 })
  useLayoutEffect(() => {
    const margin = listRef.current?.offsetTop || 0
    const bar = scrollRef.current?.querySelector('header')?.offsetHeight || 0
    const pad = bar + (jumpRef.current?.offsetHeight || 0)
    setLayout(l => (l.margin === margin && l.pad === pad ? l : { margin, pad }))
  })

  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: i => (rows[i].head ? 62 : 122),
    getItemKey: i => rows[i].key,
    overscan: 6,
    scrollMargin: layout.margin,
    scrollPaddingStart: layout.pad,
  })

  const levels = contacts.map(c => contactedLevel(daysSince(c.last_contacted)))
  const recent = levels.filter(l => l === 'green').length
  const overdue = levels.filter(l => l === 'red' || l === 'none').length

  const toastRef = useRef(toast)
  toastRef.current = toast
  const unpin = useCallback(async c => {
    await updateRow('contacts', c.id, { pinned: false })
    toastRef.current(`Unpinned ${c.name}`, { label: 'Undo', onClick: () => updateRow('contacts', c.id, { pinned: true }) })
  }, [])

  return (
    <Screen
      scrollRef={scrollRef}
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
      ) : (<>
        {/* Jump straight to a Qanungo instead of scrolling the whole list. Stays at the top while scrolling. */}
        <nav className={m.jump} aria-label="Jump to Qanungo" ref={jumpRef}>
          {groups.map(g => (
            <button key={g.name} type="button" className={m.jumpBtn}
              onClick={() => v.scrollToIndex(headAt[g.name], { align: 'start' })}>
              {g.name}<span className={m.jumpCount}>{g.items.length}</span>
            </button>
          ))}
        </nav>
        <div ref={listRef} className={m.vlist} style={{ height: v.getTotalSize() }}>
          {v.getVirtualItems().map(vi => (
            <div key={vi.key} data-index={vi.index} ref={v.measureElement} className={m.vrow}
              style={{ transform: `translateY(${vi.start - layout.margin}px)` }}>
              <Row row={rows[vi.index]} openCard={openCard} unpin={unpin} />
            </div>
          ))}
        </div>
      </>)}
      {sheets.element}
    </Screen>
  )
}

const Row = memo(function Row({ row, openCard, unpin }) {
  if (row.head) {
    return (
      <h2 className={m.head} style={{ paddingTop: row.first ? 14 : 22 }}>
        <span>{row.head.name}</span><span className={m.headCount}>{row.head.items.length}</span>
      </h2>
    )
  }
  const { c, village } = row.item
  return (
    <ul className={ui.list} style={{ paddingBottom: 10 }}>
      <ContactRow contact={c} villageName={village?.name} subtitle={village?.name || 'Unknown village'} showContacted
        onPress={() => openCard(c.id)}
        onUnpin={() => unpin(c)} />
    </ul>
  )
})
