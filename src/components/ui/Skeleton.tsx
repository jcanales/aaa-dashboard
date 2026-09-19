import React from 'react'
import { cn } from '@/lib/utils'

export function Sk({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('relative overflow-hidden bg-slate-200 rounded', className)} style={style}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  )
}

export function KpiCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2.5">
        <Sk className="h-8 w-8 rounded-lg flex-shrink-0" />
        <Sk className="h-3 w-2/3 max-w-24" />
      </div>
      <Sk className="h-7 w-3/4 max-w-28" />
      <Sk className="h-3 w-full max-w-36 mt-2" />
    </div>
  )
}

export function ChartCardSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <Sk className="h-3 w-40 mb-4" />
      <Sk className="w-full rounded-lg" style={{ height }} />
    </div>
  )
}

export function TableRowsSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-50">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Sk key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Placeholder rows for an expanded HTS-code row's entry-level drill-down
// (Entry #, Date, Importer, Value, Duty) — used while that row's entries
// are being fetched, instead of a plain "Loading…" line.
export function EntriesDrillDownSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100/70">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-1.5">
          <Sk className="h-2.5 w-24 flex-shrink-0" />
          <Sk className="h-2.5 w-20 flex-shrink-0" />
          <Sk className="h-2.5 flex-1 max-w-[160px]" />
          <Sk className="h-2.5 w-14 flex-shrink-0 ml-auto" />
          <Sk className="h-2.5 w-14 flex-shrink-0" />
        </div>
      ))}
    </div>
  )
}

export function PresentationChartCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <Sk className="h-4 w-52" />
        <Sk className="h-6 w-24" />
      </div>
      <div className="px-3 pb-2">
        <Sk className="w-full rounded-lg" style={{ height: 230 }} />
      </div>
      <div className="border-t border-slate-100 p-3 space-y-1.5">
        {[0, 1, 2, 3].map(i => <Sk key={i} className="h-6 w-full" />)}
      </div>
    </div>
  )
}
