import React, { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, Bell, CheckCircle, Clock, EyeOff, Tag } from 'lucide-react'
import { fetchChanges, fetchKpis, reviewChange } from '@/api/tariffApi'
import type { TariffChange, TariffKpis } from '@/types/tariff.types'
import { Sk, KpiCardSkeleton } from '@/components/ui/Skeleton'

function impactColor(score: number): string {
  if (score >= 8) return 'text-red-600 bg-red-50 border-red-200'
  if (score >= 5) return 'text-amber-600 bg-amber-50 border-amber-200'
  return 'text-emerald-600 bg-emerald-50 border-emerald-200'
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700',
  reviewed:   'bg-blue-100 text-blue-700',
  approved:   'bg-emerald-100 text-emerald-700',
  suppressed: 'bg-slate-100 text-slate-500',
}

const STATUS_TABS = ['all', 'pending', 'reviewed', 'approved', 'suppressed'] as const
type StatusTab = (typeof STATUS_TABS)[number]

function fmtDuty(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null && 'rate' in v) return String((v as { rate: unknown }).rate)
  return String(v)
}

function KpiTile({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
      <span className="text-teal-600">{icon}</span>
      <div>
        <p className="text-xl font-bold text-slate-800">{value}</p>
        <p className="text-[10px] text-slate-400">{label}</p>
      </div>
    </div>
  )
}

export function TariffPage() {
  const [kpis, setKpis] = useState<TariffKpis | null>(null)
  const [changes, setChanges] = useState<TariffChange[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<StatusTab>('all')
  const [selectedChange, setSelectedChange] = useState<TariffChange | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = (p: number, status: StatusTab) => {
    setLoading(true)
    fetchChanges({ status: status === 'all' ? undefined : status, page: p, limit: 15 })
      .then(({ data, total: t }) => { setChanges(data); setTotal(t); setPage(p) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchKpis().then(setKpis).catch(console.error)
    load(1, 'all')
  }, [])

  const handleReview = async (action: 'approved' | 'suppressed') => {
    if (!selectedChange) return
    setReviewing(true)
    try {
      const updated = await reviewChange(selectedChange.id, action)
      setSelectedChange(updated)
      setChanges((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      if (kpis && action === 'approved') {
        setKpis({ ...kpis, pendingReview: Math.max(0, kpis.pendingReview - 1) })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setReviewing(false)
    }
  }

  const totalPages = Math.ceil(total / 15)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-slate-700">Tariff Intelligence</h1>
      </div>

      {/* KPI tiles */}
      {kpis ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiTile label="Changes today"       value={kpis.changesToday}        icon={<Tag className="h-5 w-5" />} />
          <KpiTile label="Pending review"       value={kpis.pendingReview}       icon={<Clock className="h-5 w-5 text-amber-500" />} />
          <KpiTile label="Alerts this week"     value={kpis.alertsSentThisWeek}  icon={<Bell className="h-5 w-5" />} />
          <KpiTile label="Clients affected"     value={kpis.clientsAffected}     icon={<AlertTriangle className="h-5 w-5" />} />
          <KpiTile label="Highest impact score" value={kpis.highestImpactScore}  icon={<CheckCircle className="h-5 w-5 text-red-500" />} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => <KpiCardSkeleton key={i} />)}
        </div>
      )}

      <div className="flex gap-4">
        {/* Change list */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Status tabs */}
          <div className="flex gap-0 border-b border-slate-100 px-2 pt-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); load(1, tab); setSelectedChange(null) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-t capitalize transition-colors
                  ${activeTab === tab ? 'bg-teal-700 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="divide-y divide-slate-50">
            {loading && (
              <div className="divide-y divide-slate-50">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="px-4 py-3 flex flex-col gap-2">
                    <Sk className="h-3 w-3/4" />
                    <div className="flex items-center gap-2">
                      <Sk className="h-3 w-14" />
                      <Sk className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && changes.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">No changes found</div>
            )}
            {!loading && changes.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedChange(c)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors
                  ${selectedChange?.id === c.id ? 'bg-blue-50/60 border-l-2 border-brand-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-medium text-slate-800 line-clamp-2 leading-tight">{c.title}</p>
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${impactColor(c.impactScore)}`}>
                    {c.impactScore}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {c.status}
                  </span>
                  <span className="text-[10px] text-slate-400">{c.documentNumber}</span>
                  {c.effectiveDate && (
                    <span className="text-[10px] text-slate-400">
                      Eff: {format(parseISO(c.effectiveDate), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => load(page - 1, activeTab)} disabled={page === 1}
                  className="px-2 py-0.5 text-[10px] rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
                <button onClick={() => load(page + 1, activeTab)} disabled={page === totalPages}
                  className="px-2 py-0.5 text-[10px] rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedChange && (
          <div className="w-96 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[selectedChange.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {selectedChange.status}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${impactColor(selectedChange.impactScore)}`}>
                  Impact {selectedChange.impactScore}/10
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800 leading-tight mt-1">{selectedChange.title}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{selectedChange.documentNumber}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-xs">
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Summary</p>
                <p className="text-slate-600 leading-relaxed">{selectedChange.summary}</p>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Impact Rationale</p>
                <p className="text-slate-600 leading-relaxed">{selectedChange.impactRationale}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Duty Before</p>
                  <p className="text-slate-700 font-medium">{fmtDuty(selectedChange.dutyBefore)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Duty After</p>
                  <p className="text-slate-700 font-medium">{fmtDuty(selectedChange.dutyAfter)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Effective Date</p>
                  <p className="text-slate-700">
                    {selectedChange.effectiveDate ? format(parseISO(selectedChange.effectiveDate), 'MMM d, yyyy') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Published</p>
                  <p className="text-slate-700">{format(parseISO(selectedChange.publicationDate), 'MMM d, yyyy')}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">HTS Codes</p>
                <div className="flex flex-wrap gap-1">
                  {selectedChange.htsCodes.map((hts) => (
                    <span key={hts} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-mono">{hts}</span>
                  ))}
                </div>
              </div>

              <a
                href={selectedChange.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
              >
                View source document ↗
              </a>

              {selectedChange.reviewedBy && (
                <div className="text-[10px] text-slate-400">
                  Reviewed by <strong className="text-slate-500">{selectedChange.reviewedBy}</strong>
                  {selectedChange.reviewedAt && ` on ${format(parseISO(selectedChange.reviewedAt), 'MMM d, yyyy')}`}
                </div>
              )}
            </div>

            {selectedChange.status === 'pending' && (
              <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => handleReview('approved')}
                  disabled={reviewing}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Approve & Alert
                </button>
                <button
                  onClick={() => handleReview('suppressed')}
                  disabled={reviewing}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Suppress
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
