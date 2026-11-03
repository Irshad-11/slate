# Slate

A private workspace for markdown notes, PDFs and an infinite whiteboard canvas, side by side. Built for one owner and opened with one access key.

![version](https://img.shields.io/badge/version-1.2.0-4f46e5) ![react](https://img.shields.io/badge/React-18-61dafb) ![vite](https://img.shields.io/badge/Vite-8-646cff) ![supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20db%20%2B%20storage-3ecf8e)

---

## What it does

- **Notes in markdown** with a live preview editor. Formatting shows as you type, and the raw syntax appears only on the line you are editing.
- **Infinite canvas** next to your text, powered by Excalidraw: shapes, arrows, text, freehand pen, images, mermaid diagrams.
- **Document canvas.** Link any heading to its own area on one shared canvas. Click the heading and the canvas jumps to that area.
- **PDF reader.** Upload a PDF, read it on the left and sketch on the canvas on the right.
- **Pen presets** with real pixel sizes, keyboard shortcuts and a floating toolbar you can drag anywhere.
- **Board themes and patterns**: chalkboard, blackboard, blueprint, ruled paper, graph paper, kraft, midnight, plus dot, line or grid patterns.
- **Export** to PDF, Markdown, PNG and SVG.
- **Private by setup.** Your data lives in your own Supabase project, protected by row level security. There are no sign ups and no analytics.

---

## How to use it

### Signing in
Open the app, paste your access key and press **Open workspace**. The session stays signed in until you press **Sign out** in the sidebar.

### Dashboard
- **New note** starts a blank note. The **PDF** button next to it uploads a PDF as a new note.
- **Categories** group your notes. Use **+** to add one, and the **⋯** menu to rename, recolor, reorder or delete it.
- **Pinned**, **All notes** and **Trash** live in the sidebar. Notes in trash can be restored or deleted forever.
- Search with **Ctrl/Cmd + K**. You can filter by tag, sort the list, and switch between grid and list view.

### The editor
The top bar has three views:

| View | What you see |
|---|---|
| **Document** | Only the text (or the PDF) |
| **Both** | Text or PDF on the left, canvas on the right. Drag the divider to resize. |
| **Canvas** | The canvas at full width |

**Writing.** Type markdown as usual. Use `#` for headings, `-` for lists, `- [ ]` for tasks, `|` for tables, and fenced code blocks. The toolbar inserts everything for you, including:
- **Drawing pad**: a small freehand sketch area inside the text
- **Mermaid block**: a diagram written as text
- **Image**: you can also just paste (Ctrl/Cmd + V) or drop an image anywhere in the text
- **Link canvas to this heading**: gives the heading its own area on the document canvas

If the editor ever feels stuck after a diagram or table, click in the empty space below the text to get a new line.

**Canvases.** Every note has two:
- **Free canvas**: a space for anything
- **Document canvas**: one area (frame) per linked heading. In **Both** view, set the selector to *Document canvas, follow headings* and the canvas moves to the heading at your cursor. A heading without an area shows an **Add area** button.

**PDFs.** Use **Attach PDF** on any note, or the PDF button on the dashboard. Switch between **PDF** and **Notes** with the tabs above the document. The PDF reader has zoom, fit width and a dark page mode for night reading.

### Drawing on the canvas
The **floating toolbar** holds Select, your first three pen presets, the Eraser and Shapes. Drag the grip (⠿) to move it anywhere, and it remembers its position.

The **menu button** in the bottom left corner holds everything else:
- undo, redo and zoom
- background pattern
- pen settings, shape library and mermaid diagrams
- board theme and canvas size (infinite, A4, Letter, 16:9, square or custom)
- snap to grid, library, export image, and clear canvas

**Pen presets.** Open *Pen size, color and presets* from the menu. You can set size (in pixels), opacity and color, save a preset, reorder presets or delete them. The first three presets appear on the floating toolbar.

### Export
The **Export** button in the top bar offers:
- **PDF**: document only, canvas only, or the document with each heading's canvas area placed under it. Table of contents and A4 or Letter page size are optional.
- **Markdown**: clean text. Images become private links that work for 7 days.
- **PNG / SVG**: the canvas you are looking at. A sized canvas exports exactly its page.

For a quick image of selected shapes, use **Export image** in the canvas menu (or **Ctrl/Cmd + Shift + E**). It can include or drop the background, and it can download the image or copy it as PNG.

### Settings
Open with **Ctrl/Cmd + ,** or the gear icon. Here you can:
- switch the editor between **Live preview** and **Write and Read** mode
- see every keyboard shortcut
- **find and delete unused files**. Images and PDFs you removed from notes stay in storage until you clean them here.

### Keyboard shortcuts

| Where | Keys | Action |
|---|---|---|
| Everywhere | Ctrl/Cmd + K | Search notes |
| | Ctrl/Cmd + , | Settings |
| | Ctrl/Cmd + S | Save now (autosave also runs after 0.8 s) |
| Document | Ctrl/Cmd + B / I | Bold / italic |
| | Ctrl/Cmd + V | Paste text or an image |
| Canvas | V, H, P, E | Select, hand, pen, eraser |
| | R, O, D, A, L, T, 9, F | Rectangle, ellipse, diamond, arrow, line, text, image, frame |
| | Alt + 1 … 9 | Pen preset 1 to 9 |
| | Shift + P | Next pen preset |
| | [ and ] | Pen smaller / larger (add Shift for bigger steps) |
| | Ctrl/Cmd + Shift + E | Export image dialog |

---

## Setup

### Requirements
- Node.js 20 or newer
- A free [Supabase](https://supabase.com) account

### 1. Get the code
```bash
git clone https://github.com/Irshad-11/slate.git
cd slate
npm install
```

### 2. Create the Supabase project
1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole content of [`supabase.sql`](./supabase.sql) and press **Run**. This creates:
   - the `categories` and `notes` tables, with row level security so only you can read or write them
   - a private storage bucket `slate-images` for images and PDFs

### 3. Create your owner account (your access key)
1. Go to **Authentication → Users → Add user → Create new user**.
2. Enter your email. For the password, use a **long random string (24+ characters)**. This password is your **access key**.
3. Tick **Auto Confirm User** so no confirmation email is needed.
4. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". Now nobody else can create an account.

> Keep the key in a password manager. Never put it in code, `.env` files or the repo.

### 4. Add your environment values
```bash
cp .env.example .env
```
Then fill in `.env`:
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_OWNER_EMAIL=the-email-you-used-in-step-3
```
You can find the URL and anon key under **Project Settings → API** (the anon key is safe for the browser, because row level security protects your data). `.env` should stay out of git; add it to `.gitignore` if it isn't already.

### 5. Run it
```bash
npm run dev
```
Open the printed URL, paste your access key and press **Open workspace**.

### 6. Deploy (optional)
```bash
npm run build
```
This creates a static site in `dist/` with relative paths and hash routing, so it works on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, or a plain web server). Set the same three `VITE_` variables in your host's environment settings before building there.

---

## Project structure

```
slate/
├── index.html          App shell, meta tags, favicon
├── vite.config.js      Vite, Tailwind, ships canvas fonts with the build
├── supabase.sql        Tables, row level security, storage bucket
├── .env.example        Environment template
└── src/
    ├── main.jsx        Entry point
    ├── index.css       Design tokens, text styles, light and dark themes
    ├── lib.js          Supabase client, auth, data and storage helpers
    ├── App.jsx         Gate page, dashboard, settings, routing
    ├── Editor.jsx      Editor, live preview, PDF reader, drawing pads, export
    └── Canvas.jsx      Excalidraw canvas, toolbar, pen presets, boards, shapes
```

**Built with** React, Vite, Tailwind CSS v4, Supabase, Excalidraw, CodeMirror 6, react-markdown, Mermaid, pdf.js, html2pdf.js, Phosphor Icons and the Geist font.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "That key is not valid" | Check that `VITE_OWNER_EMAIL` matches the user exactly, and that the user is confirmed. |
| "Slate is not connected yet" | `.env` is missing or incomplete. Restart `npm run dev` after editing it. |
| Image or PDF upload fails, or a PDF note cannot be saved | Make sure the whole `supabase.sql` ran without errors in step 2. |
| Canvas text in Chinese, Japanese or Korean looks off offline | That one font loads from a public CDN; the others ship with the app. |

## Known limitations
- Only one owner account. There is no sharing or realtime sync between two open tabs (the last save wins).
- Text in the PDF reader cannot be selected.
- Exported PDFs are rendered as images, so their text is not selectable.
- Board textures and background patterns export as a flat color.