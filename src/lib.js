import { createClient } from '@supabase/supabase-js'

/* ------------------------------------------------------------------ */
/* Supabase client and auth                                            */
/* ------------------------------------------------------------------ */
const URL_ = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
export const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL
export const configured = Boolean(URL_ && ANON && OWNER_EMAIL)

export const supabase = configured
  ? createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'slate-auth' } })
  : null

export async function signInWithKey(accessKey) {
  if (!supabase) throw new Error('not-configured')
  const { data, error } = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password: accessKey })
  if (error) throw error
  return data.session
}
export async function signOut() { if (supabase) await supabase.auth.signOut() }
export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}
export function onAuthChange(cb) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

/* ------------------------------------------------------------------ */
/* Database helpers                                                    */
/* ------------------------------------------------------------------ */
function unwrap({ data, error }) { if (error) throw error; return data }

export const db = {
  async loadAll() {
    const [cats, notes] = await Promise.all([
      supabase.from('categories').select('*').order('position', { ascending: true }),
      supabase.from('notes').select('*').order('updated_at', { ascending: false }),
    ])
    return { categories: unwrap(cats) || [], notes: unwrap(notes) || [] }
  },
  insertNote: async (row) => unwrap(await supabase.from('notes').insert(row).select().single()),
  updateNote: async (id, patch) => unwrap(await supabase.from('notes').update(patch).eq('id', id).select('id, updated_at').single()),
  deleteNote: async (id) => unwrap(await supabase.from('notes').delete().eq('id', id)),
  insertCategory: async (row) => unwrap(await supabase.from('categories').insert(row).select().single()),
  updateCategory: async (id, patch) => unwrap(await supabase.from('categories').update(patch).eq('id', id)),
  deleteCategory: async (id) => unwrap(await supabase.from('categories').delete().eq('id', id)),
}

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */
export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  }))

export function shortId(len = 4) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const arr = crypto.getRandomValues(new Uint8Array(len))
  for (const n of arr) s += chars[n % chars.length]
  return s
}

export function relTime(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 45) return 'just now'
  const units = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'], [2629800, 'month'], [31557600, 'year']]
  let label = 'minute', size = 60
  for (const [s, l] of units) { if (diff >= s) { size = s; label = l } }
  const n = Math.max(1, Math.round(diff / size))
  return `${n} ${label}${n === 1 ? '' : 's'} ago`
}

export function daysSince(iso) {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export const CATEGORY_COLORS = {
  indigo: '#6366f1', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e',
  sky: '#0ea5e9', violet: '#8b5cf6', slate: '#64748b',
}

export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v) } catch { return fallback }
}
export function lsSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ } }

/* ------------------------------------------------------------------ */
/* Markdown helpers                                                    */
/* ------------------------------------------------------------------ */
export const MARKER_RE = /\s*<!--cv:([a-z0-9]+)-->/g
const MARKER_END = /\s*<!--cv:([a-z0-9]+)-->\s*$/

/** Walk lines and report headings, pads and mermaid blocks with 1 based line numbers. */
export function parseDoc(content) {
  const lines = (content || '').split('\n')
  const headings = [], pads = [], mermaids = []
  let fence = null, fenceStart = 0, fenceBody = []
  lines.forEach((raw, i) => {
    const f = raw.match(/^\s*(```|~~~)\s*([\w-]*)/)
    if (fence) {
      if (f && f[1] === fence.mark && !f[2]) {
        if (fence.lang === 'draw') {
          const id = fenceBody.join('').trim()
          if (id) pads.push({ id, line: fenceStart })
        } else if (fence.lang === 'mermaid') mermaids.push({ line: fenceStart, code: fenceBody.join('\n') })
        fence = null; fenceBody = []
      } else fenceBody.push(raw)
      return
    }
    if (f) { fence = { mark: f[1], lang: f[2] }; fenceStart = i + 1; return }
    const h = raw.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const m = h[2].match(MARKER_END)
      const text = h[2].replace(MARKER_RE, '').trim()
      headings.push({ level: h[1].length, text: text || 'Untitled heading', line: i + 1, cv: m ? m[1] : null })
    }
  })
  return { headings, pads, mermaids, lines }
}

export const stripMarkers = (md) => (md || '').replace(MARKER_RE, '')

/** Markdown for export: no canvas markers, no drawing pad blocks. */
export function toExportMarkdown(md) {
  return stripMarkers(md).replace(/^(```|~~~)draw\s*\n[\s\S]*?\n\1\s*$\n?/gm, '').replace(/\n{3,}/g, '\n\n')
}

export function plainPreview(md, maxLines = 4) {
  const { lines } = parseDoc(md)
  const out = []
  let inFence = false
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; continue }
    if (inFence) continue
    const t = stripMarkers(l).replace(/^#{1,6}\s+/, '').replace(/^\s*([-*+]|\d+\.)\s+(\[[ x]\]\s+)?/, '').replace(/^>\s?/, '')
      .replace(/[*_`~]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\|/g, ' ').trim()
    if (t && !/^[-: ]+$/.test(t)) out.push(t)
    if (out.length >= maxLines) break
  }
  return out
}

/** Tiny tokenizer for code block styling. Returns [{t, v}] where t is k, s, c, n or ''. */
const KW = new Set('const let var function return if else for while do switch case break continue new class extends import from export default async await try catch finally throw typeof instanceof in of null undefined true false this def lambda pass elif yield with as fn pub struct impl use mod match enum interface type public private static void int string bool select insert update delete where create table and or not'.split(' '))
export function tokenize(code) {
  const re = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g
  const out = []
  let last = 0, m
  while ((m = re.exec(code))) {
    if (m.index > last) out.push({ t: '', v: code.slice(last, m.index) })
    if (m[1]) out.push({ t: 'c', v: m[1] })
    else if (m[2]) out.push({ t: 's', v: m[2] })
    else if (m[3]) out.push({ t: 'n', v: m[3] })
    else out.push({ t: KW.has(m[4]) ? 'k' : '', v: m[4] })
    last = re.lastIndex
  }
  if (last < code.length) out.push({ t: '', v: code.slice(last) })
  return out
}

/* ------------------------------------------------------------------ */
/* Canvas thumbnail (lightweight, no Excalidraw needed)                */
/* ------------------------------------------------------------------ */
export function pickThumbCanvas(canvases) {
  if (!canvases) return null
  const list = Object.entries(canvases).filter(([, c]) => c?.elements?.some((e) => !e.isDeleted))
  if (!list.length) return null
  return (list.find(([k]) => k === 'main') || list[0])[1]
}

export function thumbShapes(canvas) {
  const els = (canvas?.elements || []).filter((e) => !e.isDeleted).slice(0, 160)
  if (!els.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const e of els) {
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y)
    maxX = Math.max(maxX, e.x + Math.abs(e.width || 0)); maxY = Math.max(maxY, e.y + Math.abs(e.height || 0))
  }
  const pad = 16
  const items = els.map((e) => {
    const base = { stroke: e.strokeColor, fill: e.backgroundColor && e.backgroundColor !== 'transparent' ? e.backgroundColor : 'none' }
    if (e.type === 'rectangle' || e.type === 'frame') return { ...base, k: 'rect', x: e.x, y: e.y, w: e.width, h: e.height, r: e.roundness ? 8 : 0 }
    if (e.type === 'ellipse') return { ...base, k: 'ellipse', cx: e.x + e.width / 2, cy: e.y + e.height / 2, rx: e.width / 2, ry: e.height / 2 }
    if (e.type === 'diamond') {
      const cx = e.x + e.width / 2, cy = e.y + e.height / 2
      return { ...base, k: 'path', d: `M${cx} ${e.y}L${e.x + e.width} ${cy}L${cx} ${e.y + e.height}L${e.x} ${cy}Z` }
    }
    if ((e.type === 'line' || e.type === 'arrow' || e.type === 'freedraw') && e.points?.length) {
      return { ...base, fill: e.type === 'line' ? base.fill : 'none', k: 'path', d: 'M' + e.points.map(([px, py]) => `${e.x + px} ${e.y + py}`).join('L') }
    }
    if (e.type === 'text') return { ...base, k: 'text', x: e.x, y: e.y, w: e.width, h: e.height }
    return null
  }).filter(Boolean)
  const board = canvas.appState?.board && canvas.appState.board !== 'plain'
  return { viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`, items, board, bg: canvas.appState?.viewBackgroundColor }
}

/* ------------------------------------------------------------------ */
/* Drawing pads                                                        */
/* ------------------------------------------------------------------ */
export const PAD_REF_WIDTH = 800
export const PAD_COLORS = {
  ink: { light: '#111111', dark: '#ededed' },
  red: { light: '#dc2626', dark: '#f87171' },
  amber: { light: '#d97706', dark: '#fbbf24' },
  green: { light: '#16a34a', dark: '#4ade80' },
  blue: { light: '#2563eb', dark: '#60a5fa' },
  violet: { light: '#7c3aed', dark: '#a78bfa' },
}
export const PAD_SIZES = [2, 4, 8]

/** Draw stroke list onto a 2D context already scaled to CSS pixels. */
export function drawPad(ctx, strokes, cssWidth, theme) {
  const s = cssWidth / PAD_REF_WIDTH
  for (const st of strokes || []) {
    if (!st.points?.length) continue
    ctx.save()
    ctx.globalCompositeOperation = st.tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = (PAD_COLORS[st.color] || PAD_COLORS.ink)[theme === 'dark' ? 'dark' : 'light']
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = (st.tool === 'eraser' ? st.size * 4 : st.size) * s
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const pts = st.points
    if (pts.length === 1) {
      ctx.beginPath(); ctx.arc(pts[0][0] * s, pts[0][1] * s, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.beginPath(); ctx.moveTo(pts[0][0] * s, pts[0][1] * s)
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * s, my = ((pts[i][1] + pts[i + 1][1]) / 2) * s
        ctx.quadraticCurveTo(pts[i][0] * s, pts[i][1] * s, mx, my)
      }
      const l = pts[pts.length - 1]; ctx.lineTo(l[0] * s, l[1] * s); ctx.stroke()
    }
    ctx.restore()
  }
}

/** Render a pad to a PNG data URL (light theme on white) for exports. */
export function padToDataUrl(pad, width = 720) {
  const h = Math.round(((pad?.h || 240) * width) / PAD_REF_WIDTH)
  const c = document.createElement('canvas')
  c.width = width * 2; c.height = h * 2
  const ctx = c.getContext('2d'); ctx.scale(2, 2)
  const layer = document.createElement('canvas'); layer.width = c.width; layer.height = c.height
  const lctx = layer.getContext('2d'); lctx.scale(2, 2)
  drawPad(lctx, pad?.strokes, width, 'light')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, h)
  ctx.drawImage(layer, 0, 0, width, h)
  return c.toDataURL('image/png')
}

/* ------------------------------------------------------------------ */
/* Mermaid (lazy)                                                      */
/* ------------------------------------------------------------------ */
let mermaidPromise = null
let mermaidTheme = null
let mermaidSeq = 0
async function getMermaid(theme) {
  if (!mermaidPromise) mermaidPromise = import('mermaid').then((m) => m.default)
  const mermaid = await mermaidPromise
  if (mermaidTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'default',
      fontFamily: '"Geist Variable", ui-sans-serif, sans-serif', htmlLabels: false,
      flowchart: { htmlLabels: false }, suppressErrorRendering: true,
    })
    mermaidTheme = theme
  }
  return mermaid
}
export async function renderMermaid(code, theme = 'light') {
  const mermaid = await getMermaid(theme)
  await mermaid.parse(code)
  const { svg } = await mermaid.render(`mmd${++mermaidSeq}`, code)
  return svg
}

/* ------------------------------------------------------------------ */
/* Export helpers                                                      */
/* ------------------------------------------------------------------ */
export function safeFileName(name) {
  return (name || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
export function svgToPngDataUrl(svgText, maxWidth = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const w = img.naturalWidth || 800, h = img.naturalHeight || 600
      const scale = Math.min(2, maxWidth / w)
      const c = document.createElement('canvas'); c.width = Math.max(1, w * scale); c.height = Math.max(1, h * scale)
      const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg-image')) }
    img.src = url
  })
}
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob) })
}

/* ------------------------------------------------------------------ */
/* App version and settings                                            */
/* ------------------------------------------------------------------ */
// eslint-disable-next-line no-undef
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
export const DEFAULT_SETTINGS = { editorMode: 'live' }
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...lsGet('slate-settings', {}) })

export const SHORTCUTS = [
  ['Everywhere', [['Ctrl or Cmd + K', 'Search notes'], ['Ctrl or Cmd + ,', 'Open settings'], ['Ctrl or Cmd + S', 'Save now']]],
  ['Document', [['Ctrl or Cmd + B', 'Bold'], ['Ctrl or Cmd + I', 'Italic'], ['Ctrl or Cmd + Z', 'Undo'], ['Ctrl or Cmd + Shift + Z', 'Redo'], ['Ctrl or Cmd + V', 'Paste text or an image'], ['Click below the text', 'Add an empty line at the end']]],
  ['Canvas tools', [['V', 'Select'], ['H', 'Hand, move around'], ['P', 'Pen'], ['E', 'Eraser'], ['R', 'Rectangle'], ['A', 'Arrow'], ['T', 'Text'], ['9', 'Image'], ['O', 'Ellipse'], ['D', 'Diamond'], ['L', 'Line'], ['K', 'Laser pointer'], ['F', 'Frame'], ['Ctrl or Cmd + V', 'Paste an image where the pointer is'], ['Shift + 1', 'Zoom to fit everything']]],
  ['Pen', [['Alt + 1 to 9', 'Use pen preset 1 to 9'], ['Shift + P', 'Next pen preset'], ['[ and ]', 'Pen size smaller or larger'], ['Shift + [ and ]', 'Pen size in bigger steps'], ['Drag the grip', 'Move the floating toolbar']]],
  ['Canvas view', [['Ctrl or Cmd + wheel', 'Zoom'], ['Space + drag', 'Move around'], ['Ctrl or Cmd + Shift + E', 'Export image dialog'], ['Ctrl or Cmd + Z', 'Undo']]],
]

/* ------------------------------------------------------------------ */
/* Pen presets                                                         */
/* ------------------------------------------------------------------ */
// Sizes are real pixels at 100% zoom (v1.2). v1.1 stored Excalidraw stroke widths, about 4.25 times smaller.
export const DEFAULT_PEN_PRESETS = [
  { id: 'fine', name: 'Fine pen', color: 'ink', size: 1.5, opacity: 100 },
  { id: 'pen', name: 'Pen', color: 'ink', size: 3, opacity: 100 },
  { id: 'marker', name: 'Red marker', color: '#e03131', size: 6, opacity: 100 },
  { id: 'hl', name: 'Highlighter', color: '#fcc419', size: 20, opacity: 35 },
]
export const loadPenPresets = () => {
  const p = lsGet('slate-pen-presets-v2', null)
  if (Array.isArray(p) && p.length) return p
  const old = lsGet('slate-pen-presets', null)
  if (Array.isArray(old) && old.length) {
    const moved = old.map((x) => ({ ...x, size: Math.max(0.5, Math.round(x.size * 4.25 * 2) / 2) }))
    lsSet('slate-pen-presets-v2', moved)
    return moved
  }
  return DEFAULT_PEN_PRESETS
}
export const savePenPresets = (p) => lsSet('slate-pen-presets-v2', p)

/* ------------------------------------------------------------------ */
/* Image storage (private bucket, files under <user id>/<note id>/)    */
/* ------------------------------------------------------------------ */
export const BUCKET = 'slate-images'
export const IMG_SCHEME = 'slate://img/'
export const IMG_RE = /slate:\/\/img\/([^\s)"'<>]+)/g

async function userId() {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new Error('Your session ended. Sign in again to upload images.')
  return id
}
const extFor = (type) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }[type] || 'png')

/** Shrink very large photos before upload. Small images and GIF or SVG files are kept as they are. */
export async function prepareImage(blob) {
  if (blob.size < 1.5 * 1024 * 1024 || /gif|svg/.test(blob.type)) return blob
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b || blob), 'image/webp', 0.86))
}

export async function uploadFile(file, noteId, prefix = 'file') {
  if (!supabase) throw new Error('Slate is not connected to Supabase.')
  if (file.size > 50 * 1024 * 1024) throw new Error('Upload failed. The file is over 50 MB.')
  const uid = await userId()
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(file.name || '')?.[1] || 'bin').toLowerCase()
  const path = `${uid}/${noteId}/${prefix}_${shortId(8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error) throw new Error(/bucket/i.test(error.message) ? 'Upload failed. The storage bucket is missing, run the latest supabase.sql.' : `Upload failed. ${error.message}`)
  return path
}

export async function uploadImage(blob, noteId, name) {
  if (!supabase) throw new Error('Slate is not connected to Supabase.')
  if (blob.size > 20 * 1024 * 1024) throw new Error('Upload failed. The image is over 20 MB.')
  const uid = await userId()
  const ready = await prepareImage(blob)
  const path = `${uid}/${noteId}/${name || shortId(10)}.${extFor(ready.type)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, ready, { contentType: ready.type || 'image/png', upsert: true })
  if (error) throw new Error(/bucket/i.test(error.message) ? 'Upload failed. The image bucket is missing, run the latest supabase.sql.' : `Upload failed. ${error.message}`)
  return path
}

const blobCache = new Map()
export function imageBlob(path) {
  if (!blobCache.has(path)) {
    const p = supabase.storage.from(BUCKET).download(path).then(({ data, error }) => { if (error) throw error; return data })
    p.catch(() => blobCache.delete(path))
    blobCache.set(path, p)
  }
  return blobCache.get(path)
}
const urlCache = new Map()
export async function imageObjectUrl(path) {
  if (!urlCache.has(path)) urlCache.set(path, imageBlob(path).then((b) => URL.createObjectURL(b)))
  try { return await urlCache.get(path) } catch (e) { urlCache.delete(path); throw e }
}
export async function imageDataUrl(path) { return blobToDataUrl(await imageBlob(path)) }
export const pathFromSrc = (src) => (src && src.startsWith(IMG_SCHEME) ? decodeURIComponent(src.slice(IMG_SCHEME.length)) : null)

/** Turn stored canvas files ({path}) into Excalidraw files ({dataURL}). */
export async function resolveCanvasFiles(files) {
  const out = {}
  await Promise.all(Object.values(files || {}).map(async (f) => {
    try {
      const dataURL = f.dataURL || (f.path ? await imageDataUrl(f.path) : null)
      if (dataURL) out[f.id] = { id: f.id, mimeType: f.mimeType, dataURL, created: f.created || Date.now() }
    } catch { /* missing image: Excalidraw shows a placeholder */ }
  }))
  return out
}

export function referencedImagePaths(notes) {
  const used = new Set()
  for (const n of notes) {
    for (const m of (n.content || '').matchAll(IMG_RE)) used.add(decodeURIComponent(m[1]))
    if (n.pdf?.path) used.add(n.pdf.path)
    for (const c of Object.values(n.canvases || {})) for (const f of Object.values(c?.files || {})) if (f?.path) used.add(f.path)
  }
  return used
}

async function listFolder(prefix) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, offset })
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}
/** Every stored image of the owner: [{path, size}] */
export async function listAllImages() {
  const uid = await userId()
  const top = await listFolder(uid)
  const files = []
  for (const entry of top) {
    if (entry.id) { files.push({ path: `${uid}/${entry.name}`, size: entry.metadata?.size || 0 }); continue }
    for (const f of await listFolder(`${uid}/${entry.name}`)) if (f.id) files.push({ path: `${uid}/${entry.name}/${f.name}`, size: f.metadata?.size || 0 })
  }
  return files
}
export async function removeImages(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
  paths.forEach((p) => { blobCache.delete(p); urlCache.delete(p) })
}
export const formatBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)
export async function signedImageUrl(path, seconds = 604800) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds)
  if (error) throw error
  return data.signedUrl
}
