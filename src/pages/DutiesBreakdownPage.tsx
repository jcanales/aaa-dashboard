import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ChevronDown, ChevronRight, DollarSign, Landmark, Percent, ShieldAlert, Layers, Boxes, Download, ExternalLink,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from 'recharts'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { Sk, KpiCardSkeleton, ChartCardSkeleton, TableRowsSkeleton, EntriesDrillDownSkeleton } from '@/components/ui/Skeleton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import { captureElement } from '@/utils/chartCapture'
import { formatUSD } from '@/utils/formatUtils'
import { downloadHtsBreakdownPdf } from '@/utils/htsBreakdownReportPdf'
import {
  fetchHtsBreakdown, fetchHtsEntries, fetchIeepaMonthly,
  type HtsBreakdownResponse, type HtsBreakdownRow, type HtsEntryRow, type IeepaMonthRow,
} from '@/api/entriesApi'

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export function formatHts(code: string): string {
  if (!/^\d{6,10}$/.test(code)) return code
  const parts = [code.slice(0, 4), code.slice(4, 6), code.slice(6)].filter(Boolean)
  return parts.join('.')
}

function rowsByDuty(rows: HtsBreakdownRow[]): HtsBreakdownRow[] {
  return [...rows].sort((a, b) => b.totalDuty - a.totalDuty)
}

function KpiCard({ title, value, sub, icon, to }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; to?: string
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
          {title}
          {to && <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
        </p>
        <span className="text-teal-600">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </>
  )
  if (to) {
    return (
      <Link to={to} className="group bg-white rounded-xl border border-slate-200 p-4 shadow-sm block hover:shadow-md hover:border-teal-300 transition-all no-underline">
        {inner}
      </Link>
    )
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      {inner}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function DutiesBreakdownPageSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map((i) => <KpiCardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCardSkeleton height={280} />
        <ChartCardSkeleton height={280} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCardSkeleton height={280} />
        <ChartCardSkeleton height={280} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <Sk className="h-3.5 w-48" />
        </div>
        <TableRowsSkeleton rows={10} cols={10} />
      </div>
    </>
  )
}

type SortKey = 'hts' | 'enteredValue' | 'regularDuty' | 'sec301' | 'sec232' | 'ieepa' | 'totalDuty'

const PAGE_SIZE = 100

export function DutiesBreakdownPage() {
  useClients()
  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [data, setData] = useState<HtsBreakdownResponse | null>(null)
  // Page-1 rows, frozen across grid pagination — the Top-10 chart, current-vs-prior
  // comparison, and effective-rate chart must always reflect the true global top 10
  // by duty, not whatever page the grid happens to be showing.
  const [chartRows, setChartRows] = useState<HtsBreakdownRow[]>([])
  const [monthly, setMonthly] = useState<IeepaMonthRow[]>([])
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('totalDuty')
  const [sortDesc, setSortDesc] = useState(true)
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
    Promise.all([
      fetchHtsBreakdown({ ...params, page: 1, limit: PAGE_SIZE }),
      fetchIeepaMonthly(params),
    ])
      .then(([b, m]) => { setData(b); setChartRows(b.current); setMonthly(m) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [searchTrigger, selectedClient?.coKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadPage(p: number) {
    // Guard against out-of-order responses: a quick double-click on Next can
    // fire two overlapping requests, and without this check the older page's
    // response could resolve last and clobber the newer one.
    const gen = (genRef.current += 1)
    activeHts.current = null
    setExpanded({})
    setLoading(true)
    fetchHtsBreakdown({ ...params, page: p, limit: PAGE_SIZE })
      .then((b) => { if (genRef.current === gen) setData(b) })
      .catch(console.error)
      .finally(() => { if (genRef.current === gen) setLoading(false) })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

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

  const rows = [...(data?.current ?? [])].sort((a, b) => {
    const va = a[sortKey]; const vb = b[sortKey]
    const cmp = typeof va === 'string' ? String(va).localeCompare(String(vb)) : Number(va) - Number(vb)
    return sortDesc ? -cmp : cmp
  })
  const t = data?.totals.current

  const BUCKET_COLORS = { regular: '#0f766e', sec301: '#f59e0b', sec232: '#6366f1', ieepa: '#dc2626', other: '#94a3b8' }

  const top10 = rowsByDuty(chartRows).slice(0, 10)
  const priorByHts = new Map((data?.prior ?? []).map((r) => [r.hts, r.totalDuty]))
  const compareData = top10.map((r) => ({
    hts: formatHts(r.hts), Current: r.totalDuty, Prior: priorByHts.get(r.hts) ?? 0,
  }))

  const trendData = monthly.map((m) => ({
    // ieepa/monthly's buckets are computed from actual line-level HTS codes
    // (see htsBuckets.ts's perEntryDutyCte) — already mutually exclusive, so
    // no subtraction is needed to isolate the regular-duty segment.
    period: m.period, Regular: m.regularDuty,
    'Sec 301': m.sec301, 'Sec 232': m.sec232,
    IEEPA: m.ieepaDuty + m.other99Duty,
  }))

  const donutData = t ? [
    { name: 'Regular', value: t.regularDuty, color: BUCKET_COLORS.regular },
    { name: 'Sec 301', value: t.sec301,      color: BUCKET_COLORS.sec301 },
    { name: 'Sec 232', value: t.sec232,      color: BUCKET_COLORS.sec232 },
    { name: 'IEEPA',   value: t.ieepa,       color: BUCKET_COLORS.ieepa },
    { name: 'Other',   value: t.other,       color: BUCKET_COLORS.other },
  ].filter((d) => d.value > 0) : []

  const rateData = top10
    .filter((r) => r.enteredValue > 0)
    .map((r) => ({ hts: formatHts(r.hts), 'Effective Rate %': (r.totalDuty / r.enteredValue) * 100 }))

  const compareChartRef = useRef<HTMLDivElement>(null)
  const trendChartRef = useRef<HTMLDivElement>(null)
  const donutChartRef = useRef<HTMLDivElement>(null)
  const rateChartRef = useRef<HTMLDivElement>(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const handleDownloadPdf = async () => {
    if (!t) return
    setExportingPdf(true)
    try {
      const [compareChartImg, trendChartImg, donutImg, rateChartImg] = await Promise.all([
        captureElement(compareChartRef.current),
        captureElement(trendChartRef.current),
        captureElement(donutChartRef.current),
        captureElement(rateChartRef.current),
      ])
      await downloadHtsBreakdownPdf({
        totals: t,
        priorTotals: data?.totals.prior ?? t,
        topRows: rowsByDuty(chartRows),
        rowsTotal: data?.total ?? chartRows.length,
        dateFrom: data?.dateFrom,
        dateTo: data?.dateTo,
        clientName: selectedClient?.name,
        compareChartImg, trendChartImg, donutImg, rateChartImg,
      }, `HTS_Breakdown_Report_${selectedClient?.coKey ?? 'all-clients'}_${dateFrom}_to_${dateTo}.pdf`)
    } finally {
      setExportingPdf(false)
    }
  }

  const SortHeader = ({ k, label, right = true }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 ${right ? 'text-right' : 'text-left'}`}
    >
      {label}{sortKey === k ? (sortDesc ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <ClientSelector />
        <DateRangeSelector />
        <SearchButton />
        {loading && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="h-3.5 w-3.5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
            Loading…
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <h1 className="text-sm font-semibold text-slate-700">Duties Paid — HTS Breakdown</h1>
          <button
            onClick={handleDownloadPdf}
            disabled={exportingPdf || !t}
            className="flex items-center gap-1.5 text-[11px] font-medium text-teal-700 hover:text-teal-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Download PDF report"
          >
            <Download className="h-3.5 w-3.5" />
            {exportingPdf ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <DutiesBreakdownPageSkeleton />
      ) : (
      <>
      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <KpiCard title="Total Duties"   value={formatUSD(t?.totalDuty ?? 0)}
                 sub={data ? `vs ${formatUSD(data.totals.prior.totalDuty)} prior period` : undefined}
                 icon={<DollarSign className="h-4 w-4" />} to="/duties/hts/total" />
        <KpiCard title="Regular Duty"   value={formatUSD(t?.regularDuty ?? 0)} icon={<Landmark className="h-4 w-4" />} to="/duties/hts/regular" />
        <KpiCard title="Section 301"    value={formatUSD(t?.sec301 ?? 0)}      icon={<Percent className="h-4 w-4" />} to="/duties/hts/sec301" />
        <KpiCard title="Section 232"    value={formatUSD(t?.sec232 ?? 0)}      icon={<Layers className="h-4 w-4" />} to="/duties/hts/sec232" />
        <KpiCard title="IEEPA"          value={formatUSD(t?.ieepa ?? 0)}       icon={<ShieldAlert className="h-4 w-4" />} to="/duties/hts/ieepa" />
        <KpiCard title="Ch-99"          value={formatUSD(t?.other ?? 0)}       icon={<Boxes className="h-4 w-4" />} to="/duties/hts/ch99" />
      </div>

      {/* Chart row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top 10 HTS — Current vs Prior Period">
          <div ref={compareChartRef}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={compareData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtUSD} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="hts" width={90} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Current" fill={BUCKET_COLORS.regular} radius={[0, 3, 3, 0]} />
                <Bar dataKey="Prior"   fill={BUCKET_COLORS.other}   radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Monthly Duty Trend by Type">
          <div ref={trendChartRef}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={fmtUSD} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Regular" stackId="d" fill={BUCKET_COLORS.regular} />
                <Bar dataKey="Sec 301" stackId="d" fill={BUCKET_COLORS.sec301} />
                <Bar dataKey="Sec 232" stackId="d" fill={BUCKET_COLORS.sec232} />
                <Bar dataKey="IEEPA"   stackId="d" fill={BUCKET_COLORS.ieepa} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Chart row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Duty Composition">
          <div ref={donutChartRef}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                  {donutData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Effective Duty Rate — Top HTS">
          <div ref={rateChartRef}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rateData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="hts" width={90} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                <Bar dataKey="Effective Rate %" fill={BUCKET_COLORS.regular} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* HTS table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Duties by HTS Code</h2>
            {data && (
              <p className="text-[11px] text-slate-400">
                {format(parseISO(data.dateFrom), 'MMM d, yyyy')} – {format(parseISO(data.dateTo), 'MMM d, yyyy')}
              </p>
            )}
          </div>
          {data && data.total > 0 && (
            <span className="text-[11px] text-slate-400">
              {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total} HTS codes
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-8" />
                <SortHeader k="hts" label="HTS" right={false} />
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-left">Description</th>
                <SortHeader k="enteredValue" label="Entry Value" />
                <SortHeader k="regularDuty"  label="Regular" />
                <SortHeader k="sec301"       label="Sec 301" />
                <SortHeader k="sec232"       label="Sec 232" />
                <SortHeader k="ieepa"        label="IEEPA" />
                <SortHeader k="totalDuty"    label="Total Duty" />
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No data available</td></tr>
              )}
              {rows.map((row) => (
                <React.Fragment key={row.hts}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => toggleExpand(row.hts)}>
                    <td className="pl-3 text-slate-400">
                      {expanded[row.hts] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{formatHts(row.hts)}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate">{row.description ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatUSD(row.enteredValue)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatUSD(row.regularDuty)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatUSD(row.sec301)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatUSD(row.sec232)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatUSD(row.ieepa + row.other)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatUSD(row.totalDuty)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {t && t.totalDuty > 0 ? `${((row.totalDuty / t.totalDuty) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                  {expanded[row.hts] === 'loading' && (
                    <tr><td colSpan={10} className="px-10 py-2"><EntriesDrillDownSkeleton /></td></tr>
                  )}
                  {Array.isArray(expanded[row.hts]) && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={10} className="px-10 py-2">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-[#093B49] text-white">
                              <th className="py-1.5 px-2 text-left font-medium first:rounded-l">Entry #</th>
                              <th className="py-1.5 px-2 text-left font-medium">Date</th>
                              <th className="py-1.5 px-2 text-left font-medium">Importer</th>
                              <th className="py-1.5 px-2 text-right font-medium">Entry Value</th>
                              <th className="py-1.5 px-2 text-right font-medium">Regular</th>
                              <th className="py-1.5 px-2 text-right font-medium">Sec 301</th>
                              <th className="py-1.5 px-2 text-right font-medium">Sec 232</th>
                              <th className="py-1.5 px-2 text-right font-medium">IEEPA</th>
                              <th className="py-1.5 px-2 text-right font-medium">Ch-99</th>
                              <th className="py-1.5 px-2 text-right font-medium last:rounded-r">Total Duty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(expanded[row.hts] as HtsEntryRow[]).map((en) => (
                              <tr key={en.recid} className="border-t border-slate-100">
                                <td className="py-1 px-2 text-slate-600">
                                  <Link to={`/entries/${en.recid}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                                    {en.entryNo}
                                  </Link>
                                </td>
                                <td className="py-1 px-2 text-slate-500">{format(new Date(en.entryDate), 'MMM d, yyyy')}</td>
                                <td className="py-1 px-2 text-slate-500">{en.custName ?? en.custKey}</td>
                                <td className="py-1 px-2 text-right text-slate-600">{formatUSD(en.enteredValue)}</td>
                                <td className="py-1 px-2 text-right text-slate-600">{en.regularDuty > 0 ? formatUSD(en.regularDuty) : '—'}</td>
                                <td className="py-1 px-2 text-right text-slate-600">{en.sec301 > 0 ? formatUSD(en.sec301) : '—'}</td>
                                <td className="py-1 px-2 text-right text-slate-600">{en.sec232 > 0 ? formatUSD(en.sec232) : '—'}</td>
                                <td className="py-1 px-2 text-right text-slate-600">{en.ieepa > 0 ? formatUSD(en.ieepa) : '—'}</td>
                                <td className="py-1 px-2 text-right text-slate-600">{en.other > 0 ? formatUSD(en.other) : '—'}</td>
                                <td className="py-1 px-2 text-right font-medium text-slate-700">{formatUSD(en.totalDuty)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            {t && rows.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr className="font-semibold text-slate-700">
                  <td />
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right">{formatUSD(t.enteredValue)}</td>
                  <td className="px-3 py-2 text-right">{formatUSD(t.regularDuty)}</td>
                  <td className="px-3 py-2 text-right">{formatUSD(t.sec301)}</td>
                  <td className="px-3 py-2 text-right">{formatUSD(t.sec232)}</td>
                  <td className="px-3 py-2 text-right">{formatUSD(t.ieepa + t.other)}</td>
                  <td className="px-3 py-2 text-right">{formatUSD(t.totalDuty)}</td>
                  <td className="px-3 py-2 text-right">100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {data && data.total > data.limit && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Page {data.page} of {Math.ceil(data.total / data.limit)}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => loadPage(data.page - 1)}
                disabled={data.page === 1 || loading}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Prev
              </button>
              <button
                onClick={() => loadPage(data.page + 1)}
                disabled={data.page >= Math.ceil(data.total / data.limit) || loading}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}
