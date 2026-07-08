import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, Building2 } from 'lucide-react'
import { useClientStore } from '@/store/clientStore'

export function ClientSelector() {
  const { clients, selectedClient, isLoading, setSelected } = useClientStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = search
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.coKey ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : clients

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium
          transition-all max-w-[260px]
          ${selectedClient
            ? 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}
        `}
      >
        <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">
          {selectedClient ? selectedClient.name : 'All Accounts'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 pt-2 pb-1 border-b border-slate-100">
            <input
              type="text"
              placeholder="Search client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-md outline-none focus:border-teal-400"
            />
          </div>

          <button
            onClick={() => { setSelected(null); setOpen(false); setSearch('') }}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors border-b border-slate-100
              ${!selectedClient ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-slate-600'}
            `}
          >
            <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <span>All Accounts</span>
          </button>

          <div className="max-h-64 overflow-y-auto">
            {isLoading && (
              <p className="text-xs text-slate-400 px-3 py-3 text-center">Loading clients…</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-3 text-center">No clients found</p>
            )}
            {!isLoading && filtered.map((c) => (
              <button
                key={c.coKey}
                onClick={() => { setSelected(c); setOpen(false); setSearch('') }}
                className={`
                  w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors
                  ${selectedClient?.coKey === c.coKey ? 'bg-teal-50' : ''}
                `}
              >
                <div className="mt-0.5 h-5 w-5 rounded flex items-center justify-center bg-teal-100 text-teal-700 text-[9px] font-bold flex-shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium leading-snug ${selectedClient?.coKey === c.coKey ? 'text-teal-800' : 'text-slate-700'}`}>
                    {c.name}
                  </p>
                  {c.irsNo && (
                    <p className="text-[10px] text-slate-400 leading-tight">{c.irsNo}</p>
                  )}
                </div>
                <span className="mt-0.5 flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-600 leading-none">
                  {c.coKey}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
