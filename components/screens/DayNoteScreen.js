import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { upsertRow } from '../../lib/store'
import { useAutosave } from '../../lib/hooks'
import { Screen, SaveStatus } from '../ui'
import n from '../../styles/note.module.css'

export default function DayNoteScreen() {
  const row = useLiveQuery(() => db.day_note.get(1), [], null)
  const [text, setText] = useState(null)
  const focused = useRef(false)
  const { status, change, flush } = useAutosave(body => upsertRow('day_note', { id: 1, body }), 800)

  useEffect(() => {
    if (row === null) return
    if (text === null || (!focused.current && status === 'saved')) setText(row?.body || '')
  }, [row])

  return (
    <Screen barTitle="Day to Day" actions={<SaveStatus status={status} />} bodyClassName={n.body}>
      {text !== null && (
        <textarea className={n.plain} value={text} placeholder="Your day-to-day scratchpad…"
          onFocus={() => { focused.current = true }}
          onBlur={() => { focused.current = false; flush() }}
          onChange={e => { setText(e.target.value); change(e.target.value) }} />
      )}
    </Screen>
  )
}
