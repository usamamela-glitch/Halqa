import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import styles from '../styles/NoteEditor.module.css'

export default function NoteEditor({ note, onClose, onDelete, table }) {
  const [text, setText] = useState(note.body || '')
  const [images, setImages] = useState(note.images || [])
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const saveTimer = useRef(null)
  const fileRef = useRef(null)

  // Auto-save text
  function handleTextChange(val) {
    setText(val)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      supabase.from(table).update({ body: val }).eq('id', note.id)
    }, 800)
  }

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      supabase.from(table).update({ body: text, images }).eq('id', note.id)
    }
  }, [text, images])

  async function handleImagePick(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${note.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('note-images').upload(path, file)
    if (!error) {
      const newImages = [...images, path]
      setImages(newImages)
      await supabase.from(table).update({ images: newImages }).eq('id', note.id)
    }
    setUploading(false)
    e.target.value = ''
  }

  async function deleteImage(path) {
    await supabase.storage.from('note-images').remove([path])
    const newImages = images.filter(i => i !== path)
    setImages(newImages)
    await supabase.from(table).update({ images: newImages }).eq('id', note.id)
  }

  function getImageUrl(path) {
    const { data } = supabase.storage.from('note-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleDelete() {
    // Delete all images from storage
    if (images.length > 0) {
      await supabase.storage.from('note-images').remove(images)
    }
    await supabase.from(table).delete().eq('id', note.id)
    onDelete(note.id)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose}>‹ Notes</button>
        <span className={styles.savingLabel}>Auto-saving</span>
        <button className={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
      </div>

      <div className={styles.body}>
        <textarea
          className={styles.textArea}
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          placeholder="Start typing…"
          autoFocus
        />

        {/* Images */}
        {images.length > 0 && (
          <div className={styles.imageGrid}>
            {images.map(path => (
              <div key={path} className={styles.imageWrap}>
                <img src={getImageUrl(path)} className={styles.noteImage} alt="" />
                <button className={styles.removeImage} onClick={() => deleteImage(path)}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Add photo button */}
        <button
          className={styles.addPhotoBtn}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '⏳ Uploading…' : '📷 Add Photo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImagePick}
        />
      </div>

      {/* Delete confirm */}
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
