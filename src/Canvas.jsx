import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Excalidraw, MainMenu, WelcomeScreen, convertToExcalidrawElements, exportToBlob, exportToSvg, exportToCanvas,
  CaptureUpdateAction, getSceneVersion, getCommonBounds,
} from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import CodeMirror from '@uiw/react-codemirror'
import {
  ShapesIcon, TreeStructureIcon, PaletteIcon, XIcon, RectangleIcon, CircleIcon, TriangleIcon, HexagonIcon, StarIcon,
  DatabaseIcon, CloudIcon, NoteIcon, ChatCircleIcon, PersonSimpleIcon, ArmchairIcon, HandWavingIcon, UserIcon,
  HardDrivesIcon, BrowserIcon, DeviceMobileIcon, PlugsConnectedIcon, WarningIcon, CheckIcon,
  CursorIcon, HandIcon, PenNibIcon, EraserIcon, SquareIcon, ArrowUpRightIcon, TextTIcon, ImageIcon, DiamondIcon,
  LineSegmentIcon, CursorClickIcon, FrameCornersIcon, ListIcon, ResizeIcon, BooksIcon, GridFourIcon, ArrowsInIcon,
  PlusIcon, TrashIcon, ArrowCounterClockwiseIcon, DotsSixVerticalIcon, ArrowClockwiseIcon, MinusIcon, ExportIcon,
  ArrowsHorizontalIcon, ArrowsVerticalIcon, ArrowsOutCardinalIcon, ArrowUpIcon,
} from '@phosphor-icons/react'
import { renderMermaid, resolveCanvasFiles, uploadImage, loadPenPresets, savePenPresets, DEFAULT_PEN_PRESETS, lsGet, lsSet } from './lib.js'

/* ================================================================== */
/* Board themes                                                        */
/* ================================================================== */
const svgUri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`
const noise = (alpha, freq = 0.85) => svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)
const smudge = (alpha) => svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><filter id='s'><feTurbulence type='fractalNoise' baseFrequency='0.008' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#s)'/></svg>`)
const darkNoise = (alpha) => svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)
const grid = (color, size = 24) => svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><path d='M${size} 0.5H0.5V${size}' fill='none' stroke='${color}' stroke-width='1'/></svg>`)
const ruled = (color) => svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><path d='M0 31.5H32' stroke='${color}' stroke-width='1'/></svg>`)

export const BOARDS = {
  plain: { name: 'Plain', note: 'Follows the app theme', color: null, ink: '#1e1e1e', palette: ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'] },
  chalk: { name: 'Chalkboard', note: 'Green slate, white and yellow chalk', color: '#2e4636', layers: [noise(0.09), smudge(0.07)], tile: 220, ink: '#f2efe4', palette: ['#f2efe4', '#f5d76e', '#a5d8ff', '#ffa8a8', '#b2f2bb', '#eebefa'] },
  black: { name: 'Blackboard', note: 'Classic black slate with chalk', color: '#1f2321', layers: [noise(0.08), smudge(0.06)], tile: 220, ink: '#ecebe3', palette: ['#ecebe3', '#f5d76e', '#99e9f2', '#ffc9c9', '#d8f5a2', '#d0bfff'] },
  blueprint: { name: 'Blueprint', note: 'Drafting blue with a fine grid', color: '#1d4a73', layers: [grid('rgba(255,255,255,0.16)')], tile: 24, ink: '#eaf3ff', palette: ['#eaf3ff', '#ffffff', '#ffd43b', '#74c0fc', '#ff8787', '#8ce99a'] },
  paper: { name: 'Ruled paper', note: 'Warm notebook paper with lines', color: '#f8f3e6', layers: [ruled('rgba(70,100,170,0.20)')], tile: 32, ink: '#2b2722', palette: ['#2b2722', '#1c4fbf', '#c92a2a', '#2b8a3e', '#e8590c', '#7048e8'] },
  graph: { name: 'Graph paper', note: 'White sheet with a light grid', color: '#ffffff', layers: [grid('rgba(30,60,120,0.12)', 20)], tile: 20, ink: '#1f2937', palette: ['#1f2937', '#1971c2', '#e03131', '#2f9e44', '#f08c00', '#9c36b5'] },
  kraft: { name: 'Kraft', note: 'Brown kraft paper with dark ink', color: '#c8a57a', layers: [darkNoise(0.18)], tile: 220, ink: '#3a2816', palette: ['#3a2816', '#fffaf0', '#8b1e1e', '#1e3a8a', '#14532d', '#5b21b6'] },
  midnight: { name: 'Midnight', note: 'Deep dark board for low light', color: '#131209', layers: [noise(0.04)], tile: 220, ink: '#e6e1cf', palette: ['#e6e1cf', '#f5d76e', '#91a7ff', '#ff8787', '#69db7c', '#da77f2'] },
}
const plainBg = (bg) => (!bg || bg === '#ffffff' || bg === 'transparent' ? 'transparent' : bg)
export const boardOf = (data) => BOARDS[data?.appState?.board] ? data.appState.board : 'plain'

/* ================================================================== */
/* Canvas size (infinite or a fixed page)                              */
/* ================================================================== */
export const CANVAS_SIZES = {
  infinite: { name: 'Infinite canvas' },
  a4p: { name: 'A4 portrait', w: 794, h: 1123 },
  a4l: { name: 'A4 landscape', w: 1123, h: 794 },
  letter: { name: 'US Letter', w: 816, h: 1056 },
  slide: { name: 'Slide 16:9', w: 1280, h: 720 },
  square: { name: 'Square', w: 1080, h: 1080 },
  custom: { name: 'Custom size' },
}
export const pageOf = (data) => { const s = data?.appState?.canvasSize; return s && s.w > 0 && s.h > 0 ? s : null }

/* ================================================================== */
/* Exports used by the export dialog                                   */
/* ================================================================== */
export const canvasIsEmpty = (data) => !(data?.elements || []).some((e) => !e.isDeleted)

async function exportArgs(data, theme) {
  const board = boardOf(data)
  const plain = board === 'plain'
  return {
    elements: (data.elements || []).filter((e) => !e.isDeleted),
    files: await resolveCanvasFiles(data.files),
    appState: {
      exportBackground: true,
      viewBackgroundColor: plain ? (plainBg(data.appState?.viewBackgroundColor) === 'transparent' ? '#ffffff' : data.appState.viewBackgroundColor) : BOARDS[board].color,
      exportWithDarkMode: plain && theme === 'dark' && !pageOf(data),
    },
    exportPadding: 32,
  }
}
export async function canvasToPngBlob(data, theme = 'light') {
  const page = pageOf(data)
  if (canvasIsEmpty(data) && !page) throw new Error('empty')
  const args = await exportArgs(data, theme)
  if (!page) return exportToBlob({ ...args, mimeType: 'image/png', getDimensions: (w, h) => ({ width: w * 2, height: h * 2, scale: 2 }) })
  // Fixed page: render the scene, then crop it to the page rectangle
  const scale = 2
  const out = document.createElement('canvas')
  out.width = page.w * scale; out.height = page.h * scale
  const ctx = out.getContext('2d')
  ctx.fillStyle = args.appState.viewBackgroundColor; ctx.fillRect(0, 0, out.width, out.height)
  if (args.elements.length) {
    const P = 64 // room for stroke thickness beyond element bounds
    const src = await exportToCanvas({ ...args, appState: { ...args.appState, exportBackground: false }, exportPadding: P, getDimensions: (w, h) => ({ width: w * scale, height: h * scale, scale }) })
    const [minX, minY] = getCommonBounds(args.elements)
    ctx.drawImage(src, (minX - P - page.x) * scale, (minY - P - page.y) * scale)
  }
  return new Promise((res) => out.toBlob(res, 'image/png'))
}
export async function canvasToSvgText(data, theme = 'light') {
  const page = pageOf(data)
  if (canvasIsEmpty(data) && !page) throw new Error('empty')
  const args = await exportArgs(data, theme)
  if (!page) return new XMLSerializer().serializeToString(await exportToSvg(args))
  const P = 64
  const svg = await exportToSvg({ ...args, appState: { ...args.appState, exportBackground: false }, exportPadding: P })
  const [minX, minY] = args.elements.length ? getCommonBounds(args.elements) : [page.x + P, page.y + P]
  const vx = page.x - (minX - P), vy = page.y - (minY - P)
  svg.setAttribute('viewBox', `${vx} ${vy} ${page.w} ${page.h}`)
  svg.setAttribute('width', page.w); svg.setAttribute('height', page.h)
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  Object.entries({ x: vx, y: vy, width: page.w, height: page.h, fill: args.appState.viewBackgroundColor }).forEach(([k, v]) => bg.setAttribute(k, v))
  svg.insertBefore(bg, svg.firstChild)
  return new XMLSerializer().serializeToString(svg)
}

/** Export one heading area (a frame on the document canvas) as PNG. */
export async function frameToPngBlob(data, cv) {
  const all = (data?.elements || []).filter((e) => !e.isDeleted)
  const frame = all.find((e) => e.type === 'frame' && e.customData?.cv === cv)
  if (!frame) throw new Error('empty')
  const children = all.filter((e) => e.frameId === frame.id)
  if (!children.length) throw new Error('empty')
  const args = await exportArgs(data, 'light')
  return exportToBlob({ ...args, elements: [frame, ...children], exportingFrame: frame, exportPadding: 0, mimeType: 'image/png', getDimensions: (w, h) => ({ width: w * 2, height: h * 2, scale: 2 }) })
}
export const frameHasContent = (data, cv) => {
  const all = (data?.elements || []).filter((e) => !e.isDeleted)
  const frame = all.find((e) => e.type === 'frame' && e.customData?.cv === cv)
  return !!frame && all.some((e) => e.frameId === frame.id)
}

/* ================================================================== */
/* Preset shapes                                                       */
/* ================================================================== */
const base = (ink) => ({ strokeColor: ink, backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, roughness: 0 })
function poly(pts, ink, extra = {}) {
  const [x0, y0] = pts[0]
  const rel = pts.map(([x, y]) => [x - x0, y - y0])
  const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1])
  return { type: 'line', x: x0, y: y0, points: rel, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), ...base(ink), ...extra }
}
const line = (a, b, ink) => poly([a, b], ink)
const ell = (x, y, w, h, ink, extra = {}) => ({ type: 'ellipse', x, y, width: w, height: h, ...base(ink), ...extra })
const rect = (x, y, w, h, ink, extra = {}) => ({ type: 'rectangle', x, y, width: w, height: h, roundness: { type: 3 }, ...base(ink), ...extra })
const label = (text, cx, y, ink) => ({ type: 'text', x: cx - text.length * 4.6, y, text, fontSize: 16, strokeColor: ink })
const arc = (cx, cy, rx, ry, from, to, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const t = from + ((to - from) * i) / n; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] })

function cylinder(ink, w = 120, h = 140, ry = 16) {
  return [
    ell(0, 0, w, ry * 2, ink),
    line([0, ry], [0, h - ry], ink), line([w, ry], [w, h - ry], ink),
    poly(arc(w / 2, h - ry, w / 2, ry, 0, Math.PI), ink, { roundness: { type: 2 } }),
  ]
}
const head = (x, ink) => ell(x, 0, 40, 40, ink)

const SHAPES = {
  roundrect: { label: 'Rounded rectangle', icon: RectangleIcon, build: (ink) => [rect(0, 0, 180, 100, ink)] },
  circle: { label: 'Circle', icon: CircleIcon, build: (ink) => [ell(0, 0, 120, 120, ink)] },
  triangle: { label: 'Triangle', icon: TriangleIcon, build: (ink) => [poly([[60, 0], [120, 104], [0, 104], [60, 0]], ink)] },
  hexagon: { label: 'Hexagon', icon: HexagonIcon, build: (ink) => [poly([[32, 0], [96, 0], [128, 56], [96, 112], [32, 112], [0, 56], [32, 0]], ink)] },
  star: {
    label: 'Star', icon: StarIcon, build: (ink) => {
      const pts = Array.from({ length: 11 }, (_, i) => { const r = i % 2 ? 28 : 68; const a = -Math.PI / 2 + (i * Math.PI) / 5; return [68 + r * Math.cos(a), 68 + r * Math.sin(a)] })
      return [poly(pts, ink)]
    },
  },
  cylinder: { label: 'Database cylinder', icon: DatabaseIcon, build: (ink) => cylinder(ink) },
  cloud: {
    label: 'Cloud', icon: CloudIcon, build: (ink) => {
      const pts = Array.from({ length: 73 }, (_, i) => { const t = (i / 72) * Math.PI * 2; const k = 1 + 0.14 * Math.abs(Math.sin(4 * t)); return [100 + 92 * k * Math.cos(t), 60 + 52 * k * Math.sin(t)] })
      return [poly(pts, ink, { roundness: { type: 2 } })]
    },
  },
  sticky: { label: 'Sticky note', icon: NoteIcon, build: () => [{ ...rect(0, 0, 160, 160, '#c9a227', { roundness: null }), backgroundColor: '#ffec99', label: { text: 'Note', strokeColor: '#1e1e1e', fontSize: 20 } }] },
  bubble: { label: 'Speech bubble', icon: ChatCircleIcon, build: (ink) => [poly([[0, 0], [190, 0], [190, 100], [70, 100], [38, 132], [44, 100], [0, 100], [0, 0]], ink)] },
  standing: {
    label: 'Stickman standing', icon: PersonSimpleIcon, people: true, build: (ink) => [
      head(40, ink), line([60, 40], [60, 104], ink), poly([[28, 84], [60, 58], [92, 84]], ink), poly([[34, 160], [60, 104], [86, 160]], ink),
    ],
  },
  sitting: {
    label: 'Stickman sitting', icon: ArmchairIcon, people: true, build: (ink) => [
      head(40, ink), line([60, 40], [60, 100], ink), poly([[60, 100], [106, 100], [106, 148]], ink), poly([[60, 60], [92, 88]], ink),
      line([36, 52], [36, 152], ink), line([36, 108], [120, 108], ink), line([120, 108], [120, 152], ink),
    ],
  },
  waving: {
    label: 'Stickman waving', icon: HandWavingIcon, people: true, build: (ink) => [
      head(40, ink), line([60, 40], [60, 104], ink), poly([[60, 60], [30, 94]], ink), poly([[60, 60], [90, 38], [104, 6]], ink), poly([[34, 160], [60, 104], [86, 160]], ink),
    ],
  },
  user: { label: 'User', icon: UserIcon, diagram: true, build: (ink) => [ell(30, 0, 40, 40, ink), poly([[8, 92], [12, 66], [50, 50], [88, 66], [92, 92], [8, 92]], ink, { roundness: { type: 2 } }), label('User', 50, 104, ink)] },
  server: {
    label: 'Server', icon: HardDrivesIcon, diagram: true, build: (ink) => [0, 36, 72].flatMap((y) => [rect(0, y, 120, 28, ink), ell(100, y + 10, 8, 8, ink, { backgroundColor: ink })]).concat(label('Server', 60, 112, ink)),
  },
  database: { label: 'Database', icon: DatabaseIcon, diagram: true, build: (ink) => [...cylinder(ink, 100, 110, 14), label('Database', 50, 122, ink)] },
  browser: {
    label: 'Browser', icon: BrowserIcon, diagram: true, build: (ink) => [
      rect(0, 0, 170, 116, ink), line([0, 26], [170, 26], ink), ...[12, 28, 44].map((x) => ell(x - 4, 9, 8, 8, ink, { backgroundColor: ink })), label('Browser', 85, 128, ink),
    ],
  },
  mobile: { label: 'Mobile', icon: DeviceMobileIcon, diagram: true, build: (ink) => [rect(0, 0, 72, 132, ink), line([26, 118], [46, 118], ink), label('Mobile', 36, 144, ink)] },
  api: { label: 'API', icon: PlugsConnectedIcon, diagram: true, build: (ink) => [{ ...rect(0, 0, 130, 64, ink), label: { text: 'API', fontSize: 20, strokeColor: ink } }] },
}

function placeShape(kind, ink, cx, cy) {
  const parts = SHAPES[kind].build(ink)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of parts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + (p.width || 60)); maxY = Math.max(maxY, p.y + (p.height || 20)) }
  const dx = cx - (minX + maxX) / 2, dy = cy - (minY + maxY) / 2
  const gid = parts.length > 1 ? `g_${Math.random().toString(36).slice(2, 10)}` : null
  return { gid, skeleton: parts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy, ...(gid ? { groupIds: [gid] } : {}) })) }
}

/* ================================================================== */
/* Mermaid templates                                                   */
/* ================================================================== */
const TEMPLATES = {
  Flowchart: 'flowchart TD\n  A[Capture idea] --> B{Worth doing?}\n  B -- Yes --> C[Write outline]\n  B -- No --> D[Archive]\n  C --> E[Draw the diagram]',
  Sequence: 'sequenceDiagram\n  participant U as You\n  participant A as Slate\n  participant D as Database\n  U->>A: Edit note\n  A->>D: Save changes\n  D-->>A: Stored\n  A-->>U: Saved',
  ER: 'erDiagram\n  CATEGORY ||--o{ NOTE : groups\n  NOTE {\n    uuid id\n    text title\n    text content\n  }\n  CATEGORY {\n    uuid id\n    text name\n  }',
  Gantt: 'gantt\n  title Writing plan\n  dateFormat YYYY-MM-DD\n  section Draft\n  Outline        :a1, 2026-11-03, 3d\n  First draft    :after a1, 5d\n  section Review\n  Edit and trim  :2026-11-12, 4d',
  Class: 'classDiagram\n  class Note {\n    +String title\n    +String content\n    +save()\n  }\n  class Canvas {\n    +Element[] elements\n    +export()\n  }\n  Note "1" --> "*" Canvas : links',
  State: 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review : submit\n  Review --> Draft : changes\n  Review --> Published : approve\n  Published --> [*]',
}

const ui = {
  icon: 'press inline-flex size-9 items-center justify-center rounded-lg border border-line bg-card text-muted shadow-sm hover:bg-hover hover:text-fg',
  iconOn: 'press inline-flex size-9 items-center justify-center rounded-lg border border-accent bg-card text-accent shadow-sm',
  panel: 'pop-in absolute bottom-16 left-3 z-20 w-80 max-w-[calc(100%-24px)] max-h-[calc(100%-80px)] overflow-y-auto rounded-2xl border border-line bg-card p-3 shadow-[var(--shadow)]',
}

/* ================================================================== */
/* Canvas board                                                        */
/* ================================================================== */
const MAX_INLINE_BYTES = 300 * 1024
// Excalidraw draws a freehand stroke about 4.25 times wider than its strokeWidth.
// Slate shows pen sizes in real pixels at 100% zoom and converts here.
const PX_PER_WIDTH = 4.25
const toWidth = (px) => Math.max(0.05, px / PX_PER_WIDTH)
const clampSize = (n) => Math.round(Math.min(48, Math.max(0.5, Number.isFinite(n) ? n : 3)) * 2) / 2
const PATTERNS = { none: 'None', dots: 'Dots', lines: 'Lines', grid: 'Grid' }
const isDark = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '')
  if (!m) return false
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45
}
const patternImage = (kind, color, tile = 24) => (
  kind === 'dots' ? svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'><circle cx='${tile / 2}' cy='${tile / 2}' r='1.3' fill='${color}'/></svg>`)
    : kind === 'lines' ? ruledLine(color, tile)
      : kind === 'grid' ? grid(color, tile) : null
)
const ruledLine = (color, tile) => svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'><path d='M0 ${tile - 0.5}H${tile}' stroke='${color}' stroke-width='1'/></svg>`)
const DRAW_TOOLS = [
  ['rectangle', 'Rectangle', 'R', SquareIcon], ['ellipse', 'Ellipse', 'O', CircleIcon], ['diamond', 'Diamond', 'D', DiamondIcon],
  ['arrow', 'Arrow', 'A', ArrowUpRightIcon], ['line', 'Line', 'L', LineSegmentIcon], ['text', 'Text', 'T', TextTIcon],
  ['image', 'Image', '9', ImageIcon], ['frame', 'Frame', 'F', FrameCornersIcon],
]
const MENU_TOOLS = [['hand', 'Hand', 'H', HandIcon], ['freedraw', 'Pen', 'P', PenNibIcon], ['laser', 'Laser', 'K', CursorClickIcon]]
const FRAME_W = 960, FRAME_H = 600

function CanvasBoard({ data, theme, onChange, onNotice, noteId, focus, frameNames, legacy, onMigrated }) {
  const apiRef = useRef(null)
  const layerRef = useRef(null)
  const patternRef = useRef(null)
  const pageRef = useRef(null)
  const rootRef = useRef(null)
  const ribbonRef = useRef(null)
  const [panel, setPanel] = useState(null) // menu | pen | board | size | shapes
  const [shapesPop, setShapesPop] = useState(false)
  const [mermaidOpen, setMermaidOpen] = useState(false)
  const [board, setBoard] = useState(() => boardOf(data))
  const boardRef = useRef(board)
  const [pattern, setPattern] = useState(() => (PATTERNS[data?.appState?.pattern] ? data.appState.pattern : 'none'))
  const patternStateRef = useRef(pattern)
  const [page, setPage] = useState(() => pageOf(data))
  const pageStateRef = useRef(page)
  const [tool, setToolState] = useState('selection')
  const [hasSel, setHasSel] = useState(false)
  const [presets, setPresets] = useState(loadPenPresets)
  const [pen, setPen] = useState(() => ({ ...(loadPenPresets()[1] || DEFAULT_PEN_PRESETS[1]) }))
  const penRef = useRef(pen)
  penRef.current = pen
  const presetsRef = useRef(presets)
  presetsRef.current = presets
  const [snap, setSnap] = useState(!!data?.appState?.gridModeEnabled)
  const [zoomPct, setZoomPct] = useState(100)
  const [rootSize, setRootSize] = useState({ w: 0, h: 0 })
  const [ribSize, setRibSize] = useState({ w: 0, h: 0 })
  const [rpos, setRpos] = useState(() => lsGet('slate-ribbon', { fx: 0.5, fy: 0.02 }))
  const [vertical, setVertical] = useState(() => lsGet('slate-ribbon-vertical', false))
  const [confirmClear, setConfirmClear] = useState(false)
  const def = BOARDS[board]
  const textured = board !== 'plain'
  const compact = rootSize.w > 0 && rootSize.w < 730

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.target === rootRef.current) setRootSize({ w: e.contentRect.width, h: e.contentRect.height })
        if (e.target === ribbonRef.current) setRibSize({ w: e.target.offsetWidth, h: e.target.offsetHeight })
      }
    })
    ro.observe(rootRef.current); if (ribbonRef.current) ro.observe(ribbonRef.current)
    return () => ro.disconnect()
  }, [vertical])

  const initial = useMemo(() => {
    const b = BOARDS[boardOf(data)]
    const inline = Object.fromEntries(Object.values(data?.files || {}).filter((f) => f.dataURL).map((f) => [f.id, f]))
    return {
      elements: data?.elements || [],
      files: Object.keys(inline).length ? inline : undefined,
      appState: {
        viewBackgroundColor: b.color ? 'transparent' : plainBg(data?.appState?.viewBackgroundColor),
        gridSize: data?.appState?.gridSize || 20,
        gridModeEnabled: !!data?.appState?.gridModeEnabled,
        currentItemRoughness: 0,
        currentItemStrokeColor: b.ink,
        currentItemFontFamily: 5,
      },
      scrollToContent: !pageOf(data),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ----- saving: throttled, only when something real changed ----- */
  const uploaded = useRef(Object.fromEntries(Object.values(data?.files || {}).map((f) => [f.id, f])))
  const uploading = useRef(new Set())
  const last = useRef({ v: getSceneVersion(initial.elements), bg: initial.appState.viewBackgroundColor, grid: initial.appState.gridModeEnabled, dirty: false })
  const pending = useRef(null)
  const timer = useRef(null)
  const emitRef = useRef(null)
  const exporting = useRef(false)

  const startUpload = useCallback(async (id, f) => {
    uploading.current.add(id)
    try {
      const blob = await (await fetch(f.dataURL)).blob()
      const path = await uploadImage(blob, noteId || 'canvas', `cv_${id.slice(0, 32)}`)
      uploaded.current[id] = { id, mimeType: f.mimeType, path, created: f.created || Date.now() }
    } catch (e) {
      if ((f.dataURL?.length || 0) * 0.75 < MAX_INLINE_BYTES) uploaded.current[id] = { id, mimeType: f.mimeType, dataURL: f.dataURL, created: f.created }
      onNotice?.(e?.message || 'Upload failed. The image was not saved.', 'error')
    }
    uploading.current.delete(id)
    const api = apiRef.current
    if (api) { pending.current = { elements: api.getSceneElementsIncludingDeleted(), appState: api.getAppState(), files: api.getFiles() }; emitRef.current() }
  }, [noteId, onNotice])

  const emit = useCallback(() => {
    clearTimeout(timer.current); timer.current = null
    if (!pending.current) return
    const { elements, appState, files } = pending.current
    pending.current = null
    const b = boardRef.current
    const live = elements.filter((e) => !e.isDeleted)
    let kept = null
    for (const e of live) {
      if (e.type !== 'image' || !e.fileId) continue
      const id = e.fileId
      if (uploaded.current[id]) { kept = kept || {}; kept[id] = uploaded.current[id]; continue }
      const f = files?.[id]
      if (f?.dataURL && !uploading.current.has(id)) startUpload(id, f)
    }
    const bg = appState.viewBackgroundColor
    onChange({
      elements: live,
      appState: {
        viewBackgroundColor: b === 'plain' ? (exporting.current ? 'transparent' : bg) : BOARDS[b].color,
        gridSize: appState.gridSize || 20, gridModeEnabled: !!appState.gridModeEnabled, board: b,
        canvasSize: pageStateRef.current || null, pattern: patternStateRef.current,
      },
      ...(kept ? { files: kept } : {}),
    })
  }, [onChange, startUpload])
  emitRef.current = emit

  const mountedAt = useRef(Date.now())
  const prevTool = useRef('selection')
  const seenImages = useRef(new Set())
  const restoreBg = useRef(null)
  const reopening = useRef(false)
  const prepareExportBg = (st) => {
    if (exporting.current) return
    exporting.current = true
    restoreBg.current = st.viewBackgroundColor
    const b = BOARDS[boardRef.current]
    const solid = b.color || (plainBg(st.viewBackgroundColor) === 'transparent' ? '#ffffff' : st.viewBackgroundColor)
    apiRef.current?.updateScene({ appState: { viewBackgroundColor: solid } })
  }
  const handleChange = useCallback((elements, appState, files) => {
    // Excalidraw's own export dialog: show a solid background while it is open
    const dialogOpen = appState.openDialog?.name === 'imageExport'
    if (dialogOpen && !exporting.current) {
      // opened with the keyboard shortcut: give it a solid background, then reopen so the preview uses it
      prepareExportBg(appState)
      reopening.current = true
      setTimeout(() => {
        apiRef.current?.updateScene({ appState: { openDialog: null } })
        setTimeout(() => apiRef.current?.updateScene({ appState: { openDialog: { name: 'imageExport' } } }), 30)
      }, 0)
      return
    }
    if (exporting.current) {
      if (dialogOpen) { reopening.current = false; return }
      if (reopening.current) return
      exporting.current = false
      const back = restoreBg.current
      setTimeout(() => apiRef.current?.updateScene({ appState: { viewBackgroundColor: back } }), 0)
      return
    }
    const t = appState.activeTool?.type
    if (t && t !== prevTool.current) {
      // pen size and opacity belong to the pen only, other tools get normal defaults back
      if (prevTool.current === 'freedraw' && t !== 'eraser') setTimeout(() => apiRef.current?.updateScene({ appState: { currentItemOpacity: 100, currentItemStrokeWidth: 2 } }), 0)
      prevTool.current = t
      setToolState(t)
    }
    const sel = Object.keys(appState.selectedElementIds || {}).length > 0
    setHasSel((p) => (p === sel ? p : sel))
    const z = Math.round(appState.zoom.value * 100)
    setZoomPct((p) => (p === z ? p : z))
    // images pasted while a see-through pen is active should not inherit its opacity
    const ready = (e) => e.type === 'image' && e.fileId && files?.[e.fileId] && !seenImages.current.has(e.id)
    const faded = elements.filter((e) => ready(e) && !e.isDeleted && e.opacity < 100)
    elements.forEach((e) => { if (ready(e)) seenImages.current.add(e.id) })
    if (faded.length && Date.now() - mountedAt.current > 1000) {
      const ids = new Set(faded.map((e) => e.id))
      setTimeout(() => {
        const api = apiRef.current
        api?.updateScene({ elements: api.getSceneElementsIncludingDeleted().map((e) => (ids.has(e.id) ? { ...e, opacity: 100, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) } : e)) })
      }, 600)
    }
    const v = getSceneVersion(elements)
    const bg = appState.viewBackgroundColor, g = appState.gridModeEnabled
    const l = last.current
    if (!l.dirty && Date.now() - mountedAt.current < 1000) { last.current = { v, bg, grid: g, dirty: false }; return }
    if (boardRef.current !== 'plain' && bg !== 'transparent' && bg !== l.bg) { boardRef.current = 'plain'; setBoard('plain') }
    if (!l.dirty && v === l.v && bg === l.bg && g === l.grid) return
    last.current = { v, bg, grid: g, dirty: false }
    pending.current = { elements, appState, files }
    if (!timer.current) timer.current = setTimeout(() => emitRef.current(), 300)
  }, [])
  const forceSave = () => {
    const api = apiRef.current
    if (!api) return
    last.current.dirty = true
    handleChange(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles())
  }

  useEffect(() => () => { if (timer.current) emitRef.current() }, [])

  /* ----- document canvas: one frame per linked heading ----- */
  const findFrame = (cv) => apiRef.current?.getSceneElements().find((e) => e.type === 'frame' && e.customData?.cv === cv)
  const createFrame = (cv, name, w = FRAME_W, h = FRAME_H) => {
    const api = apiRef.current
    const frames = api.getSceneElements().filter((e) => e.type === 'frame')
    const x = frames.length ? Math.max(...frames.map((f) => f.x + f.width)) + 160 : 0
    const y = frames.length ? Math.min(...frames.map((f) => f.y)) : 0
    const [fr] = convertToExcalidrawElements([{ type: 'frame', children: [], name: name || 'Heading', x, y, width: w, height: h, customData: { cv } }])
    api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), fr], captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    return fr
  }
  const pendingFocus = useRef(focus || null)
  const runFocus = () => {
    const api = apiRef.current, f = pendingFocus.current
    if (!api || !f) return
    pendingFocus.current = null
    let fr = findFrame(f.cv)
    if (!fr && f.create) { fr = createFrame(f.cv, f.name); forceSave() }
    if (fr) api.scrollToContent([fr], { fitToViewport: true, viewportZoomFactor: 0.9, animate: true })
  }
  useEffect(() => { if (focus) { pendingFocus.current = focus; runFocus() } }, [focus?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const migrate = async () => {
    const api = apiRef.current
    const list = Object.entries(legacy || {})
    if (!api || !list.length) return
    const done = []
    for (const [cv, { data: old, name }] of list) {
      if (findFrame(cv)) { done.push(cv); continue }
      const els = (old?.elements || []).filter((e) => !e.isDeleted)
      let fr = createFrame(cv, name)
      if (els.length) {
        const [minX, minY, maxX, maxY] = getCommonBounds(els)
        const w = Math.max(FRAME_W, maxX - minX + 96), h = Math.max(FRAME_H, maxY - minY + 96)
        fr = { ...fr, width: w, height: h, version: fr.version + 1 }
        const dx = fr.x + 48 - minX, dy = fr.y + 48 - minY
        const moved = els.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy, frameId: fr.id }))
        api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted().map((e) => (e.id === fr.id ? fr : e)), ...moved], captureUpdate: CaptureUpdateAction.NEVER })
        const files = Object.values(old.files || {})
        files.forEach((f) => { uploaded.current[f.id] = f })
        if (files.length) api.addFiles(Object.values(await resolveCanvasFiles(old.files)))
      }
      done.push(cv)
    }
    forceSave()
    onMigrated?.(done)
  }

  const namesKey = JSON.stringify(frameNames || {})
  useEffect(() => {
    const api = apiRef.current
    if (!api || !frameNames) return
    const changed = api.getSceneElementsIncludingDeleted().some((e) => e.type === 'frame' && e.customData?.cv && frameNames[e.customData.cv] && frameNames[e.customData.cv] !== e.name)
    if (!changed) return
    api.updateScene({
      elements: api.getSceneElementsIncludingDeleted().map((e) => (e.type === 'frame' && frameNames[e.customData?.cv] && frameNames[e.customData.cv] !== e.name
        ? { ...e, name: frameNames[e.customData.cv], version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) } : e)),
      captureUpdate: CaptureUpdateAction.NEVER,
    })
  }, [namesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- api ready: stored images, migration, focus ----- */
  const onApi = (api) => {
    if (apiRef.current === api) return
    apiRef.current = api
    if (import.meta.env.DEV) window.__slateApi = api
    const stored = Object.values(data?.files || {}).filter((f) => f.path)
    setTimeout(async () => {
      if (apiRef.current !== api) return
      if (stored.length) resolveCanvasFiles(Object.fromEntries(stored.map((f) => [f.id, f]))).then((out) => { if (apiRef.current === api) api.addFiles(Object.values(out)) })
      await migrate()
      if (pendingFocus.current) runFocus()
      else if (pageStateRef.current) fitPage()
      positionLayers()
    }, 80)
  }

  /* ----- background layers that follow scroll and zoom ----- */
  const positionLayers = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const { scrollX: sx, scrollY: sy, zoom } = api.getAppState()
    const z = zoom.value
    const el = layerRef.current, b = BOARDS[boardRef.current]
    if (el && b.tile) {
      el.style.backgroundPosition = (b.layers || []).map(() => `${sx * z}px ${sy * z}px`).join(',')
      el.style.backgroundSize = (b.layers || []).map((_, i) => `${(i === 1 ? 600 : b.tile) * z}px`).join(',')
    }
    const pt = patternRef.current
    if (pt) { pt.style.backgroundPosition = `${sx * z}px ${sy * z}px`; pt.style.backgroundSize = `${24 * z}px ${24 * z}px` }
    const pg = pageRef.current, p = pageStateRef.current
    if (pg && p) {
      pg.style.transform = `translate(${(p.x + sx) * z}px, ${(p.y + sy) * z}px)`
      pg.style.width = `${p.w * z}px`; pg.style.height = `${p.h * z}px`
    }
  }, [])
  useEffect(() => { positionLayers() }, [board, page, pattern, positionLayers])

  const fitPage = () => {
    const api = apiRef.current, p = pageStateRef.current
    if (!api || !p) return
    const st = api.getAppState()
    const zoom = Math.max(0.1, Math.min(2, Math.min(st.width / (p.w + 96), st.height / (p.h + 96))))
    api.updateScene({ appState: { zoom: { value: zoom }, scrollX: st.width / (2 * zoom) - (p.x + p.w / 2), scrollY: st.height / (2 * zoom) - (p.y + p.h / 2) } })
    setTimeout(positionLayers, 0)
  }
  const zoomTo = (next) => {
    const api = apiRef.current
    if (!api) return
    const st = api.getAppState()
    const z = Math.max(0.1, Math.min(30, next))
    const cx = -st.scrollX + st.width / 2 / st.zoom.value, cy = -st.scrollY + st.height / 2 / st.zoom.value
    api.updateScene({ appState: { zoom: { value: z }, scrollX: st.width / 2 / z - cx, scrollY: st.height / 2 / z - cy } })
    setTimeout(positionLayers, 0)
  }
  const zoomFit = () => {
    const api = apiRef.current
    if (page) fitPage()
    else api?.scrollToContent(api.getSceneElements(), { fitToViewport: true, viewportZoomFactor: 0.9, animate: true })
  }

  const applySize = (key, custom) => {
    const api = apiRef.current
    if (key === 'infinite') { pageStateRef.current = null; setPage(null); forceSave(); return }
    const dims = key === 'custom' ? custom : CANVAS_SIZES[key]
    if (!api || !dims?.w || !dims?.h) return
    const st = api.getAppState()
    const cx = -st.scrollX + st.width / 2 / st.zoom.value, cy = -st.scrollY + st.height / 2 / st.zoom.value
    const prev = pageStateRef.current
    const next = { preset: key, w: Math.round(dims.w), h: Math.round(dims.h), x: Math.round(prev ? prev.x + prev.w / 2 - dims.w / 2 : cx - dims.w / 2), y: Math.round(prev ? prev.y + prev.h / 2 - dims.h / 2 : cy - dims.h / 2) }
    pageStateRef.current = next; setPage(next)
    forceSave()
    setTimeout(fitPage, 0)
  }
  const applyPattern = (k) => { patternStateRef.current = k; setPattern(k); forceSave() }

  /* ----- board themes ----- */
  const applyBoard = (key) => {
    const api = apiRef.current
    const prev = BOARDS[boardRef.current], next = BOARDS[key]
    boardRef.current = key; setBoard(key)
    if (!api) return
    const els = api.getSceneElementsIncludingDeleted().map((e) => (!e.isDeleted && e.strokeColor === prev.ink ? { ...e, strokeColor: next.ink, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) } : e))
    api.updateScene({ elements: els, appState: { viewBackgroundColor: 'transparent', currentItemStrokeColor: penRef.current.color === 'ink' ? next.ink : api.getAppState().currentItemStrokeColor }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    forceSave()
  }

  /* ----- tools and pen ----- */
  const setTool = (type) => {
    const api = apiRef.current
    if (!api) return
    if (type === 'freedraw') applyPen(penRef.current)
    else api.setActiveTool({ type })
    setShapesPop(false)
    if (panel === 'menu') setPanel(null)
  }
  const inkOf = (c) => (c === 'ink' ? BOARDS[boardRef.current].ink : c)
  const applyPen = (p, { activate = true, toSelection = false } = {}) => {
    const api = apiRef.current
    if (!api) return
    const next = { ...p, size: clampSize(p.size), opacity: p.opacity || 100 }
    setPen(next)
    const color = inkOf(next.color)
    const st = api.getAppState()
    const sel = st.selectedElementIds || {}
    if (toSelection && Object.keys(sel).length) {
      api.updateScene({
        elements: api.getSceneElementsIncludingDeleted().map((e) => (sel[e.id] ? { ...e, strokeColor: color, strokeWidth: e.type === 'freedraw' ? toWidth(next.size) : Math.max(0.5, next.size / 2), opacity: next.opacity, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) } : e)),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      })
    }
    api.updateScene({ appState: { currentItemStrokeColor: color, currentItemStrokeWidth: toWidth(next.size), currentItemOpacity: next.opacity } })
    if (activate) api.setActiveTool({ type: 'freedraw' })
  }
  const usePreset = (i, quiet) => {
    const p = presetsRef.current[i]
    if (!p) return
    applyPen(p)
    setShapesPop(false)
    if (!quiet) onNotice?.(`Pen: ${p.name}`)
  }
  const updatePresets = (list) => { setPresets(list); savePenPresets(list) }

  // Keyboard: Alt + 1..9 presets, Shift + P next preset, [ and ] pen size
  useEffect(() => {
    const onKey = (e) => {
      const root = rootRef.current
      if (!root) return
      const t = e.target
      if (t !== document.body && !root.contains(t)) return
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable) return
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (e.altKey && !e.ctrlKey && !e.metaKey && digit) { e.preventDefault(); e.stopPropagation(); usePreset(Number(digit[1]) - 1); return }
      if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyP') {
        e.preventDefault(); e.stopPropagation()
        const list = presetsRef.current
        const i = list.findIndex((p) => p.id === penRef.current.id)
        usePreset((i + 1) % list.length)
        return
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        e.preventDefault(); e.stopPropagation()
        const s = penRef.current.size
        const step = e.shiftKey ? 4 : s < 4 ? 0.5 : s < 12 ? 1 : 2
        applyPen({ ...penRef.current, size: s + (e.code === 'BracketRight' ? step : -step) }, { toSelection: true })
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendKey = (key, opts = {}) => {
    const target = rootRef.current?.querySelector('.excalidraw')
    target?.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, bubbles: true, cancelable: true, ctrlKey: !/Mac/.test(navigator.platform), metaKey: /Mac/.test(navigator.platform), ...opts }))
  }
  const undo = () => sendKey('z')
  const redo = () => sendKey('z', { shiftKey: true })

  /* ----- inserts ----- */
  const insertCount = useRef(0)
  const insertShape = (kind) => {
    const api = apiRef.current
    if (!api) return
    const st = api.getAppState()
    const cx = -st.scrollX + st.width / 2 / st.zoom.value
    const cy = -st.scrollY + st.height / 2 / st.zoom.value
    const n = insertCount.current++ % 6
    const { gid, skeleton } = placeShape(kind, st.currentItemStrokeColor || BOARDS[boardRef.current].ink, cx + n * 32, cy + n * 32)
    const els = convertToExcalidrawElements(skeleton, { regenerateIds: true })
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...els],
      appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])), selectedGroupIds: gid ? { [gid]: true } : {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
    api.setActiveTool({ type: 'selection' })
    if (window.innerWidth < 640) setPanel(null)
  }

  const insertMermaid = async (code) => {
    const api = apiRef.current
    const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw')
    const { elements, files } = await parseMermaidToExcalidraw(code, { themeVariables: { fontSize: '16px' } })
    const els = convertToExcalidrawElements(elements, { regenerateIds: true })
    const st = api.getAppState()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    els.forEach((e) => { minX = Math.min(minX, e.x); minY = Math.min(minY, e.y); maxX = Math.max(maxX, e.x + e.width); maxY = Math.max(maxY, e.y + e.height) })
    const cx = -st.scrollX + st.width / 2 / st.zoom.value, cy = -st.scrollY + st.height / 2 / st.zoom.value
    const dx = cx - (minX + maxX) / 2, dy = cy - (minY + maxY) / 2
    const ink = st.currentItemStrokeColor
    const moved = els.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy, ...(boardRef.current !== 'plain' && e.strokeColor === '#1e1e1e' ? { strokeColor: ink } : {}) }))
    if (files && Object.keys(files).length) api.addFiles(Object.values(files))
    api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...moved], captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    api.scrollToContent(moved, { fitToViewport: true, viewportZoomFactor: 0.8, animate: true })
    onNotice?.('Diagram inserted into the canvas')
  }

  const openExportDialog = () => {
    const api = apiRef.current
    if (!api) return
    setPanel(null)
    prepareExportBg(api.getAppState())
    reopening.current = true
    setTimeout(() => api.updateScene({ appState: { openDialog: { name: 'imageExport' } } }), 30)
  }

  /* ----- floating ribbon: drag anywhere, position remembered ----- */
  const ribLeft = Math.max(0, (rootSize.w - ribSize.w) * rpos.fx)
  const ribTop = Math.max(0, (rootSize.h - ribSize.h) * rpos.fy)
  const startRibbonDrag = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const start = { x: e.clientX, y: e.clientY, left: ribLeft, top: ribTop }
    let next = rpos
    const move = (ev) => {
      const spanX = Math.max(1, rootSize.w - ribSize.w), spanY = Math.max(1, rootSize.h - ribSize.h)
      const left = Math.min(spanX, Math.max(0, start.left + ev.clientX - start.x))
      const top = Math.min(spanY, Math.max(0, start.top + ev.clientY - start.y))
      next = { fx: left / spanX, fy: top / spanY }
      setRpos(next)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); lsSet('slate-ribbon', next) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const ribbonBelow = rpos.fy < 0.55

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name))
  useEffect(() => {
    if (!panel && !shapesPop) return
    const onDown = (e) => { if (!e.target.closest?.('[data-canvas-ui],[data-canvas-panel]')) { setPanel(null); setShapesPop(false) } }
    const onEsc = (e) => { if (e.key === 'Escape') { setPanel(null); setShapesPop(false) } }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onEsc) }
  }, [panel, shapesPop])

  const layerStyle = textured ? { backgroundColor: def.color, backgroundImage: (def.layers || []).join(',') } : { backgroundColor: 'var(--surface)' }
  const patternColor = textured ? (isDark(def.color) ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.13)') : (theme === 'dark' ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.13)')
  const patternUri = patternImage(pattern, patternColor)
  const invertDots = board === 'plain' && theme === 'dark'
  const iconBtn = (active) => `press relative inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-hover text-accent' : 'text-muted hover:bg-hover hover:text-fg'}`
  const top3 = presets.slice(0, 3)
  const shapeActive = DRAW_TOOLS.some((d) => d[0] === tool)

  return (
    <div ref={rootRef} className={`slate-canvas relative h-full w-full overflow-hidden ${textured ? 'board-textured' : ''} ${tool === 'freedraw' ? 'tool-freedraw' : ''} ${hasSel ? 'has-sel' : ''}`}>
      <div ref={layerRef} className="board-layer" style={layerStyle} />
      {page && <div ref={pageRef} className={`page-frame ${textured ? '' : 'page-plain'}`} aria-hidden="true" />}
      {patternUri && <div ref={patternRef} className="board-layer" style={{ backgroundImage: patternUri }} aria-hidden="true" />}
      <Excalidraw
        excalidrawAPI={onApi}
        initialData={initial}
        theme={theme === 'dark' ? 'dark' : 'light'}
        onChange={handleChange}
        onScrollChange={positionLayers}
        onPaste={() => {
          const api = apiRef.current
          if (api && api.getAppState().currentItemOpacity !== 100) {
            api.updateScene({ appState: { currentItemOpacity: 100 } })
            setTimeout(() => { if (api.getAppState().activeTool.type === 'freedraw') applyPen(penRef.current) }, 400)
          }
          return true
        }}
        UIOptions={{
          tools: { image: true },
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: true, toggleTheme: null, clearCanvas: true, changeViewBackgroundColor: true },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Heading>Sketch the idea behind this note</WelcomeScreen.Center.Heading>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>

      {/* Floating ribbon: select, three pen presets, eraser, shapes. Drag the grip to move it. */}
      <div ref={ribbonRef} data-canvas-ui role="toolbar" aria-label="Pen and tools" aria-orientation={vertical ? 'vertical' : 'horizontal'}
        className={`absolute z-10 flex items-center gap-0.5 rounded-2xl border border-line bg-card/90 p-1 shadow-[var(--shadow)] backdrop-blur-xl ${vertical ? 'flex-col' : 'flex-row'}`}
        style={{ left: ribLeft, top: ribTop, visibility: rootSize.w ? 'visible' : 'hidden' }}>
        <button type="button" onPointerDown={startRibbonDrag} aria-label="Move toolbar" title="Drag to move"
          className={`press inline-flex cursor-grab items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-fg active:cursor-grabbing ${vertical ? 'h-4 w-9' : 'h-9 w-4'}`}>
          <DotsSixVerticalIcon size={16} weight="bold" className={vertical ? 'rotate-90' : ''} />
        </button>
        <button type="button" onClick={() => setTool('selection')} aria-pressed={tool === 'selection'} aria-label="Select (V)" title="Select  V" className={iconBtn(tool === 'selection')}>
          <CursorIcon size={18} weight={tool === 'selection' ? 'fill' : 'regular'} />
        </button>
        {top3.map((p, i) => {
          const on = tool === 'freedraw' && pen.id === p.id
          const s = Math.max(5, Math.min(18, 4 + clampSize(p.size)))
          return (
            <button key={p.id} type="button" onClick={() => usePreset(i, true)} aria-pressed={on} aria-label={`${p.name} (Alt ${i + 1})`} title={`${p.name}  Alt ${i + 1}`} className={iconBtn(on)}>
              <span className={`rounded-full ${invertDots ? 'invert-dark' : ''}`} style={{ width: s, height: s, background: inkOf(p.color), opacity: Math.max(0.35, (p.opacity || 100) / 100), boxShadow: '0 0 0 1px var(--line)' }} />
            </button>
          )
        })}
        <button type="button" onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} aria-label="Eraser (E)" title="Eraser  E" className={iconBtn(tool === 'eraser')}>
          <EraserIcon size={18} weight={tool === 'eraser' ? 'fill' : 'regular'} />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setShapesPop((o) => !o)} aria-expanded={shapesPop} aria-label="Shapes" title="Shapes" className={iconBtn(shapesPop || shapeActive)}>
            <ShapesIcon size={18} weight={shapeActive ? 'fill' : 'regular'} />
          </button>
          {shapesPop && (
            <div data-canvas-panel className={`pop-in absolute z-20 w-56 rounded-2xl border border-line bg-card p-2 shadow-[var(--shadow)] ${vertical ? 'left-full top-0 ml-2' : ribbonBelow ? 'right-0 top-full mt-2' : 'bottom-full right-0 mb-2'}`}>
              <div className="grid grid-cols-4 gap-1">
                {DRAW_TOOLS.map(([type, label, key, I]) => (
                  <button key={type} type="button" onClick={() => setTool(type)} aria-pressed={tool === type} title={`${label}  ${key}`} aria-label={`${label} (${key})`}
                    className={`press flex aspect-square flex-col items-center justify-center rounded-lg ${tool === type ? 'bg-hover text-accent' : 'text-muted hover:bg-hover hover:text-fg'}`}>
                    <I size={18} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { setShapesPop(false); setPanel('shapes') }} className="press mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left body-6 text-fg hover:bg-hover">
                <StarIcon size={16} className="text-muted" />Shape library and icons
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Everything else lives behind one menu button in the corner */}
      <button type="button" data-canvas-ui onClick={() => togglePanel('menu')} aria-expanded={panel === 'menu'} aria-label="Canvas menu" title="Canvas menu"
        className={`press absolute left-3 z-10 inline-flex size-10 items-center justify-center rounded-xl border border-line bg-card/90 text-muted shadow-[var(--shadow)] backdrop-blur-xl hover:text-fg ${compact && hasSel ? 'bottom-20' : 'bottom-3'} ${panel === 'menu' ? 'text-accent' : ''}`}>
        <ListIcon size={20} />
      </button>

      {panel === 'menu' && (
        <div data-canvas-panel className={`${ui.panel} ${compact && hasSel ? 'bottom-32' : ''}`} role="dialog" aria-label="Canvas menu">
          <PanelHeader title="Canvas" onClose={() => setPanel(null)} />
          <p className="mb-1 mt-3 caption-3 uppercase tracking-wider text-subtle">Tools</p>
          <div className="grid grid-cols-6 gap-1">
            {[...MENU_TOOLS, ...DRAW_TOOLS.slice(0, 3)].map(([type, label, key, I]) => (
              <button key={type} type="button" onClick={() => setTool(type)} aria-pressed={tool === type} title={`${label}  ${key}`} aria-label={`${label} (${key})`}
                className={`press flex aspect-square items-center justify-center rounded-lg ${tool === type ? 'bg-hover text-accent' : 'text-muted hover:bg-hover hover:text-fg'}`}>
                <I size={18} />
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button type="button" onClick={undo} className="press inline-flex items-center justify-center gap-1 rounded-lg border border-line py-1 caption-1 text-fg hover:bg-hover"><ArrowCounterClockwiseIcon size={14} />Undo</button>
            <button type="button" onClick={redo} className="press inline-flex items-center justify-center gap-1 rounded-lg border border-line py-1 caption-1 text-fg hover:bg-hover"><ArrowClockwiseIcon size={14} />Redo</button>
            <div className="flex items-center justify-between rounded-lg border border-line">
              <button type="button" onClick={() => zoomTo(zoomPct / 100 / 1.2)} aria-label="Zoom out" className="press inline-flex size-7 items-center justify-center rounded-md text-muted hover:text-fg"><MinusIcon size={14} /></button>
              <button type="button" onClick={() => zoomTo(1)} title="Reset zoom" className="font-mono caption-5 text-fg">{zoomPct}%</button>
              <button type="button" onClick={() => zoomTo(zoomPct / 100 * 1.2)} aria-label="Zoom in" className="press inline-flex size-7 items-center justify-center rounded-md text-muted hover:text-fg"><PlusIcon size={14} /></button>
            </div>
          </div>

          <p className="mb-1 mt-3 caption-3 uppercase tracking-wider text-subtle">Background pattern</p>
          <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Background pattern">
            {Object.entries(PATTERNS).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={pattern === k} onClick={() => applyPattern(k)}
                className={`press flex flex-col items-center gap-1 rounded-lg border py-1 caption-5 ${pattern === k ? 'border-accent text-fg' : 'border-line text-muted hover:bg-hover'}`}>
                <span className="block size-6 rounded border border-line" style={{ backgroundImage: patternImage(k, theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)', 8) || 'none' }} />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-0.5 border-t border-line pt-2">
            {[
              [PenNibIcon, 'Pen size, color and presets', () => setPanel('pen')],
              [ShapesIcon, 'Shape library and icons', () => setPanel('shapes')],
              [TreeStructureIcon, 'Mermaid diagram', () => { setPanel(null); setMermaidOpen(true) }],
              [PaletteIcon, `Board theme: ${def.name}`, () => setPanel('board')],
              [ResizeIcon, `Canvas size: ${page ? (CANVAS_SIZES[page.preset]?.name || 'Custom size') : 'Infinite'}`, () => setPanel('size')],
              [GridFourIcon, snap ? 'Snap to grid: on' : 'Snap to grid: off', () => { const g = !snap; setSnap(g); apiRef.current?.updateScene({ appState: { gridModeEnabled: g } }) }],
              [ArrowsInIcon, page ? 'Fit page in view' : 'Zoom to fit drawing', () => { setPanel(null); zoomFit() }],
              [BooksIcon, 'Library', () => { setPanel(null); apiRef.current?.toggleSidebar({ name: 'default', tab: 'library' }) }],
              [ExportIcon, 'Export image (choose what, background, copy PNG)', openExportDialog],
              [vertical ? ArrowsHorizontalIcon : ArrowsVerticalIcon, vertical ? 'Toolbar: make horizontal' : 'Toolbar: make vertical', () => { const v = !vertical; setVertical(v); lsSet('slate-ribbon-vertical', v) }],
              [ArrowsOutCardinalIcon, 'Toolbar: move back to the top', () => { const p = { fx: 0.5, fy: 0.02 }; setRpos(p); lsSet('slate-ribbon', p) }],
            ].map(([I, label, fn]) => (
              <button key={label} type="button" onClick={fn} className="press flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left body-6 text-fg hover:bg-hover">
                <I size={16} className="shrink-0 text-muted" /><span className="min-w-0 truncate">{label}</span>
              </button>
            ))}
            {confirmClear ? (
              <div className="flex items-center gap-2 rounded-lg border border-line p-2">
                <span className="body-6 text-fg">Clear the whole canvas?</span>
                <button type="button" onClick={() => setConfirmClear(false)} className="press ml-auto rounded-md px-2 py-1 caption-1 text-muted hover:bg-hover">Keep</button>
                <button type="button" onClick={() => { setConfirmClear(false); apiRef.current?.updateScene({ elements: [], captureUpdate: CaptureUpdateAction.IMMEDIATELY }) }} className="press rounded-md px-2 py-1 caption-1 text-danger hover:bg-hover">Clear</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} className="press flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left body-6 text-danger hover:bg-hover"><TrashIcon size={16} />Clear canvas</button>
            )}
          </div>
        </div>
      )}

      {panel === 'pen' && (
        <PenPanel pen={pen} board={def} presets={presets} invert={invertDots} onClose={() => setPanel(null)}
          onChange={(p) => applyPen(p, { activate: tool === 'freedraw' || tool === 'selection', toSelection: true })}
          onPick={(i) => usePreset(i)}
          onSave={(name) => { const p = { ...pen, id: `p_${Date.now().toString(36)}`, name }; updatePresets([...presets, p]); setPen(p); onNotice?.(`Preset “${name}” saved`) }}
          onDelete={(id) => updatePresets(presets.filter((p) => p.id !== id))}
          onMove={(i, dir) => { const l = [...presets]; const j = i + dir; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; updatePresets(l) }}
          onReset={() => updatePresets(DEFAULT_PEN_PRESETS)} />
      )}

      {panel === 'size' && <SizePanel page={page} onClose={() => setPanel(null)} onApply={applySize} onFit={fitPage} />}

      {panel === 'shapes' && (
        <div data-canvas-panel className={ui.panel} role="dialog" aria-label="Shapes">
          <PanelHeader title="Shape library" onClose={() => setPanel(null)} />
          {[['Basic', (s) => !s.people && !s.diagram], ['People', (s) => s.people], ['Diagram icons', (s) => s.diagram]].map(([title, f]) => (
            <div key={title} className="mt-3">
              <p className="mb-2 caption-3 uppercase tracking-wider text-subtle">{title}</p>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(SHAPES).filter(([, s]) => f(s)).map(([k, s]) => (
                  <button key={k} type="button" onClick={() => insertShape(k)} title={s.label} aria-label={`Insert ${s.label.toLowerCase()}`}
                    className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-line text-muted hover:bg-hover hover:text-fg">
                    <s.icon size={22} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-3 caption-5 text-subtle">Shapes appear in the middle of your view, grouped and ready to move.</p>
        </div>
      )}

      {panel === 'board' && (
        <div data-canvas-panel className={ui.panel} role="dialog" aria-label="Board theme">
          <PanelHeader title="Board theme" onClose={() => setPanel(null)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(BOARDS).map(([k, b]) => (
              <button key={k} type="button" onClick={() => applyBoard(k)} aria-pressed={board === k}
                className={`press overflow-hidden rounded-xl border p-1 text-left ${board === k ? 'border-accent' : 'border-line hover:border-subtle'}`}>
                <span className="relative block h-12 overflow-hidden rounded-lg border border-line"
                  style={b.color ? { backgroundColor: b.color, backgroundImage: (b.layers || []).join(',') } : { background: 'var(--card)' }}>
                  <svg viewBox="0 0 100 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
                    <path d="M12 26c8-10 16-10 22 0s14 8 20-2" fill="none" stroke={b.color ? b.ink : 'var(--fg)'} strokeWidth="2.5" strokeLinecap="round" />
                    <rect x="62" y="10" width="26" height="18" rx="3" fill="none" stroke={b.palette[1]} strokeWidth="2" />
                  </svg>
                </span>
                <span className="flex items-center gap-1 px-1 pt-1 title-5 text-fg">{board === k && <CheckIcon size={12} className="text-accent" />}{b.name}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 caption-5 text-muted">{def.note}</p>
        </div>
      )}

      {mermaidOpen && <MermaidModal theme={theme} onClose={() => setMermaidOpen(false)} onInsert={insertMermaid} />}
    </div>
  )
}
export default memo(CanvasBoard, (a, b) => a.theme === b.theme && a.focus?.n === b.focus?.n
  && JSON.stringify(a.frameNames || {}) === JSON.stringify(b.frameNames || {}))

function PenPanel({ pen, board, presets, invert, onChange, onPick, onSave, onDelete, onMove, onReset, onClose }) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const swatches = ['ink', ...board.palette.filter((c) => c !== board.ink)]
  const size = clampSize(pen.size)
  return (
    <div data-canvas-panel className={`${ui.panel} ${invert ? 'swatch-invert' : ''}`} role="dialog" aria-label="Pen">
      <PanelHeader title="Pen" onClose={onClose} />
      <p className="mb-2 mt-3 caption-3 uppercase tracking-wider text-subtle">Presets <span className="normal-case tracking-normal text-subtle">· the first three sit on the toolbar</span></p>
      <ul className="space-y-0.5">
        {presets.map((p, i) => (
          <li key={p.id} className="group flex items-center gap-1">
            <button type="button" onClick={() => onPick(i)} aria-pressed={pen.id === p.id}
              className={`press flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 text-left ${pen.id === p.id ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg'}`}>
              <span className="flex size-6 shrink-0 items-center justify-center">
                <span className="sw rounded-full" style={{ background: p.color === 'ink' ? board.ink : p.color, width: Math.max(3, Math.min(22, clampSize(p.size))), height: Math.max(3, Math.min(22, clampSize(p.size))), opacity: (p.opacity || 100) / 100, boxShadow: '0 0 0 1px var(--line)' }} />
              </span>
              <span className="min-w-0 flex-1 truncate body-6">{p.name}</span>
              <span className="font-mono caption-5 text-subtle">{clampSize(p.size)}px</span>
              {i < 9 && <kbd className="rounded border border-line px-1 font-mono caption-5 text-subtle">Alt {i + 1}</kbd>}
            </button>
            <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} up`}
              className="press inline-flex size-6 items-center justify-center rounded-md text-subtle opacity-0 hover:bg-hover hover:text-fg focus:opacity-100 disabled:hidden group-hover:opacity-100"><ArrowUpIcon size={12} /></button>
            {presets.length > 1 && (
              <button type="button" onClick={() => onDelete(p.id)} aria-label={`Delete preset ${p.name}`}
                className="press inline-flex size-6 items-center justify-center rounded-md text-subtle opacity-0 hover:bg-hover hover:text-danger focus:opacity-100 group-hover:opacity-100"><TrashIcon size={14} /></button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-3 border-t border-line pt-3">
        <label className="block">
          <span className="flex items-center justify-between caption-1 text-fg">Size<span className="font-mono caption-5 text-muted">{size}px at 100% zoom</span></span>
          <input type="range" min="0.5" max="48" step="0.5" value={size} onChange={(e) => onChange({ ...pen, size: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" aria-label="Pen size" />
          <span className="mt-1 flex h-6 items-center justify-center rounded-lg bg-surface">
            <span className="sw rounded-full" style={{ width: '70%', height: Math.max(1, Math.min(24, size)), background: pen.color === 'ink' ? board.ink : pen.color, opacity: (pen.opacity || 100) / 100 }} />
          </span>
        </label>
        <label className="block">
          <span className="flex items-center justify-between caption-1 text-fg">Opacity<span className="font-mono caption-5 text-muted">{pen.opacity || 100}%</span></span>
          <input type="range" min="10" max="100" step="5" value={pen.opacity || 100} onChange={(e) => onChange({ ...pen, opacity: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" aria-label="Pen opacity" />
        </label>
        <div>
          <span className="caption-1 text-fg">Color</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {swatches.map((c) => (
              <button key={c} type="button" onClick={() => onChange({ ...pen, color: c })} aria-label={c === 'ink' ? 'Board ink' : `Color ${c}`} aria-pressed={pen.color === c}
                className={`press size-7 rounded-full border-2 p-0.5 ${pen.color === c ? 'border-accent' : 'border-transparent'}`}>
                <span className="sw block size-full rounded-full border border-black/10" style={{ background: c === 'ink' ? board.ink : c }} />
              </button>
            ))}
            <label className="press relative size-7 cursor-pointer overflow-hidden rounded-full border border-line" title="Custom color">
              <span className="sr-only">Custom color</span>
              <input type="color" value={pen.color?.startsWith('#') ? pen.color : board.ink} onChange={(e) => onChange({ ...pen, color: e.target.value })} className="absolute -inset-2 size-12 cursor-pointer" />
            </label>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        {naming ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onSave(name.trim()); setName(''); setNaming(false) } }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name" aria-label="Preset name"
              className="min-w-0 flex-1 rounded-lg border border-line bg-input px-2 py-1 body-6 text-fg focus:border-accent focus:outline-none" />
            <button type="submit" disabled={!name.trim()} className="press rounded-lg bg-accent px-3 py-1 button-sm text-accent-fg disabled:opacity-50">Save</button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setNaming(true)} className="press inline-flex items-center gap-1 rounded-lg px-2 py-1 button-sm text-accent hover:bg-hover"><PlusIcon size={14} />Save as preset</button>
            <button type="button" onClick={onReset} className="press inline-flex items-center gap-1 rounded-lg px-2 py-1 caption-1 text-muted hover:bg-hover hover:text-fg"><ArrowCounterClockwiseIcon size={14} />Reset</button>
          </div>
        )}
        <p className="mt-2 caption-5 text-subtle">Size changes also apply to selected strokes. Use [ and ] to resize while drawing, Alt 1 to 9 to switch presets.</p>
      </div>
    </div>
  )
}

function SizePanel({ page, onApply, onFit, onClose }) {
  const [w, setW] = useState(page?.w || 1200)
  const [h, setH] = useState(page?.h || 800)
  const current = page ? page.preset : 'infinite'
  return (
    <div data-canvas-panel className={ui.panel} role="dialog" aria-label="Canvas size">
      <PanelHeader title="Canvas size" onClose={onClose} />
      <div className="mt-3 space-y-0.5">
        {Object.entries(CANVAS_SIZES).filter(([k]) => k !== 'custom').map(([k, s]) => (
          <button key={k} type="button" onClick={() => onApply(k)} aria-pressed={current === k}
            className={`press flex w-full items-center justify-between rounded-lg px-2 py-2 text-left body-6 ${current === k ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg'}`}>
            <span className="flex items-center gap-2">{current === k && <CheckIcon size={14} className="text-accent" />}{s.name}</span>
            {s.w && <span className="font-mono caption-5 text-subtle">{s.w} × {s.h}</span>}
          </button>
        ))}
      </div>
      <form className="mt-3 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); onApply('custom', { w: Number(w), h: Number(h) }) }}>
        <p className="caption-1 text-fg">Custom size {current === 'custom' && <CheckIcon size={12} className="inline text-accent" />}</p>
        <div className="mt-2 flex items-center gap-2">
          <input type="number" min="100" max="10000" value={w} onChange={(e) => setW(e.target.value)} aria-label="Width in pixels" className="w-20 rounded-lg border border-line bg-input px-2 py-1 font-mono caption-4 text-fg" />
          <span className="caption-2 text-muted">×</span>
          <input type="number" min="100" max="10000" value={h} onChange={(e) => setH(e.target.value)} aria-label="Height in pixels" className="w-20 rounded-lg border border-line bg-input px-2 py-1 font-mono caption-4 text-fg" />
          <button type="submit" disabled={!(w >= 100 && h >= 100)} className="press ml-auto rounded-lg bg-accent px-3 py-1 button-sm text-accent-fg disabled:opacity-50">Apply</button>
        </div>
      </form>
      {page && <button type="button" onClick={onFit} className="press mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 button-sm text-fg hover:bg-hover"><ArrowsInIcon size={16} />Fit page in view</button>}
      <p className="mt-3 caption-5 text-subtle">A sized canvas shows a page and exports exactly that area. Anything outside the page stays editable but is left out of exports.</p>
    </div>
  )
}

function PanelHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="title-4 text-fg">{title}</h3>
      <button type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} className="press inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg"><XIcon size={16} /></button>
    </div>
  )
}

/* ================================================================== */
/* Mermaid modal                                                       */
/* ================================================================== */
function MermaidModal({ theme, onClose, onInsert }) {
  const [tpl, setTpl] = useState('Flowchart')
  const [code, setCode] = useState(TEMPLATES.Flowchart)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rendering, setRendering] = useState(true)

  useEffect(() => {
    let alive = true
    setRendering(true)
    const t = setTimeout(async () => {
      try { const out = await renderMermaid(code, theme); if (alive) { setSvg(out); setError('') } } catch (e) {
        if (alive) setError((e?.message || 'The diagram could not be parsed.').split('\n').slice(0, 3).join(' '))
      }
      if (alive) setRendering(false)
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [code, theme])

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const insert = async () => {
    setBusy(true)
    try { await onInsert(code); onClose() } catch (e) {
      setError(`Insert failed. ${(e?.message || 'The diagram type may not be supported.').split('\n')[0]}`)
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fade-in absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="mmd-title" className="pop-in relative flex max-h-[calc(100dvh-32px)] w-full max-w-5xl flex-col rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow)] sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="mmd-title" className="title-2 mr-auto text-fg">Mermaid diagram</h2>
          <label className="flex items-center gap-2 caption-1 text-muted">Template
            <select value={tpl} onChange={(e) => { setTpl(e.target.value); setCode(TEMPLATES[e.target.value]) }} className="press h-8 rounded-lg border border-line bg-input px-2 caption-1 text-fg">
              {Object.keys(TEMPLATES).map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <button type="button" onClick={onClose} aria-label="Close" className="press inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg"><XIcon size={18} /></button>
        </div>
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          <div className="cm-mono h-64 overflow-hidden rounded-xl border border-line bg-input md:h-96">
            <CodeMirror value={code} onChange={setCode} theme={theme === 'dark' ? 'dark' : 'light'} height="100%" aria-label="Mermaid code"
              basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }} />
          </div>
          <div className="mermaid-preview mermaid-fit relative h-64 overflow-auto rounded-xl border border-line bg-surface p-4 md:h-96" aria-live="polite">
            {rendering && !svg ? <div className="skeleton h-3/4 w-3/4 rounded-lg" /> : svg ? <div className={error ? 'opacity-40' : ''} dangerouslySetInnerHTML={{ __html: svg }} /> : null}
          </div>
        </div>
        <div className="mt-3 min-h-5">{error && <p role="alert" className="flex items-start gap-2 body-6 text-danger"><WarningIcon size={16} className="mt-0.5 shrink-0" />{error}</p>}</div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto caption-5 text-subtle">Flowchart, sequence and class diagrams become editable shapes. Other types are inserted as an image.</p>
          <button type="button" onClick={onClose} className="press rounded-lg px-3 py-2 button-sm text-muted hover:bg-hover hover:text-fg">Cancel</button>
          <button type="button" onClick={insert} disabled={busy || !!error || !code.trim()} className="press inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 button-md text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? 'Inserting' : 'Insert into canvas'}
          </button>
        </div>
      </div>
    </div>
  )
}
