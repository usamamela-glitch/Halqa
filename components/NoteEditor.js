import { useRef, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import styles from '../styles/NoteEditor.module.css'

export default function NoteEditor({ note, onClose, onDelete, table }) {
  const [blocks, setBlocks] = useState([]) // array of {type: 'text'|'image', content: string, id: string}
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved')
  const fileRef = useRef(null)
  const saveTimer = useRef(null)
  const activeTextRef = useRef(null)
  const activeBlockId = useRef(null)

  // Parse saved note into blocks on load
  useEffect(() => {
    const saved = note.body || ''
    const imgs = note.images || []
    
    if (!saved && imgs.length === 0) {
      setBlocks([{ type: 'text', content: '', id: genId() }])
      return
    }

    // If we have images stored separately, build blocks from body + images
    // Body may contain [IMG:path] markers or just be plain text
    if (imgs.length > 0 && saved.includes('[IMG:')) {
      const parts = []
      let remaining = saved
      let imgIndex = 0
      
      const imgRegex = /\[IMG:([^\]]+)\]/g
      let match
      let lastIndex = 0
      
      while ((match = imgRegex.exec(saved)) !== null) {
        const textBefore = saved.slice(lastIndex, match.index).trim()
        if (textBefore) parts.push({ type: 'text', content: stripHtml(textBefore), id: genId() })
        parts.push({ type: 'image', content: match[1], id: genId() })
        lastIndex = match.index + match[0].length
      }
      const textAfter = saved.slice(lastIndex).trim()
      if (textAfter) parts.push({ type: 'text', content: stripHtml(textAfter), id: genId() })
      
      if (parts.length === 0) parts.push({ type: 'text', content: '', id: genId() })
      // Ensure ends with text block
      if (parts[parts.length - 1].type === 'image') parts.push({ type: 'text', content: '', id: genId() })
      setBlocks(parts)
    } else {
      // Plain text note, no images or old HTML
      const cleanText = stripHtml(saved)
      const initial = [{ type: 'text', content: cleanText, id: genId() }]
      // If images exist but no markers, append them at end
      if (imgs.length > 0) {
        imgs.forEach(path => initial.push({ type: 'image', content: path, id: genId() }))
        initial.push({ type: 'text', content: '', id: genId() })
      }
      setBlocks(initial)
    }
  }, [])

  function genId() {
    return Math.random().toString(36).slice(2)
  }

  function stripHtml(html) {
    if (!html) return ''
    return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  }

  function blocksToBody(bks) {
    return bks.map(b => b.type === 'text' ? b.content : `[IMG:${b.content}]`).join('\n')
  }

  function blocksToImages(bks) {
    return bks.filter(b => b.type === 'image').map(b => b.content)
  }

  async function saveNow(bks) {
    const currentBlocks = bks || blocks
    setSaveStatus('saving')
    const body = blocksToBody(currentBlocks)
    const images = blocksToImages(currentBlocks)
    await supabase.from(table).update({ body, images }).eq('id', note.id)
    setSaveStatus('saved')
  }

  function triggerSave(bks) {
    clearTimeout(saveTimer.current)
    setSaveStatus('unsaved')
    saveTimer.current = setTimeout(() => saveNow(bks), 800)
  }

  async function handleBack() {
    clearTimeout(saveTimer.current)
    await saveNow()
    onClose()
  }

  useEffect(() => {
    const onHide = () => {
      clearTimeout(saveTimer.current)
      saveNow()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      clearTimeout(saveTimer.current)
    }
  }, [blocks])

  function updateTextBlock(id, content) {
    const newBlocks = blocks.map(b => b.id === id ? { ...b, content } : b)
    setBlocks(newBlocks)
    triggerSave(newBlocks)
  }

  async function handleImagePick(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${note.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('note-images').upload(path, file)

    if (!error) {
      // Find the active text block and insert image after it
      const currentBlocks = [...blocks]
      const activeIdx = activeBlockId.current 
        ? currentBlocks.findIndex(b => b.id === activeBlockId.current)
        : currentBlocks.length - 1
      
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : currentBlocks.length
      const newImageBlock = { type: 'image', content: path, id: genId() }
      const newTextBlock = { type: 'text', content: '', id: genId() }
      
      currentBlocks.splice(insertAt, 0, newImageBlock, newTextBlock)
      setBlocks(currentBlocks)
      triggerSave(currentBlocks)
    }

    setUploading(false)
    e.target.value = ''
  }

  async function deleteImage(blockId, path) {
    await supabase.storage.from('note-images').remove([path])
    const newBlocks = blocks.filter(b => b.id !== blockId)
    // Merge adjacent text blocks if needed
    const merged = []
    for (const b of newBlocks) {
      if (b.type === 'text' && merged.length > 0 && merged[merged.length-1].type === 'text') {
        merged[merged.length-1].content += (merged[merged.length-1].content && b.content ? '\n' : '') + b.content
      } else {
        merged.push({...b})
      }
    }
    if (merged.length === 0) merged.push({ type: 'text', content: '', id: genId() })
    setBlocks(merged)
    triggerSave(merged)
  }

  async function handleDelete() {
    const paths = blocks.filter(b => b.type === 'image').map(b => b.content)
    if (paths.length > 0) await supabase.storage.from('note-images').remove(paths)
    await supabase.from(table).delete().eq('id', note.id)
    onDelete(note.id)
  }

  function getImageUrl(path) {
    const { data } = supabase.storage.from('note-images').getPublicUrl(path)
    return data.publicUrl
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

      <div className={styles.editorScroll}>
        {blocks.map((block, idx) => (
          block.type === 'text' ? (
            <textarea
              key={block.id}
              className={styles.textBlock}
              value={block.content}
              onChange={e => updateTextBlock(block.id, e.target.value)}
              onFocus={() => { activeBlockId.current = block.id }}
              placeholder={idx === 0 ? 'Start typing…' : ''}
              rows={1}
              style={{ height: 'auto', minHeight: '40px' }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
            />
          ) : (
            <div key={block.id} className={styles.imageBlock}>
              <img
                src={getImageUrl(block.content)}
                className={styles.noteImage}
                alt="note image"
                onError={e => { e.target.style.display = 'none' }}
              />
              <button className={styles.removeImage} onClick={() => deleteImage(block.id, block.content)}>×</button>
            </div>
          )
        ))}
      </div>

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
