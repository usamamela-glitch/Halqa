import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import styles from '../styles/NoteEditor.module.css'

export default function NoteEditor({ note, onClose, onDelete, table }) {
  const [content, setContent] = useState(note.body || '')
  const [images, setImages] = useState(note.images || [])
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const saveTimer = useRef(null)
  const fileRef = useRef(null)
  const textareaRef = useRef(null)
  const cursorPosRef = useRef(null)

  // Auto-save
  function triggerSave(text, imgs) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      supabase.from(table).update({ body: text, images: imgs }).eq('id', note.id)
    }, 800)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      supabase.from(table).update({ body: content, images }).eq('id', note.id)
    }
  }, [content, images])

  function handleTextChange(e) {
    const val = e.target.value
    setContent(val)
    triggerSave(val, images)
  }

  // Save cursor position before file picker opens
  function handleAddPhoto() {
    if (textareaRef.current) {
      cursorPosRef.current = textareaRef.current.selectionStart
    }
    fileRef.current?.click()
  }

  async function handleImagePick(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${note.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('note-images').upload(path, file)

    if (!error) {
      const { data } = supabase.storage.from('note-images').getPublicUrl(path)
      const imageUrl = data.publicUrl
      // Insert image marker at cursor position
      const pos = cursorPosRef.current ?? content.length
      const marker = `\n[IMG:${path}]\n`
      const newContent = content.slice(0, pos) + marker + content.slice(pos)
      const newImages = [...images, path]
      setContent(newContent)
      setImages(newImages)
      triggerSave(newContent, newImages)
    }
    setUploading(false)
    e.target.value = ''
  }

  async function deleteImage(path) {
    await supabase.storage.from('note-images').remove([path])
    const newImages = images.filter(i => i !== path)
    // Remove marker from content
    const newContent = content.replace(`\n[IMG:${path}]\n`, '').replace(`[IMG:${path}]`, '')
    setImages(newImages)
    setContent(newContent)
    triggerSave(newContent, newImages)
  }

  function getImageUrl(path) {
    const { data } = supabase.storage.from('note-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleDelete() {
    if (images.length > 0) {
      await supabase.storage.from('note-images').remove(images)
    }
    await supabase.from(table).delete().eq('id', note.id)
    onDelete(note.id)
  }

  // Render content with images inline
  function renderContent() {
    const imgRegex = /\[IMG:([^\]]+)\]/g
    const parts = []
    let lastIndex = 0
    let match

    while ((match = imgRegex.exec(content)) !== null) {
      const before = content.slice(lastIndex, match.index).replace(/^\n/, '').replace(/\n$/, '')
      if (before) parts.push({ type: 'text', value: before, key: `t-${lastIndex}` })
      parts.push({ type: 'image', path: match[1], key: `i-${match[1]}` })
      lastIndex = match.index + match[0].length
    }

    const after = content.slice(lastIndex).replace(/^\n/, '')
    if (after) parts.push({ type: 'text', value: after, key: `t-end` })

    return parts
  }

  // Check if content has any image markers
  const hasImages = images.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose}>‹ Notes</button>
        <span className={styles.savingLabel}>{uploading ? 'Uploading…' : 'Auto-saving'}</span>
        <button className={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
      </div>

      <div className={styles.editorWrap}>
        {!hasImages ? (
          // Pure text mode — full height textarea
          <textarea
            ref={textareaRef}
            className={styles.textArea}
            value={content}
            onChange={handleTextChange}
            placeholder="Start typing…"
            autoFocus
          />
        ) : (
          // Mixed mode — render text and images inline
          <div className={styles.mixedEditor}>
            {renderContent().map(part => (
              part.type === 'text' ? (
                <textarea
                  key={part.key}
                  className={styles.inlineTextArea}
                  defaultValue={part.value}
                  onBlur={e => {
                    // Update the full content when user finishes editing a segment
                    const newContent = content.replace(part.value, e.target.value)
                    setContent(newContent)
                    triggerSave(newContent, images)
                  }}
                  placeholder={part.value ? '' : 'Continue typing…'}
                />
              ) : (
                <div key={part.key} className={styles.inlineImageWrap}>
                  <img src={getImageUrl(part.path)} className={styles.inlineImage} alt="" />
                  <button className={styles.removeImage} onClick={() => deleteImage(part.path)}>×</button>
                </div>
              )
            ))}
          </div>
        )}

        <button
          className={styles.addPhotoBtn}
          onClick={handleAddPhoto}
          disabled={uploading}
        >
          📷 {uploading ? 'Uploading…' : 'Add Photo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImagePick}
        />
      </div>

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
