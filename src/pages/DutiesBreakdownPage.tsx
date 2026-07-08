import React, { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, DollarSign, Landmark, Percent, ShieldAlert, Layers } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from 'recharts'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
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

function KpiCard({ title, value, sub, icon }: {
  title: string; value: string; sub?: string; icon: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium">{title}</p>
        <span className="text-teal-600">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
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

type SortKey = 'hts' | 'enteredValue' | 'regularDuty' | 'sec301' | 'sec232' | 'ieepa' | 'totalDuty'

export function DutiesBreakdownPage() {
  useClients()
  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [data, setData] = useState<HtsBreakdownResponse | null>(null)
  const [monthly, setMonthly] = useState<IeepaMonthRow[]>([])
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('totalDuty')
  const [sortDesc, setSortDesc] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, HtsEntryRow[] | 'loading'>>({})
  // Per-hts fetch generation counters guard against stale async writes: a fetch's
  // .then/.catch only applies if both the row's own sequence and the filter
  // generation are unchanged since the fetch was issued.
  const expandSeq = useRef<Record<string, number>>({})
  const genRef = useRef(0)

  const params = { coKey: selectedClient?.coKey, dateFrom, dateTo }

  useEffect(() => {
    genRef.current += 1
    setLoading(true)
    setExpanded({})
    Promise.all([fetchHtsBreakdown(params), fetchIeepaMonthly(params)])
      .then(([b, m]) => { setData(b); setMonthly(m) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [searchTrigger, selectedClient?.coKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  function toggleExpand(hts: string) {
    if (expanded[hts]) {
      expandSeq.current[hts] = (expandSeq.current[hts] ?? 0) + 1
      setExpanded((e) => { const { [hts]: _, ...rest } = e; return rest })
      return
    }
    const seq = (expandSeq.current[hts] = (expandSeq.current[hts] ?? 0) + 1)
    const gen = genRef.current
    setExpanded((e) => ({ ...e, [hts]: 'loading' }))
    fetchHtsEntries({ hts, ...params })
      .then((rows) => {
        if (expandSeq.current[hts] !== seq || genRef.current !== gen) return
        setExpanded((e) => ({ ...e, [hts]: rows }))
      })
      .catch(() => {
        if (expandSeq.current[hts] !== seq || genRef.current !== gen) return
        setExpanded((e) => { const { [hts]: _, ...rest } = e; return rest })
      })
  }

  const rows = [...(data?.current ?? [])].sort((a, b) => {
    const va = a[sortKey]; const vb = b[sortKey]
    const cmp = typeof va === 'string' ? String(va).localeCompare(String(vb)) : Number(va) - Number(vb)
    return sortDesc ? -cmp : cmp
  })
  const t = data?.totals.current

  const BUCKET_COLORS = { regular: '#0f766e', sec301: '#f59e0b', sec232: '#6366f1', ieepa: '#dc2626', other: '#94a3b8' }

  const top10 = rowsByDuty(data?.current ?? []).slice(0, 10)
  const priorByHts = new Map((data?.prior ?? []).map((r) => [r.hts, r.totalDuty]))
  const compareData = top10.map((r) => ({
    hts: formatHts(r.hts), Current: r.totalDuty, Prior: priorByHts.get(r.hts) ?? 0,
  }))

  const trendData = monthly.map((m) => ({
    period: m.period, Regular: m.regularDuty, 'Sec 301': m.sec301, 'Sec 232': m.sec232,
    IEEPA: m.ieepaDuty + m.remediation,
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
        <div className="ml-auto">
          <h1 className="text-sm font-semibold text-slate-700">Duties Paid — HTS Breakdown</h1>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="Total Duties"   value={fmtUSD(t?.totalDuty ?? 0)}
                 sub={data ? `vs ${fmtUSD(data.totals.prior.totalDuty)} prior period` : undefined}
                 icon={<DollarSign className="h-4 w-4" />} />
        <KpiCard title="Regular Duty"   value={fmtUSD(t?.regularDuty ?? 0)} icon={<Landmark className="h-4 w-4" />} />
        <KpiCard title="Section 301"    value={fmtUSD(t?.sec301 ?? 0)}      icon={<Percent className="h-4 w-4" />} />
        <KpiCard title="Section 232"    value={fmtUSD(t?.sec232 ?? 0)}      icon={<Layers className="h-4 w-4" />} />
        <KpiCard title="IEEPA"          value={fmtUSD((t?.ieepa ?? 0) + (t?.other ?? 0))}
                 sub={t && t.other > 0 ? `incl. ${fmtUSD(t.other)} other Ch-99` : undefined}
                 icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      {/* Chart row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top 10 HTS — Current vs Prior Period">
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
        </ChartCard>
        <ChartCard title="Monthly Duty Trend by Type">
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
        </ChartCard>
      </div>

      {/* Chart row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Duty Composition">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                {donutData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtUSD(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Effective Duty Rate — Top HTS">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rateData} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="hts" width={90} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Bar dataKey="Effective Rate %" fill={BUCKET_COLORS.regular} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* HTS table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Duties by HTS Code</h2>
          {data && (
            <p className="text-[11px] text-slate-400">
              {format(parseISO(data.dateFrom), 'MMM d, yyyy')} – {format(parseISO(data.dateTo), 'MMM d, yyyy')}
            </p>
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
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.enteredValue)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.regularDuty)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.sec301)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.sec232)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.ieepa + row.other)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtUSD(row.totalDuty)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {t && t.totalDuty > 0 ? `${((row.totalDuty / t.totalDuty) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                  {expanded[row.hts] === 'loading' && (
                    <tr><td colSpan={10} className="px-10 py-3 text-slate-400 text-[11px]">Loading entries…</td></tr>
                  )}
                  {Array.isArray(expanded[row.hts]) && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={10} className="px-10 py-2">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-slate-400">
                              <th className="py-1 text-left font-medium">Entry #</th>
                              <th className="py-1 text-left font-medium">Date</th>
                              <th className="py-1 text-left font-medium">Importer</th>
                              <th className="py-1 text-right font-medium">Value</th>
                              <th className="py-1 text-right font-medium">Total Duty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(expanded[row.hts] as HtsEntryRow[]).map((en) => (
                              <tr key={en.recid} className="border-t border-slate-100">
                                <td className="py-1 text-slate-600">{en.entryNo}</td>
                                <td className="py-1 text-slate-500">{format(new Date(en.entryDate), 'MMM d, yyyy')}</td>
                                <td className="py-1 text-slate-500">{en.custName ?? en.custKey}</td>
                                <td className="py-1 text-right text-slate-600">{fmtUSD(en.enteredValue)}</td>
                                <td className="py-1 text-right font-medium text-slate-700">{fmtUSD(en.totalDuty)}</td>
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
                  <td className="px-3 py-2 text-right">{fmtUSD(t.enteredValue)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.regularDuty)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.sec301)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.sec232)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.ieepa + t.other)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.totalDuty)}</td>
                  <td className="px-3 py-2 text-right">100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
