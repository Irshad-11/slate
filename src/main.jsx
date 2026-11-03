import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App.jsx'

// Canvas fonts are served next to the app, with the public CDN as a fallback
window.EXCALIDRAW_ASSET_PATH = [new URL('./excalidraw-assets/', document.baseURI).href, 'https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/']

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
