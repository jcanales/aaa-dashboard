import React, { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO, startOfMonth, addMonths } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  AlertTriangle, TrendingUp, Zap, Repeat, Lightbulb, Package,
  Landmark, DollarSign, Percent, Download,
} from 'lucide-react'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import { formatUSD } from '@/utils/formatUtils'
import { captureElement } from '@/utils/chartCapture'
import { downloadIeepaReportPdf } from '@/utils/ieepaReportPdf'
import {
  fetchIeepaKpis, fetchIeepaMonthly, fetchIeepaTopEntries,
  type IeepaKpis, type IeepaMonthRow, type IeepaTopEntry,
} from '@/api/entriesApi'

// ── Formatting ──────────────────────────────────────────────────────────────
function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}
function pctNum(part: number, total: number) { return total > 0 ? (part / total) * 100 : 0 }
function pctStr(part: number, total: number) { return `${pctNum(part, total).toFixed(1)}%` }

const DONUT_COLORS = { regular: '#073b49', sec301: '#3A6FF9', sec232: '#077a96', ieepa: '#f59e0b', remed: '#ef4444' }

// ── Month range helper ───────────────────────────────────────────────────────
// USENTRY.DUTY (surfaced here as regularDuty) is the header grand-total duty,
// not the baseline-only segment — the sec301/232/ieepa/remediation buckets are
// already included in it, so isolating "regular" duty means subtracting them
// back out (same correction DutiesBreakdownPage applies to its trend chart).
interface FullMonth {
  key: string; label: string; yr: number; mo: number
  entries: number; ieepaEntries: number
  regularDuty: number; sec301: number; sec232: number
  ieepaDuty: number; remediation: number; combined: number
}

function buildFullMonthRange(dateFrom: string, dateTo: string, monthly: IeepaMonthRow[]): FullMonth[] {
  const from = parseISO(dateFrom)
  const to = parseISO(dateTo)
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return []

  const byKey = new Map(monthly.map((m) => [`${m.yr}-${String(m.mo).padStart(2, '0')}`, m]))
  const months: FullMonth[] = []
  let cursor = startOfMonth(from)
  const end = startOfMonth(to)
  let guard = 0
  while (cursor <= end && guard < 120) {
    const yr = cursor.getFullYear()
    const mo = cursor.getMonth() + 1
    const key = `${yr}-${String(mo).padStart(2, '0')}`
    const row = byKey.get(key)
    const sec301 = row?.sec301 ?? 0
    const sec232 = row?.sec232 ?? 0
    const ieepaDuty = row?.ieepaDuty ?? 0
    const remediation = row?.remediation ?? 0
    months.push({
      key, label: format(cursor, 'MMM'), yr, mo,
      entries: row?.entries ?? 0,
      ieepaEntries: row?.ieepaEntries ?? 0,
      regularDuty: Math.max(0, (row?.regularDuty ?? 0) - sec301 - sec232 - ieepaDuty - remediation),
      sec301, sec232, ieepaDuty, remediation,
      combined: ieepaDuty + remediation,
    })
    cursor = addMonths(cursor, 1)
    guard++
  }
  return months
}

interface Insight { icon: React.ReactNode; title: string; text: string }

function buildInsights(months: FullMonth[], kpis: IeepaKpis): Insight[] {
  const totalCombined = kpis.ieepaDuty + kpis.remediationDuty
  const nonZero = months.filter((m) => m.combined > 0)
  if (nonZero.length === 0 || totalCombined === 0) {
    return [{
      icon: <Package className="h-[18px] w-[18px]" />,
      title: 'No IEEPA Impact',
      text: 'No entries in this period carried IEEPA or Reciprocal duty.',
    }]
  }

  const peak = nonZero.reduce((a, b) => (b.combined > a.combined ? b : a))
  const peakShare = pctNum(peak.combined, totalCombined)
  const insights: Insight[] = [{
    icon: <TrendingUp className="h-[18px] w-[18px]" />,
    title: `${peak.label} — Peak IEEPA Month`,
    text: `${peak.label} saw ${formatUSD(peak.combined)} in combined IEEPA duties — ${
      peakShare >= 40 ? 'by far the highest single month' : 'the highest month'
    } in the period, representing ${peakShare.toFixed(1)}% of total IEEPA exposure.`,
  }]

  // Compare against the most recent ACTIVE month, not the last calendar month
  // in range — trailing zero months (e.g. a YTD range that runs past the last
  // shipment) would otherwise always read as a misleading "100% drop".
  const lastActive = nonZero[nonZero.length - 1]
  if (lastActive && lastActive.key !== peak.key) {
    if (lastActive.combined < peak.combined) {
      const drop = pctNum(peak.combined - lastActive.combined, peak.combined)
      insights.push({
        icon: <AlertTriangle className="h-[18px] w-[18px]" />,
        title: 'Exposure Down From Peak',
        text: `IEEPA exposure has fallen ${drop.toFixed(1)}% from the ${peak.label} peak (${formatUSD(peak.combined)}) to ${lastActive.label} (${formatUSD(lastActive.combined)}), consistent with reduced volume or sourcing adjustments.`,
      })
    } else {
      const activeIdx = nonZero.length - 2
      const prev = activeIdx >= 0 ? nonZero[activeIdx] : undefined
      if (prev && prev.combined > 0 && lastActive.combined > prev.combined) {
        const rise = pctNum(lastActive.combined - prev.combined, prev.combined)
        insights.push({
          icon: <TrendingUp className="h-[18px] w-[18px]" />,
          title: 'Exposure Trending Up',
          text: `IEEPA exposure increased ${rise.toFixed(1)}% from ${prev.label} to ${lastActive.label} (${formatUSD(prev.combined)} → ${formatUSD(lastActive.combined)}).`,
        })
      }
    }
  }

  insights.push({
    icon: <Lightbulb className="h-[18px] w-[18px]" />,
    title: 'Optimization Opportunity',
    text: `IEEPA duties represent ${pctStr(totalCombined, kpis.totalDuty)} of total duties paid in this period (${formatUSD(totalCombined)}). A classification review, first-sale valuation analysis, or FTA/USMCA eligibility audit could reduce the dutiable base on qualifying product lines.`,
  })

  return insights.slice(0, 3)
}

// ── Small presentational pieces ──────────────────────────────────────────────
function ReportKpi({ icon, label, value, sub, valueClass }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <span className="text-teal-600">{icon}</span>
      </div>
      <p className={`text-2xl font-bold leading-tight ${valueClass ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function HighlightCard({ accent, icon, tag, label, value, sub, badge }: {
  accent: 'teal' | 'amber'; icon: React.ReactNode; tag: string; label: string; value: string; sub: string; badge: string
}) {
  const c = accent === 'teal'
    ? { border: 'border-l-teal-600', tagBg: 'bg-teal-100 text-teal-700', value: 'text-teal-700', badge: 'bg-teal-50 text-teal-700 border border-teal-200' }
    : { border: 'border-l-amber-500', tagBg: 'bg-amber-100 text-amber-700', value: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border border-amber-200' }
  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${c.border} p-5 shadow-sm`}>
      <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 mb-2.5 ${c.tagBg}`}>
        {icon} {tag}
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}</p>
      <p className={`text-3xl font-bold leading-none ${c.value}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-2">{sub}</p>
      <span className={`inline-block mt-2.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.badge}`}>{badge}</span>
    </div>
  )
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {sub && <p className="text-[11px] text-slate-400 mb-3">{sub}</p>}
      {children}
    </div>
  )
}

function MoMTrend({ current, prior }: { current: number; prior: number }) {
  if (prior === 0 && current === 0) return <span className="text-slate-300">—</span>
  if (prior === 0 && current > 0) return <span className="text-brand-600 font-bold">NEW</span>
  if (prior > 0 && current === 0) return <span className="text-emerald-600 font-bold">▼ 100%</span>
  const change = ((current - prior) / prior) * 100
  if (change > 0.5) return <span className="text-amber-600 font-bold">▲ {change.toFixed(1)}%</span>
  if (change < -0.5) return <span className="text-emerald-600 font-bold">▼ {Math.abs(change).toFixed(1)}%</span>
  return <span className="text-slate-400">—</span>
}

function MiniBar({ duty, recip }: { duty: number; recip: number }) {
  const total = duty + recip
  const dutyPct = total > 0 ? (duty / total) * 100 : 0
  return (
    <div className="min-w-[110px] h-2 rounded-full bg-slate-100 overflow-hidden flex">
      <div className="h-full bg-teal-800" style={{ width: `${dutyPct}%` }} />
      <div className="h-full bg-amber-500" style={{ width: `${total > 0 ? 100 - dutyPct : 0}%` }} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
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

  const fullMonths = useMemo(() => buildFullMonthRange(dateFrom, dateTo, monthly), [dateFrom, dateTo, monthly])
  const insights = useMemo(() => (kpis ? buildInsights(fullMonths, kpis) : []), [fullMonths, kpis])
  const totalCombined = (kpis?.ieepaDuty ?? 0) + (kpis?.remediationDuty ?? 0)
  const trueRegularDuty = Math.max(
    0,
    (kpis?.regularDuty ?? 0) - (kpis?.sec301 ?? 0) - (kpis?.sec232 ?? 0) - (kpis?.ieepaDuty ?? 0) - (kpis?.remediationDuty ?? 0),
  )
  const peakKey = useMemo(() => {
    const nonZero = fullMonths.filter((m) => m.combined > 0)
    if (nonZero.length === 0) return null
    return nonZero.reduce((a, b) => (b.combined > a.combined ? b : a)).key
  }, [fullMonths])

  const monthlyChartData = fullMonths.map((m) => ({
    period: m.label, 'IEEPA Duty': m.ieepaDuty, 'Reciprocal Duty': m.remediation,
  }))
  const duty301ChartData = fullMonths.map((m) => ({ period: m.label, 'Duty 301': m.sec301 }))
  const regularChartData = fullMonths.map((m) => ({ period: m.label, 'Regular Duty': m.regularDuty }))

  const donutData = kpis ? [
    { name: 'Regular Duty', value: trueRegularDuty,        color: DONUT_COLORS.regular },
    { name: 'Sec 301',      value: kpis.sec301,            color: DONUT_COLORS.sec301 },
    { name: 'Sec 232',      value: kpis.sec232,            color: DONUT_COLORS.sec232 },
    { name: 'IEEPA Duty',   value: kpis.ieepaDuty,         color: DONUT_COLORS.ieepa },
    { name: 'Reciprocal',   value: kpis.remediationDuty,   color: DONUT_COLORS.remed },
  ].filter((d) => d.value > 0) : []

  const maxTopEntry = topEntries[0]?.combinedIeepa ?? 0
  const periodLabel = dateFrom && dateTo
    ? `${format(parseISO(dateFrom), 'MMM d, yyyy')} – ${format(parseISO(dateTo), 'MMM d, yyyy')}`
    : 'All dates'

  const barChartRef = useRef<HTMLDivElement>(null)
  const donutChartRef = useRef<HTMLDivElement>(null)
  const duty301ChartRef = useRef<HTMLDivElement>(null)
  const generalDutyChartRef = useRef<HTMLDivElement>(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const handleDownloadPdf = async () => {
    if (!kpis) return
    setExportingPdf(true)
    try {
      const [barChartImg, donutImg, duty301Img, generalDutyImg] = await Promise.all([
        captureElement(barChartRef.current),
        captureElement(donutChartRef.current),
        captureElement(duty301ChartRef.current),
        captureElement(generalDutyChartRef.current),
      ])
      await downloadIeepaReportPdf({
        kpis,
        trueRegularDuty,
        months: fullMonths.map((m) => ({
          key: m.key, label: m.label,
          ieepaDuty: m.ieepaDuty, remediation: m.remediation, combined: m.combined,
        })),
        topEntries,
        insights: insights.map((ins) => ({ title: ins.title, text: ins.text })),
        peakKey,
        dateFrom,
        dateTo,
        clientName: selectedClient?.name,
        barChartImg,
        donutImg,
        duty301Img,
        generalDutyImg,
      }, `IEEPA_Report_${selectedClient?.coKey ?? 'all-clients'}_${dateFrom}_to_${dateTo}.pdf`)
    } finally {
      setExportingPdf(false)
    }
  }

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
        <div className="ml-auto text-right">
          <h1 className="text-sm font-semibold text-slate-700">IEEPA Tariff Impact Report</h1>
          <p className="text-[11px] text-slate-400">
            {selectedClient?.name ?? 'All Clients'} · {periodLabel} · {(kpis?.totalEntries ?? 0).toLocaleString()} entries
          </p>
        </div>
      </div>

      {/* Alert banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-800">
          <strong>IEEPA tariffs effective February 2025.</strong> Reciprocal (&quot;Liberation Day&quot;) duties applied
          from April 2025. This report covers customs entries subject to International Emergency Economic Powers Act
          duties, Section 301, and Section 232 surcharges.
        </p>
      </div>

      {/* KPI grid */}
      <div>
        <div className="flex items-center justify-between mb-2.5 border-b border-slate-200 pb-1.5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
            Financial Overview
          </h2>
          <button
            onClick={handleDownloadPdf}
            disabled={exportingPdf || !kpis}
            className="flex items-center gap-1.5 text-[11px] font-medium text-teal-700 hover:text-teal-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Download one-page PDF summary"
          >
            <Download className="h-3.5 w-3.5" />
            {exportingPdf ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ReportKpi icon={<Landmark className="h-4 w-4" />} label="Total Dutiable Value" value={fmtM(kpis?.totalValue ?? 0)}
            sub={`Across ${(kpis?.totalEntries ?? 0).toLocaleString()} entries`} />
          <ReportKpi icon={<DollarSign className="h-4 w-4" />} label="Total All Duties Paid" value={fmtM(kpis?.totalDuty ?? 0)}
            sub="Duty + IEEPA + 301 + 232" />
          <ReportKpi icon={<Percent className="h-4 w-4" />} label="Regular Duty" value={formatUSD(trueRegularDuty)}
            sub={`Sec 301: ${formatUSD(kpis?.sec301 ?? 0)}`} />
          <ReportKpi icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} label="Entries with IEEPA Impact"
            value={`${(kpis?.ieepaEntries ?? 0).toLocaleString()} / ${(kpis?.totalEntries ?? 0).toLocaleString()}`}
            sub={`${pctStr(kpis?.ieepaEntries ?? 0, kpis?.totalEntries ?? 0)} of all entries`} />
        </div>
      </div>

      {/* IEEPA highlight cards */}
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-teal-800 mb-2.5 border-b border-slate-200 pb-1.5">
          IEEPA Duty Breakdown
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <HighlightCard accent="teal" icon={<Zap className="h-3 w-3" />} tag="IEEPA Total"
            label="Combined IEEPA Exposure" value={fmtM(totalCombined)}
            sub="IEEPA Duty + Reciprocal combined"
            badge={`${pctStr(totalCombined, kpis?.totalDuty ?? 0)} of all duties paid`} />
          <HighlightCard accent="amber" icon={<Zap className="h-3 w-3" />} tag="IEEPA Duty"
            label="IEEPA Duty" value={fmtM(kpis?.ieepaDuty ?? 0)}
            sub="International Emergency Economic Powers Act"
            badge={`${pctStr(kpis?.ieepaDuty ?? 0, totalCombined)} of IEEPA total`} />
          <HighlightCard accent="amber" icon={<Repeat className="h-3 w-3" />} tag="Reciprocal Duty"
            label="IEEPA Reciprocal Duty" value={fmtM(kpis?.remediationDuty ?? 0)}
            sub="Liberation Day reciprocal tariffs"
            badge={`${pctStr(kpis?.remediationDuty ?? 0, totalCombined)} of IEEPA total`} />
        </div>
      </div>

      {/* Charts row 1 */}
      {fullMonths.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ChartCard title="Monthly IEEPA Duty Impact" sub="IEEPA Duty vs Reciprocal Duty by month">
              <div ref={barChartRef}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthlyChartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtM} width={55} />
                    <Tooltip formatter={(v: number) => formatUSD(v)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="IEEPA Duty" stackId="a" fill={DONUT_COLORS.regular} />
                    <Bar dataKey="Reciprocal Duty" stackId="a" fill={DONUT_COLORS.ieepa} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
          <ChartCard title="Total Duty Composition" sub="Share of all duties by type">
            <div ref={donutChartRef}>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {donutData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatUSD(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}

      {/* Charts row 2 */}
      {fullMonths.length > 0 && (
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-teal-800 mb-2.5 border-b border-slate-200 pb-1.5">
            Monthly Duty 301 &amp; General Duty
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Monthly Duty 301 Impact" sub="Section 301 duties by month">
              <div ref={duty301ChartRef}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={duty301ChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtM} width={55} />
                    <Tooltip formatter={(v: number) => formatUSD(v)} />
                    <Bar dataKey="Duty 301" fill={DONUT_COLORS.sec301} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard title="Monthly General Duty (HTS Dutiable)" sub="Regular duty by month">
              <div ref={generalDutyChartRef}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={regularChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtM} width={55} />
                    <Tooltip formatter={(v: number) => formatUSD(v)} />
                    <Bar dataKey="Regular Duty" fill={DONUT_COLORS.regular} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        </div>
      )}

      {/* Top entries table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Top 10 Entries by IEEPA Exposure</h2>
          <span className="text-[11px] text-slate-400">Sorted by combined IEEPA duty descending</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sticky-table">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-medium">#</th>
                <th className="text-left px-4 py-2.5 font-medium">Entry #</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-right px-4 py-2.5 font-medium">IEEPA Duty</th>
                <th className="text-right px-4 py-2.5 font-medium">Reciprocal Duty</th>
                <th className="text-right px-4 py-2.5 font-medium">Combined IEEPA</th>
                <th className="text-left px-4 py-2.5 font-medium">Impact</th>
                <th className="text-right px-4 py-2.5 font-medium">Entry Value</th>
              </tr>
            </thead>
            <tbody>
              {topEntries.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    {loading ? 'Loading…' : 'No IEEPA-affected entries in this period'}
                  </td>
                </tr>
              )}
              {topEntries.map((e, i) => (
                <tr key={e.recid} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                      i < 3 ? 'bg-teal-800 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-teal-800">{e.entryNo}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {e.entryDate ? format(parseISO(e.entryDate), 'MM/dd/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700 font-medium">{formatUSD(e.ieepaDuty)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 font-medium">{formatUSD(e.remediationDuty)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-amber-600">{formatUSD(e.combinedIeepa)}</td>
                  <td className="px-4 py-2.5">
                    <div className="w-20 h-1.5 rounded-full bg-amber-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${maxTopEntry > 0 ? (e.combinedIeepa / maxTopEntry) * 100 : 0}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-teal-800">{formatUSD(e.entryVal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Month-by-month comparison table */}
      {fullMonths.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Month-by-Month IEEPA Comparison</h2>
            <p className="text-[11px] text-slate-400">{periodLabel}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 font-medium">Month</th>
                  <th className="text-right px-4 py-2.5 font-medium">IEEPA Duty</th>
                  <th className="text-right px-4 py-2.5 font-medium">Reciprocal Duty</th>
                  <th className="text-right px-4 py-2.5 font-medium">Combined</th>
                  <th className="text-left px-4 py-2.5 font-medium">Breakdown</th>
                  <th className="text-right px-4 py-2.5 font-medium">% of Period</th>
                  <th className="text-right px-4 py-2.5 font-medium">MoM Change</th>
                </tr>
              </thead>
              <tbody>
                {fullMonths.map((m, i) => {
                  const prior = i > 0 ? fullMonths[i - 1].combined : 0
                  const isPeak = m.key === peakKey
                  return (
                    <tr key={m.key} className={`border-b border-slate-50 ${isPeak ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-2.5 font-bold text-teal-800">
                        {m.label}{isPeak ? ' ★' : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {m.ieepaDuty > 0
                          ? <span className="font-semibold text-teal-800">{formatUSD(m.ieepaDuty)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {m.remediation > 0
                          ? <span className="font-semibold text-amber-600">{formatUSD(m.remediation)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {m.combined > 0
                          ? <span className="font-extrabold text-slate-800">{formatUSD(m.combined)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5"><MiniBar duty={m.ieepaDuty} recip={m.remediation} /></td>
                      <td className="px-4 py-2.5 text-right text-slate-500 font-medium">
                        {pctStr(m.combined, totalCombined)}
                      </td>
                      <td className="px-4 py-2.5 text-right"><MoMTrend current={m.combined} prior={prior} /></td>
                    </tr>
                  )
                })}
                <tr className="bg-slate-50 font-bold">
                  <td className="px-4 py-2.5 text-teal-800">Total</td>
                  <td className="px-4 py-2.5 text-right text-teal-800">{formatUSD(kpis?.ieepaDuty ?? 0)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-600">{formatUSD(kpis?.remediationDuty ?? 0)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800 text-sm">{formatUSD(totalCombined)}</td>
                  <td className="px-4 py-2.5 text-[10px] text-slate-500">
                    {pctStr(kpis?.ieepaDuty ?? 0, totalCombined)} / {pctStr(kpis?.remediationDuty ?? 0, totalCombined)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-teal-800">100.0%</td>
                  <td className="px-4 py-2.5 text-right text-slate-300">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* legend */}
          <div className="flex flex-wrap items-center gap-5 px-4 py-3 border-t border-slate-100 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-teal-800" /> IEEPA Duty</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Reciprocal Duty</span>
            <span className="flex items-center gap-1.5"><span className="text-amber-600 font-bold">▲</span> Month-over-month increase</span>
            <span className="flex items-center gap-1.5"><span className="text-emerald-600 font-bold">▼</span> Month-over-month decrease</span>
            <span className="flex items-center gap-1.5 text-amber-600 font-bold">★ Peak month</span>
          </div>
        </div>
      )}

      {/* Key insights */}
      {insights.length > 0 && (
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-teal-800 mb-2.5 border-b border-slate-200 pb-1.5">
            Key Insights
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {insights.map((ins) => (
              <div key={ins.title} className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                <div className="text-teal-700 mb-1.5">{ins.icon}</div>
                <p className="text-[11px] font-bold text-teal-800 mb-1">{ins.title}</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">{ins.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-200 pt-3">
        <p className="max-w-[600px]">
          This report is prepared for informational purposes only based on entry data provided. Duty figures are
          subject to CBP liquidation and post-entry correction.
        </p>
        <p className="font-bold text-teal-800">CONFIDENTIAL</p>
      </div>
    </div>
  )
}
