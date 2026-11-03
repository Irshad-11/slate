import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Ship Excalidraw's canvas fonts with the app (CJK font stays on the CDN fallback, it is 13 MB)
const FONT_DIR = resolve('node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const listFonts = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? (f === 'Xiaolai' ? [] : listFonts(p)) : [p]
})
const excalidrawFonts = () => ({
  name: 'slate-excalidraw-fonts',
  configureServer(server) {
    server.middlewares.use('/excalidraw-assets/fonts', (req, res, next) => {
      const p = resolve(FONT_DIR, '.' + decodeURIComponent(req.url.split('?')[0]))
      if (!p.startsWith(FONT_DIR + sep)) return next()
      try { res.setHeader('Content-Type', 'font/woff2'); res.end(readFileSync(p)) } catch { next() }
    })
  },
  generateBundle() {
    for (const p of listFonts(FONT_DIR)) {
      this.emitFile({ type: 'asset', fileName: `excalidraw-assets/fonts/${relative(FONT_DIR, p).split(sep).join('/')}`, source: readFileSync(p) })
    }
  },
})

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), excalidrawFonts()],
  define: { 'process.env.IS_PREACT': JSON.stringify('false'), __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { chunkSizeWarningLimit: 4000 },
})
