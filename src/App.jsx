import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import {
  MagnifyingGlassIcon, PlusIcon, PushPinIcon, PushPinSlashIcon, TrashIcon, SunIcon, MoonIcon, SignOutIcon,
  SquaresFourIcon, ListBulletsIcon, DotsThreeIcon, ArrowCounterClockwiseIcon, XIcon, FolderSimpleIcon,
  ArrowUpIcon, ArrowDownIcon, PencilSimpleIcon, CopyIcon, ExportIcon, CheckIcon, NotebookIcon, ArrowLeftIcon,
  WarningIcon, TagIcon, GearIcon, BroomIcon, KeyboardIcon, FilePdfIcon,
} from '@phosphor-icons/react'
import {
  configured, signInWithKey, signOut, getSession, onAuthChange, db, uuid, relTime, daysSince,
  CATEGORY_COLORS, lsGet, lsSet, plainPreview, pickThumbCanvas, thumbShapes,
  APP_VERSION, loadSettings, SHORTCUTS, listAllImages, referencedImagePaths, removeImages, formatBytes, uploadFile,
} from './lib.js'

const Editor = lazy(() => import('./Editor.jsx'))

/* ================================================================== */
/* Shared UI atoms                                                     */
/* ================================================================== */
export const btn = {
  primary: 'press inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 button-md text-accent-fg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary: 'press inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-card px-3 py-2 button-md text-fg hover:bg-hover disabled:opacity-50',
  ghost: 'press inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 button-sm text-muted hover:bg-hover hover:text-fg disabled:opacity-40',
  icon: 'press inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed',
  danger: 'press inline-flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 button-sm text-danger hover:bg-hover',
}
export const inputCls = 'w-full rounded-lg border border-line bg-input px-3 py-2 body-6 text-fg transition duration-300 hover:border-subtle focus:border-accent focus:outline-none'

export function Wordmark({ size = 'md' }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden="true" viewBox="0 0 32 32" className={size === 'sm' ? 'size-6' : 'size-8'}>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 13h14M9 19h9" stroke="var(--accent-fg)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className={size === 'sm' ? 'title-3 text-fg' : 'title-2 text-fg'}>Slate</span>
    </span>
  )
}

export function ThemeToggle({ theme, onToggle, className = '' }) {
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <button type="button" onClick={onToggle} className={`${btn.icon} ${className}`} aria-label={label} title={label}>
      {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  )
}

export function Modal({ title, onClose, children, width = 'max-w-md', labelledBy }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    const first = ref.current?.querySelector('button, [href], input, select, textarea')
    first?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])
  const id = labelledBy || 'modal-title'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="fade-in absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id}
        className={`pop-in relative w-full ${width} max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={id} className="title-2 text-fg">{title}</h2>
          <button type="button" className={btn.icon} onClick={onClose} aria-label="Close"><XIcon size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Popover menu anchored to a trigger. Items: {label, icon, onClick, danger, disabled} or {sep:true} or {render} */
export function Menu({ label, items, align = 'right', trigger, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className={className || 'relative'} style={open ? { zIndex: 50 } : undefined}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className={btn.icon}>
        {trigger || <DotsThreeIcon size={18} weight="bold" />}
      </button>
      {open && (
        <div role="menu" className={`pop-in absolute top-full z-40 mt-1 min-w-48 rounded-xl border border-line bg-card p-1 shadow-[var(--shadow)] ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {items.filter(Boolean).map((it, i) => it.sep ? <div key={i} className="my-1 h-px bg-line" /> : it.render ? <div key={i}>{it.render(() => setOpen(false))}</div> : (
            <button key={i} type="button" role="menuitem" disabled={it.disabled}
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick?.() }}
              className={`press flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left body-6 hover:bg-hover disabled:opacity-40 ${it.danger ? 'text-danger' : 'text-fg'}`}>
              {it.icon && <it.icon size={16} className="shrink-0" />}<span className="truncate">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Toasts({ toasts, dismiss }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className="rise-in pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
          {t.tone === 'error' ? <WarningIcon size={18} className="shrink-0 text-danger" /> : <CheckIcon size={18} className="shrink-0 text-success" />}
          <p className="body-6 text-fg">{t.text}</p>
          {t.action && <button type="button" className="press rounded-md px-2 py-1 button-sm text-accent hover:bg-hover" onClick={() => { t.action.run(); dismiss(t.id) }}>{t.action.label}</button>}
          <button type="button" className={btn.icon} aria-label="Dismiss message" onClick={() => dismiss(t.id)}><XIcon size={14} /></button>
        </div>
      ))}
    </div>
  )
}

/* ================================================================== */
/* Routing, theme, session                                             */
/* ================================================================== */
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}
export const go = (path) => { window.location.hash = path }

function parseRoute(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  const q = Object.fromEntries(new URLSearchParams(query))
  if (parts.length === 0) return { name: 'gate' }
  if (parts[0] === 'notes') {
    if (!parts[1]) return { name: 'dash', view: 'all' }
    if (parts[1] === 'pinned') return { name: 'dash', view: 'pinned' }
    if (parts[1] === 'trash') return { name: 'dash', view: 'trash' }
    if (parts[1] === 'c' && parts[2]) return { name: 'dash', view: 'cat', catId: parts[2] }
  }
  if (parts[0] === 'n' && parts[1]) return { name: 'note', id: parts[1], export: q.export === '1' }
  return { name: '404' }
}

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff'))
  }, [theme])
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = (e) => { if (!lsGet('slate-theme-set', false)) setTheme(e.matches ? 'dark' : 'light') }
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const toggle = useCallback(() => setTheme((t) => {
    const n = t === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('slate-theme', n) } catch { /* ignore */ }
    lsSet('slate-theme-set', true)
    return n
  }), [])
  return [theme, toggle]
}

/* ================================================================== */
/* App                                                                 */
/* ================================================================== */
export default function App() {
  const hash = useHash()
  const route = useMemo(() => parseRoute(hash), [hash])
  const [theme, toggleTheme] = useTheme()
  const [session, setSession] = useState(undefined)
  const [data, setData] = useState({ notes: [], categories: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [toasts, setToasts] = useState([])

  const toast = useCallback((text, tone = 'ok', action) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, text, tone, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 4000)
  }, [])
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  useEffect(() => {
    getSession().then((s) => setSession(s || null))
    return onAuthChange((s) => setSession(s || null))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
    try { setData(await db.loadAll()) } catch (e) {
      setLoadError(e?.message?.includes('relation') || e?.code === '42P01'
        ? 'The notes tables are missing. Run supabase.sql in the Supabase SQL editor, then reload.'
        : 'Notes could not be loaded. Check your connection and reload the page.')
    }
    setLoading(false)
  }, [])
  const userId = session?.user?.id
  useEffect(() => { if (userId) load() }, [userId, load])

  useEffect(() => {
    if (session && route.name === 'gate') window.location.replace('#/notes')
  }, [session, route.name])

  /* ----- data actions (optimistic) ----- */
  const setNotes = (fn) => setData((d) => ({ ...d, notes: fn(d.notes) }))
  const setCats = (fn) => setData((d) => ({ ...d, categories: fn(d.categories) }))

  const actions = useMemo(() => {
    const patchLocal = (id, patch) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)))
    const patchNote = async (id, patch, msg) => {
      let before
      setNotes((ns) => ns.map((n) => { if (n.id === id) { before = n; return { ...n, ...patch, updated_at: new Date().toISOString() } } return n }))
      try {
        await db.updateNote(id, { ...patch, updated_at: new Date().toISOString() })
        if (msg) toast(msg)
      } catch {
        if (before) setNotes((ns) => ns.map((n) => (n.id === id ? before : n)))
        toast('That change was not saved. Check your connection and try again.', 'error')
      }
    }
    return {
      patchLocal,
      patchNote,
      async createNote(categoryId = null) {
        const now = new Date().toISOString()
        const row = { id: uuid(), title: 'Untitled', content: '', category_id: categoryId, created_at: now, updated_at: now, canvases: {}, pads: {}, tags: [], pinned: false, view_mode: 'document', deleted_at: null }
        setNotes((ns) => [row, ...ns])
        go(`/n/${row.id}`)
        try {
          const { id, title, content, category_id, canvases, pads, tags, pinned, view_mode } = row
          await db.insertNote({ id, title, content, category_id, canvases, pads, tags, pinned, view_mode })
        } catch {
          setNotes((ns) => ns.filter((n) => n.id !== row.id))
          toast('The note could not be created. Check your connection and try again.', 'error')
          go('/notes')
        }
      },
      async createPdfNote(file, categoryId = null) {
        if (!file) return
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast('That file is not a PDF. Choose a .pdf file.', 'error'); return }
        const id = uuid()
        toast(`Uploading “${file.name}”`)
        let path
        try { path = await uploadFile(file, id, 'pdf') } catch (e) { toast(e?.message || 'Upload failed. Try again.', 'error'); return }
        const now = new Date().toISOString()
        const row = { id, title: file.name.replace(/\.pdf$/i, '') || 'PDF', content: '', category_id: categoryId, created_at: now, updated_at: now, canvases: {}, pads: {}, tags: [], pinned: false, view_mode: 'both', deleted_at: null, pdf: { path, name: file.name, size: file.size } }
        try {
          const { created_at: _c, updated_at: _u, deleted_at: _d, ...ins } = row
          await db.insertNote(ins)
          setNotes((ns) => [row, ...ns])
          go(`/n/${id}`)
        } catch (e) {
          toast(/pdf/.test(e?.message || '') ? 'The PDF note could not be saved. Run the v1.2 block of supabase.sql first.' : 'The PDF note could not be created. Try again.', 'error')
        }
      },
      async duplicateNote(note) {
        const now = new Date().toISOString()
        const row = { ...note, id: uuid(), title: `${note.title} copy`, pinned: false, created_at: now, updated_at: now, deleted_at: null }
        setNotes((ns) => [row, ...ns])
        try {
          const { owner: _o, created_at: _c, updated_at: _u, ...ins } = row
          await db.insertNote(ins); toast(`Duplicated as “${row.title}”`)
        } catch { setNotes((ns) => ns.filter((n) => n.id !== row.id)); toast('The copy could not be created.', 'error') }
      },
      trashNote: (n) => patchNote(n.id, { deleted_at: new Date().toISOString(), pinned: false }, `“${n.title}” moved to trash`),
      restoreNote: (n) => patchNote(n.id, { deleted_at: null }, `“${n.title}” restored`),
      async destroyNote(n) {
        setNotes((ns) => ns.filter((x) => x.id !== n.id))
        try { await db.deleteNote(n.id); toast(`“${n.title}” deleted permanently`) } catch {
          setNotes((ns) => [n, ...ns]); toast('The note could not be deleted. Try again.', 'error')
        }
      },
      async createCategory(name, color) {
        const row = { id: uuid(), name, color, position: Date.now() % 2147483647, created_at: new Date().toISOString() }
        setCats((cs) => [...cs, row])
        try { await db.insertCategory({ id: row.id, name, color, position: row.position }); toast(`Category “${name}” created`) } catch {
          setCats((cs) => cs.filter((c) => c.id !== row.id)); toast('The category could not be created.', 'error')
        }
        return row.id
      },
      async updateCategory(id, patch, msg) {
        let before
        setCats((cs) => cs.map((c) => { if (c.id === id) { before = c; return { ...c, ...patch } } return c }))
        try { await db.updateCategory(id, patch); if (msg) toast(msg) } catch {
          setCats((cs) => cs.map((c) => (c.id === id ? before : c))); toast('That category change was not saved.', 'error')
        }
      },
      async moveCategory(id, dir, cats) {
        const list = [...cats]
        const i = list.findIndex((c) => c.id === id), j = i + dir
        if (i < 0 || j < 0 || j >= list.length) return
        ;[list[i], list[j]] = [list[j], list[i]]
        const next = list.map((c, k) => ({ ...c, position: k }))
        setCats(() => next)
        try { await Promise.all(next.map((c) => db.updateCategory(c.id, { position: c.position }))) } catch {
          setCats(() => cats); toast('The new order was not saved.', 'error')
        }
      },
      async deleteCategory(cat) {
        const prev = { cats: null, notes: null }
        setData((d) => { prev.cats = d.categories; prev.notes = d.notes; return { categories: d.categories.filter((c) => c.id !== cat.id), notes: d.notes.map((n) => (n.category_id === cat.id ? { ...n, category_id: null } : n)) } })
        try { await db.deleteCategory(cat.id); toast(`Category “${cat.name}” deleted. Its notes are kept.`) } catch {
          setData({ categories: prev.cats, notes: prev.notes }); toast('The category could not be deleted.', 'error')
        }
      },
    }
  }, [toast])

  const [settings, setSettingsState] = useState(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const setSettings = useCallback((patch) => setSettingsState((s) => { const n = { ...s, ...patch }; lsSet('slate-settings', n); return n }), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  useEffect(() => {
    if (!session) return
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); setSettingsOpen(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session])

  const handleSignOut = async () => { await signOut(); setData({ notes: [], categories: [] }); window.location.replace('#/') }

  let screen
  if (session === undefined) screen = <div className="h-full" />
  else if (route.name === '404') screen = <NotFound signedIn={!!session} />
  else if (!session || route.name === 'gate') screen = <GatePage theme={theme} toggleTheme={toggleTheme} />
  else if (route.name === 'note') {
    const note = data.notes.find((n) => n.id === route.id)
    screen = loading ? <EditorSkeleton /> : !note ? <NotFound signedIn note /> : (
      <Suspense fallback={<EditorSkeleton />}>
        <Editor key={note.id} note={note} categories={data.categories} theme={theme} toggleTheme={toggleTheme}
          actions={actions} toast={toast} openExport={route.export} settings={settings} openSettings={openSettings} />
      </Suspense>
    )
  } else {
    screen = <Dashboard route={route} data={data} loading={loading} loadError={loadError} reload={load}
      actions={actions} theme={theme} toggleTheme={toggleTheme} onSignOut={handleSignOut} openSettings={openSettings} />
  }

  return (
    <>
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}
        className="skip-link press rounded-lg bg-accent px-3 py-2 button-sm text-accent-fg">Skip to content</a>
      {screen}
      {settingsOpen && session && <SettingsModal settings={settings} setSettings={setSettings} notes={data.notes} onClose={() => setSettingsOpen(false)} toast={toast} />}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </>
  )
}

function EditorSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading note">
      <div className="flex h-14 items-center gap-3 border-b border-line px-4">
        <div className="skeleton size-8 rounded-lg" /><div className="skeleton h-4 w-48 rounded-md" />
        <div className="ml-auto skeleton h-8 w-56 rounded-lg" />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-4 p-8">
        <div className="skeleton h-8 w-2/3 rounded-lg" />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-4 rounded-md" style={{ width: `${92 - i * 9}%` }} />)}
      </div>
    </div>
  )
}

/* ================================================================== */
/* Gate page (public)                                                  */
/* ================================================================== */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal:not(.is-in)')
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target) } })
    }, { threshold: 0.15 })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
}

function GatePage({ theme, toggleTheme }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [legal, setLegal] = useState(null)
  useReveal()

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const submit = async (e) => {
    e.preventDefault()
    if (cooldown > 0 || busy) return
    if (!configured) { setError('Slate is not connected yet. Add your Supabase values to .env and restart the dev server.'); return }
    if (!key.trim()) { setError('Enter your access key to continue.'); return }
    setBusy(true); setError('')
    try {
      await signInWithKey(key)
      setKey('')
      window.location.replace('#/notes')
    } catch (err) {
      const network = err?.name === 'AuthRetryableFetchError' || /fetch|network/i.test(err?.message || '')
      setError(network ? 'Slate could not reach Supabase. Check your connection and try again.' : 'That key is not valid. Check it and try again.')
      setCooldown(3)
    }
    setBusy(false)
  }

  return (
    <div className="min-h-full bg-bg">
      <nav aria-label="Primary" className="fixed inset-x-0 top-4 z-30 flex justify-center px-4">
        <div className="rounded-full border border-line bg-card/70 px-4 py-2 backdrop-blur-xl">
          <a href="#/" aria-current="page" className="press block rounded-full"><Wordmark size="sm" /></a>
        </div>
      </nav>

      <main id="main" tabIndex={-1} className="outline-none">
        <section className="mx-auto flex max-w-5xl flex-col items-center px-4 pb-16 pt-32 text-center sm:pt-40">
          <h1 className="hero-text heading-3 max-w-[680px] sm:heading-1">
            Notes and diagrams,<br />in one private place
          </h1>
          <p className="mt-6 max-w-[680px] body-3 text-muted sm:title-2">
            Write in markdown, sketch on an infinite canvas,<br className="hidden sm:block" /> and give every heading its own diagram. Only your key opens it.
          </p>

          <form onSubmit={submit} noValidate className="mt-10 w-full max-w-md text-left" aria-describedby="gate-proof">
            <label htmlFor="access-key" className="title-4 text-fg">Access key</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input id="access-key" type="password" autoComplete="current-password" value={key}
                onChange={(e) => { setKey(e.target.value); if (error && cooldown === 0) setError('') }}
                aria-invalid={!!error} aria-describedby={error ? 'gate-error' : undefined}
                placeholder="Paste your key" className={`${inputCls} h-10 sm:flex-1`} />
              <button type="submit" disabled={busy || cooldown > 0} className={`${btn.primary} h-10 shrink-0`}>
                {busy ? 'Opening' : 'Open workspace'}
              </button>
            </div>
            <div className="mt-2 min-h-5">
              {error && <p id="gate-error" role="alert" className="body-6 text-danger">{error}{cooldown > 0 && <span className="text-muted"> You can try again in {cooldown}s.</span>}</p>}
            </div>
            <p id="gate-proof" className="mt-2 flex items-center gap-2 caption-2 text-muted">
              <span aria-hidden="true" className="inline-block size-2 rounded-full bg-success" />For Personal Use
            </p>
          </form>

          <div className="reveal mt-16 w-full"><HeroVisual /></div>
        </section>

        <TaglineReveal lines={['Write the idea down.', 'Then draw what it means.']} />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-8">
          <span className="caption-2 text-muted">Slate, a private notes workspace</span>
          <div className="flex items-center gap-1">
            <button type="button" className={btn.ghost} onClick={() => setLegal('privacy')}>Privacy</button>
            <button type="button" className={btn.ghost} onClick={() => setLegal('terms')}>Terms</button>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>
      </footer>
      {legal && <LegalModal kind={legal} onClose={() => setLegal(null)} />}
    </div>
  )
}

function HeroVisual() {
  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-surface p-2 text-left shadow-[var(--shadow)]" role="img"
      aria-label="Illustration of the Slate editor with a markdown document on the left and a diagram canvas on the right">
      <div className="overflow-hidden rounded-lg border border-line bg-card">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="size-2 rounded-full bg-line" /><span className="size-2 rounded-full bg-line" /><span className="size-2 rounded-full bg-line" />
          <div className="mx-auto flex rounded-md border border-line p-0.5">
            <span className="rounded px-2 caption-5 text-muted">Document</span>
            <span className="rounded bg-hover px-2 caption-4 text-fg">Both</span>
            <span className="rounded px-2 caption-5 text-muted">Canvas</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="space-y-3 p-6">
            <div className="h-4 w-1/2 rounded bg-fg/80" />
            <div className="h-2 w-11/12 rounded bg-subtle/50" /><div className="h-2 w-4/5 rounded bg-subtle/50" />
            <div className="flex items-center gap-2 pt-2"><div className="h-3 w-1/3 rounded bg-fg/60" /><span className="size-2 rounded-full bg-accent" /></div>
            <div className="h-2 w-10/12 rounded bg-subtle/50" /><div className="h-2 w-2/3 rounded bg-subtle/50" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2"><span className={`size-3 rounded border border-subtle ${i === 0 ? 'bg-accent' : ''}`} /><div className="h-2 rounded bg-subtle/50" style={{ width: `${48 - i * 8}%` }} /></div>
            ))}
          </div>
          <div className="relative hidden h-64 border-l border-line bg-surface sm:block" style={{ backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
            <div className="absolute left-8 top-10 flex h-12 w-28 items-center justify-center rounded-lg border-2 border-fg/70 caption-4 text-fg">Draft</div>
            <div className="absolute left-36 top-16 h-0.5 w-16 bg-fg/70" />
            <div className="absolute left-52 top-14 size-0 border-y-4 border-l-8 border-y-transparent border-l-fg/70" />
            <div className="absolute left-56 top-6 flex size-20 items-center justify-center rounded-full border-2 border-accent caption-4 text-accent">Review</div>
            <div className="absolute left-16 top-36 size-14 rotate-45 rounded-md border-2 border-fg/50" />
            <div className="absolute bottom-8 right-8 h-16 w-24 rounded-md bg-amber-200 p-2 caption-5 text-black/70 dark:bg-amber-300">Ship notes</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaglineReveal({ lines }) {
  const ref = useRef(null)
  useEffect(() => {
    const words = [...ref.current.querySelectorAll('.tw')]
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !('IntersectionObserver' in window)) { words.forEach((w) => w.classList.add('on')); return }
    let queue = Promise.resolve()
    const io = new IntersectionObserver((entries) => {
      const hits = entries.filter((e) => e.isIntersecting).map((e) => e.target)
        .sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i))
      hits.forEach((w) => {
        io.unobserve(w)
        queue = queue.then(() => new Promise((r) => { w.classList.add('on'); setTimeout(r, 90) }))
      })
    }, { rootMargin: '0px 0px -15% 0px', threshold: 0.6 })
    words.forEach((w) => io.observe(w))
    return () => io.disconnect()
  }, [])
  let i = 0
  return (
    <section aria-label="What Slate is for" className="px-4 py-24 sm:py-24">
      <p ref={ref} className="mx-auto max-w-[680px] text-center heading-3 sm:heading-2">
        {lines.map((line, li) => (
          <span key={li} className="block">
            {line.split(' ').map((w, wi) => <span key={wi}><span className="tw" data-i={i++}>{w}</span>{' '}</span>)}
          </span>
        ))}
      </p>
    </section>
  )
}

function LegalModal({ kind, onClose }) {
  return (
    <Modal title={kind === 'privacy' ? 'Privacy' : 'Terms'} onClose={onClose}>
      {kind === 'privacy' ? (
        <div className="space-y-3 body-6 text-muted">
          <p>Slate stores your notes, canvases and drawings in your own Supabase project. Row level security limits every row to the single owner account that holds the key.</p>
          <p>Slate has no analytics, no tracking and no advertising. Your theme and layout choices are saved in this browser&apos;s local storage.</p>
          <p>Canvas fonts ship with Slate. Only when a canvas contains Chinese, Japanese or Korean text does it download an extra font from a public CDN. No note content is sent with that request.</p>
        </div>
      ) : (
        <div className="space-y-3 body-6 text-muted">
          <p>Slate is a private tool for one owner. It is provided as is, without warranty of any kind.</p>
          <p>You are responsible for your Supabase project, its backups, and keeping your access key secret. Anyone with the key can read and change your notes.</p>
        </div>
      )}
      <div className="mt-6 flex justify-end"><button type="button" className={btn.secondary} onClick={onClose}>Close</button></div>
    </Modal>
  )
}

function NotFound({ signedIn, note }) {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-full flex-col items-center justify-center gap-6 px-4 text-center outline-none">
      <Wordmark />
      <p className="font-mono heading-2 text-subtle">404</p>
      <div className="max-w-sm space-y-2">
        <h1 className="title-1 text-fg">{note ? 'This note is not here' : 'This page does not exist'}</h1>
        <p className="body-6 text-muted">{note ? 'It may have been deleted permanently, or the link is incomplete.' : 'The link may be broken or the page was moved.'}</p>
      </div>
      <a href={signedIn ? '#/notes' : '#/'} className={btn.primary}><ArrowLeftIcon size={18} />{signedIn ? 'Back to your notes' : 'Back to Slate'}</a>
    </main>
  )
}

/* ================================================================== */
/* Dashboard                                                           */
/* ================================================================== */
function MenuToggleIcon({ open }) {
  return (
    <span aria-hidden="true" className="relative block size-4">
      <span className={`absolute left-0 top-1 h-0.5 w-4 rounded bg-current transition-transform duration-500 ${open ? 'translate-y-1 rotate-45' : ''}`} />
      <span className={`absolute left-0 top-3 h-0.5 w-4 rounded bg-current transition-transform duration-500 ${open ? '-translate-y-1 -rotate-45' : ''}`} />
    </span>
  )
}

function Dashboard({ route, data, loading, loadError, reload, actions, theme, toggleTheme, onSignOut, openSettings }) {
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState(() => lsGet('slate-layout', 'grid'))
  const [sort, setSort] = useState(() => lsGet('slate-sort', 'edited'))
  const [tag, setTag] = useState('')
  const [drawer, setDrawer] = useState(false)
  const searchRef = useRef(null)

  useEffect(() => { lsSet('slate-layout', layout) }, [layout])
  useEffect(() => { lsSet('slate-sort', sort) }, [sort])
  useEffect(() => { setDrawer(false) }, [route.view, route.catId])
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (window.innerWidth < 768) setDrawer(true)
        setTimeout(() => (document.querySelector('[data-search]:not([hidden])') || searchRef.current)?.focus(), 30)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { notes, categories } = data
  const live = notes.filter((n) => !n.deleted_at)
  const trash = notes.filter((n) => n.deleted_at)
  const cat = route.view === 'cat' ? categories.find((c) => c.id === route.catId) : null
  const allTags = useMemo(() => [...new Set(live.flatMap((n) => n.tags || []))].sort(), [live])

  const sorter = (a, b) => sort === 'az' ? a.title.localeCompare(b.title) : sort === 'created'
    ? new Date(b.created_at) - new Date(a.created_at) : new Date(b.updated_at) - new Date(a.updated_at)
  const q = search.trim().toLowerCase()
  const matches = (n) => (!q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)) && (!tag || (n.tags || []).includes(tag))

  let pool = route.view === 'trash' ? trash : route.view === 'pinned' ? live.filter((n) => n.pinned)
    : route.view === 'cat' ? live.filter((n) => n.category_id === route.catId) : live
  pool = pool.filter(matches).sort(sorter)

  let sections
  if (route.view === 'trash' || route.view === 'pinned' || q || tag) sections = [{ title: q || tag ? 'Results' : null, items: pool }]
  else if (route.view === 'cat') {
    sections = [{ title: 'Pinned', items: pool.filter((n) => n.pinned) }, { title: cat?.name || 'Notes', items: pool.filter((n) => !n.pinned) }]
  } else {
    const pinned = pool.filter((n) => n.pinned)
    const recent = [...live].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).filter((n) => !n.pinned).slice(0, 4)
    sections = [{ title: 'Pinned', items: pinned }, { title: 'Recent', items: recent }, { title: 'All notes', items: pool.filter((n) => !n.pinned) }]
  }
  sections = sections.filter((s) => s.items.length || s.title === null)

  const title = route.view === 'trash' ? 'Trash' : route.view === 'pinned' ? 'Pinned' : cat ? cat.name : route.view === 'cat' ? 'Category not found' : 'All notes'
  const sidebarProps = { data, route, search, setSearch, actions, theme, toggleTheme, onSignOut, openSettings, counts: { all: live.length, pinned: live.filter((n) => n.pinned).length, trash: trash.length } }

  return (
    <div className="flex h-full bg-bg">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-sidebar md:flex md:flex-col" aria-label="Workspace">
        <Sidebar {...sidebarProps} searchRef={searchRef} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 flex flex-col bg-sidebar/95 backdrop-blur-xl md:hidden" role="dialog" aria-modal="true" aria-label="Workspace menu">
          <div className="flex items-center justify-between px-4 py-3">
            <Wordmark size="sm" />
            <button type="button" className={btn.icon} onClick={() => setDrawer(false)} aria-label="Close menu"><MenuToggleIcon open /></button>
          </div>
          <Sidebar {...sidebarProps} stagger hideBrand />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-4 py-2 md:hidden">
          <button type="button" className={btn.icon} onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}><MenuToggleIcon open={false} /></button>
          <Wordmark size="sm" />
          <button type="button" className={`${btn.primary} ml-auto py-1`} onClick={() => actions.createNote(cat?.id || null)}><PlusIcon size={16} /><span className="button-sm">New</span></button>
        </header>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto outline-none">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto flex min-w-0 items-center gap-2">
                {cat && <span className="size-3 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[cat.color] || CATEGORY_COLORS.indigo }} />}
                <h1 className="truncate title-1 text-fg">{title}</h1>
                {!loading && <span className="font-mono caption-5 text-subtle">{pool.length}</span>}
              </div>
              {route.view !== 'trash' && (
                <div className="flex flex-wrap items-center gap-2">
                  {allTags.length > 0 && (
                    <label className="relative flex items-center">
                      <span className="sr-only">Filter by tag</span>
                      <TagIcon size={14} className="pointer-events-none absolute left-2 text-muted" />
                      <select value={tag} onChange={(e) => setTag(e.target.value)} className="press h-8 rounded-lg border border-line bg-card pl-6 pr-2 caption-1 text-fg hover:bg-hover">
                        <option value="">All tags</option>
                        {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="flex items-center">
                    <span className="sr-only">Sort notes</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value)} className="press h-8 rounded-lg border border-line bg-card px-2 caption-1 text-fg hover:bg-hover">
                      <option value="edited">Recently edited</option><option value="created">Created</option><option value="az">A to Z</option>
                    </select>
                  </label>
                  <div className="flex rounded-lg border border-line bg-card p-0.5" role="group" aria-label="Layout">
                    {[['grid', SquaresFourIcon, 'Grid view'], ['list', ListBulletsIcon, 'List view']].map(([k, I, l]) => (
                      <button key={k} type="button" aria-pressed={layout === k} aria-label={l} title={l} onClick={() => setLayout(k)}
                        className={`press inline-flex size-8 items-center justify-center rounded-md ${layout === k ? 'bg-hover text-accent' : 'text-muted hover:text-fg'}`}><I size={16} /></button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {route.view === 'trash' && <p className="mt-2 body-6 text-muted">Notes stay in trash until you delete them. Each card shows how long ago it was moved here, so you can clear anything older than 30 days.</p>}

            {loadError ? (
              <div role="alert" className="mt-10 flex flex-col items-start gap-3 rounded-2xl border border-line bg-card p-6">
                <WarningIcon size={24} className="text-danger" />
                <p className="body-5 text-fg">{loadError}</p>
                <button type="button" className={btn.secondary} onClick={reload}>Try again</button>
              </div>
            ) : loading ? <CardSkeletons layout={layout} /> : sections.every((s) => !s.items.length) ? (
              <EmptyState view={route.view} cat={cat} q={q || tag} onCreate={() => actions.createNote(cat?.id || null)} onClear={() => { setSearch(''); setTag('') }} />
            ) : sections.map((s, i) => (
              <section key={i} className="mt-8" aria-label={s.title || title}>
                {s.title && <h2 className="mb-3 caption-3 uppercase tracking-wider text-subtle">{s.title}</h2>}
                <div className={layout === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'flex flex-col gap-2'}>
                  {s.items.map((n) => <NoteCard key={n.id} note={n} layout={layout} categories={categories} actions={actions} theme={theme} />)}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}

function Sidebar({ data, route, search, setSearch, actions, theme, toggleTheme, onSignOut, openSettings, counts, searchRef, stagger, hideBrand }) {
  const { categories, notes } = data
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('indigo')
  const [renaming, setRenaming] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  let idx = 0
  const total = 6 + categories.length
  const step = Math.min(60, 400 / Math.max(1, total - 1))
  const anim = () => (stagger ? { className: 'rise-in', style: { animationDelay: `${Math.round(idx++ * step)}ms` } } : { className: '', style: undefined })
  const countFor = (id) => notes.filter((n) => !n.deleted_at && n.category_id === id).length

  const navItem = ({ id, href, active, icon: I, dot, label, count, children }) => {
    const a = anim()
    return (
      <li key={id || href} className={`group relative ${a.className}`} style={a.style}>
        <a href={href} aria-current={active ? 'page' : undefined}
          className={`press flex items-center gap-3 rounded-lg px-3 py-2 pr-12 title-4 ${active ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg'}`}>
          {I && <I size={18} className={active ? 'text-accent' : ''} weight={active ? 'fill' : 'regular'} />}
          {dot && <span className="mx-1 size-2.5 shrink-0 rounded-full" style={{ background: dot }} />}
          <span className="truncate">{label}</span>
          <span className="ml-auto font-mono caption-5 text-subtle">{count}</span>
        </a>
        {children}
      </li>
    )
  }

  const submitNew = async (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setAdding(false); setNewName('')
    const id = await actions.createCategory(name, newColor)
    go(`/notes/c/${id}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hideBrand && <div className="px-4 pb-2 pt-4"><a href="#/notes" className="press inline-block rounded-lg"><Wordmark size="sm" /></a></div>}
      <div className="space-y-2 px-3 py-2">
        <label className="relative block">
          <span className="sr-only">Search notes</span>
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input ref={searchRef} data-search hidden={false} type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes" className={`${inputCls} pl-8 pr-12`} />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line px-1 font-mono caption-5 text-subtle">⌘K</kbd>
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => actions.createNote(route.view === 'cat' ? route.catId : null)} className={`${btn.primary} flex-1`}>
            <PlusIcon size={18} />New note
          </button>
          <label className={`${btn.secondary} cursor-pointer px-3`} title="Upload a PDF to read with a canvas next to it">
            <FilePdfIcon size={18} /><span className="sr-only">Upload PDF</span>
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; actions.createPdfNote(f, route.view === 'cat' ? route.catId : null) }} />
          </label>
        </div>
      </div>
      <nav aria-label="Notes" className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {navItem({ href: '#/notes', active: route.view === 'all', icon: NotebookIcon, label: 'All notes', count: counts.all })}
          {navItem({ href: '#/notes/pinned', active: route.view === 'pinned', icon: PushPinIcon, label: 'Pinned', count: counts.pinned })}
        </ul>
        <div className="mb-1 mt-6 flex items-center justify-between px-3">
          <h2 className="caption-3 uppercase tracking-wider text-subtle">Categories</h2>
          <button type="button" className={`${btn.icon} size-6`} aria-label="Add category" title="Add category" onClick={() => setAdding((a) => !a)}><PlusIcon size={14} /></button>
        </div>
        {adding && (
          <form onSubmit={submitNew} className="pop-in mb-2 space-y-2 rounded-xl border border-line bg-card p-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name" aria-label="Category name" className={inputCls}
              onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false) }} />
            <ColorSwatches value={newColor} onChange={setNewColor} />
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setAdding(false)}>Cancel</button>
              <button type="submit" className={`${btn.primary} py-1`} disabled={!newName.trim()}><span className="button-sm">Add</span></button>
            </div>
          </form>
        )}
        <ul className="space-y-0.5">
          {categories.length === 0 && !adding && <li className="px-3 py-2 caption-2 text-subtle">Group notes by adding a category.</li>}
          {categories.map((c, i) => renaming === c.id ? (
            <li key={c.id}>
              <form onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.n.value.trim(); if (v && v !== c.name) actions.updateCategory(c.id, { name: v }, `Category renamed to “${v}”`); setRenaming(null) }}>
                <input name="n" autoFocus defaultValue={c.name} aria-label="Category name" className={inputCls} onBlur={(e) => e.target.form.requestSubmit()}
                  onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null) }} />
              </form>
            </li>
          ) : confirmDel === c.id ? (
            <li key={c.id} className="pop-in space-y-2 rounded-xl border border-line bg-card p-3">
              <p className="body-6 text-fg">Delete “{c.name}”? Its notes stay in All notes.</p>
              <div className="flex justify-end gap-2">
                <button type="button" className={btn.ghost} onClick={() => setConfirmDel(null)}>Cancel</button>
                <button type="button" className={btn.danger} onClick={() => { setConfirmDel(null); actions.deleteCategory(c); if (route.catId === c.id) go('/notes') }}>Delete</button>
              </div>
            </li>
          ) : (
            navItem({ id: c.id, href: `#/notes/c/${c.id}`, active: route.catId === c.id, dot: CATEGORY_COLORS[c.color] || CATEGORY_COLORS.indigo, label: c.name, count: countFor(c.id), children: (
              <Menu label={`Options for ${c.name}`} className="absolute right-1 top-1/2 -translate-y-1/2" items={[
                { label: 'Rename', icon: PencilSimpleIcon, onClick: () => setRenaming(c.id) },
                { render: (close) => <div className="px-2 py-2"><p className="mb-2 caption-4 text-muted">Color</p><ColorSwatches value={c.color} onChange={(v) => { close(); actions.updateCategory(c.id, { color: v }) }} /></div> },
                { label: 'Move up', icon: ArrowUpIcon, disabled: i === 0, onClick: () => actions.moveCategory(c.id, -1, categories) },
                { label: 'Move down', icon: ArrowDownIcon, disabled: i === categories.length - 1, onClick: () => actions.moveCategory(c.id, 1, categories) },
                { sep: true },
                { label: 'Delete category', icon: TrashIcon, danger: true, onClick: () => setConfirmDel(c.id) },
              ]} />
            ) })
          ))}
        </ul>
        <ul className="mt-6 space-y-0.5">
          {navItem({ href: '#/notes/trash', active: route.view === 'trash', icon: TrashIcon, label: 'Trash', count: counts.trash })}
        </ul>
      </nav>
      <div className="flex items-center gap-1 border-t border-line px-3 py-3">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <button type="button" onClick={openSettings} className={btn.icon} aria-label="Settings" title="Settings  Ctrl ,"><GearIcon size={18} /></button>
        <span className="font-mono caption-5 text-subtle">v{APP_VERSION}</span>
        <button type="button" onClick={onSignOut} className={`${btn.ghost} ml-auto`}><SignOutIcon size={16} />Sign out</button>
      </div>
    </div>
  )
}

function ColorSwatches({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category color">
      {Object.entries(CATEGORY_COLORS).map(([k, hex]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={k} title={k} onClick={() => onChange(k)}
          className={`press size-6 rounded-full border-2 ${value === k ? 'border-fg' : 'border-transparent'}`}>
          <span className="m-auto block size-4 rounded-full" style={{ background: hex }} />
        </button>
      ))}
    </div>
  )
}

function CanvasThumb({ canvas, className = '' }) {
  const t = useMemo(() => thumbShapes(canvas), [canvas])
  if (!t) return null
  return (
    <svg viewBox={t.viewBox} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden="true"
      style={t.board ? { background: t.bg, borderRadius: 6 } : undefined}>
      {t.items.map((it, i) => {
        const p = { stroke: it.stroke === '#1e1e1e' && !t.board ? 'var(--fg)' : it.stroke, fill: it.fill, strokeWidth: 3, vectorEffect: 'non-scaling-stroke', opacity: 0.85 }
        if (it.k === 'rect') return <rect key={i} {...p} x={it.x} y={it.y} width={Math.abs(it.w)} height={Math.abs(it.h)} rx={it.r} />
        if (it.k === 'ellipse') return <ellipse key={i} {...p} cx={it.cx} cy={it.cy} rx={Math.abs(it.rx)} ry={Math.abs(it.ry)} />
        if (it.k === 'text') return <rect key={i} x={it.x} y={it.y + it.h * 0.3} width={it.w} height={it.h * 0.4} rx={2} fill="var(--subtle)" opacity={0.6} />
        return <path key={i} {...p} d={it.d} strokeLinecap="round" strokeLinejoin="round" />
      })}
    </svg>
  )
}

function NoteCard({ note, layout, categories, actions }) {
  const cat = categories.find((c) => c.id === note.category_id)
  const [renaming, setRenaming] = useState(false)
  const preview = useMemo(() => { const l = plainPreview(note.content, 5); return (l[0] === note.title ? l.slice(1) : l).slice(0, 4) }, [note.content, note.title])
  const thumb = useMemo(() => pickThumbCanvas(note.canvases), [note.canvases])
  const trashed = !!note.deleted_at
  const [confirm, setConfirm] = useState(false)

  const menu = trashed ? null : [
    { label: 'Rename', icon: PencilSimpleIcon, onClick: () => setRenaming(true) },
    { render: (close) => (
      <div className="px-2 py-1">
        <p className="mb-1 flex items-center gap-2 caption-4 text-muted"><FolderSimpleIcon size={14} />Move to category</p>
        <div className="max-h-40 overflow-y-auto">
          {[{ id: null, name: 'No category', color: null }, ...categories].map((c) => (
            <button key={c.id || 'none'} type="button" disabled={note.category_id === c.id}
              onClick={() => { close(); actions.patchNote(note.id, { category_id: c.id }, c.id ? `Note moved to ${c.name}` : 'Note removed from its category') }}
              className="press flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left body-6 text-fg hover:bg-hover disabled:opacity-40">
              <span className="size-2 rounded-full" style={{ background: c.color ? CATEGORY_COLORS[c.color] : 'var(--subtle)' }} />{c.name}
            </button>
          ))}
        </div>
      </div>
    ) },
    { label: 'Duplicate', icon: CopyIcon, onClick: () => actions.duplicateNote(note) },
    { label: 'Export', icon: ExportIcon, onClick: () => go(`/n/${note.id}?export=1`) },
    { sep: true },
    { label: 'Move to trash', icon: TrashIcon, danger: true, onClick: () => actions.trashNote(note) },
  ]

  const titleEl = renaming ? (
    <form className="relative z-10" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.t.value.trim() || 'Untitled'; if (v !== note.title) actions.patchNote(note.id, { title: v }, `Renamed to “${v}”`); setRenaming(false) }}>
      <input name="t" autoFocus defaultValue={note.title} aria-label="Note title" className={inputCls} onBlur={(e) => e.target.form.requestSubmit()} onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false) }} />
    </form>
  ) : trashed ? <h3 className="truncate title-3 text-fg">{note.title}</h3> : (
    <h3 className="truncate title-3 text-fg"><a href={`#/n/${note.id}`} className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">{note.title}</a></h3>
  )

  const meta = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {note.pdf?.path && <span className="inline-flex items-center gap-1 rounded-md border border-line px-1 caption-4 text-muted"><FilePdfIcon size={12} />PDF</span>}
      {cat && <span className="inline-flex items-center gap-1 rounded-md border border-line px-1 caption-4 text-muted"><span className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[cat.color] }} />{cat.name}</span>}
      {(note.tags || []).slice(0, 3).map((t) => <span key={t} className="rounded-md bg-hover px-1 caption-5 text-muted">#{t}</span>)}
      <span className="font-mono caption-5 text-subtle">{trashed ? `Deleted ${relTime(note.deleted_at)}` : relTime(note.updated_at)}</span>
    </div>
  )

  const controls = trashed ? (
    <div className="relative z-10 flex items-center gap-1">
      {confirm ? (
        <>
          <button type="button" className={btn.ghost} onClick={() => setConfirm(false)}>Keep</button>
          <button type="button" className={btn.danger} onClick={() => actions.destroyNote(note)}>Delete forever</button>
        </>
      ) : (
        <>
          <button type="button" className={btn.ghost} onClick={() => actions.restoreNote(note)}><ArrowCounterClockwiseIcon size={16} />Restore</button>
          <button type="button" className={btn.icon} aria-label="Delete permanently" title="Delete permanently" onClick={() => setConfirm(true)}><TrashIcon size={16} /></button>
        </>
      )}
    </div>
  ) : (
    <div className="relative z-10 flex items-center">
      <button type="button" onClick={() => actions.patchNote(note.id, { pinned: !note.pinned }, note.pinned ? 'Note unpinned' : 'Note pinned')}
        aria-pressed={note.pinned} aria-label={note.pinned ? 'Unpin note' : 'Pin note'} title={note.pinned ? 'Unpin' : 'Pin'}
        className={`${btn.icon} ${note.pinned ? 'text-accent' : ''}`}>
        {note.pinned ? <PushPinIcon size={16} weight="fill" /> : <PushPinSlashIcon size={16} className="opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />}
      </button>
      <Menu label={`Options for ${note.title}`} items={menu} />
    </div>
  )

  const thumbBox = (
    <div className="relative overflow-hidden rounded-lg bg-surface">
      {preview.length ? (
        <div className={`space-y-1 p-3 ${thumb ? 'pr-20 sm:pr-24' : ''}`}>
          {preview.map((l, i) => <p key={i} className={`truncate ${i === 0 ? 'caption-4 text-fg' : 'caption-5 text-muted'}`}>{l}</p>)}
        </div>
      ) : !thumb && (note.pdf?.path
        ? <p className="flex items-center gap-2 p-3 caption-4 text-muted"><FilePdfIcon size={16} className="text-danger" /><span className="truncate">{note.pdf.name}</span></p>
        : <p className="p-3 caption-5 text-subtle">Empty note</p>)}
      {thumb && <CanvasThumb canvas={thumb} className={preview.length ? 'absolute bottom-2 right-2 h-16 w-16 sm:w-20' : 'mx-auto h-24 w-full p-3'} />}
    </div>
  )

  if (layout === 'list') {
    return (
      <article className={`group relative flex items-center gap-3 has-[[aria-expanded=true]]:z-30 rounded-2xl border border-line bg-card p-2 transition duration-300 hover:border-subtle ${trashed ? 'opacity-80' : ''}`}>
        <div className="hidden h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-surface sm:block">
          {thumb ? <CanvasThumb canvas={thumb} className="h-full w-full p-1" /> : <p className="truncate p-2 caption-5 text-muted">{preview[0] || ''}</p>}
        </div>
        <div className="min-w-0 flex-1 space-y-1 py-1">{titleEl}{meta}</div>
        {controls}
      </article>
    )
  }
  return (
    <article className={`group relative flex flex-col has-[[aria-expanded=true]]:z-30 rounded-2xl border border-line bg-card p-2 transition duration-300 hover:-translate-y-0.5 hover:border-subtle ${trashed ? 'opacity-80' : ''}`}>
      <div className="h-28 overflow-hidden rounded-lg">{thumbBox}</div>
      <div className={trashed ? 'space-y-2 px-2 pb-1 pt-3' : 'flex items-start gap-2 px-2 pb-1 pt-3'}>
        <div className="min-w-0 flex-1 space-y-2">{titleEl}{meta}</div>
        {controls}
      </div>
    </article>
  )
}

function CardSkeletons({ layout }) {
  return (
    <div aria-busy="true" aria-label="Loading notes" className={`mt-8 ${layout === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'flex flex-col gap-2'}`}>
      {Array.from({ length: 8 }).map((_, i) => layout === 'grid' ? (
        <div key={i} className="rounded-2xl border border-line bg-card p-2">
          <div className="skeleton h-28 rounded-lg" />
          <div className="space-y-2 px-2 pb-1 pt-3"><div className="skeleton h-4 w-2/3 rounded-md" /><div className="skeleton h-3 w-1/2 rounded-md" /></div>
        </div>
      ) : (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2">
          <div className="skeleton h-12 w-20 rounded-lg" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-1/3 rounded-md" /><div className="skeleton h-3 w-1/4 rounded-md" /></div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ view, cat, q, onCreate, onClear }) {
  const conf = q ? { icon: MagnifyingGlassIcon, title: 'No notes match', body: 'Try another word, or clear the search and tag filter.', action: ['Clear filters', onClear] }
    : view === 'trash' ? { icon: TrashIcon, title: 'Trash is empty', body: 'Notes you move to trash wait here until you restore or delete them.', action: ['Back to all notes', () => go('/notes')] }
    : view === 'pinned' ? { icon: PushPinIcon, title: 'Nothing pinned yet', body: 'Pin the notes you open most and they stay at the top of every list.', action: ['Browse all notes', () => go('/notes')] }
    : view === 'cat' && cat ? { icon: FolderSimpleIcon, title: `Nothing in ${cat.name} yet`, body: 'Start a note here, or move an existing one from its card menu.', action: [`New note in ${cat.name}`, onCreate] }
    : view === 'cat' ? { icon: FolderSimpleIcon, title: 'This category no longer exists', body: 'It may have been deleted. Your notes are still in All notes.', action: ['Back to all notes', () => go('/notes')] }
    : { icon: NotebookIcon, title: 'Start your first note', body: 'Write in markdown, then link a canvas to any heading to sketch the idea next to the text.', action: ['Create a note', onCreate] }
  const I = conf.icon
  return (
    <div className="rise-in mt-12 flex flex-col items-center rounded-2xl border border-line bg-card px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-hover text-accent"><I size={24} /></div>
      <h2 className="title-2 text-fg">{conf.title}</h2>
      <p className="mt-2 max-w-sm body-6 text-muted">{conf.body}</p>
      <button type="button" className={`${btn.primary} mt-6`} onClick={conf.action[1]}>{conf.action[0]}</button>
    </div>
  )
}

/* ================================================================== */
/* Settings                                                            */
/* ================================================================== */
function SettingsModal({ settings, setSettings, notes, onClose, toast }) {
  const [scan, setScan] = useState({ kind: 'idle' })
  const findOrphans = async () => {
    setScan({ kind: 'working', text: 'Checking stored images' })
    try {
      const all = await listAllImages()
      const used = referencedImagePaths(notes)
      const orphans = all.filter((f) => !used.has(f.path))
      setScan({ kind: 'found', total: all.length, orphans, bytes: orphans.reduce((n, f) => n + f.size, 0) })
    } catch (e) {
      setScan({ kind: 'error', text: /bucket/i.test(e?.message || '') ? 'The image bucket is missing. Run the latest supabase.sql, then try again.' : `The check failed. ${e?.message || 'Check your connection and try again.'}` })
    }
  }
  const clean = async () => {
    const list = scan.orphans
    setScan({ kind: 'working', text: `Deleting ${list.length} images` })
    try {
      await removeImages(list.map((f) => f.path))
      setScan({ kind: 'done', count: list.length, bytes: list.reduce((n, f) => n + f.size, 0) })
      toast(`${list.length} unused ${list.length === 1 ? 'image' : 'images'} deleted`)
    } catch (e) { setScan({ kind: 'error', text: `Delete failed. ${e?.message || 'Try again.'}` }) }
  }
  return (
    <Modal title="Settings" onClose={onClose} width="max-w-2xl">
      <section aria-labelledby="set-editor">
        <h3 id="set-editor" className="title-4 text-fg">Document editor</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Editor mode">
          {[['live', 'Live preview', 'Formatting shows as you type. Markdown symbols appear only on the line you are editing.'],
            ['classic', 'Write and Read', 'Plain markdown while writing, with a separate Read view for the formatted page.']].map(([k, label, hint]) => (
            <button key={k} type="button" role="radio" aria-checked={settings.editorMode === k} onClick={() => setSettings({ editorMode: k })}
              className={`press rounded-xl border p-3 text-left ${settings.editorMode === k ? 'border-accent' : 'border-line hover:border-subtle'}`}>
              <span className="flex items-center gap-2 title-4 text-fg">{settings.editorMode === k && <CheckIcon size={14} className="text-accent" />}{label}</span>
              <span className="mt-1 block caption-2 text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="set-storage" className="mt-6">
        <h3 id="set-storage" className="title-4 text-fg">Image storage</h3>
        <p className="mt-1 caption-2 text-muted">Deleting an image from a note or canvas keeps the file in Supabase. This finds files no note uses anymore, including notes in trash, and removes them.</p>
        <div className="mt-3 rounded-xl border border-line p-3">
          {scan.kind === 'idle' && <button type="button" className={btn.secondary} onClick={findOrphans}><BroomIcon size={18} />Find unused images</button>}
          {scan.kind === 'working' && <div role="status" className="flex items-center gap-3"><span className="skeleton size-4 rounded-full" /><span className="body-6 text-muted">{scan.text}</span></div>}
          {scan.kind === 'found' && (scan.orphans.length ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="body-6 text-fg">{scan.orphans.length} of {scan.total} stored images are unused ({formatBytes(scan.bytes)}).</p>
              <div className="ml-auto flex gap-2">
                <button type="button" className={btn.ghost} onClick={() => setScan({ kind: 'idle' })}>Keep them</button>
                <button type="button" className={btn.danger} onClick={clean}>Delete {scan.orphans.length} unused</button>
              </div>
            </div>
          ) : <p className="flex items-center gap-2 body-6 text-fg"><CheckIcon size={16} className="text-success" />All {scan.total} stored images are in use. Nothing to clean.</p>)}
          {scan.kind === 'done' && <p className="flex items-center gap-2 body-6 text-fg"><CheckIcon size={16} className="text-success" />Deleted {scan.count} {scan.count === 1 ? 'image' : 'images'} and freed {formatBytes(scan.bytes)}.</p>}
          {scan.kind === 'error' && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="flex items-start gap-2 body-6 text-danger"><WarningIcon size={16} className="mt-0.5 shrink-0" />{scan.text}</p>
              <button type="button" className={`${btn.ghost} ml-auto`} onClick={findOrphans}>Try again</button>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="set-keys" className="mt-6">
        <h3 id="set-keys" className="flex items-center gap-2 title-4 text-fg"><KeyboardIcon size={18} />Keyboard shortcuts</h3>
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {SHORTCUTS.map(([group, list]) => (
            <div key={group}>
              <p className="mb-1 caption-3 uppercase tracking-wider text-subtle">{group}</p>
              <dl className="space-y-1">
                {list.map(([k, d]) => (
                  <div key={k + d} className="flex items-center justify-between gap-3">
                    <dt className="caption-2 text-muted">{d}</dt>
                    <dd><kbd className="whitespace-nowrap rounded border border-line bg-surface px-1 font-mono caption-5 text-fg">{k}</kbd></dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
      <p className="mt-6 font-mono caption-5 text-subtle">Slate v{APP_VERSION}</p>
    </Modal>
  )
}
