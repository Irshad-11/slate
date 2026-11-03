import { Children, Suspense, createContext, isValidElement, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import CodeMirror, { Decoration, EditorView, ViewPlugin, WidgetType, StateField, StateEffect } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeftIcon, CheckIcon, WarningIcon, ArticleIcon, ColumnsIcon, ChalkboardSimpleIcon, ExportIcon, PencilLineIcon,
  BookOpenIcon, SidebarSimpleIcon, TextHOneIcon, TextHTwoIcon, TextHThreeIcon, TextBIcon, TextItalicIcon,
  TextStrikethroughIcon, ListBulletsIcon, ListNumbersIcon, ListChecksIcon, QuotesIcon, CodeBlockIcon, TableIcon,
  LinkIcon, MinusIcon, ScribbleIcon, TreeStructureIcon, FrameCornersIcon, PencilSimpleIcon, EraserIcon,
  ArrowArcLeftIcon, ArrowArcRightIcon, BroomIcon, XIcon, FilePdfIcon, FileMdIcon, FileImageIcon, FileSvgIcon, PlusIcon,
  ImageIcon, GearIcon, NotePencilIcon, ArrowsClockwiseIcon, DownloadSimpleIcon, TrashIcon, MoonStarsIcon, ArrowsOutLineHorizontalIcon,
} from '@phosphor-icons/react'
import {
  db, parseDoc, stripMarkers, toExportMarkdown, shortId, lsGet, lsSet, tokenize, renderMermaid, drawPad, padToDataUrl,
  PAD_COLORS, PAD_SIZES, PAD_REF_WIDTH, safeFileName, downloadBlob, svgToPngDataUrl, blobToDataUrl, CATEGORY_COLORS,
  uploadImage, imageObjectUrl, imageDataUrl, pathFromSrc, signedImageUrl, IMG_SCHEME, IMG_RE, uploadFile, imageBlob,
} from './lib.js'
import { btn, Modal, ThemeToggle, Menu } from './App.jsx'

const CanvasBoard = lazy(() => import('./Canvas.jsx'))
const FIELDS = ['title', 'content', 'canvases', 'pads', 'view_mode', 'tags', 'category_id', 'pdf']
const pick = (n) => Object.fromEntries(FIELDS.map((k) => [k, n[k]]))

function useMedia(q) {
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q), on = (e) => setM(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

/* ================================================================== */
/* CodeMirror markdown decorations                                     */
/* ================================================================== */
class CvWidget extends WidgetType {
  constructor(id) { super(); this.id = id }
  eq(o) { return o.id === this.id }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-cv-chip'
    s.title = 'Open the canvas linked to this heading'
    s.addEventListener('mousedown', (e) => { e.preventDefault(); liveCtx.current?.onCanvasMarker?.(this.id) })
    s.style.cursor = 'pointer'
    s.innerHTML = '<svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M200 80v32a8 8 0 0 1-16 0V88h-24a8 8 0 0 1 0-16h32a8 8 0 0 1 8 8M96 168H72v-24a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8h32a8 8 0 0 0 0-16M232 56v144a16 16 0 0 1-16 16H40a16 16 0 0 1-16-16V56a16 16 0 0 1 16-16h176a16 16 0 0 1 16 16m-16 144V56H40v144z"/></svg>canvas'
    return s
  }
  ignoreEvent() { return false }
}

const INLINE = [
  [/\*\*(?=\S)([^*\n]+?)\*\*/g, 'cm-strong', 2],
  [/(?<![*\w])\*(?=\S)([^*\n]+?)\*(?![*\w])/g, 'cm-em', 1],
  [/(?<!\w)_(?=\S)([^_\n]+?)_(?!\w)/g, 'cm-em', 1],
  [/~~([^~\n]+)~~/g, 'cm-strike', 2],
  [/`([^`\n]+)`/g, 'cm-icode', 0],
  [/\[([^\]\n]+)\]\(([^)\s]+)\)/g, 'cm-link', 0],
]
const mdDecorations = ViewPlugin.fromClass(class {
  constructor(view) { this.build(view) }
  update(u) { if (u.docChanged) this.build(u.view) }
  build(view) {
    const doc = view.state.doc
    const ranges = [], atomic = []
    let fence = false
    const mark = (cls) => Decoration.mark({ class: cls })
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i), t = line.text
      if (/^\s*(```|~~~)/.test(t)) { ranges.push(Decoration.line({ class: 'cm-fence cm-fence-edge' }).range(line.from)); fence = !fence; continue }
      if (fence) { ranges.push(Decoration.line({ class: 'cm-fence' }).range(line.from)); continue }
      const h = /^(#{1,6})\s/.exec(t)
      if (h) {
        ranges.push(Decoration.line({ class: `cm-h cm-h${Math.min(3, h[1].length)}` }).range(line.from))
        ranges.push(mark('cm-mk').range(line.from, line.from + h[1].length))
      } else if (/^>\s?/.test(t)) {
        ranges.push(Decoration.line({ class: 'cm-quote' }).range(line.from))
      }
      const lm = /^(\s*)([-*+]|\d+\.)(\s+\[[ xX]\])?\s/.exec(t)
      if (lm) ranges.push(mark('cm-mk').range(line.from + lm[1].length, line.from + lm[0].length - 1))
      const cv = /\s*<!--cv:([a-z0-9]+)-->/.exec(t)
      if (cv) {
        const d = Decoration.replace({ widget: new CvWidget(cv[1]) }).range(line.from + cv.index, line.from + cv.index + cv[0].length)
        ranges.push(d); atomic.push(d)
      }
      if (t.length > 2000) continue
      for (const [re, cls] of INLINE) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(t))) { if (m[0].length) ranges.push(mark(cls).range(line.from + m.index, line.from + m.index + m[0].length)) }
      }
    }
    this.decorations = Decoration.set(ranges, true)
    this.atomic = Decoration.set(atomic, true)
  }
}, {
  decorations: (v) => v.decorations,
  provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.atomic ?? Decoration.none),
})

/* ================================================================== */
/* Live preview: markdown renders in place, raw syntax only on the     */
/* line being edited                                                   */
/* ================================================================== */
const liveCtx = { current: null }
const refreshLive = StateEffect.define()
const setFocus = StateEffect.define()
const focusField = StateField.define({
  create: () => false,
  update: (v, tr) => { for (const e of tr.effects) if (e.is(setFocus)) return e.value; return v },
})
const focusTracker = EditorView.focusChangeEffect.of((_s, focusing) => setFocus.of(focusing))

class BulletW extends WidgetType {
  eq() { return true }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-lv-bullet'; s.textContent = '•'; return s }
}
class CheckW extends WidgetType {
  constructor(checked) { super(); this.checked = checked }
  eq(o) { return o.checked === this.checked }
  toDOM(view) {
    const i = document.createElement('input')
    i.type = 'checkbox'; i.checked = this.checked; i.className = 'cm-lv-check'; i.setAttribute('aria-label', 'Toggle task')
    i.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const line = view.state.doc.lineAt(view.posAtDOM(i))
      const m = /\[( |x|X)\]/.exec(line.text)
      if (m) { const from = line.from + m.index + 1; view.dispatch({ changes: { from, to: from + 1, insert: m[1] === ' ' ? 'x' : ' ' } }) }
    })
    return i
  }
  ignoreEvent() { return true }
}
class HrW extends WidgetType {
  eq() { return true }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-lv-hr'; return s }
}
class LabelW extends WidgetType {
  constructor(text) { super(); this.text = text }
  eq(o) { return o.text === this.text }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-lv-label'; s.textContent = this.text; return s }
}
class ImageW extends WidgetType {
  constructor(src, alt) { super(); this.src = src; this.alt = alt }
  eq(o) { return o.src === this.src && o.alt === this.alt }
  toDOM() {
    const wrap = document.createElement('span'); wrap.className = 'cm-lv-imgwrap'
    if (this.src.startsWith('uploading-')) { wrap.className += ' cm-lv-uploading'; wrap.textContent = 'Uploading image'; return wrap }
    const img = document.createElement('img'); img.className = 'cm-lv-img'; img.alt = this.alt || 'Image from the note'
    const path = pathFromSrc(this.src)
    if (path) imageObjectUrl(path).then((u) => { img.src = u }).catch(() => { wrap.textContent = 'Image could not be loaded. It may have been removed.'; wrap.className += ' cm-lv-missing' })
    else img.src = this.src
    wrap.appendChild(img)
    return wrap
  }
}
class MermaidW extends WidgetType {
  constructor(code, theme) { super(); this.code = code; this.theme = theme }
  eq(o) { return o.code === this.code && o.theme === this.theme }
  toDOM() {
    const d = document.createElement('div'); d.className = 'cm-lv-block mermaid-preview'
    d.innerHTML = '<div class="skeleton" style="height:120px;border-radius:8px"></div>'
    renderMermaid(this.code, this.theme).then((svg) => { d.innerHTML = svg }).catch((e) => {
      d.textContent = `This diagram has an error. ${(e?.message || '').split('\n')[0]} Click to edit.`; d.classList.add('cm-lv-error')
    })
    d.title = 'Click to edit the diagram source'
    return d
  }
}
class PadW extends WidgetType {
  constructor(id, theme) { super(); this.id = id; this.theme = theme }
  eq(o) { return o.id === this.id && o.theme === this.theme }
  toDOM() {
    const d = document.createElement('div'); d.className = 'cm-lv-pad'
    const root = createRoot(d)
    root.render(<ReadCtx.Provider value={liveCtx.current?.read}><DrawingPad id={this.id} /></ReadCtx.Provider>)
    d._root = root
    return d
  }
  destroy(dom) { const r = dom._root; setTimeout(() => r?.unmount(), 0) }
  ignoreEvent() { return true }
}
class TableW extends WidgetType {
  constructor(lines) { super(); this.lines = lines; this.key = lines.join('\n') }
  eq(o) { return o.key === this.key }
  toDOM() {
    const wrap = document.createElement('div'); wrap.className = 'cm-lv-block md'
    const table = document.createElement('table')
    const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim().replace(/\*\*|__|`|~~/g, ''))
    const head = document.createElement('tr')
    cells(this.lines[0]).forEach((c) => { const th = document.createElement('th'); th.textContent = c; head.appendChild(th) })
    table.appendChild(head)
    this.lines.slice(2).forEach((l) => { const tr = document.createElement('tr'); cells(l).forEach((c) => { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td) }); table.appendChild(tr) })
    wrap.appendChild(table); wrap.title = 'Click to edit the table'
    return wrap
  }
}

const LV_INLINE = [
  [/\*\*(?=\S)([^*\n]+?)\*\*/g, 'cm-strong', 2, 2],
  [/(?<![*\w])\*(?=\S)([^*\n]+?)\*(?![*\w])/g, 'cm-em', 1, 1],
  [/(?<!\w)_(?=\S)([^_\n]+?)_(?!\w)/g, 'cm-em', 1, 1],
  [/~~([^~\n]+)~~/g, 'cm-strike', 2, 2],
  [/(?<!!)\[([^\]\n]+)\]\(([^)\s]+)\)/g, 'cm-link', 1, null],
]
function buildLive(state) {
  const doc = state.doc
  const focused = state.field(focusField, false)
  const sel = state.selection.main
  const a = doc.lineAt(sel.from).number, b = doc.lineAt(sel.to).number
  const theme = liveCtx.current?.theme || 'light'
  const out = []
  const hide = (from, to) => { if (to > from) out.push(Decoration.replace({}).range(from, to)) }
  const lineCls = (line, cls) => out.push(Decoration.line({ class: cls }).range(line.from))
  let i = 1
  while (i <= doc.lines) {
    const line = doc.line(i), t = line.text
    const f = /^\s*(```|~~~)\s*([\w-]*)/.exec(t)
    if (f) {
      let j = i + 1
      const close = new RegExp(`^\\s*${f[1]}\\s*$`)
      while (j <= doc.lines && !close.test(doc.line(j).text)) j++
      const closed = j <= doc.lines
      const end = Math.min(j, doc.lines)
      const endLine = doc.line(end)
      const inside = focused && b >= i && a <= end
      const lang = f[2]
      if (!inside && closed && (lang === 'mermaid' || lang === 'draw')) {
        const body = []
        for (let k = i + 1; k < end; k++) body.push(doc.line(k).text)
        const w = lang === 'mermaid' ? new MermaidW(body.join('\n'), theme) : new PadW(body.join('').trim(), theme)
        out.push(Decoration.replace({ widget: w, block: true }).range(line.from, endLine.to))
      } else {
        for (let k = i; k <= end; k++) lineCls(doc.line(k), k === i || (k === end && closed) ? 'cm-fence cm-fence-edge' : 'cm-fence')
        if (!inside && closed) {
          if (line.to > line.from) out.push(Decoration.replace({ widget: new LabelW(lang || 'code') }).range(line.from, line.to))
          hide(endLine.from, endLine.to)
        }
      }
      i = end + 1
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(t) && i < doc.lines && /^\s*\|?\s*:?-{3,}/.test(doc.line(i + 1).text)) {
      let j = i
      while (j <= doc.lines && /^\s*\|/.test(doc.line(j).text)) j++
      const end = j - 1
      const inside = focused && b >= i && a <= end
      if (!inside) {
        const lines = []
        for (let k = i; k <= end; k++) lines.push(doc.line(k).text)
        out.push(Decoration.replace({ widget: new TableW(lines), block: true }).range(line.from, doc.line(end).to))
      } else for (let k = i; k <= end; k++) lineCls(doc.line(k), 'cm-table-src')
      i = end + 1
      continue
    }
    const active = focused && i >= a && i <= b
    const h = /^(#{1,6})\s+/.exec(t)
    if (h) {
      lineCls(line, `cm-h cm-h${Math.min(3, h[1].length)}`)
      if (!active) hide(line.from, line.from + h[0].length)
    }
    const cv = /\s*<!--cv:([a-z0-9]+)-->/.exec(t)
    if (cv) out.push(Decoration.replace({ widget: new CvWidget(cv[1]) }).range(line.from + cv.index, line.from + cv.index + cv[0].length))
    if (!active && /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(t)) { out.push(Decoration.replace({ widget: new HrW() }).range(line.from, line.to)); i++; continue }
    const q = /^(\s*>\s?)/.exec(t)
    if (q) { lineCls(line, 'cm-quote-lv'); if (!active) hide(line.from, line.from + q[1].length) }
    const task = /^(\s*)([-*+])\s+\[( |x|X)\]\s/.exec(t)
    const bullet = !task && /^(\s*)([-*+])\s/.exec(t)
    if (task) {
      if (!active) out.push(Decoration.replace({ widget: new CheckW(task[3] !== ' ') }).range(line.from + task[1].length, line.from + task[0].length - 1))
      if (task[3] !== ' ' && line.to > line.from + task[0].length) out.push(Decoration.mark({ class: 'cm-lv-done' }).range(line.from + task[0].length, line.to))
    } else if (bullet) {
      if (!active) out.push(Decoration.replace({ widget: new BulletW() }).range(line.from + bullet[1].length, line.from + bullet[1].length + 1))
      else out.push(Decoration.mark({ class: 'cm-mk' }).range(line.from + bullet[1].length, line.from + bullet[1].length + 1))
    }
    if (t.length <= 2000) {
      const covered = []
      const free = (s, e) => !covered.some(([x, y]) => s < y && e > x)
      for (const m of t.matchAll(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g)) {
        const s = line.from + m.index, e = s + m[0].length
        covered.push([s, e])
        if (active) out.push(Decoration.mark({ class: 'cm-link' }).range(s, e))
        else out.push(Decoration.replace({ widget: new ImageW(m[2], m[1]) }).range(s, e))
      }
      for (const m of t.matchAll(/`([^`\n]+)`/g)) {
        const s = line.from + m.index, e = s + m[0].length
        if (!free(s, e)) continue
        covered.push([s, e])
        out.push(Decoration.mark({ class: 'cm-icode' }).range(s, e))
        if (!active) { hide(s, s + 1); hide(e - 1, e) }
      }
      for (const [re, cls, pre, post] of LV_INLINE) {
        for (const m of t.matchAll(re)) {
          const s = line.from + m.index, e = s + m[0].length
          if (!free(s, e)) continue
          out.push(Decoration.mark({ class: cls }).range(s, e))
          if (!active) {
            const suffix = post == null ? m[0].length - 1 - m[1].length : post
            hide(s, s + pre); hide(e - suffix, e)
          }
        }
      }
    }
    i++
  }
  return Decoration.set(out, true)
}
const liveField = StateField.define({
  create: (s) => buildLive(s),
  update(v, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(refreshLive) || e.is(setFocus))) return buildLive(tr.state)
    return v
  },
  provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
})

/* Clicks above or below the text give you a line to type on, paste and drop handle images */
const edgeAndPaste = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (e.button !== 0) return false
    const doc = view.state.doc
    const bottom = view.documentTop + view.lineBlockAt(doc.length).bottom
    if (e.clientY > bottom + 2) {
      e.preventDefault()
      const last = doc.line(doc.lines)
      if (last.text.trim() !== '') view.dispatch({ changes: { from: doc.length, insert: '\n' }, selection: { anchor: doc.length + 1 }, scrollIntoView: true })
      else view.dispatch({ selection: { anchor: doc.length } })
      view.focus()
      return true
    }
    if (e.clientY < view.documentTop + view.lineBlockAt(0).top - 2) {
      e.preventDefault()
      if (/^\s*(```|~~~|\||!\[|---)/.test(doc.line(1).text)) view.dispatch({ changes: { from: 0, insert: '\n' }, selection: { anchor: 0 } })
      else view.dispatch({ selection: { anchor: 0 } })
      view.focus()
      return true
    }
    return false
  },
  paste(e, view) {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return false
    e.preventDefault()
    liveCtx.current?.insertImages(files, view)
    return true
  },
  drop(e, view) {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return false
    e.preventDefault()
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos != null) view.dispatch({ selection: { anchor: pos } })
    liveCtx.current?.insertImages(files, view)
    return true
  },
})

/* ================================================================== */
/* Editor                                                              */
/* ================================================================== */
export default function Editor({ note, categories, theme, toggleTheme, actions, toast, openExport, settings, openSettings }) {
  const live = settings?.editorMode !== 'classic'
  const [draft, setDraft] = useState(() => pick(note))
  const draftRef = useRef(draft)
  const [save, setSave] = useState('saved')
  const dirty = useRef(new Set())
  const timer = useRef(null)
  const saving = useRef(false)
  const retry = useRef(null)
  const [docMode, setDocMode] = useState(() => lsGet('slate-docmode', 'write'))
  const editorShown = live || docMode === 'write'
  const [outlineOpen, setOutlineOpen] = useState(() => window.innerWidth >= 1024 && lsGet('slate-outline', true))
  const [active, setActive] = useState(null)
  const [canvasViewKey, setCanvasViewKey] = useState(() => (note.canvases?.doc ? 'doc' : 'main'))
  const [bothPin, setBothPin] = useState(null)
  const [docTab, setDocTab] = useState(() => (note.pdf?.path ? 'pdf' : 'notes'))
  const [focus, setFocus] = useState(null)
  const pdfRef = useRef(null)
  const fileRef = useRef(null)
  const [exportOpen, setExportOpen] = useState(!!openExport)
  const [bothTab, setBothTab] = useState('doc')
  const [split, setSplit] = useState(() => lsGet('slate-split', 0.5))
  const lastShown = useRef('main')
  const viewRef = useRef(null)
  const splitRef = useRef(null)
  const isMobile = useMedia('(max-width: 767px)')
  const isWide = useMedia('(min-width: 1024px)')

  useEffect(() => { lsSet('slate-docmode', docMode) }, [docMode])
  useEffect(() => { if (window.innerWidth >= 1024) lsSet('slate-outline', outlineOpen) }, [outlineOpen])
  useEffect(() => { lsSet('slate-split', split) }, [split])
  useEffect(() => { document.title = `${draft.title || 'Untitled'} · Slate` }, [draft.title])
  useEffect(() => () => { document.title = 'Slate · Private notes and diagrams' }, [])
  useEffect(() => { if (openExport) window.history.replaceState(null, '', `#/n/${note.id}`) }, [openExport, note.id])

  /* ----- autosave ----- */
  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (!dirty.current.size) return
    if (saving.current) { timer.current = setTimeout(() => flushRef.current(), 400); return }
    const keys = [...dirty.current]
    dirty.current.clear()
    const patch = Object.fromEntries(keys.map((k) => [k, draftRef.current[k]]))
    patch.updated_at = new Date().toISOString()
    saving.current = true
    setSave('saving')
    try {
      await db.updateNote(note.id, patch)
      actions.patchLocal(note.id, patch)
      setSave(dirty.current.size ? 'saving' : 'saved')
    } catch (e) {
      if (/pdf/.test(e?.message || '') && /column/i.test(e?.message || '')) {
        toast('The PDF could not be saved. Run the v1.2 block of supabase.sql, then attach it again.', 'error')
        keys.filter((k) => k !== 'pdf').forEach((k) => dirty.current.add(k))
        if (dirty.current.size) { timer.current = setTimeout(() => flushRef.current(), 400) }
        saving.current = false
        setSave(dirty.current.size ? 'saving' : 'saved')
        return
      }
      keys.forEach((k) => dirty.current.add(k))
      setSave('error')
      clearTimeout(retry.current)
      retry.current = setTimeout(() => flushRef.current(), 5000)
    }
    saving.current = false
  }, [note.id, actions, toast])
  const flushRef = useRef(flush)
  flushRef.current = flush

  const titleTouched = useRef(note.title !== 'Untitled' || !!note.content.trim())
  const update = useCallback((patchOrFn) => {
    let patch = typeof patchOrFn === 'function' ? patchOrFn(draftRef.current) : patchOrFn
    if (!patch) return
    if ('title' in patch && patch.title !== draftRef.current.title) titleTouched.current = true
    if ('content' in patch && !titleTouched.current) {
      const m = /^#\s+(.+?)\s*(<!--cv:[a-z0-9]+-->)?\s*$/m.exec(patch.content.split('\n').find((l) => l.trim()) || '')
      if (m) patch = { ...patch, title: m[1].slice(0, 120) }
    }
    draftRef.current = { ...draftRef.current, ...patch }
    Object.keys(patch).forEach((k) => dirty.current.add(k))
    setDraft(draftRef.current)
    setSave('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), 800)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushRef.current() }
    }
    const onUnload = (e) => { if (dirty.current.size) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); clearTimeout(retry.current); flushRef.current() }
  }, [])

  /* ----- document structure ----- */
  const doc = useMemo(() => parseDoc(draft.content), [draft.content])
  const docRef = useRef(doc)
  docRef.current = doc
  const activeHeading = useMemo(() => {
    if (!active) return null
    if (active.cv) { const h = doc.headings.find((x) => x.cv === active.cv); if (h) return h }
    return doc.headings.find((x) => x.line === active.line) || null
  }, [active, doc])
  const view = ['document', 'both', 'canvas'].includes(draft.view_mode) ? draft.view_mode : 'document'
  const setView = (v) => update({ view_mode: v })
  const linkedHeadings = doc.headings.filter((h) => h.cv)
  const hasPdf = !!draft.pdf?.path
  const pdfTab = hasPdf && docTab === 'pdf'

  /* ----- document canvas: one area (frame) per linked heading ----- */
  const docData = draft.canvases?.doc
  const frameSet = useMemo(() => new Set((docData?.elements || []).filter((e) => e.type === 'frame' && !e.isDeleted && e.customData?.cv).map((e) => e.customData.cv)), [docData])
  const hasArea = useCallback((cv) => !!cv && (frameSet.has(cv) || !!draft.canvases?.[cv]), [frameSet, draft.canvases])
  const legacy = useMemo(() => Object.fromEntries(Object.entries(draft.canvases || {})
    .filter(([k, c]) => k !== 'main' && k !== 'doc' && c?.elements?.some((e) => !e.isDeleted))
    .map(([k, c]) => [k, { data: c, name: doc.headings.find((h) => h.cv === k)?.text || 'Heading' }])), [draft.canvases, doc])
  const frameNames = useMemo(() => Object.fromEntries(linkedHeadings.map((h) => [h.cv, h.text])), [doc]) // eslint-disable-line react-hooks/exhaustive-deps
  const onMigrated = useCallback((cvs) => {
    if (!cvs.length) return
    update((d) => { const c = { ...d.canvases }; cvs.forEach((k) => { if (k !== 'main' && k !== 'doc') delete c[k] }); return { canvases: c } })
  }, [update])

  const pinValid = bothPin === 'main' || bothPin === 'doc'
  const bothKey = pinValid ? bothPin : pdfTab ? 'main' : 'doc'
  const following = !pinValid && !pdfTab
  useEffect(() => {
    if (following && view === 'both' && activeHeading?.cv && frameSet.has(activeHeading.cv)) setFocus({ cv: activeHeading.cv, n: Date.now() })
  }, [activeHeading?.cv, following, view]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownKey = view === 'canvas' ? canvasViewKey : view === 'both' ? bothKey : lastShown.current
  useEffect(() => { if (shownKey) lastShown.current = shownKey }, [shownKey])

  /* ----- canvas linking ----- */
  const newCanvasId = () => { let id; do { id = shortId(4) } while (draftRef.current.canvases?.[id] || frameSet.has(id)); return id }
  const linkCanvas = useCallback((h) => {
    let cv = h.cv
    if (!cv) {
      cv = newCanvasId()
      const v = viewRef.current
      if (v && editorShown && v.dom.isConnected && h.line <= v.state.doc.lines) {
        const ln = v.state.doc.line(h.line)
        const trail = /\s*$/.exec(ln.text)[0].length
        v.dispatch({ changes: { from: ln.to - trail, to: ln.to, insert: ` <!--cv:${cv}-->` } })
      } else {
        const lines = draftRef.current.content.split('\n')
        lines[h.line - 1] = `${lines[h.line - 1].replace(/\s+$/, '')} <!--cv:${cv}-->`
        update({ content: lines.join('\n') })
      }
    }
    if (!hasArea(cv)) toast(`Canvas area added for “${h.text}”`)
    setActive({ line: h.line, cv })
    setFocus({ cv, name: h.text, create: true, n: Date.now() })
    return cv
  }, [editorShown, update, toast, hasArea]) // eslint-disable-line react-hooks/exhaustive-deps

  const openHeadingCanvas = (h) => {
    linkCanvas(h)
    if (view === 'document') setView('both')
    if (view === 'canvas') setCanvasViewKey('doc')
    if (bothPin === 'main') setBothPin(null)
    if (pdfTab) setDocTab('notes')
    setBothTab('canvas')
  }

  /* ----- PDF ----- */
  const attachPdf = async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast('That file is not a PDF. Choose a .pdf file.', 'error'); return }
    toast(`Uploading “${file.name}”`)
    try {
      const path = await uploadFile(file, note.id, 'pdf')
      update({ pdf: { path, name: file.name, size: file.size } })
      setDocTab('pdf')
      if (view === 'document') setView('both')
      toast('PDF attached. It opens next to the canvas.')
    } catch (e) { toast(e?.message || 'Upload failed. Try again.', 'error') }
  }

  const focusHeading = (h) => {
    setActive({ line: h.line, cv: h.cv })
    const v = viewRef.current
    if (editorShown && v && v.dom.isConnected && h.line <= v.state.doc.lines) {
      const ln = v.state.doc.line(h.line)
      v.dispatch({ selection: { anchor: ln.from }, effects: EditorView.scrollIntoView(ln.from, { y: 'start', yMargin: 24 }) })
      v.focus()
    } else {
      document.getElementById(`h-${h.line}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    }
    if (isMobile && view === 'both') setBothTab('doc')
  }

  const focusPad = (p) => {
    const v = viewRef.current
    if (editorShown && v && v.dom.isConnected && p.line <= v.state.doc.lines) {
      const ln = v.state.doc.line(p.line)
      v.dispatch({ selection: { anchor: ln.from }, effects: EditorView.scrollIntoView(ln.from, { y: 'center' }) })
      v.focus()
    } else document.getElementById(`pad-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const onCanvasChange = useCallback((key, data) => update((d) => ({ canvases: { ...d.canvases, [key]: data } })), [update])
  const onPad = useCallback((id, data) => update((d) => ({ pads: { ...d.pads, [id]: data } })), [update])
  const toggleTask = useCallback((line) => {
    const lines = draftRef.current.content.split('\n')
    if (!lines[line - 1]) return
    lines[line - 1] = lines[line - 1].replace(/\[( |x|X)\]/, (m, c) => (c === ' ' ? '[x]' : '[ ]'))
    update({ content: lines.join('\n') })
  }, [update])

  /* ----- write mode commands ----- */
  const cursorTimer = useRef(null)
  const onCmUpdate = useCallback((vu) => {
    if (!vu.selectionSet && !vu.docChanged) return
    clearTimeout(cursorTimer.current)
    cursorTimer.current = setTimeout(() => {
      const st = vu.view.state
      const ln = st.doc.lineAt(st.selection.main.head).number
      const hs = parseDoc(st.doc.toString()).headings
      let found = null
      for (const h of hs) { if (h.line <= ln) found = h; else break }
      setActive((a) => (found ? (a && a.line === found.line && a.cv === found.cv ? a : { line: found.line, cv: found.cv }) : a))
    }, 300)
  }, [])

  const cmd = useMemo(() => {
    const v = () => viewRef.current
    const BLOCK_RE = /^(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+|>\s?)/
    return {
      wrap(before, after = before, ph = 'text') {
        const view = v(); if (!view) return
        const { from, to } = view.state.selection.main
        const sel = view.state.sliceDoc(from, to)
        if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
          const inner = sel.slice(before.length, sel.length - after.length)
          view.dispatch({ changes: { from, to, insert: inner }, selection: { anchor: from, head: from + inner.length } })
        } else {
          const text = sel || ph
          view.dispatch({ changes: { from, to, insert: before + text + after }, selection: { anchor: from + before.length, head: from + before.length + text.length } })
        }
        view.focus()
      },
      prefix(p) {
        const view = v(); if (!view) return
        const { state } = view
        const { from, to } = state.selection.main
        const a = state.doc.lineAt(from).number, b = state.doc.lineAt(to).number
        const numbered = p === '1. '
        let all = true
        for (let i = a; i <= b; i++) { const t = state.doc.line(i).text; if (numbered ? !/^\d+\.\s/.test(t) : !t.startsWith(p)) all = false }
        const changes = []
        for (let i = a, n = 1; i <= b; i++, n++) {
          const ln = state.doc.line(i)
          const m = BLOCK_RE.exec(ln.text)
          const cur = m ? m[0].length : 0
          changes.push({ from: ln.from, to: ln.from + cur, insert: all ? '' : numbered ? `${n}. ` : p })
        }
        view.dispatch({ changes })
        view.focus()
      },
      block(text, selectInside) {
        const view = v(); if (!view) return
        const { state } = view
        const ln = state.doc.lineAt(state.selection.main.head)
        const empty = ln.text.trim() === ''
        const lead = empty ? '' : '\n\n'
        const insert = `${lead}${text}\n`
        const from = empty ? ln.from : ln.to
        const sel = selectInside ? from + lead.length + selectInside[0] : from + insert.length
        view.dispatch({ changes: { from, to: empty ? ln.to : ln.to, insert }, selection: selectInside ? { anchor: sel, head: sel + selectInside[1] } : { anchor: sel }, scrollIntoView: true })
        view.focus()
      },
      headingAtCursor() {
        const view = v(); if (!view) return null
        const ln = view.state.doc.lineAt(view.state.selection.main.head).number
        let found = null
        for (const h of parseDoc(view.state.doc.toString()).headings) { if (h.line <= ln) found = h; else break }
        return found
      },
    }
  }, [])

  const insertPad = () => {
    let id
    do { id = `pad_${shortId(4)}` } while (draftRef.current.pads?.[id])
    cmd.block('```draw\n' + id + '\n```')
    update((d) => ({ pads: { ...d.pads, [id]: { h: 240, strokes: [] } } }))
    toast('Drawing pad added. Switch to Read to draw on it.')
  }
  const replaceToken = (token, text) => {
    const re = new RegExp(`!\\[[^\\]\\n]*\\]\\(${token}\\)`)
    const v = viewRef.current
    if (v && v.dom.isConnected) {
      const m = re.exec(v.state.doc.toString())
      if (m) { v.dispatch({ changes: { from: m.index, to: m.index + m[0].length, insert: text } }); return }
    }
    const c = draftRef.current.content
    if (re.test(c)) update({ content: c.replace(re, text) })
  }
  const insertImages = async (files, view = viewRef.current) => {
    for (const file of files) {
      const token = `uploading-${shortId(6)}`
      const alt = (file.name || 'image').replace(/\.[^.]+$/, '').replace(/[[\]()]/g, '').slice(0, 60) || 'image'
      if (view && view.dom.isConnected) {
        const { from, to } = view.state.selection.main
        const ln = view.state.doc.lineAt(from)
        const lead = ln.text.trim() && from === ln.to ? '\n' : ''
        const ph = `${lead}![${alt}](${token})`
        view.dispatch({ changes: { from, to, insert: ph }, selection: { anchor: from + ph.length } })
      } else update((d) => ({ content: `${d.content}\n\n![${alt}](${token})\n` }))
      try {
        const path = await uploadImage(file, note.id)
        replaceToken(token, `![${alt}](${IMG_SCHEME}${path})`)
        toast('Image added to the note')
      } catch (e) {
        replaceToken(token, '')
        toast(e?.message || 'Upload failed. Try a smaller image.', 'error')
      }
    }
  }
  liveCtx.current = {
    theme, insertImages, read: null,
    onCanvasMarker: (id) => { const h = docRef.current.headings.find((x) => x.cv === id); if (h) openHeadingCanvas(h) },
  }

  const linkCanvasAtCursor = () => {
    const h = cmd.headingAtCursor()
    if (!h) { toast('Put the cursor in or under a heading first, then link a canvas.', 'error'); return }
    if (h.cv) { setActive({ line: h.line, cv: h.cv }); toast(`“${h.text}” already has a canvas`); if (view === 'document') setView('both'); return }
    linkCanvas(h)
    if (view === 'document') setView('both')
  }

  const tools = [
    [TextHOneIcon, 'Heading 1', () => cmd.prefix('# ')],
    [TextHTwoIcon, 'Heading 2', () => cmd.prefix('## ')],
    [TextHThreeIcon, 'Heading 3', () => cmd.prefix('### ')],
    null,
    [TextBIcon, 'Bold (Ctrl B)', () => cmd.wrap('**', '**', 'bold text')],
    [TextItalicIcon, 'Italic (Ctrl I)', () => cmd.wrap('_', '_', 'italic text')],
    [TextStrikethroughIcon, 'Strikethrough', () => cmd.wrap('~~', '~~', 'struck text')],
    null,
    [ListBulletsIcon, 'Bullet list', () => cmd.prefix('- ')],
    [ListNumbersIcon, 'Numbered list', () => cmd.prefix('1. ')],
    [ListChecksIcon, 'Checklist', () => cmd.prefix('- [ ] ')],
    [QuotesIcon, 'Quote', () => cmd.prefix('> ')],
    [CodeBlockIcon, 'Code block', () => cmd.block('```js\ncode\n```', [6, 4])],
    [TableIcon, 'Table', () => cmd.block('| Column | Column |\n| --- | --- |\n| Cell | Cell |')],
    [LinkIcon, 'Link', () => cmd.wrap('[', '](https://)', 'link text')],
    [ImageIcon, 'Insert image (or paste one)', () => fileRef.current?.click()],
    [MinusIcon, 'Divider', () => cmd.block('---')],
    null,
    [ScribbleIcon, 'Insert drawing pad', insertPad],
    [TreeStructureIcon, 'Insert mermaid block', () => cmd.block('```mermaid\nflowchart LR\n  A[Idea] --> B[Draft]\n  B --> C[Review]\n```')],
    [FrameCornersIcon, 'Link canvas to this heading', linkCanvasAtCursor],
  ]

  const onEditorKeys = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === 'b') { e.preventDefault(); e.stopPropagation(); cmd.wrap('**', '**', 'bold text') }
    if (k === 'i') { e.preventDefault(); e.stopPropagation(); cmd.wrap('_', '_', 'italic text') }
  }

  const cmExtensions = useMemo(() => (live
    ? [markdown({ base: markdownLanguage }), EditorView.lineWrapping, focusField, focusTracker, liveField, edgeAndPaste]
    : [markdown({ base: markdownLanguage }), EditorView.lineWrapping, mdDecorations, edgeAndPaste]), [live])
  useEffect(() => { viewRef.current?.dispatch?.({ effects: refreshLive.of(null) }) }, [theme])
  const cmTheme = useMemo(() => EditorView.theme({}, { dark: theme === 'dark' }), [theme])

  /* ----- read context ----- */
  const readCtx = useMemo(() => ({
    headingsByLine: Object.fromEntries(doc.headings.map((h) => [h.line, h])),
    hasArea, pads: draft.pads || {}, theme, onPad, toggleTask,
    activeLine: activeHeading?.line, onHeading: (h) => setActive({ line: h.line, cv: h.cv }), onCanvas: openHeadingCanvas,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [doc, hasArea, draft.pads, theme, onPad, toggleTask, activeHeading, view, pdfTab])

  liveCtx.current.read = readCtx

  /* ----- split drag ----- */
  const startDrag = (e) => {
    e.preventDefault()
    const box = splitRef.current.getBoundingClientRect()
    const move = (ev) => setSplit(Math.min(0.75, Math.max(0.25, (ev.clientX - box.left) / box.width)))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.userSelect = '' }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const cat = categories.find((c) => c.id === draft.category_id)

  /* ----- panes ----- */
  const outline = (
    <Outline doc={doc} hasArea={hasArea} active={activeHeading} onHeading={focusHeading} onCanvas={openHeadingCanvas}
      onPad={focusPad} onClose={() => setOutlineOpen(false)} />
  )

  const docPane = (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      {outlineOpen && isWide && !pdfTab && <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar" aria-label="Outline">{outline}</aside>}
      {outlineOpen && !isWide && !pdfTab && (
        <>
          <div className="fade-in absolute inset-0 z-20 bg-black/30" onClick={() => setOutlineOpen(false)} aria-hidden="true" />
          <aside className="rise-in absolute inset-y-0 left-0 z-30 flex w-72 max-w-[85%] flex-col border-r border-line bg-sidebar" aria-label="Outline">{outline}</aside>
        </>
      )}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Document">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          {!pdfTab && <button type="button" className={`${btn.icon} ${outlineOpen ? 'text-accent' : ''}`} onClick={() => setOutlineOpen((o) => !o)} aria-pressed={outlineOpen} aria-label="Toggle outline" title="Outline"><SidebarSimpleIcon size={18} /></button>}
          {hasPdf && <Segmented label="Show" value={docTab} onChange={setDocTab} options={[['pdf', 'PDF', FilePdfIcon], ['notes', 'Notes', NotePencilIcon]]} />}
          {hasPdf && (
            <Menu label="PDF options" items={[
              { label: 'Replace PDF', icon: ArrowsClockwiseIcon, onClick: () => pdfRef.current?.click() },
              { label: 'Download original', icon: DownloadSimpleIcon, onClick: async () => { try { downloadBlob(await imageBlob(draft.pdf.path), draft.pdf.name || 'document.pdf') } catch { toast('Download failed. Try again.', 'error') } } },
              { sep: true },
              { label: 'Remove PDF from note', icon: TrashIcon, danger: true, onClick: () => { update({ pdf: null }); setDocTab('notes'); toast('PDF removed. Clean unused files in Settings to free the space.') } },
            ]} />
          )}
          {!hasPdf && <button type="button" className={btn.ghost} onClick={() => pdfRef.current?.click()} title="Attach a PDF to read next to the canvas"><FilePdfIcon size={16} />Attach PDF</button>}
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; attachPdf(f) }} />
          {!pdfTab && !live && <Segmented label="Document mode" value={docMode} onChange={setDocMode} options={[['write', 'Write', PencilLineIcon], ['read', 'Read', BookOpenIcon]]} />}
          {live && !pdfTab && !hasPdf && <span className="hidden items-center gap-1 rounded-md px-1 caption-4 text-subtle sm:inline-flex" title="Change the editor mode in Settings"><PencilLineIcon size={14} />Live preview</span>}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) insertImages(f) }} />
          <TagEditor tags={draft.tags || []} onChange={(tags) => update({ tags })} />
        </div>
        {editorShown && !pdfTab && (
          <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto border-b border-line px-2 py-1" role="toolbar" aria-label="Formatting">
            {tools.map((t, i) => t ? (
              <button key={i} type="button" className={btn.icon} title={t[1]} aria-label={t[1]} onMouseDown={(e) => e.preventDefault()} onClick={t[2]}>
                {(() => { const I = t[0]; return <I size={18} /> })()}
              </button>
            ) : <span key={i} className="mx-1 h-4 w-px shrink-0 bg-line" aria-hidden="true" />)}
          </div>
        )}
        <div className="relative min-h-0 flex-1" onKeyDownCapture={editorShown && !pdfTab ? onEditorKeys : undefined}>
          {pdfTab ? <PdfViewer pdf={draft.pdf} theme={theme} /> : editorShown ? (
            <CodeMirror
              key={live ? 'live' : 'write'}
              value={draft.content}
              onChange={(v) => update({ content: v })}
              onCreateEditor={(v) => { viewRef.current = v }}
              onUpdate={onCmUpdate}
              extensions={cmExtensions}
              theme={cmTheme}
              height="100%"
              className="h-full"
              placeholder="Start writing. Type # and a space for a heading."
              aria-label="Markdown editor"
              basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false, closeBrackets: false, syntaxHighlighting: false, highlightSelectionMatches: false, bracketMatching: false }}
            />
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
                {draft.content.trim() ? (
                  <ReadCtx.Provider value={readCtx}>
                    <article className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={READ_COMPONENTS} urlTransform={slateUrl}>{stripMarkers(draft.content)}</ReactMarkdown>
                    </article>
                  </ReadCtx.Provider>
                ) : (
                  <Empty icon={BookOpenIcon} title="Nothing to read yet" body="Write some markdown first. Headings, lists, tables, mermaid blocks and drawing pads all render here."
                    action={['Start writing', () => setDocMode('write')]} />
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )

  const canvasProps = (key) => ({
    data: draft.canvases?.[key], theme, onChange: (d) => onCanvasChange(key, d), onNotice: toast, noteId: note.id,
    ...(key === 'doc' ? { focus, frameNames, legacy, onMigrated } : {}),
  })
  const missingArea = following && activeHeading && !frameSet.has(activeHeading.cv) && !legacy[activeHeading.cv]
  const bothHeader = (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
      <FrameCornersIcon size={16} className="shrink-0 text-muted" />
      <label className="flex min-w-0 items-center gap-2 caption-2 text-muted">
        <span className="sr-only">Canvas shown here</span>
        <select value={pinValid ? bothPin : '__follow'} onChange={(e) => setBothPin(e.target.value === '__follow' ? null : e.target.value)}
          className="press h-8 min-w-0 max-w-60 rounded-lg border border-line bg-card px-2 caption-1 text-fg hover:bg-hover">
          <option value="__follow">{pdfTab ? 'Free canvas' : 'Document canvas, follow headings'}</option>
          {!pdfTab && <option value="main">Free canvas</option>}
          <option value="doc">Document canvas</option>
          {pdfTab && <option value="main">Free canvas (pinned)</option>}
        </select>
      </label>
      {following && activeHeading && <p className="min-w-0 truncate caption-2 text-muted">at <span className="title-4 text-fg">{activeHeading.text}</span></p>}
    </div>
  )
  const bothCanvas = (
    <div className="flex h-full min-h-0 flex-col">
      {bothHeader}
      <div className="relative min-h-0 flex-1">
        <Suspense fallback={<CanvasSkeleton />}>
          <div key={bothKey} className="fade-in absolute inset-0">
            <CanvasBoard {...canvasProps(bothKey)} />
          </div>
        </Suspense>
        {missingArea && (
          <div className="pop-in absolute left-1/2 top-16 z-10 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-card px-3 py-2 shadow-[var(--shadow)]">
            <p className="min-w-0 truncate body-6 text-muted">“{activeHeading.text}” has no area here yet</p>
            <button type="button" className={`${btn.primary} shrink-0 py-1`} onClick={() => linkCanvas(activeHeading)}><PlusIcon size={14} /><span className="button-sm">Add area</span></button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-3">
        <a href="#/notes" className={btn.icon} aria-label="Back to notes" title="Back to notes" onClick={() => flushRef.current()}><ArrowLeftIcon size={18} /></a>
        <nav aria-label="Breadcrumb" className="hidden items-center gap-1 lg:flex">
          <a href="#/notes" className="press rounded-md px-1 caption-1 text-muted hover:text-fg">Notes</a>
          <span className="caption-2 text-subtle">/</span>
          <label className="relative flex items-center">
            <span className="sr-only">Category</span>
            {cat && <span className="pointer-events-none absolute left-2 size-2 rounded-full" style={{ background: CATEGORY_COLORS[cat.color] }} />}
            <select value={draft.category_id || ''} onChange={(e) => {
              const id = e.target.value || null
              update({ category_id: id })
              const c = categories.find((x) => x.id === id)
              toast(c ? `Note moved to ${c.name}` : 'Note removed from its category')
            }} className={`press max-w-40 rounded-md bg-transparent py-1 pr-1 caption-1 text-muted hover:bg-hover hover:text-fg ${cat ? 'pl-6' : 'pl-1'}`}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <span className="caption-2 text-subtle">/</span>
        </nav>
        <input value={draft.title} onChange={(e) => update({ title: e.target.value })} onBlur={() => { if (!draftRef.current.title.trim()) update({ title: 'Untitled' }) }}
          aria-label="Note title" className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 title-3 text-fg hover:bg-hover focus:bg-hover focus:outline-none" />
        <SaveStatus state={save} onRetry={() => flushRef.current()} compact={isMobile} />
        <Segmented label="View" value={view} onChange={setView} iconOnly={isMobile}
          options={[['document', 'Document', ArticleIcon], ['both', 'Both', ColumnsIcon], ['canvas', 'Canvas', ChalkboardSimpleIcon]]} />
        <button type="button" className={`${isMobile ? btn.icon : btn.secondary} ${isMobile ? '' : 'py-1'}`} onClick={() => setExportOpen(true)} aria-label="Export" title="Export">
          <ExportIcon size={18} />{!isMobile && <span className="button-sm">Export</span>}
        </button>
        {!isMobile && <ThemeToggle theme={theme} onToggle={toggleTheme} />}
        <button type="button" className={btn.icon} onClick={openSettings} aria-label="Settings" title="Settings  Ctrl ,"><GearIcon size={18} /></button>
      </header>

      <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 outline-none">
        {view === 'document' && docPane}

        {view === 'both' && (isMobile ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 justify-center border-b border-line p-2">
              <Segmented label="Pane" value={bothTab} onChange={setBothTab} alwaysLabel options={[['doc', 'Document', ArticleIcon], ['canvas', 'Canvas', ChalkboardSimpleIcon]]} />
            </div>
            <div className="flex min-h-0 flex-1">{bothTab === 'doc' ? docPane : <div className="min-w-0 flex-1">{bothCanvas}</div>}</div>
          </div>
        ) : (
          <div ref={splitRef} className="flex min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0" style={{ width: `${split * 100}%` }}>{docPane}</div>
            <div role="separator" aria-orientation="vertical" aria-label="Resize panes" tabIndex={0} aria-valuenow={Math.round(split * 100)} aria-valuemin={25} aria-valuemax={75}
              onPointerDown={startDrag}
              onKeyDown={(e) => { if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0.25, s - 0.05)); if (e.key === 'ArrowRight') setSplit((s) => Math.min(0.75, s + 0.05)) }}
              className="group relative w-2 shrink-0 cursor-col-resize">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors duration-300 group-hover:bg-accent group-focus-visible:bg-accent" />
            </div>
            <div className="min-w-0 flex-1">{bothCanvas}</div>
          </div>
        ))}

        {view === 'canvas' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <label className="flex min-w-0 items-center gap-2 caption-1 text-muted">
                <FrameCornersIcon size={16} />Canvas
                <select value={canvasViewKey} onChange={(e) => setCanvasViewKey(e.target.value)} className="press h-8 min-w-0 max-w-64 rounded-lg border border-line bg-card px-2 caption-1 text-fg hover:bg-hover">
                  <option value="main">Free canvas</option>
                  <option value="doc">Document canvas</option>
                </select>
              </label>
              {canvasViewKey === 'doc' && linkedHeadings.some((h) => hasArea(h.cv)) && (
                <label className="flex min-w-0 items-center gap-2 caption-1 text-muted">Go to
                  <select value="" onChange={(e) => { if (e.target.value) setFocus({ cv: e.target.value, n: Date.now() }) }} className="press h-8 min-w-0 max-w-64 rounded-lg border border-line bg-card px-2 caption-1 text-fg hover:bg-hover">
                    <option value="">Choose a heading</option>
                    {linkedHeadings.filter((h) => hasArea(h.cv)).map((h) => <option key={h.cv} value={h.cv}>{'  '.repeat(h.level - 1)}{h.text}</option>)}
                  </select>
                </label>
              )}
              <span className="caption-5 text-subtle">{canvasViewKey === 'doc' ? 'Each linked heading has its own area on this canvas' : 'A free space for anything'}</span>
            </div>
            <div className="relative min-h-0 flex-1">
              <Suspense fallback={<CanvasSkeleton />}>
                <div key={canvasViewKey} className="fade-in absolute inset-0">
                  <CanvasBoard {...canvasProps(canvasViewKey)} />
                </div>
              </Suspense>
            </div>
          </div>
        )}
      </main>

      {exportOpen && <ExportDialog draft={draft} doc={doc} shownKey={shownKey || 'main'} theme={theme} onClose={() => setExportOpen(false)} toast={toast} />}
    </div>
  )
}

/* ================================================================== */
/* Small pieces                                                        */
/* ================================================================== */
function Segmented({ label, value, onChange, options, iconOnly, alwaysLabel }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-lg border border-line bg-card p-0.5">
      {options.map(([k, text, I]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} title={text} aria-label={iconOnly ? text : undefined}
          className={`press inline-flex h-8 items-center gap-1 rounded-md px-2 button-sm ${value === k ? 'bg-hover text-fg' : 'text-muted hover:text-fg'}`}>
          {I && <I size={16} className={value === k ? 'text-accent' : ''} />}{!iconOnly && <span className={alwaysLabel ? '' : 'hidden sm:inline'}>{text}</span>}
        </button>
      ))}
    </div>
  )
}

function SaveStatus({ state, onRetry, compact }) {
  if (state === 'error') {
    return (
      <button type="button" onClick={onRetry} className="press inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 caption-1 text-danger hover:bg-hover" title="Not saved. Click to retry.">
        <WarningIcon size={14} />{!compact && 'Error, retry'}
      </button>
    )
  }
  return (
    <span role="status" aria-live="polite" className="inline-flex shrink-0 items-center gap-1 px-1 caption-2 text-muted">
      {state === 'saving' ? <span className="skeleton size-2 rounded-full bg-accent" /> : <CheckIcon size={14} className="text-success" />}
      <span className={compact ? 'sr-only' : ''}>{state === 'saving' ? 'Saving' : 'Saved'}</span>
    </span>
  )
}

function TagEditor({ tags, onChange }) {
  const [val, setVal] = useState('')
  const add = () => {
    const t = val.trim().replace(/^#/, '').toLowerCase()
    if (t && !tags.includes(t) && tags.length < 12) onChange([...tags, t])
    setVal('')
  }
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-0.5 rounded-md bg-hover py-0.5 pl-2 pr-0.5 caption-4 text-muted">
          #{t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="press inline-flex size-4 items-center justify-center rounded text-subtle hover:text-fg"><XIcon size={10} /></button>
        </span>
      ))}
      <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } if (e.key === 'Backspace' && !val && tags.length) onChange(tags.slice(0, -1)) }}
        onBlur={add} placeholder="Add tag" aria-label="Add tag" className="w-20 rounded-md bg-transparent px-1 py-0.5 caption-4 text-fg hover:bg-hover focus:bg-hover focus:outline-none" />
    </div>
  )
}

function Empty({ icon: I, title, body, action, secondary }) {
  return (
    <div className="rise-in mx-auto flex max-w-sm flex-col items-center rounded-2xl border border-line bg-card px-6 py-10 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-hover text-accent"><I size={24} /></div>
      <h3 className="title-2 text-fg">{title}</h3>
      <p className="mt-2 body-6 text-muted">{body}</p>
      {action && <button type="button" className={`${btn.primary} mt-6`} onClick={action[1]}><PlusIcon size={16} />{action[0]}</button>}
      {secondary && <button type="button" className={`${btn.ghost} mt-2`} onClick={secondary[1]}>{secondary[0]}</button>}
    </div>
  )
}

function CanvasSkeleton() {
  return (
    <div className="absolute inset-0 p-4" aria-busy="true" aria-label="Loading canvas">
      <div className="mx-auto skeleton h-10 w-80 max-w-full rounded-xl" />
      <div className="absolute left-4 top-4 skeleton size-10 rounded-lg" />
      <div className="mx-auto mt-24 skeleton h-24 w-48 rounded-2xl" />
    </div>
  )
}

const LEVEL_PAD = ['pl-2', 'pl-4', 'pl-6', 'pl-8', 'pl-10', 'pl-12']
function Outline({ doc, hasArea, active, onHeading, onCanvas, onPad, onClose }) {
  const items = [...doc.headings.map((h) => ({ k: 'h', line: h.line, h })), ...doc.pads.map((p) => ({ k: 'p', line: p.line, p }))].sort((a, b) => a.line - b.line)
  return (
    <>
      <div className="flex items-center justify-between px-3 py-3">
        <h2 className="caption-3 uppercase tracking-wider text-subtle">Outline</h2>
        <button type="button" onClick={onClose} className={`${btn.icon} size-6`} aria-label="Close outline"><XIcon size={14} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {items.length === 0 ? (
          <div className="mx-1 rounded-xl border border-line p-3">
            <p className="title-4 text-fg">No headings yet</p>
            <p className="mt-1 caption-2 text-muted">Start a line with # to add a heading. Each heading can get its own canvas.</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {items.map((it) => it.k === 'h' ? (
              <li key={`h${it.line}`} className="group flex items-center gap-1">
                <button type="button" onClick={() => onHeading(it.h)} aria-current={active?.line === it.line ? 'true' : undefined}
                  className={`press min-w-0 flex-1 truncate rounded-lg py-1 pr-2 text-left ${LEVEL_PAD[it.h.level - 1]} ${it.h.level === 1 ? 'title-4' : 'body-6'} ${active?.line === it.line ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg'}`}>
                  {it.h.text}
                </button>
                <CanvasIconButton h={it.h} exists={hasArea(it.h.cv)} onClick={() => onCanvas(it.h)} />
              </li>
            ) : (
              <li key={`p${it.line}`} className={LEVEL_PAD[1]}>
                <button type="button" onClick={() => onPad(it.p)} className="press inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 caption-4 text-muted hover:bg-hover hover:text-fg">
                  <ScribbleIcon size={12} />Drawing pad <span className="font-mono caption-5 text-subtle">{it.p.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function CanvasIconButton({ h, exists, onClick, className = '' }) {
  const label = exists ? `Open canvas for ${h.text}` : `Create canvas for ${h.text}`
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`press relative inline-flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-hover ${exists ? 'text-accent' : 'text-subtle opacity-60 hover:opacity-100 group-hover:opacity-100'} ${className}`}>
      <FrameCornersIcon size={14} weight={exists ? 'fill' : 'regular'} />
      {exists && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-accent" />}
    </button>
  )
}

/* ================================================================== */
/* Read mode renderers                                                 */
/* ================================================================== */
const ReadCtx = createContext(null)

function makeHeading(level) {
  const Tag = `h${level}`
  return function Heading({ node, children }) {
    const ctx = useContext(ReadCtx)
    const line = node?.position?.start?.line
    const h = ctx.headingsByLine[line]
    const exists = !!h?.cv && ctx.hasArea(h.cv)
    const isActive = ctx.activeLine === line
    return (
      <Tag id={`h-${line}`} className="group relative flex scroll-mt-6 items-center gap-2">
        {isActive && <span aria-hidden="true" className="absolute -left-4 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent" />}
        <span className="min-w-0 cursor-pointer" onClick={() => h && ctx.onHeading(h)}>{children}</span>
        {h && <CanvasIconButton h={h} exists={exists} onClick={() => ctx.onCanvas(h)} />}
      </Tag>
    )
  }
}

function MermaidBlock({ code }) {
  const { theme } = useContext(ReadCtx)
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    renderMermaid(code, theme).then((s) => { if (alive) { setSvg(s); setErr('') } })
      .catch((e) => { if (alive) setErr((e?.message || 'Unknown error').split('\n').slice(0, 2).join(' ')) })
    return () => { alive = false }
  }, [code, theme])
  return (
    <figure className="mermaid-preview flex justify-center overflow-x-auto rounded-xl border border-line bg-surface p-4">
      {err ? <p className="flex items-start gap-2 body-6 text-danger"><WarningIcon size={16} className="mt-0.5 shrink-0" />This diagram has an error. {err}</p>
        : svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="skeleton h-40 w-full rounded-lg" />}
    </figure>
  )
}

const slateUrl = (url) => (url.startsWith(IMG_SCHEME) || url.startsWith('uploading-') ? url : defaultUrlTransform(url))
function SlateImage({ src, alt }) {
  const path = pathFromSrc(src)
  const [url, setUrl] = useState(path ? null : src)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!path) return
    let alive = true
    imageObjectUrl(path).then((u) => { if (alive) setUrl(u) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [path])
  if (src?.startsWith('uploading-')) return <span className="skeleton inline-block h-24 w-48 rounded-lg" aria-label="Uploading image" />
  if (failed) return <span className="caption-2 text-danger">Image could not be loaded. It may have been removed.</span>
  return url ? <img src={url} alt={alt || 'Image from the note'} loading="lazy" /> : <span className="skeleton inline-block h-32 w-64 rounded-lg" aria-label="Loading image" />
}

const READ_COMPONENTS = {
  h1: makeHeading(1), h2: makeHeading(2), h3: makeHeading(3), h4: makeHeading(4), h5: makeHeading(5), h6: makeHeading(6),
  pre({ node, children }) {
    const cls = node?.children?.[0]?.properties?.className || []
    if (cls.includes('language-mermaid') || cls.includes('language-draw')) return <>{children}</>
    return <pre>{children}</pre>
  },
  code({ className, children }) {
    const lang = /language-([\w-]+)/.exec(className || '')?.[1]
    const text = String(children).replace(/\n$/, '')
    if (lang === 'mermaid') return <MermaidBlock code={text} />
    if (lang === 'draw') return <DrawingPad id={text.trim()} />
    if (lang || text.includes('\n')) return <code className={className}>{tokenize(text).map((t, i) => (t.t ? <span key={i} className={`tok-${t.t}`}>{t.v}</span> : t.v))}</code>
    return <code>{children}</code>
  },
  li({ node, className, children }) {
    const ctx = useContext(ReadCtx)
    if (!className?.includes('task-list-item')) return <li className={className}>{children}</li>
    const line = node?.position?.start?.line
    return (
      <li className={className}>
        {Children.toArray(children).map((c, i) => (isValidElement(c) && c.props?.type === 'checkbox'
          ? <input key={i} type="checkbox" checked={!!c.props.checked} onChange={() => ctx.toggleTask(line)} aria-label="Toggle task" />
          : c))}
      </li>
    )
  },
  a({ href, children }) {
    const external = /^https?:/.test(href || '')
    return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{children}</a>
  },
  img({ src, alt }) { return <SlateImage src={src} alt={alt} /> },
}

/* ================================================================== */
/* PDF reader                                                          */
/* ================================================================== */
let pdfjsPromise = null
const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })
    pdfjsPromise.catch(() => { pdfjsPromise = null })
  }
  return pdfjsPromise
}

function PdfViewer({ pdf, theme }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [ratios, setRatios] = useState([])
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [dim, setDim] = useState(() => lsGet('slate-pdf-dim', true))
  const [current, setCurrent] = useState(1)
  const [width, setWidth] = useState(0)
  const scrollRef = useRef(null)

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(scrollRef.current)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    let alive = true, task = null
    setPdfDoc(null); setError('')
    ;(async () => {
      try {
        const lib = await loadPdfjs()
        const blob = await imageBlob(pdf.path)
        task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        const d = await task.promise
        const first = (await d.getPage(1)).getViewport({ scale: 1 })
        if (!alive) return
        setRatios(Array.from({ length: d.numPages }, () => first.height / first.width))
        setPdfDoc(d)
      } catch (e) {
        if (alive) setError(/password/i.test(e?.message || '') ? 'This PDF is password protected and cannot be shown.' : 'The PDF could not be opened. It may have been removed from storage.')
      }
    })()
    return () => { alive = false; task?.destroy?.() }
  }, [pdf.path])

  const pageW = Math.max(240, Math.round(Math.min(Math.max(0, width - 32), 1000) * zoom))
  const invert = dim && theme === 'dark'
  const tb = 'press inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg disabled:opacity-40'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-1" role="toolbar" aria-label="PDF reader">
        <FilePdfIcon size={16} className="ml-1 shrink-0 text-muted" />
        <span className="min-w-0 max-w-48 truncate caption-1 text-fg" title={pdf.name}>{pdf.name || 'PDF'}</span>
        <span className="font-mono caption-5 text-subtle">{pdfDoc ? `${current} / ${pdfDoc.numPages}` : ''}</span>
        <span className="ml-auto" />
        <button type="button" className={tb} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} aria-label="Zoom out" title="Zoom out"><MinusIcon size={16} /></button>
        <button type="button" className="press rounded-lg px-2 py-1 font-mono caption-4 text-fg hover:bg-hover" onClick={() => setZoom(1)} title="Fit width">{Math.round(zoom * 100)}%</button>
        <button type="button" className={tb} onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))} aria-label="Zoom in" title="Zoom in"><PlusIcon size={16} /></button>
        <button type="button" className={tb} onClick={() => setZoom(1)} aria-label="Fit width" title="Fit width"><ArrowsOutLineHorizontalIcon size={16} /></button>
        {theme === 'dark' && (
          <button type="button" className={`${tb} ${dim ? 'text-accent' : ''}`} aria-pressed={dim} onClick={() => { setDim(!dim); lsSet('slate-pdf-dim', !dim) }} aria-label="Dark pages" title="Dark pages for night reading"><MoonStarsIcon size={16} /></button>
        )}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-surface py-4">
        {error ? (
          <div className="mx-auto mt-8 flex max-w-sm items-start gap-2 rounded-xl border border-line bg-card p-4 body-6 text-danger" role="alert"><WarningIcon size={16} className="mt-0.5 shrink-0" />{error}</div>
        ) : !pdfDoc ? (
          <div className="mx-auto space-y-4" style={{ width: pageW }} aria-busy="true" aria-label="Loading PDF">
            {[0, 1].map((i) => <div key={i} className="skeleton rounded-lg" style={{ height: pageW * 1.3 }} />)}
          </div>
        ) : ratios.map((r, i) => (
          <PdfPage key={i} pdfDoc={pdfDoc} n={i + 1} width={pageW} ratio={r} invert={invert} rootRef={scrollRef} onVisible={setCurrent} />
        ))}
      </div>
    </div>
  )
}

function PdfPage({ pdfDoc, n, width, ratio, invert, rootRef, onVisible }) {
  const boxRef = useRef(null)
  const canvasRef = useRef(null)
  const [near, setNear] = useState(n <= 2)
  const [h, setH] = useState(ratio)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const root = rootRef.current
    const nearIo = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root, rootMargin: '1200px 0px' })
    const seenIo = new IntersectionObserver(([e]) => { if (e.isIntersecting) onVisible(n) }, { root, threshold: 0.5 })
    nearIo.observe(boxRef.current); seenIo.observe(boxRef.current)
    return () => { nearIo.disconnect(); seenIo.disconnect() }
  }, [n, rootRef, onVisible])
  useEffect(() => {
    const c = canvasRef.current
    if (!near || !width) { if (c && !near) { c.width = 0; c.height = 0 } return }
    let task = null, cancelled = false
    const t = setTimeout(async () => {
      try {
        const page = await pdfDoc.getPage(n)
        const base = page.getViewport({ scale: 1 })
        if (cancelled) return
        setH(base.height / base.width)
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const vp = page.getViewport({ scale: (width / base.width) * dpr })
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
        task = page.render({ canvasContext: c.getContext('2d'), viewport: vp })
        await task.promise
      } catch (e) { if (!cancelled && e?.name !== 'RenderingCancelledException') setFailed(true) }
    }, 60)
    return () => { cancelled = true; clearTimeout(t); task?.cancel?.() }
  }, [near, width, pdfDoc, n])
  return (
    <div ref={boxRef} className="relative mx-auto mb-4 overflow-hidden rounded-md border border-line bg-white" style={{ width, height: Math.round(width * h) }}>
      <canvas ref={canvasRef} className="block h-full w-full" style={{ filter: invert ? 'invert(0.88) hue-rotate(180deg)' : 'none' }} role="img" aria-label={`Page ${n}`} />
      {failed && <p className="absolute inset-0 flex items-center justify-center caption-2 text-danger">Page {n} could not be drawn.</p>}
    </div>
  )
}

/* ================================================================== */
/* Drawing pad                                                         */
/* ================================================================== */
function DrawingPad({ id }) {
  const { pads, onPad, theme } = useContext(ReadCtx)
  const init = pads?.[id]
  const [strokes, setStrokes] = useState(() => init?.strokes || [])
  const [h, setH] = useState(() => init?.h || 240)
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('ink')
  const [size, setSize] = useState(1)
  const [w, setW] = useState(0)
  const [, force] = useState(0)
  const past = useRef([]), future = useRef([])
  const cur = useRef(null)
  const wrapRef = useRef(null), canvasRef = useRef(null)
  const raf = useRef(0)

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const redraw = useCallback(() => {
    const c = canvasRef.current
    if (!c || !w) return
    const dpr = window.devicePixelRatio || 1
    const cssH = (h * w) / PAD_REF_WIDTH
    const pw = Math.round(w * dpr), ph = Math.round(cssH * dpr)
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph }
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, cssH)
    drawPad(ctx, cur.current ? [...strokes, cur.current] : strokes, w, theme)
  }, [strokes, w, h, theme])
  const redrawRef = useRef(redraw)
  redrawRef.current = redraw
  useEffect(() => { redraw() }, [redraw])

  const scale = w / PAD_REF_WIDTH || 1
  const toRef = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return [Math.round(((e.clientX - r.left) / scale) * 10) / 10, Math.round(((e.clientY - r.top) / scale) * 10) / 10]
  }
  const commit = (next, nextH = h) => {
    past.current.push({ strokes, h }); if (past.current.length > 100) past.current.shift()
    future.current = []
    setStrokes(next); setH(nextH)
    onPad(id, { h: nextH, strokes: next })
  }
  const onDown = (e) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    cur.current = { tool, color, size: PAD_SIZES[size], points: [toRef(e)] }
    redraw()
  }
  const onMove = (e) => {
    if (!cur.current) return
    const p = toRef(e), pts = cur.current.points, l = pts[pts.length - 1]
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 1) return
    pts.push(p)
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => redrawRef.current())
  }
  const onUp = () => {
    if (!cur.current) return
    const s = cur.current
    cur.current = null
    commit([...strokes, s])
  }
  const undo = () => {
    const prev = past.current.pop(); if (!prev) return
    future.current.push({ strokes, h })
    setStrokes(prev.strokes); setH(prev.h); onPad(id, prev); force((n) => n + 1)
  }
  const redo = () => {
    const nx = future.current.pop(); if (!nx) return
    past.current.push({ strokes, h })
    setStrokes(nx.strokes); setH(nx.h); onPad(id, nx); force((n) => n + 1)
  }
  const startResize = (e) => {
    e.preventDefault()
    const startY = e.clientY, startH = h
    let latest = startH
    const move = (ev) => { latest = Math.round(Math.min(1400, Math.max(120, startH + (ev.clientY - startY) / scale))); setH(latest) }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      if (latest !== startH) { past.current.push({ strokes, h: startH }); future.current = []; onPad(id, { h: latest, strokes }) }
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const tb = 'press inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg disabled:opacity-40'
  return (
    <div id={`pad-${id}`} className="not-prose overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1" role="toolbar" aria-label="Drawing pad tools">
        <button type="button" className={`${tb} ${tool === 'pen' ? 'bg-hover text-accent' : ''}`} aria-pressed={tool === 'pen'} aria-label="Pen" title="Pen" onClick={() => setTool('pen')}><PencilSimpleIcon size={16} /></button>
        <button type="button" className={`${tb} ${tool === 'eraser' ? 'bg-hover text-accent' : ''}`} aria-pressed={tool === 'eraser'} aria-label="Eraser" title="Eraser" onClick={() => setTool('eraser')}><EraserIcon size={16} /></button>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {Object.keys(PAD_COLORS).map((c) => (
          <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} title={c} onClick={() => { setColor(c); setTool('pen') }}
            className={`press inline-flex size-6 items-center justify-center rounded-full border-2 ${color === c && tool === 'pen' ? 'border-accent' : 'border-transparent'}`}>
            <span className="size-4 rounded-full" style={{ background: PAD_COLORS[c][theme === 'dark' ? 'dark' : 'light'] }} />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {PAD_SIZES.map((s, i) => (
          <button key={s} type="button" className={`${tb} ${size === i ? 'bg-hover text-fg' : ''}`} aria-pressed={size === i} aria-label={`Stroke width ${['thin', 'medium', 'thick'][i]}`} title={['Thin', 'Medium', 'Thick'][i]} onClick={() => setSize(i)}>
            <span className="rounded-full bg-current" style={{ width: s + 2, height: s + 2 }} />
          </button>
        ))}
        <span className="ml-auto" />
        <button type="button" className={tb} aria-label="Undo" title="Undo" onClick={undo} disabled={!past.current.length}><ArrowArcLeftIcon size={16} /></button>
        <button type="button" className={tb} aria-label="Redo" title="Redo" onClick={redo} disabled={!future.current.length}><ArrowArcRightIcon size={16} /></button>
        <button type="button" className={tb} aria-label="Clear pad" title="Clear" onClick={() => strokes.length && commit([])} disabled={!strokes.length}><BroomIcon size={16} /></button>
      </div>
      <div ref={wrapRef} className="relative">
        <canvas ref={canvasRef} className="block w-full touch-none" style={{ height: (h * (w || PAD_REF_WIDTH)) / PAD_REF_WIDTH, cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Drawing area" role="img" />
        {!strokes.length && <p className="pointer-events-none absolute inset-0 flex items-center justify-center caption-2 text-subtle">Draw here with a mouse, pen or finger</p>}
      </div>
      <div onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="Resize drawing pad" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const nh = Math.min(1400, Math.max(120, h + (e.key === 'ArrowDown' ? 40 : -40))); setH(nh); onPad(id, { h: nh, strokes }) } }}
        className="group flex h-3 cursor-row-resize items-center justify-center border-t border-line">
        <span className="h-0.5 w-8 rounded-full bg-line transition-colors duration-300 group-hover:bg-accent" />
      </div>
    </div>
  )
}

/* ================================================================== */
/* Export                                                              */
/* ================================================================== */
const PrintCtx = createContext(null)
function makePrintHeading(level) {
  const Tag = `h${level}`
  return function PH({ node, children }) {
    const ctx = useContext(PrintCtx)
    const fig = ctx.figures[node?.position?.start?.line]
    return (
      <>
        <Tag>{children}</Tag>
        {fig && <figure><img src={fig.src} alt={`Canvas for ${fig.caption}`} /><figcaption>Canvas: {fig.caption}</figcaption></figure>}
      </>
    )
  }
}
const PRINT_COMPONENTS = {
  img({ src, alt }) {
    const ctx = useContext(PrintCtx)
    const path = pathFromSrc(src)
    const url = path ? ctx.images[path] : src
    return url ? <img src={url} alt={alt || 'Image'} style={{ maxWidth: '100%', borderRadius: 6 }} /> : null
  },
  h1: makePrintHeading(1), h2: makePrintHeading(2), h3: makePrintHeading(3), h4: makePrintHeading(4), h5: makePrintHeading(5), h6: makePrintHeading(6),
  pre({ node, children }) {
    const cls = node?.children?.[0]?.properties?.className || []
    if (cls.includes('language-mermaid') || cls.includes('language-draw')) return <>{children}</>
    return <pre>{children}</pre>
  },
  code({ node, className, children }) {
    const ctx = useContext(PrintCtx)
    const lang = /language-([\w-]+)/.exec(className || '')?.[1]
    const text = String(children).replace(/\n$/, '')
    if (lang === 'mermaid') {
      const src = ctx.mermaids[node?.position?.start?.line]
      return src ? <figure><img src={src} alt="Mermaid diagram" /></figure> : <pre><code>{text}</code></pre>
    }
    if (lang === 'draw') {
      const src = ctx.pads[text.trim()]
      return src ? <figure><img src={src} alt="Drawing" /></figure> : null
    }
    return <code className={className}>{children}</code>
  },
}

function PrintDoc({ title, content, ctx, toc, headings, topFigure }) {
  return (
    <PrintCtx.Provider value={ctx}>
      <div className="print-doc">
        {!(headings[0]?.level === 1 && headings[0].text === title.trim() && content) && <h1 style={{ marginTop: 0 }}>{title}</h1>}
        {toc && headings.length > 0 && (
          <div style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '12px 16px', margin: '8px 0 24px' }}>
            <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Contents</p>
            {headings.map((h) => <p key={h.line} style={{ margin: '2px 0', paddingLeft: (h.level - 1) * 16, color: '#444' }}>{h.text}</p>)}
          </div>
        )}
        {topFigure && <figure><img src={topFigure.src} alt={topFigure.caption} /><figcaption>{topFigure.caption}</figcaption></figure>}
        {content && <ReactMarkdown remarkPlugins={[remarkGfm]} components={PRINT_COMPONENTS} urlTransform={slateUrl}>{content}</ReactMarkdown>}
      </div>
    </PrintCtx.Provider>
  )
}

const FORMATS = [
  ['pdf', 'PDF', FilePdfIcon, 'Print ready file'],
  ['md', 'Markdown', FileMdIcon, 'Plain text, portable'],
  ['png', 'PNG', FileImageIcon, 'Image of the canvas'],
  ['svg', 'SVG', FileSvgIcon, 'Vector canvas'],
]
const SCOPES = [['doc', 'Document only'], ['canvas', 'Canvas only'], ['both', 'Document with linked canvases']]
const VALID = { pdf: ['doc', 'canvas', 'both'], md: ['doc'], png: ['canvas'], svg: ['canvas'] }

function ExportDialog({ draft, doc, shownKey, theme, onClose, toast }) {
  const [format, setFormat] = useState('pdf')
  const [scope, setScope] = useState('both')
  const [toc, setToc] = useState(true)
  const [page, setPage] = useState('a4')
  const [status, setStatus] = useState({ kind: 'idle' })
  const busy = status.kind === 'working'
  const shownLabel = shownKey === 'main' ? 'Free canvas' : shownKey === 'doc' ? 'Document canvas' : (doc.headings.find((h) => h.cv === shownKey)?.text || 'Canvas')

  useEffect(() => { if (!VALID[format].includes(scope)) setScope(VALID[format][0]) }, [format, scope])
  const name = safeFileName(draft.title)

  const run = async () => {
    setStatus({ kind: 'working', step: 'Preparing', pct: 0.1 })
    try {
      const shown = draft.canvases?.[shownKey]
      const canvasMod = format === 'md' ? null : await import('./Canvas.jsx')
      if (format === 'md') {
        if (!draft.content.trim()) throw new Error('Export failed. The document is empty.')
        let body = toExportMarkdown(draft.content).trim()
        const paths = [...new Set([...body.matchAll(IMG_RE)].map((m) => decodeURIComponent(m[1])))]
        if (paths.length) {
          setStatus({ kind: 'working', step: 'Creating image links', pct: 0.5 })
          for (const p of paths) {
            try { body = body.split(`${IMG_SCHEME}${p}`).join(await signedImageUrl(p)) } catch { /* keep the internal link */ }
          }
        }
        const md = doc.headings[0]?.level === 1 && doc.headings[0].text === draft.title.trim() ? `${body}\n` : `# ${draft.title}\n\n${body}\n`
        downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${name}.md`)
      } else if (format === 'png' || format === 'svg') {
        if (!shown || canvasMod.canvasIsEmpty(shown)) throw new Error('Export failed. The canvas is empty.')
        if (format === 'png') downloadBlob(await canvasMod.canvasToPngBlob(shown, theme), `${name} ${shownLabel}.png`)
        else downloadBlob(new Blob([await canvasMod.canvasToSvgText(shown, theme)], { type: 'image/svg+xml' }), `${name} ${shownLabel}.svg`)
      } else {
        if (scope !== 'canvas' && !draft.content.trim()) throw new Error('Export failed. The document is empty.')
        if (scope === 'canvas' && (!shown || canvasMod.canvasIsEmpty(shown))) throw new Error('Export failed. The canvas is empty.')
        const figures = {}, pads = {}, mermaids = {}, images = {}
        let topFigure = null
        setStatus({ kind: 'working', step: 'Preparing canvases', pct: 0.25 })
        if (scope === 'canvas') {
          topFigure = { src: await blobToDataUrl(await canvasMod.canvasToPngBlob(shown, 'light')), caption: shownLabel }
        } else {
          if (scope === 'both') {
            for (const h of doc.headings) {
              if (!h.cv) continue
              const dc = draft.canvases?.doc
              if (dc && canvasMod.frameHasContent(dc, h.cv)) { figures[h.line] = { src: await blobToDataUrl(await canvasMod.frameToPngBlob(dc, h.cv)), caption: h.text }; continue }
              const c = draft.canvases?.[h.cv]
              if (c && !canvasMod.canvasIsEmpty(c)) figures[h.line] = { src: await blobToDataUrl(await canvasMod.canvasToPngBlob(c, 'light')), caption: h.text }
            }
          }
          setStatus({ kind: 'working', step: 'Rendering drawings and diagrams', pct: 0.5 })
          for (const p of doc.pads) if (draft.pads?.[p.id]?.strokes?.length) pads[p.id] = padToDataUrl(draft.pads[p.id])
          for (const m of draft.content.matchAll(IMG_RE)) {
            const path = decodeURIComponent(m[1])
            if (!images[path]) { try { images[path] = await imageDataUrl(path) } catch { /* missing image is skipped */ } }
          }
          for (const m of doc.mermaids) {
            try { mermaids[m.line] = await svgToPngDataUrl(await renderMermaid(m.code, 'light')) } catch { /* falls back to code text */ }
          }
        }
        setStatus({ kind: 'working', step: 'Laying out pages', pct: 0.7 })
        const host = document.createElement('div')
        host.style.cssText = 'position:fixed;left:-10000px;top:0;width:680px;background:#fff;'
        document.body.appendChild(host)
        const root = createRoot(host)
        try {
          flushSync(() => root.render(
            <PrintDoc title={draft.title} content={scope === 'canvas' ? '' : stripMarkers(draft.content)} toc={toc && scope !== 'canvas'}
              headings={doc.headings} topFigure={topFigure} ctx={{ figures, pads, mermaids, images }} />,
          ))
          await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => null)))
          if (document.fonts?.ready) await document.fonts.ready
          setStatus({ kind: 'working', step: 'Saving PDF', pct: 0.9 })
          const mod = await import('html2pdf.js')
          const html2pdf = mod.default || mod
          await html2pdf().set({
            margin: [14, 14, 16, 14], filename: `${name}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
            jsPDF: { unit: 'mm', format: page, orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['figure', 'img', 'pre', 'tr', 'h1', 'h2', 'h3'] },
          }).from(host.firstChild).save()
        } finally { root.unmount(); host.remove() }
      }
      setStatus({ kind: 'idle' })
      toast(`${FORMATS.find((f) => f[0] === format)[1]} export saved to your downloads`)
      onClose()
    } catch (e) {
      const msg = e?.message?.startsWith('Export failed') ? e.message : e?.message === 'empty' ? 'Export failed. The canvas is empty.' : `Export failed. ${e?.message || 'Something went wrong while building the file.'} Try again.`
      setStatus({ kind: 'error', msg })
    }
  }

  return (
    <Modal title="Export" onClose={busy ? () => {} : onClose} width="max-w-lg">
      <fieldset disabled={busy}>
        <legend className="mb-2 title-4 text-fg">Format</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FORMATS.map(([k, label, I, hint]) => (
            <label key={k} className={`press flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 ${format === k ? 'border-accent' : 'border-line hover:border-subtle'}`}>
              <input type="radio" name="fmt" value={k} checked={format === k} onChange={() => setFormat(k)} className="sr-only" />
              <I size={20} className={format === k ? 'text-accent' : 'text-muted'} />
              <span className="title-4 text-fg">{label}</span>
              <span className="caption-5 text-muted">{hint}</span>
            </label>
          ))}
        </div>
        <p className="mb-2 mt-6 title-4 text-fg">Scope</p>
        <div className="space-y-1">
          {SCOPES.map(([k, label]) => {
            const ok = VALID[format].includes(k)
            return (
              <label key={k} className={`press flex items-center gap-3 rounded-lg px-2 py-2 ${ok ? 'cursor-pointer hover:bg-hover' : 'cursor-not-allowed opacity-40'}`}>
                <input type="radio" name="scope" value={k} checked={scope === k} disabled={!ok} onChange={() => setScope(k)} className="size-4 accent-[var(--accent)]" />
                <span className="body-6 text-fg">{label}</span>
                {k === 'canvas' && ok && <span className="ml-auto truncate caption-5 text-subtle">{shownLabel}</span>}
              </label>
            )
          })}
        </div>
        {format === 'md' && draft.content.includes(IMG_SCHEME) && <p className="mt-4 caption-2 text-muted">Images become private links that work for 7 days.</p>}
        {format === 'pdf' && (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 body-6 text-fg">
              <input type="checkbox" checked={toc} onChange={(e) => setToc(e.target.checked)} disabled={scope === 'canvas'} className="size-4 accent-[var(--accent)]" />Table of contents
            </label>
            <label className="flex items-center gap-2 body-6 text-fg">Page size
              <select value={page} onChange={(e) => setPage(e.target.value)} className="press h-8 rounded-lg border border-line bg-input px-2 caption-1 text-fg"><option value="a4">A4</option><option value="letter">Letter</option></select>
            </label>
          </div>
        )}
      </fieldset>
      <div className="mt-6 min-h-12">
        {status.kind === 'working' && (
          <div role="status" aria-live="polite">
            <p className="caption-2 text-muted">{status.step}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover">
              <div className="h-full origin-left rounded-full bg-accent transition-transform duration-500" style={{ transform: `scaleX(${status.pct})` }} />
            </div>
          </div>
        )}
        {status.kind === 'error' && <p role="alert" className="flex items-start gap-2 body-6 text-danger"><WarningIcon size={16} className="mt-0.5 shrink-0" />{status.msg}</p>}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className={btn.ghost} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={btn.primary} onClick={run} disabled={busy}><ExportIcon size={18} />{busy ? 'Exporting' : `Export ${FORMATS.find((f) => f[0] === format)[1]}`}</button>
      </div>
    </Modal>
  )
}

