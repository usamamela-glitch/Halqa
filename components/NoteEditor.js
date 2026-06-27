import { useRef, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from '../styles/NoteEditor.module.css'

export default function NoteEditor({ note, onClose, onDelete, table }) {
  const editorRef = useRef(null)
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved')

  useEffect(() => {
    if (!editorRef.current) return
    let html = note.body || ''
    // Replace [IMG:path] markers with actual img tags with fresh URLs
    html = html.replace(/\[IMG:([^\]]+)\]/g, (match, path) => {
      const { data } = supabase.storage.from('note-images').getPublicUrl(path)
      return `<img src="${data.publicUrl}" data-path="${path}" style="width:100%;border-radius:10px;display:block;margin:8px 0;" />`
    })
    // Also refresh any existing img tags
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    tempDiv.querySelectorAll('img[data-path]').forEach(img => {
      const path = img.getAttribute('data-path')
      if (path) {
        const { data } = supabase.storage.from('note-images').getPublicUrl(path)
        img.src = data.publicUrl
      }
    })
    editorRef.current.innerHTML = tempDiv.innerHTML
    const el = editorRef.current
    el.focus()
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }, [])

  function getBodyToSave() {
    if (!editorRef.current) return ''
    // Clone the editor content
    const clone = editorRef.current.cloneNode(true)
    // Replace img tags with [IMG:path] markers
    clone.querySelectorAll('img[data-path]').forEach(img => {
      const path = img.getAttribute('data-path')
      const text = document.createTextNode(`[IMG:${path}]`)
      img.parentNode.replaceChild(text, img)
    })
    return clone.innerHTML
  }

  function getImagePaths() {
    if (!editorRef.current) return []
    return Array.from(editorRef.current.querySelectorAll('img[data-path]'))
      .map(img => img.getAttribute('data-path'))
  }

  async function saveNow() {
    const body = getBodyToSave()
    const images = getImagePaths()
    setSaveStatus('saving')
    await supabase.from(table).update({ body, images }).eq('id', note.id)
    setSaveStatus('saved')
  }

  function handleInput() {
    setSaveStatus('unsaved')
    clearTimeout(window._halqaSaveTimer)
    window._halqaSaveTimer = setTimeout(saveNow, 800)
  }

  async function handleBack() {
    clearTimeout(window._halqaSaveTimer)
    await saveNow()
    onClose()
  }

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        clearTimeout(window._halqaSaveTimer)
        saveNow()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearTimeout(window._halqaSaveTimer)
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
      editorRef.current.focus()
      const sel = window.getSelection()
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        const br1 = document.createElement('br')
        range.insertNode(br1)
        range.setStartAfter(br1)
        const img = document.createElement('img')
        img.src = data.publicUrl
        img.style.cssText = 'width:100%;border-radius:10px;display:block;margin:8px 0;'
        img.setAttribute('data-path', path)
        range.insertNode(img)
        range.setStartAfter(img)
        const br2 = document.createElement('br')
        range.insertNode(br2)
        range.setStartAfter(br2)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      setSaveStatus('unsaved')
      clearTimeout(window._halqaSaveTimer)
      window._halqaSaveTimer = setTimeout(saveNow, 800)
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleDelete() {
    const paths = getImagePaths()
    if (paths.length > 0) await supabase.storage.from('note-images').remove(paths)
    await supabase.from(table).delete().eq('id', note.id)
    onDelete(note.id)
  }

  const statusLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved' : 'Saved ✓'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={handleBack}>‹ Notes</button>
        <span className={`${styles.savingLabel} ${saveStatus === 'unsaved' ? styles.unsaved : ''}`}>{statusLabel}</span>
        <button className={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
      </div>

      <div className={styles.toolbar}>
        <button className={styles.photoBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
          📷 {uploading ? 'Uploading…' : 'Add Photo'}
        </button>
      </div>

      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder="Start typing…"
      />

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagePick} />

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
