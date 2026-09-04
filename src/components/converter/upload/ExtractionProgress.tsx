import { useEffect, useState } from 'react'

interface ExtractionProgressProps {
  /** Date.now() when the upload/extraction started. */
  startedAt: number
  /** Estimated total duration, from extractionEstimate.getEstimateMs(). */
  estimateMs: number
  state: 'pending' | 'done' | 'error'
}

const TICK_MS = 500
const PENDING_CAP = 95

function formatEta(remainingMs: number): string {
  const secs = Math.ceil(remainingMs / 1000)
  if (secs < 60) return `~${secs}s left`
  return `~${Math.ceil(secs / 60)}m left`
}

export function ExtractionProgress({ startedAt, estimateMs, state }: ExtractionProgressProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (state !== 'pending') return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [state])

  if (state === 'error') return null

  const elapsed = Math.max(0, now - startedAt)
  const rawPct = estimateMs > 0 ? (100 * elapsed) / estimateMs : 0
  const pct = state === 'done' ? 100 : Math.min(PENDING_CAP, Math.round(rawPct))
  const remainingMs = estimateMs - elapsed
  const eta = state === 'done' ? 'Done' : remainingMs > 0 ? formatEta(remainingMs) : 'Almost done…'

  return (
    <div className="flex w-48 flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Extracting line items…</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right text-xs text-muted-foreground">{eta}</span>
    </div>
  )
}
