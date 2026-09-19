import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import { fetchCrossings, type CrossingRow } from '@/api/abiApi'
import { TableRowsSkeleton } from '@/components/ui/Skeleton'
import { formatUSD } from '@/utils/formatUtils'

const STATUS_COLORS: Record<string, string> = {
  Open:   'bg-amber-100 text-amber-700',
  Closed: 'bg-emerald-100 text-emerald-700',
}

export function AbiCrossingsPage() {
  useClients()
  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [rows, setRows] = useState<CrossingRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(false)

  const load = (p: number, size: number = pageSize) => {
    setLoading(true)
    fetchCrossings({ coKey: selectedClient?.coKey, dateFrom, dateTo, page: p, limit: size })
      .then((res) => { setRows(res.data); setTotal(res.total); setPage(p) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [searchTrigger, selectedClient?.coKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function changePageSize(size: number) {
    setPageSize(size)
    load(1, size)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="flex flex-col h-full min-h-0 space-y-6">
      <div className="flex flex-wrap items-center gap-2 shrink-0">
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
          <h1 className="text-sm font-semibold text-slate-700">ABI Crossings</h1>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-slate-700">Border Crossings</h2>
          <span className="text-xs text-slate-400">{total.toLocaleString()} records</span>
        </div>
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-xs sticky-table">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-medium">Entry #</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Customer Ref</th>
                <th className="text-left px-4 py-2.5 font-medium">Port</th>
                <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">Value</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="p-0"><TableRowsSkeleton rows={8} cols={7} /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No crossings found
                  </td>
                </tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.recid} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {r.entryNo && r.entryRecid ? (
                      <Link to={`/entries/${r.entryRecid}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                        {r.entryNo}
                      </Link>
                    ) : (r.entryNo ?? '—')}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.date ? format(parseISO(r.date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-[160px] truncate">{r.coName ?? r.coKey}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.custRef || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.port || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap tabular-nums">{r.value ? formatUSD(r.value) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-200"
            >
              {[25, 50, 75, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Page {page} of {totalPages || 1}</span>
            <div className="flex gap-1">
              <button onClick={() => load(page - 1)} disabled={page === 1}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
              <button onClick={() => load(page + 1)} disabled={page >= totalPages}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
