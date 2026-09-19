import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Clock, Package, DollarSign, AlertTriangle } from 'lucide-react'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { Sk, KpiCardSkeleton, ChartCardSkeleton, TableRowsSkeleton } from '@/components/ui/Skeleton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import {
  fetchEntryKpis, fetchMonthlyData, fetchEntries,
  type EntryKpis, type MonthlyPoint, type Entry,
} from '@/api/entriesApi'

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtNum(n: number) { return n.toLocaleString('en-US') }

function pct(a: number, b: number) {
  if (b === 0) return null
  return ((a - b) / b) * 100
}

function Trend({ current, prior }: { current: number; prior: number }) {
  const p = pct(current, prior)
  if (p === null) return null
  const up = p >= 0
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(p).toFixed(1)}%
    </span>
  )
}

function KpiCard({ title, value, sub, icon, trend, onClick }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; trend?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm ${
        onClick ? 'cursor-pointer transition-shadow hover:shadow-md hover:border-teal-300' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium">{title}</p>
        <span className="text-teal-600">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {trend}
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700',
  released:   'bg-emerald-100 text-emerald-700',
  liquidated: 'bg-blue-100 text-blue-700',
}

function DashboardPageSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map((i) => <KpiCardSkeleton key={i} />)}
      </div>
      <ChartCardSkeleton height={240} />
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <Sk className="h-3.5 w-20" />
          <Sk className="h-3 w-16" />
        </div>
        <TableRowsSkeleton rows={8} cols={8} />
      </div>
    </>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  useClients()
  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [kpis, setKpis] = useState<EntryKpis | null>(null)
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const params = { coKey: selectedClient?.coKey, dateFrom, dateTo }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchEntryKpis(params),
      fetchMonthlyData(params),
      fetchEntries({ ...params, page: 1, limit: 20 }),
    ]).then(([k, m, e]) => {
      setKpis(k)
      setMonthly(m)
      setEntries(e.data)
      setTotal(e.total)
      setPage(1)
    }).catch(console.error).finally(() => setLoading(false))
  }, [searchTrigger, selectedClient?.coKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPage = (p: number) => {
    fetchEntries({ ...params, page: p, limit: 20 })
      .then((e) => { setEntries(e.data); setPage(p) })
      .catch(console.error)
  }

  const chartData = monthly.map((m) => ({
    period: m.period.slice(0, 7),
    Duties: m.duties,
    Value: m.value,
    Tariff: m.tariff,
  }))

  const totalPages = Math.ceil(total / 20)

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
          <h1 className="text-sm font-semibold text-slate-700">Entry Operations Dashboard</h1>
        </div>
      </div>

      {loading ? (
        <DashboardPageSkeleton />
      ) : (
      <>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Entries in Period"
          value={fmtNum(kpis?.entriesInRange ?? 0)}
          icon={<Package className="h-4 w-4" />}
          trend={kpis && <Trend current={kpis.entriesInRange} prior={kpis.entriesPrior} />}
          sub="vs prior period"
        />
        <KpiCard
          title="Total Duties Paid"
          value={fmtUSD(kpis?.dutyInRange ?? 0)}
          icon={<DollarSign className="h-4 w-4" />}
          trend={kpis && <Trend current={kpis.dutyInRange} prior={kpis.dutyPrior} />}
          sub="View HTS breakdown →"
          onClick={() => navigate('/duties/hts')}
        />
        <KpiCard
          title="Entry Value"
          value={fmtUSD(kpis?.valueInRange ?? 0)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          title="IEEPA Duties"
          value={fmtUSD(kpis?.ieepaInRange ?? 0)}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          sub="View IEEPA breakdown →"
          onClick={() => navigate('/duties/hts/ieepa')}
        />
        <KpiCard
          title="Avg Release Time"
          value={kpis?.avgReleaseDays != null ? `${kpis.avgReleaseDays.toFixed(1)}d` : '—'}
          icon={<Clock className="h-4 w-4" />}
          sub={`${fmtNum(kpis?.entriesPending ?? 0)} pending`}
        />
      </div>

      {/* Monthly chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Monthly Duty & Value Trend</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtUSD(v)} width={60} />
              <Tooltip formatter={(v: number) => fmtUSD(v)} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Duties" fill="#073b49" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Tariff" fill="#3A6FF9" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Entry table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Entries</h2>
          <span className="text-xs text-slate-400">{fmtNum(total)} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sticky-table">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-medium">Entry #</th>
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Port</th>
                <th className="text-right px-4 py-2.5 font-medium">Entry Value</th>
                <th className="text-right px-4 py-2.5 font-medium">Total Duty</th>
                <th className="text-right px-4 py-2.5 font-medium">IEEPA</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    {loading ? 'Loading…' : 'No entries found'}
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.recid} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium">
                    <Link to={`/entries/${e.recid}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                      {e.entryNo}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{e.entryType}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {e.entryDate ? format(parseISO(e.entryDate), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{e.portCod}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmtUSD(e.entryVal)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmtUSD(e.total)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {e.ieepa > 0 ? (
                      <span className="text-amber-700 font-medium">{fmtUSD(e.ieepa)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[e.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => loadPage(page - 1)}
                disabled={page === 1}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Prev
              </button>
              <button
                onClick={() => loadPage(page + 1)}
                disabled={page === totalPages}
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
