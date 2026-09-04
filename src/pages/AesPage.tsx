import React, { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import { fetchAesList, type AesRow } from '@/api/aesApi'
import { TableRowsSkeleton } from '@/components/ui/Skeleton'

const STATUS_COLORS: Record<string, string> = {
  ACCEPTED:   'bg-emerald-100 text-emerald-700',
  FILED:      'bg-blue-100 text-blue-700',
  CANCELLED:  'bg-slate-100 text-slate-600',
  ERROR:      'bg-red-100 text-red-700',
  DUPLICATED: 'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-purple-100 text-purple-700',
}

const STATUS_OPTIONS = ['all', 'ACCEPTED', 'FILED', 'CANCELLED', 'ERROR', 'DUPLICATED', 'PROCESSING']

export function AesPage() {
  useClients()
  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [rows, setRows] = useState<AesRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const load = (p: number, status: string) => {
    setLoading(true)
    fetchAesList({
      coKey: selectedClient?.coKey,
      dateFrom,
      dateTo,
      page: p,
      limit: 25,
      status: status === 'all' ? undefined : status,
    }).then((res) => {
      setRows(res.data)
      setTotal(res.total)
      setPage(p)
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load(1, statusFilter) }, [searchTrigger, selectedClient?.coKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / 25)

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <ClientSelector />
        <DateRangeSelector />
        <SearchButton />
        <div className="flex gap-1 ml-2 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); load(1, s) }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors capitalize
                ${statusFilter === s ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {s}
            </button>
          ))}
        </div>
        {loading && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="h-3.5 w-3.5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
            Loading…
          </span>
        )}
        <div className="ml-auto">
          <h1 className="text-sm font-semibold text-slate-700">AES Filings</h1>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Export Filings</h2>
          <span className="text-xs text-slate-400">{total.toLocaleString()} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sticky-table">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-medium">AES Ref #</th>
                <th className="text-left px-4 py-2.5 font-medium">Customer Ref</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="p-0"><TableRowsSkeleton rows={8} cols={5} /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    No filings found
                  </td>
                </tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.recid} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.reference}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.custRef || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-[180px] truncate">{r.coName ?? r.coKey}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.date ? format(parseISO(r.date), 'MMM d, yyyy') : '—'}
                  </td>
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
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => load(page - 1, statusFilter)} disabled={page === 1}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
              <button onClick={() => load(page + 1, statusFilter)} disabled={page === totalPages}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
