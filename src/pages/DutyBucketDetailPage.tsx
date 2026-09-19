// Dedicated breakdown page per duty-type KPI card on /duties/hts — same
// "click a KPI card → navigate to a dedicated detail page" pattern as
// aam-dashboard's TaxDetailPage (one component, parameterized by type,
// reused across routes). Reuses the same /hts-breakdown and
// /hts-breakdown/entries data DutiesBreakdownPage already fetches, just
// filtered/sorted/charted around one duty bucket instead of all of them.
import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import {
  ArrowLeft, DollarSign, Hash, Landmark, ChevronDown, ChevronRight,
  Search, X, Building2,
} from 'lucide-react'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { Sk, KpiCardSkeleton, ChartCardSkeleton, EntriesDrillDownSkeleton } from '@/components/ui/Skeleton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import { formatUSD } from '@/utils/formatUtils'
import {
  fetchHtsBreakdown, fetchHtsEntries,
  type HtsBreakdownResponse, type HtsBreakdownRow, type HtsEntryRow,
} from '@/api/entriesApi'
import { formatHts } from '@/pages/DutiesBreakdownPage'

export type DutyBucket = 'total' | 'regular' | 'sec301' | 'sec232' | 'ieepa' | 'ch99'

const COLORS = [
  '#3A6FF9', '#054d60', '#0891b2', '#0d9488', '#65a30d',
  '#ca8a04', '#dc2626', '#9333ea', '#db2777', '#ea580c',
]

function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString('en-US')}`
}

// Both HtsBreakdownRow and HtsBreakdownTotals carry these same fields —
// structurally compatible, so one helper serves the per-row and the
// grand-total case.
type DutyFields = { regularDuty: number; sec301: number; sec232: number; ieepa: number; other: number; totalDuty: number }

function bucketValue(x: DutyFields, bucket: DutyBucket): number {
  switch (bucket) {
    case 'total':   return x.totalDuty
    case 'regular': return x.regularDuty
    case 'sec301':  return x.sec301
    case 'sec232':  return x.sec232
    case 'ieepa':   return x.ieepa
    case 'ch99':    return x.other
  }
}

const BUCKET_CONFIG: Record<DutyBucket, {
  pageTitle: string; totalLabel: string; chartTitle: string; tableTotal: string
  color: string; noDataSub: string
}> = {
  total: {
    pageTitle: 'Total Duties Analysis', totalLabel: 'Total Duties Paid',
    chartTitle: 'Total Duty', tableTotal: 'Total Duty', color: '#073b49',
    noDataSub: 'had no dutiable entries in the selected date range.',
  },
  regular: {
    pageTitle: 'Regular Duty Analysis', totalLabel: 'Total Regular Duty',
    chartTitle: 'Regular Duty', tableTotal: 'Regular Duty', color: '#0f766e',
    noDataSub: 'had no regular (non-Chapter-99) duty in the selected date range.',
  },
  sec301: {
    pageTitle: 'Section 301 Analysis', totalLabel: 'Total Section 301 Duty',
    chartTitle: 'Section 301 Duty', tableTotal: 'Sec 301', color: '#f59e0b',
    noDataSub: 'had no Section 301 duty in the selected date range.',
  },
  sec232: {
    pageTitle: 'Section 232 Analysis', totalLabel: 'Total Section 232 Duty',
    chartTitle: 'Section 232 Duty', tableTotal: 'Sec 232', color: '#6366f1',
    noDataSub: 'had no Section 232 duty in the selected date range.',
  },
  ieepa: {
    pageTitle: 'IEEPA Duty Analysis', totalLabel: 'Total IEEPA / Reciprocal Duty',
    chartTitle: 'IEEPA Duty', tableTotal: 'IEEPA', color: '#dc2626',
    noDataSub: 'had no IEEPA / reciprocal duty (HTS 9903.01/9903.02) in the selected date range.',
  },
  ch99: {
    pageTitle: 'Other Chapter 99 Duty Analysis', totalLabel: 'Total Other Ch-99 Duty',
    chartTitle: 'Other Ch-99 Duty', tableTotal: 'Ch-99', color: '#94a3b8',
    noDataSub: 'had no other chapter-99 duty (not yet mapped to Sec 301/232/IEEPA) in the selected date range.',
  },
}

const PAGE_SIZE = 100

// ── Entries drill-down (identical pattern to DutiesBreakdownPage's row expand) ──

function EntriesDrillDown({ rows }: { rows: HtsEntryRow[] }) {
  return (
    <tr className="bg-slate-50/60">
      <td colSpan={6} className="px-10 py-2">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-[#093B49] text-white">
              <th className="py-1.5 px-2 text-left font-medium first:rounded-l">Entry #</th>
              <th className="py-1.5 px-2 text-left font-medium">Date</th>
              <th className="py-1.5 px-2 text-left font-medium">Importer</th>
              <th className="py-1.5 px-2 text-right font-medium">Value</th>
              <th className="py-1.5 px-2 text-right font-medium last:rounded-r">Total Duty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((en) => (
              <tr key={en.recid} className="border-t border-slate-100">
                <td className="py-1 px-2 text-slate-600">
                  <Link to={`/entries/${en.recid}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                    {en.entryNo}
                  </Link>
                </td>
                <td className="py-1 px-2 text-slate-500">{format(new Date(en.entryDate), 'MMM d, yyyy')}</td>
                <td className="py-1 px-2 text-slate-500">{en.custName ?? en.custKey}</td>
                <td className="py-1 px-2 text-right text-slate-600">{formatUSD(en.enteredValue)}</td>
                <td className="py-1 px-2 text-right font-medium text-slate-700">{formatUSD(en.totalDuty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DutyBucketDetailPage() {
  useClients()
  const navigate = useNavigate()
  const { bucket: bucketParam } = useParams<{ bucket: string }>()
  const bucket: DutyBucket = (['total', 'regular', 'sec301', 'sec232', 'ieepa', 'ch99'] as const)
    .includes(bucketParam as DutyBucket) ? (bucketParam as DutyBucket) : 'total'
  const cfg = BUCKET_CONFIG[bucket]

  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [data, setData] = useState<HtsBreakdownResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  // At most one row expanded at a time — accordion behavior. `expanded`
  // therefore only ever holds zero or one key; activeHts guards against a
  // stale fetch (for a row the user has since collapsed or switched away
  // from) writing its result in after the fact.
  const [expanded, setExpanded] = useState<Record<string, HtsEntryRow[] | 'loading'>>({})
  const activeHts = useRef<string | null>(null)
  const genRef = useRef(0)

  const params = { coKey: selectedClient?.coKey, dateFrom, dateTo }

  useEffect(() => {
    genRef.current += 1
    activeHts.current = null
    setLoading(true)
    setExpanded({})
    setSearch('')
    fetchHtsBreakdown({ ...params, page: 1, limit: PAGE_SIZE })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTrigger, selectedClient?.coKey, bucket])

  function toggleExpand(hts: string) {
    if (expanded[hts]) {
      activeHts.current = null
      setExpanded({})
      return
    }
    activeHts.current = hts
    const gen = genRef.current
    setExpanded({ [hts]: 'loading' })
    fetchHtsEntries({ hts, ...params })
      .then((rows) => {
        if (activeHts.current !== hts || genRef.current !== gen) return
        setExpanded({ [hts]: rows })
      })
      .catch(() => {
        if (activeHts.current !== hts || genRef.current !== gen) return
        setExpanded({})
      })
  }

  const t = data?.totals.current
  const bucketTotal = t ? bucketValue(t, bucket) : 0

  const bucketRows = (data?.current ?? []).filter((r) => bucketValue(r, bucket) > 0)
  const q = search.trim().toLowerCase()
  const filtered = q
    ? bucketRows.filter((r) => r.hts.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q))
    : bucketRows
  const sortedRows = [...filtered].sort((a, b) => bucketValue(b, bucket) - bucketValue(a, bucket))

  const bucketEnteredValue = bucketRows.reduce((s, r) => s + r.enteredValue, 0)

  const top10 = sortedRows.slice(0, 10).map((r, i) => ({
    hts: formatHts(r.hts), value: bucketValue(r, bucket), fill: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/duties/hts')}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-700 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to HTS Breakdown
          </button>
          <div className="w-px h-4 bg-slate-200" />
          <div>
            <h1 className="text-page-title">{cfg.pageTitle}</h1>
            {selectedClient && <p className="text-page-subtitle">{selectedClient.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ClientSelector />
          <DateRangeSelector />
          <SearchButton />
        </div>
      </div>

      {/* No client selected */}
      {!selectedClient && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No client selected</p>
          <p className="text-xs text-slate-400 max-w-xs">Select a client above to see its {cfg.pageTitle.toLowerCase()}.</p>
        </div>
      )}

      {/* Loading */}
      {selectedClient && loading && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <KpiCardSkeleton key={i} />)}
          </div>
          <ChartCardSkeleton height={300} />
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100"><Sk className="h-4 w-32" /></div>
          </div>
        </div>
      )}

      {/* No data for this bucket */}
      {selectedClient && !loading && data && bucketRows.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No {cfg.tableTotal} in this period</p>
          <p className="text-xs text-slate-400 max-w-xs">{selectedClient.name} {cfg.noDataSub}</p>
        </div>
      )}

      {/* Data view */}
      {selectedClient && !loading && data && bucketRows.length > 0 && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${cfg.color}18`, color: '#64748B' }}>
                <DollarSign className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-kpi-label mb-1">{cfg.totalLabel}</p>
                <p className="text-kpi-value text-slate-800">{formatUSD(bucketTotal)}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#0d948818', color: '#64748B' }}>
                <Hash className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-kpi-label mb-1">HTS Codes Involved</p>
                <p className="text-kpi-value text-slate-800">{bucketRows.length.toLocaleString()}</p>
                <p className="text-comparison-delta mt-1">carrying {cfg.tableTotal.toLowerCase()}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#65a30d18', color: '#64748B' }}>
                <Landmark className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-kpi-label mb-1">Entered Value Involved</p>
                <p className="text-kpi-value text-slate-800">{formatUSD(bucketEnteredValue)}</p>
                <p className="text-comparison-delta mt-1">across those HTS codes</p>
              </div>
            </div>
          </div>

          {/* Top 10 chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-card-title mb-4">Top {top10.length} HTS by {cfg.chartTitle}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top10} margin={{ top: 16, right: 20, bottom: 55, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="hts" tick={{ fontSize: 12, fontFamily: 'monospace' }}
                  angle={-35} textAnchor="end" interval={0} tickLine={false} />
                <YAxis tickFormatter={fmtM} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} width={72} />
                <Tooltip formatter={(v: number) => [formatUSD(v), cfg.tableTotal]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {top10.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  <LabelList dataKey="value" position="top" formatter={fmtM}
                    style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* HTS table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-card-title shrink-0">HTS Codes — {cfg.tableTotal}</h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search HTS or description…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-56 placeholder:text-slate-400"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {q ? `${sortedRows.length} / ${bucketRows.length}` : bucketRows.length} HTS codes
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="pl-4 pr-2 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-8">#</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">HTS</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Entry Value</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">{cfg.tableTotal}</th>
                    <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedRows.length > 0 ? (
                    sortedRows.map((row, idx) => {
                      const value = bucketValue(row, bucket)
                      const pct = bucketTotal > 0 ? (value / bucketTotal) * 100 : 0
                      const isExpanded = !!expanded[row.hts]
                      return (
                        <React.Fragment key={row.hts}>
                          <tr
                            className={`hover:bg-slate-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/40' : ''}`}
                            onClick={() => toggleExpand(row.hts)}
                          >
                            <td className="pl-4 pr-2 py-2.5 text-xs text-slate-400 tabular-nums w-8 text-right">{idx + 1}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {isExpanded
                                  ? <ChevronDown className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                                <span className="text-xs font-mono font-semibold text-slate-800">{formatHts(row.hts)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[260px] truncate" title={row.description ?? undefined}>
                              {row.description ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-right tabular-nums text-slate-600">{formatUSD(row.enteredValue)}</td>
                            <td className="px-3 py-2.5 text-xs text-right tabular-nums font-semibold text-slate-800">{formatUSD(value)}</td>
                            <td className="px-4 py-2.5 text-xs text-right tabular-nums">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: cfg.color }} />
                                </div>
                                <span className="text-slate-500 w-10 text-right">{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                          {expanded[row.hts] === 'loading' && (
                            <tr><td colSpan={6} className="px-10 py-2"><EntriesDrillDownSkeleton /></td></tr>
                          )}
                          {Array.isArray(expanded[row.hts]) && (
                            <EntriesDrillDown rows={expanded[row.hts] as HtsEntryRow[]} />
                          )}
                        </React.Fragment>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-xs text-slate-400">
                        No results for &ldquo;{search}&rdquo;
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="pl-4 pr-2 py-2.5 text-xs font-bold text-slate-700">Total</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums text-slate-700">{formatUSD(bucketEnteredValue)}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-right tabular-nums text-slate-800">{formatUSD(bucketTotal)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-right text-slate-700">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
