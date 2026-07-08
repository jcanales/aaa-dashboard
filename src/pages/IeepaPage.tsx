import React, { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { AlertTriangle, DollarSign, Package, TrendingUp } from 'lucide-react'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import {
  fetchIeepaKpis, fetchIeepaMonthly, fetchIeepaTopEntries,
  type IeepaKpis, type IeepaMonthRow, type IeepaTopEntry,
} from '@/api/entriesApi'

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function KpiCard({ title, value, sub, icon, accent = false }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${accent ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium">{title}</p>
        <span className={accent ? 'text-amber-600' : 'text-teal-600'}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export function IeepaPage() {
  useClients()
  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [kpis, setKpis] = useState<IeepaKpis | null>(null)
  const [monthly, setMonthly] = useState<IeepaMonthRow[]>([])
  const [topEntries, setTopEntries] = useState<IeepaTopEntry[]>([])
  const [loading, setLoading] = useState(false)

  const params = { coKey: selectedClient?.coKey, dateFrom, dateTo }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchIeepaKpis(params),
      fetchIeepaMonthly(params),
      fetchIeepaTopEntries(params),
    ]).then(([k, m, t]) => {
      setKpis(k)
      setMonthly(m)
      setTopEntries(t)
    }).catch(console.error).finally(() => setLoading(false))
  }, [searchTrigger, selectedClient?.coKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = monthly.map((m) => ({
    period: m.period.slice(0, 7),
    Regular: m.regularDuty,
    'Sec 301': m.sec301,
    'Sec 232': m.sec232,
    IEEPA: m.ieepaDuty,
    Remediation: m.remediation,
  }))

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
          <h1 className="text-sm font-semibold text-slate-700">IEEPA Tariff Analysis</h1>
        </div>
      </div>

      {/* Alert banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-800">
          <strong>IEEPA tariffs effective February 2025.</strong> This analysis covers customs entries subject to
          International Emergency Economic Powers Act duties, Section 301, and Section 232 surcharges.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Entries"
          value={(kpis?.totalEntries ?? 0).toLocaleString()}
          icon={<Package className="h-4 w-4" />}
          sub={`${(kpis?.ieepaEntries ?? 0).toLocaleString()} IEEPA-affected`}
        />
        <KpiCard
          title="Combined IEEPA Duty"
          value={fmtUSD((kpis?.ieepaDuty ?? 0) + (kpis?.remediationDuty ?? 0))}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent
          sub={`Remediation: ${fmtUSD(kpis?.remediationDuty ?? 0)}`}
        />
        <KpiCard
          title="Total Entry Value"
          value={fmtUSD(kpis?.totalValue ?? 0)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          title="Total All Duties"
          value={fmtUSD(kpis?.totalDuty ?? 0)}
          icon={<DollarSign className="h-4 w-4" />}
          sub={`Regular: ${fmtUSD(kpis?.regularDuty ?? 0)}`}
        />
      </div>

      {/* Monthly stacked chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Monthly Duty Composition</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtUSD(v)} width={60} />
              <Tooltip formatter={(v: number) => fmtUSD(v)} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Regular"     stackId="a" fill="#073b49" />
              <Bar dataKey="Sec 301"     stackId="a" fill="#3A6FF9" />
              <Bar dataKey="Sec 232"     stackId="a" fill="#077a96" />
              <Bar dataKey="IEEPA"       stackId="a" fill="#f59e0b" />
              <Bar dataKey="Remediation" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top entries table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Top 10 Entries by IEEPA Impact</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sticky-table">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-medium">Entry #</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Port</th>
                <th className="text-left px-4 py-2.5 font-medium">Importer</th>
                <th className="text-right px-4 py-2.5 font-medium">Entry Value</th>
                <th className="text-right px-4 py-2.5 font-medium">IEEPA Duty</th>
                <th className="text-right px-4 py-2.5 font-medium">Remediation</th>
                <th className="text-right px-4 py-2.5 font-medium">Combined</th>
              </tr>
            </thead>
            <tbody>
              {topEntries.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    {loading ? 'Loading…' : 'No data available'}
                  </td>
                </tr>
              )}
              {topEntries.map((e) => (
                <tr key={e.recid} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{e.entryNo}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {e.entryDate ? format(parseISO(e.entryDate), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{e.port}</td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-[160px] truncate">{e.custName ?? e.custKey}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmtUSD(e.entryVal)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700">{fmtUSD(e.ieepaDuty)}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">{fmtUSD(e.remediationDuty)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmtUSD(e.combinedIeepa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
