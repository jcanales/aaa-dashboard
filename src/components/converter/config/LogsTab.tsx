import { useState } from 'react'
import { Activity, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { useConversionLogs } from '@/hooks/converter/useConversionLogs'
import type { ConversionLog } from '@/types/converter/config.types'

const PAGE_SIZE_OPTIONS = [25, 50, 100]

const MODEL_LABEL: Record<string, string> = {
  'claude-sonnet-5': 'Sonnet 5',
  'claude-opus-5': 'Opus 5 (new layout)',
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtUsd(n: number | null): string {
  if (n === null) return '—'
  return n === 0 ? '$0.00' : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`
}

function SourceBadge({ log }: { log: ConversionLog }) {
  if (log.extractionModel) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
        {MODEL_LABEL[log.extractionModel] ?? log.extractionModel}
      </span>
    )
  }
  // extractionModel is only null for a genuine deterministic-template parse OR a
  // conversion processed before token tracking existed — parseSource:'ai' with no
  // model recorded means the latter, not an actual template.
  if (log.parseSource === 'ai') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">AI (untracked)</span>
  }
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">template ({log.parseSource ?? '—'})</span>
}

function StatusPill({ status, title }: { status: string; title?: string | null }) {
  const style =
    status === 'failed'
      ? 'bg-red-100 text-red-700'
      : status === 'processing'
        ? 'bg-blue-100 text-blue-700'
        : status === 'generated'
          ? 'bg-green-100 text-green-700'
          : 'bg-slate-100 text-slate-500'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style}`} title={title ?? undefined}>
      {status}
    </span>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export function LogsTab() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { rows, total, stats, isLoading, error } = useConversionLogs({ page, pageSize, from: from || undefined, to: to || undefined })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function applyFilter() {
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Documents processed" value={fmtInt(stats?.totalDocuments ?? 0)} />
        <KpiCard
          label="AI tokens (in / out)"
          value={fmtInt((stats?.totalTokensIn ?? 0) + (stats?.totalTokensOut ?? 0))}
          sub={`${fmtInt(stats?.totalTokensIn ?? 0)} in · ${fmtInt(stats?.totalTokensOut ?? 0)} out`}
        />
        <KpiCard label="Estimated AI cost" value={fmtUsd(stats?.totalEstimatedCostUsd ?? 0)} sub="Sonnet 5 / Opus 5 rates" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <ScrollText className="h-3.5 w-3.5 text-slate-400" /> Processing log
            </p>
            <p className="text-xs text-slate-400">One row per uploaded document — extraction source, tokens, and estimated AI cost.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); applyFilter() }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <label className="text-xs text-slate-500">To</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => { setTo(e.target.value); applyFilter() }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {(from || to) && (
              <button
                onClick={() => { setFrom(''); setTo(''); applyFilter() }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {error && <div className="mx-4 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_theme(colors.slate.100)]">
              <tr className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="px-4 py-2">Uploaded</th>
                <th className="px-3 py-2">Filename</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2 text-right">Tokens in</th>
                <th className="px-3 py-2 text-right">Tokens out</th>
                <th className="px-3 py-2 text-right">Est. cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-2.5"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <Activity className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                    No processed documents in this range.
                  </td>
                </tr>
              ) : (
                rows.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[220px] truncate" title={log.pdfFilename}>{log.pdfFilename}</td>
                    <td className="px-3 py-2.5"><StatusPill status={log.status} title={log.extractionError} /></td>
                    <td className="px-3 py-2.5"><SourceBadge log={log} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {log.extractionDurationMs != null ? `${(log.extractionDurationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{log.tokensIn != null ? fmtInt(log.tokensIn) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{log.tokensOut != null ? fmtInt(log.tokensOut) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-700">{fmtUsd(log.estimatedCostUsd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              {total === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} of {fmtInt(total)}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
              </button>
              <span className="text-xs text-slate-600 font-medium min-w-[48px] text-center">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
