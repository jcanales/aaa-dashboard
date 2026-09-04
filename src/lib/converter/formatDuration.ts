// Formats a wall-clock duration (milliseconds) for display in the Files
// converted / operation member grids. Sub-second durations show as "N ms" so
// deterministic-parse invoices (which finish in well under a second) don't
// all collapse to "0.0s".
export function formatExtractionDuration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
