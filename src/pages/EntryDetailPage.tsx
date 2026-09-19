// Full single-entry summary — header, duty composition by bucket, and the
// line-item breakdown (see backend/src/api/routes/entries.ts's GET /:recid
// for how a line's entered value and its chapter-99 duty programs are tied
// together). Linked to from any entries grid in the app via recid.
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, DollarSign, Landmark, Percent, Hash, AlertCircle, FileText } from 'lucide-react'
import { Sk, KpiCardSkeleton, TableRowsSkeleton } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Dialog'
import { formatUSD } from '@/utils/formatUtils'
import { fetchEntryDetail, fetchEntryCbp7501, type EntryDetail } from '@/api/entriesApi'
import { formatHts } from '@/pages/DutiesBreakdownPage'
import { generateEntry7501PdfBlob } from '@/utils/entry7501Pdf'
import { motLabel, entryTypeLabel } from '@/utils/cbpCodes'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'MMM d, yyyy') } catch { return '—' }
}
function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'MMM d, yyyy, HH:mm') } catch { return '—' }
}

function status(entry: EntryDetail): { label: string; color: string } {
  if (entry.liqDate) return { label: 'Liquidated', color: 'bg-teal-100 text-teal-700' }
  if (entry.relDate) return { label: 'Released', color: 'bg-emerald-100 text-emerald-700' }
  return { label: 'Pending', color: 'bg-amber-100 text-amber-700' }
}

function KpiTile({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
      <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50 text-teal-700">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-kpi-label mb-1">{label}</p>
        <p className="text-kpi-value text-slate-800">{value}</p>
        {sub && <p className="text-comparison-delta mt-1">{sub}</p>}
      </div>
    </div>
  )
}

const BUCKET_LABELS: { key: 'regularDuty' | 'sec301' | 'sec232' | 'ieepa' | 'other99'; label: string; color: string }[] = [
  { key: 'regularDuty', label: 'Regular',           color: '#0f766e' },
  { key: 'sec301',      label: 'Section 301',       color: '#f59e0b' },
  { key: 'sec232',      label: 'Section 232',       color: '#6366f1' },
  { key: 'ieepa',       label: 'IEEPA / Reciprocal', color: '#dc2626' },
  { key: 'other99',     label: 'Other Ch-99',       color: '#94a3b8' },
]

export function EntryDetailPage() {
  const { recid } = useParams<{ recid: string }>()
  const navigate = useNavigate()

  const [entry, setEntry] = useState<EntryDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    if (!recid) return
    setLoading(true)
    setError(null)
    fetchEntryDetail(recid)
      .then(setEntry)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load entry'))
      .finally(() => setLoading(false))
  }, [recid])

  // Revoke the blob URL whenever it's replaced or the page is left, so an
  // open-then-navigate-away doesn't leak the PDF's memory indefinitely.
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [pdfUrl])

  const handleExportPdf = async () => {
    if (!recid) return
    setExportingPdf(true)
    setPdfError(null)
    try {
      const data = await fetchEntryCbp7501(recid)
      const blob = await generateEntry7501PdfBlob(data)
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  const closePdfModal = () => {
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPdfError(null)
  }

  const handleDownloadPdf = () => {
    if (!pdfUrl || !entry) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = `CBP7501_${entry.entryNo}.pdf`
    a.click()
  }

  return (
    <div className="flex flex-col h-full min-h-0 space-y-2">
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div className="w-px h-4 bg-slate-200" />
        <div>
          <h1 className="text-page-title">{entry ? entry.entryNo : loading ? 'Loading…' : 'Entry'}</h1>
          {entry?.custName && <p className="text-page-subtitle">{entry.custName}</p>}
        </div>
        {entry && (
          <span className={`ml-2 px-2.5 py-1 rounded-full text-[11px] font-semibold ${status(entry).color}`}>
            {status(entry).label}
          </span>
        )}
        <button
          onClick={handleExportPdf}
          disabled={exportingPdf || !recid}
          title="Download CBP Form 7501 (Entry Summary) — internal reconstruction"
          className="ml-auto flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <FileText className="h-4 w-4" />
          {exportingPdf ? 'Generating…' : 'CBP Form 7501 (PDF)'}
        </button>
      </div>

      {loading && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <KpiCardSkeleton key={i} />)}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100"><Sk className="h-4 w-32" /></div>
            <TableRowsSkeleton rows={6} cols={6} />
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-7 w-7 text-red-400" />
          <p className="text-sm font-semibold text-red-700">Couldn't load this entry</p>
          <p className="text-xs text-slate-500 max-w-sm">{error}</p>
        </div>
      )}

      {!loading && !error && entry && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 shrink-0">
            <KpiTile icon={<DollarSign className="h-5 w-5" />} label="Entry Value" value={formatUSD(entry.entryVal)} />
            <KpiTile icon={<Landmark className="h-5 w-5" />} label="Total Duty" value={formatUSD(entry.totalDuty)} />
            <KpiTile
              icon={<Percent className="h-5 w-5" />}
              label="Effective Rate"
              value={entry.entryVal > 0 ? `${((entry.totalDuty / entry.entryVal) * 100).toFixed(1)}%` : '—'}
            />
            <KpiTile icon={<Hash className="h-5 w-5" />} label="Line Items" value={entry.lines.length.toLocaleString()} />
          </div>

          {/* Key details + duty composition */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-card-title mb-3">Entry Details</h2>
              <dl className="grid grid-cols-2 gap-y-2.5 text-xs">
                <dt className="text-slate-400">Client / Importer</dt>
                <dd className="text-slate-700 font-medium">{entry.custName ?? entry.custKey}</dd>
                <dt className="text-slate-400">Entry Date</dt>
                <dd className="text-slate-700">{fmtDate(entry.entryDate)}</dd>
                <dt className="text-slate-400">Release Date</dt>
                <dd className="text-slate-700">{fmtDateTime(entry.relDate)}</dd>
                <dt className="text-slate-400">Liquidation Date</dt>
                <dd className="text-slate-700">{fmtDate(entry.liqDate)}</dd>
                <dt className="text-slate-400">Port</dt>
                <dd className="text-slate-700">{entry.port ?? '—'}</dd>
                <dt className="text-slate-400">Origin / Export Country</dt>
                <dd className="text-slate-700">{entry.originCo ?? '—'} / {entry.exporCo ?? '—'}</dd>
                <dt className="text-slate-400">Mode of Transport</dt>
                <dd className="text-slate-700">{entry.mot ? `${entry.mot}${motLabel(entry.mot) ? ` — ${motLabel(entry.mot)}` : ''}` : '—'}</dd>
                <dt className="text-slate-400">Entry Type</dt>
                <dd className="text-slate-700">{entry.entryType ? `${entry.entryType}${entryTypeLabel(entry.entryType) ? ` — ${entryTypeLabel(entry.entryType)}` : ''}` : '—'}</dd>
              </dl>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-card-title mb-3">Duty Composition</h2>
              <div className="space-y-2.5">
                {BUCKET_LABELS.map(({ key, label, color }) => {
                  const value = entry[key]
                  const pct = entry.totalDuty > 0 ? (value / entry.totalDuty) * 100 : 0
                  return (
                    <div key={key} className="flex items-center gap-3 text-xs">
                      <span className="w-32 flex-shrink-0 text-slate-500">{label}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                      </div>
                      <span className="w-24 flex-shrink-0 text-right font-medium text-slate-800">{formatUSD(value)}</span>
                    </div>
                  )
                })}
                <div className="flex items-center gap-3 text-xs pt-2 mt-2 border-t border-slate-100">
                  <span className="w-32 flex-shrink-0 font-semibold text-slate-700">Total</span>
                  <div className="flex-1" />
                  <span className="w-24 flex-shrink-0 text-right font-semibold text-slate-800">{formatUSD(entry.totalDuty)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h2 className="text-card-title">Line Items</h2>
              <span className="text-xs text-slate-400">{entry.lines.length.toLocaleString()} lines</span>
            </div>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-left sticky-table">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="pl-4 pr-2 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">HTS</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Value</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Regular</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Sec 301</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Sec 232</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">IEEPA</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Other Ch-99</th>
                    <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Total Duty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entry.lines.length > 0 ? entry.lines.map((l) => (
                    <tr key={l.lineId} className="hover:bg-slate-50">
                      <td className="pl-4 pr-2 py-2 text-xs font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {l.hts ? formatHts(l.hts) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 max-w-[260px] truncate" title={l.description ?? undefined}>
                        {l.description ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{formatUSD(l.enteredValue)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{l.regularDuty > 0 ? formatUSD(l.regularDuty) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{l.sec301 > 0 ? formatUSD(l.sec301) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{l.sec232 > 0 ? formatUSD(l.sec232) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{l.ieepa > 0 ? formatUSD(l.ieepa) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{l.other99 > 0 ? formatUSD(l.other99) : '—'}</td>
                      <td className="px-4 py-2 text-xs text-right tabular-nums font-semibold text-slate-800">{formatUSD(l.totalDuty)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={9} className="px-5 py-10 text-center text-xs text-slate-400">No line items on this entry</td>
                    </tr>
                  )}
                </tbody>
                {entry.lines.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr>
                      <td colSpan={2} className="pl-4 pr-2 py-2.5 text-xs font-bold text-slate-700">Total</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums text-slate-700">{formatUSD(entry.entryVal)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums text-slate-700">{formatUSD(entry.regularDuty)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums text-slate-700">{formatUSD(entry.sec301)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums text-slate-700">{formatUSD(entry.sec232)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums text-slate-700">{formatUSD(entry.ieepa)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums text-slate-700">{formatUSD(entry.other99)}</td>
                      <td className="px-4 py-2.5 text-xs font-bold text-right tabular-nums text-slate-800">{formatUSD(entry.totalDuty)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      <Dialog
        open={exportingPdf || !!pdfUrl || !!pdfError}
        onClose={closePdfModal}
        title={entry ? `CBP Form 7501 — ${entry.entryNo}` : 'CBP Form 7501'}
        className="max-w-4xl w-[92vw]"
        footer={
          <>
            <button
              onClick={closePdfModal}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!pdfUrl}
              className="px-3 py-1.5 text-xs rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download
            </button>
          </>
        }
      >
        {/* Dialog's own content wrapper is a plain block div, not a flex
            container, so flex-1 here has nothing to grow against — give
            this an explicit height instead of relying on flex sizing. */}
        <div className="h-[68vh] -mx-4 -mt-1">
          {exportingPdf && (
            <div className="flex items-center justify-center h-full text-xs text-slate-400 gap-2">
              <span className="h-3.5 w-3.5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
              Generating PDF…
            </div>
          )}
          {!exportingPdf && pdfError && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
              <AlertCircle className="h-6 w-6 text-red-400" />
              <p className="text-xs text-red-600 font-medium">Couldn't generate the PDF</p>
              <p className="text-[11px] text-slate-400">{pdfError}</p>
            </div>
          )}
          {!exportingPdf && !pdfError && pdfUrl && (
            <iframe src={pdfUrl} title="CBP Form 7501" className="w-full h-full border-0" />
          )}
        </div>
      </Dialog>
    </div>
  )
}
