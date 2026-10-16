import { db } from './db'
import { publicUrl } from './supabase'
import { queueUpload, newId } from './store'

// Note bodies store images as [IMG:path] markers (paths in the note-images
// bucket). Older notes saved full <img> tags; both are understood on load.

const IMG_TAG = /<img\b[^>]*>/gi

function pathFromImgTag(tag) {
  const dp = /data-path="([^"]+)"/i.exec(tag)
  if (dp) return dp[1]
  const src = /src="([^"]+)"/i.exec(tag)
  if (!src) return null
  const m = /\/note-images\/([^"?#]+)/.exec(src[1])
  return m ? decodeURIComponent(m[1]) : null
}

// HTML from the editor -> body to store.
export function htmlToBody(html) {
  return (html || '').replace(IMG_TAG, tag => {
    const p = pathFromImgTag(tag)
    return p ? `[IMG:${p}]` : ''
  })
}

export function bodyPaths(body) {
  const paths = []
  normalizeBody(body).replace(/\[IMG:([^\]]+)\]/g, (_, p) => { paths.push(p); return '' })
  return paths
}

export function normalizeBody(body) {
  return htmlToBody(body || '')
}

const objectUrls = new Map()
function localUrl(path, blob) {
  if (!objectUrls.has(path)) objectUrls.set(path, URL.createObjectURL(blob))
  return objectUrls.get(path)
}

// Resolves a storage path to something an <img> can show: the local copy if
// the photo hasn't been uploaded yet, otherwise the public URL.
export async function imageUrl(bucket, path) {
  if (!path) return null
  const pending = await db.uploads.get(path)
  return pending ? localUrl(path, pending.blob) : publicUrl(bucket, path)
}

export async function bodyToHtml(body) {
  const normalized = normalizeBody(body)
  const paths = bodyPaths(normalized)
  const urls = {}
  for (const p of paths) urls[p] = await imageUrl('note-images', p)
  return normalized.replace(/\[IMG:([^\]]+)\]/g, (_, p) =>
    `<img src="${urls[p]}" data-path="${p.replace(/"/g, '&quot;')}" alt="" />`)
}

export function plainText(body) {
  return normalizeBody(body)
    .replace(/\[IMG:[^\]]+\]/g, ' ')
    .replace(/<(br|div|p|li|\/div|\/p|\/li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
}

// Shrinks a photo before storing it: faster uploads on weak rural signal.
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    return blob || file
  } catch {
    return file
  }
}

// Stores the photo locally, queues the upload, and returns its storage path.
export async function savePhoto(bucket, folder, file, maxSide) {
  const blob = await compressImage(file, maxSide)
  const path = `${folder}/${Date.now()}-${newId().slice(0, 8)}.jpg`
  await queueUpload(bucket, path, blob)
  return { path, url: localUrl(path, blob) }
}
