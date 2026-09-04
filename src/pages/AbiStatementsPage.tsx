import React, { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import { fetchStatements, type StatementRow } from '@/api/abiApi'
import { TableRowsSkeleton } from '@/components/ui/Skeleton'

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const STATUS_COLORS: Record<string, string> = {
  Open:   'bg-amber-100 text-amber-700',
  Closed: 'bg-emerald-100 text-emerald-700',
  Paid:   'bg-blue-100 text-blue-700',
}

export function AbiStatementsPage() {
  useClients()
  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [rows, setRows] = useState<StatementRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const load = (p: number) => {
    setLoading(true)
    fetchStatements({ coKey: selectedClient?.coKey, dateFrom, dateTo, page: p, limit: 25 })
      .then((res) => { setRows(res.data); setTotal(res.total); setPage(p) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [searchTrigger, selectedClient?.coKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / 25)

  return (
    <div className="space-y-6">
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
          <h1 className="text-sm font-semibold text-slate-700">ABI Statements</h1>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Duty Statements</h2>
          <span className="text-xs text-slate-400">{total.toLocaleString()} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sticky-table">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-medium">Statement #</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Due Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Port</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                <th className="text-right px-4 py-2.5 font-medium">Entries</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="p-0"><TableRowsSkeleton rows={8} cols={8} /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No statements found
                  </td>
                </tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.recid} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.stmtNo}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.date ? format(parseISO(r.date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.dueDate ? format(parseISO(r.dueDate), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-[160px] truncate">{r.coName ?? r.coKey}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.port ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {r.amount != null ? fmtUSD(r.amount) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{r.entryCount ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[r.statusLabel] ?? 'bg-slate-100 text-slate-600'}`}>
                      {r.statusLabel}
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
              <button onClick={() => load(page - 1)} disabled={page === 1}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
              <button onClick={() => load(page + 1)} disabled={page === totalPages}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
