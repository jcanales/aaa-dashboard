import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
// pdfjs-dist v5+'s worker is ESM-only. A plain `?url` import (used pre-v5) makes
// pdfjs construct `new Worker(url, { type: 'module' })` itself, which Vite's dev
// server fails to serve correctly (the browser parses it as a classic script and
// throws "Cannot use import statement outside a module", then pdfjs's fake-worker
// fallback breaks too). `?worker` is Vite's own worker-import primitive — it
// handles ESM module workers correctly in both dev and the production bundle.
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { apiGetBlob } from '@/api/converterApi'

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

export interface PdfViewerHandle {
  /** Scroll so the given PDF point (page, y-from-top in PDF units) sits near the top. */
  scrollToAnchor: (page: number, y: number) => void
}

interface PdfViewerProps {
  conversionId: string
  /** Blob endpoint for the PDF. Defaults to the single-conversion path. */
  src?: string
}

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3]

// Renders every page of the conversion's stored PDF to a canvas in a scrollable
// column, with zoom. Exposes scrollToAnchor so the review page can jump to a line.
export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer({ conversionId, src }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null)
  // pageTops[i] = px offset of page i's top; pageScales[i] = PDF y → px factor.
  const pageTops = useRef<number[]>([])
  const pageScales = useRef<number[]>([])
  const generation = useRef(0)
  const lastWheelZoom = useRef(0)
  const [zoomIdx, setZoomIdx] = useState(1) // → ZOOM_STEPS[1] = 1.0
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    scrollToAnchor: (page, y) => {
      const container = scrollRef.current
      const top = pageTops.current[page - 1]
      const scale = pageScales.current[page - 1]
      if (!container || top == null || scale == null) return
      container.scrollTo({ top: Math.max(0, top + y * scale - 24), behavior: 'smooth' })
    },
  }))

  // Load the document once per conversion.
  useEffect(() => {
    const myGen = ++generation.current
    setState('loading')
    setError(null)
    docRef.current = null
    ;(async () => {
      try {
        const path = src ?? `/conversions/${conversionId}/pdf`
        const buf = await (await apiGetBlob(path)).arrayBuffer()
        if (generation.current !== myGen) return
        // isEvalSupported no longer exists as of pdfjs-dist v5 — the eval-based
        // code path it used to gate (CVE-2024-4367) was removed upstream instead.
        docRef.current = await pdfjs.getDocument({ data: buf }).promise
        if (generation.current !== myGen) return
        setState('ready')
      } catch (err) {
        if (generation.current === myGen) {
          setError(err instanceof Error ? err.message : 'Could not load the PDF')
          setState('error')
        }
      }
    })()
    return () => {
      generation.current++
    }
  }, [conversionId, src])

  // Ctrl/Cmd + wheel zooms the PDF (like a native viewer) instead of scrolling
  // the page. Throttled so a trackpad's event storm steps one stop at a time.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const now = Date.now()
      if (now - lastWheelZoom.current < 90) return
      lastWheelZoom.current = now
      const dir = e.deltaY < 0 ? 1 : -1
      setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir)))
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  // (Re)render all pages whenever the doc is ready or the zoom changes.
  useEffect(() => {
    if (state !== 'ready') return
    const doc = docRef.current
    const host = pagesRef.current
    if (!doc || !host) return

    let cancelled = false
    const zoom = ZOOM_STEPS[zoomIdx]
    host.replaceChildren()
    pageTops.current = []
    pageScales.current = []

    ;(async () => {
      const baseWidth = Math.max(240, (scrollRef.current?.clientWidth ?? 420) - 16)
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n)
        if (cancelled) return
        const scale = (baseWidth / page.getViewport({ scale: 1 }).width) * zoom
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.className = 'mx-auto mb-2 rounded border border-slate-200 bg-white shadow-sm'
        host.appendChild(canvas)
        pageTops.current[n - 1] = canvas.offsetTop
        pageScales.current[n - 1] = scale
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
        if (cancelled) return
      }
    })()

    return () => {
      cancelled = true
    }
  }, [state, zoomIdx])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-2 py-1">
        <span className="text-xs text-muted-foreground">
          {state === 'loading' ? 'Loading PDF…' : state === 'error' ? (error ?? 'PDF error') : 'Invoice'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
            disabled={zoomIdx === 0 || state !== 'ready'}
            aria-label="Zoom out"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span
            className="w-10 text-center text-xs tabular-nums text-slate-600"
            title="Ctrl/⌘ + scroll to zoom"
          >
            {Math.round(ZOOM_STEPS[zoomIdx] * 100)}%
          </span>
          <button
            onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIdx === ZOOM_STEPS.length - 1 || state !== 'ready'}
            aria-label="Zoom in"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-2">
        {state === 'error' && <p className="p-3 text-xs text-destructive">{error}</p>}
        <div ref={pagesRef} />
      </div>
    </div>
  )
})
