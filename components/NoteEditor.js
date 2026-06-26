import { useRef, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from '../styles/NoteEditor.module.css'

export default function NoteEditor({ note, onClose, onDelete, table }) {
  const editorRef = useRef(null)
  const fileRef = useRef(null)
  const saveTimer = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Load saved content into editor on mount
  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.innerHTML = note.body || ''
    // Place cursor at end
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(editorRef.current)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }, [])

  function triggerSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const html = editorRef.current?.innerHTML || ''
      supabase.from(table).update({ body: html }).eq('id', note.id)
    }, 800)
  }

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const html = editorRef.current?.innerHTML || ''
      supabase.from(table).update({ body: html }).eq('id', note.id)
    }
  }, [])

  async function handleImagePick(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${note.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('note-images').upload(path, file)

    if (!error) {
      const { data } = supabase.storage.from('note-images').getPublicUrl(path)
      const url = data.publicUrl

      // Insert image at cursor position
      editorRef.current.focus()
      const sel = window.getSelection()
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        range.deleteContents()

        // Insert line break before image
        const br1 = document.createElement('br')
        range.insertNode(br1)
        range.setStartAfter(br1)

        // Insert image
        const img = document.createElement('img')
        img.src = url
        img.style.cssText = 'width:100%;border-radius:10px;display:block;margin:8px 0;'
        img.setAttribute('data-path', path)
        range.insertNode(img)
        range.setStartAfter(img)

        // Insert line break after image
        const br2 = document.createElement('br')
        range.insertNode(br2)
        range.setStartAfter(br2)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      triggerSave()
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleDelete() {
    // Extract image paths from editor content and delete from storage
    const imgs = editorRef.current?.querySelectorAll('img[data-path]') || []
    const paths = Array.from(imgs).map(img => img.getAttribute('data-path'))
    if (paths.length > 0) {
      await supabase.storage.from('note-images').remove(paths)
    }
    await supabase.from(table).delete().eq('id', note.id)
    onDelete(note.id)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose}>‹ Notes</button>
        <span className={styles.savingLabel}>{uploading ? 'Uploading…' : 'Auto-saving'}</span>
        <button className={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
      </div>

      <div className={styles.toolbar}>
        <button
          className={styles.photoBtn}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          📷 {uploading ? 'Uploading…' : 'Add Photo'}
        </button>
      </div>

      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable
        suppressContentEditableWarning
        onInput={triggerSave}
        data-placeholder="Start typing…"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImagePick}
      />

      {showDeleteConfirm && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false) }}>
          <div className={styles.modal}>
            <div className={styles.modalHandle} />
            <h2 className={styles.modalTitle}>Delete Note?</h2>
            <p className={styles.modalBody}>This note and all its images will be permanently deleted.</p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className={styles.btnDelete} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
