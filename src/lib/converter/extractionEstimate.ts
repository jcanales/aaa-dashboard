// Drives the upload progress bar's ETA. Extraction is a single opaque Claude call
// with no progress signal, so we estimate its duration from how long recent
// extractions actually took (per-browser, localStorage) and fall back to a flat
// default until there's enough history to trust an average.

export const EXTRACTION_DURATIONS_KEY = 'converter.extractionDurations'
export const DEFAULT_ESTIMATE_MS = 120_000 // ~2 min for a typical multi-page invoice
export const MAX_SAMPLES = 10
const MIN_SAMPLES_TO_TRUST = 2

function readSamples(): number[] {
  try {
    const raw = localStorage.getItem(EXTRACTION_DURATIONS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
  } catch {
    return []
  }
}

export function getEstimateMs(): number {
  const samples = readSamples()
  if (samples.length < MIN_SAMPLES_TO_TRUST) return DEFAULT_ESTIMATE_MS
  return Math.round(samples.reduce((sum, n) => sum + n, 0) / samples.length)
}

export function recordDurationMs(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return
  try {
    const next = [...readSamples(), ms].slice(-MAX_SAMPLES)
    localStorage.setItem(EXTRACTION_DURATIONS_KEY, JSON.stringify(next))
  } catch {
    // private mode / quota — the default estimate is a fine fallback
  }
}
