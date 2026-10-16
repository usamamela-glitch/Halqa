import { useEffect, useRef, useState } from 'react'
import { db } from '../../lib/db'
import { useNav, useScreen } from '../../lib/nav'
import { updateRow, deleteRow, restoreRow } from '../../lib/store'
import { useAutosave } from '../../lib/hooks'
import { bodyToHtml, htmlToBody, bodyPaths, plainText, savePhoto } from '../../lib/images'
import { Screen, BarButton, SaveStatus, ActionSheet, useToast } from '../ui'
import { IconCamera, IconTrash } from '../Icons'
import n from '../../styles/note.module.css'

// Full-screen note editor (village notes and general notes).
// Saves 800ms after typing stops, when the app is backgrounded, and on close.
export default function NoteScreen() {
  const { params } = useScreen()
  const { pop } = useNav()
  const toast = useToast()
  const { table, id, isNew } = params
  const editorRef = useRef(null)
  const fileRef = useRef(null)
  const rangeRef = useRef(null)
  const latestBody = useRef(null)
  const deleted = useRef(false)
  const [ready, setReady] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const { status, change, flush } = useAutosave(body => {
    if (deleted.current) return
    return updateRow(table, id, { body, images: bodyPaths(body) })
  }, 800)

  useEffect(() => {
    let live = true
    db[table].get(id).then(async row => {
      if (!live || !editorRef.current) return
      latestBody.current = htmlToBody(row?.body || '')
      editorRef.current.innerHTML = await bodyToHtml(row?.body || '')
      setReady(true)
      if (isNew) editorRef.current.focus()
    })
    return () => { live = false }
  }, [table, id, isNew])

  // Leaving an untouched new note shouldn't leave an empty "New Note" behind.
  useEffect(() => () => {
    const body = latestBody.current
    if (!deleted.current && body !== null && !plainText(body).trim() && !bodyPaths(body).length) {
      deleteRow(table, id)
    }
  }, [table, id])

  function onInput() {
    const body = htmlToBody(editorRef.current.innerHTML)
    latestBody.current = body
    change(body)
  }

  function rememberSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) rangeRef.current = sel.getRangeAt(0).cloneRange()
  }

  useEffect(() => {
    document.addEventListener('selectionchange', rememberSelection)
    return () => document.removeEventListener('selectionchange', rememberSelection)
  }, [])

  // Pasting never brings in formatting (it caused invisible text before).
  function onPaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  async function onPickPhoto(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    const { path, url } = await savePhoto('note-images', id, file, 1600)
    const el = editorRef.current
    const img = document.createElement('img')
    img.src = url
    img.setAttribute('data-path', path)
    img.alt = ''
    const range = rangeRef.current && el.contains(rangeRef.current.startContainer) ? rangeRef.current : null
    if (range) {
      range.deleteContents()
      const after = document.createElement('br')
      range.insertNode(after)
      range.insertNode(img)
      const sel = window.getSelection()
      const r = document.createRange()
      r.setStartAfter(after)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
    } else {
      el.appendChild(img)
      el.appendChild(document.createElement('br'))
    }
    onInput()
    flush()
  }

  async function remove() {
    await flush()
    const row = await db[table].get(id)
    deleted.current = true
    await deleteRow(table, id)
    pop()
    const hasContent = row && (plainText(row.body).trim() || bodyPaths(row.body).length)
    if (hasContent) toast('Note deleted', { label: 'Undo', onClick: () => restoreRow(table, row) })
  }

  return (
    <Screen
      barTitle={table === 'notes' ? 'Village note' : 'Note'}
      bodyClassName={n.body}
      actions={
        <>
          <SaveStatus status={status} />
          <BarButton onClick={() => fileRef.current?.click()} aria-label="Add photo"><IconCamera size={21} /></BarButton>
          <BarButton onClick={() => setConfirm(true)} aria-label="Delete note"><IconTrash size={20} /></BarButton>
        </>
      }
    >
      <div
        ref={editorRef}
        className={n.editor}
        contentEditable={ready}
        suppressContentEditableWarning
        onInput={onInput}
        onPaste={onPaste}
        onBlur={() => flush()}
        data-placeholder="Start typing…"
        spellCheck
      />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
      <ActionSheet open={confirm} onClose={() => setConfirm(false)} title="Delete note?"
        text="The note and its photos will be removed."
        items={[{ label: 'Delete note', icon: <IconTrash size={20} />, danger: true, onClick: remove }]} />
    </Screen>
  )
}
