/**
 * IEEPA Analysis PDF Report — @react-pdf/renderer template
 * Charts are passed as pre-captured base64 PNG images (html2canvas).
 */
import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet,
  Font, pdf,
} from '@react-pdf/renderer'
import type { IeepaKpis, IeepaMonthRow, IeepaTopEntry } from '@/api/entriesApi'

// ── Colors ────────────────────────────────────────────────────────────────────
const TEAL   = '#073b49'
const TEAL_L = '#0d9488'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const PURPLE = '#8b5cf6'
const BLUE   = '#3b82f6'
const SLATE  = '#475569'
const SLATE_L = '#94a3b8'
const SLATE_BG = '#f8fafc'
const BORDER = '#e2e8f0'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return fmtUSD(n)
}
function pct(part: number, total: number) {
  if (!total) return '0.0%'
  return `${((part / total) * 100).toFixed(1)}%`
}
function fmtDate(v: string | null) {
  if (!v) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(v))
  } catch { return String(v) }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingTop: 0,
    paddingBottom: 36,
    paddingHorizontal: 0,
    fontSize: 8,
    color: SLATE,
  },

  // Header
  header: {
    backgroundColor: TEAL,
    paddingHorizontal: 36,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'column' },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.3 },
  headerSubtitle: { fontSize: 9, color: '#7fb3c0', marginTop: 3 },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end' },
  headerMeta: { fontSize: 7.5, color: '#7fb3c0', marginTop: 2 },

  // Alert banner
  alertBanner: {
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingHorizontal: 36,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AMBER,
    marginTop: 1,
  },
  alertText: { fontSize: 7.5, color: '#92400e', flex: 1 },
  alertBold: { fontFamily: 'Helvetica-Bold', color: '#78350f' },

  // Body
  body: { paddingHorizontal: 36, paddingTop: 20 },

  // Section headings
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 4,
  },

  // KPI cards row
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  kpiCard: {
    flex: 1,
    backgroundColor: SLATE_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 10,
  },
  kpiLabel: { fontSize: 6.5, color: SLATE_L, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: TEAL, marginTop: 3 },
  kpiSub: { fontSize: 6.5, color: SLATE_L, marginTop: 2 },

  // Highlight cards
  highlightRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  highlightCard: {
    flex: 1,
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
  },
  hlCombined: { backgroundColor: '#fef2f2', borderLeftColor: RED },
  hlIeepa:    { backgroundColor: '#fffbeb', borderLeftColor: AMBER },
  hlRemed:    { backgroundColor: '#fff7ed', borderLeftColor: '#f97316' },
  hlLabel: { fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  hlAmount: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  hlPct: { fontSize: 7, marginTop: 3, color: SLATE_L },

  // Charts row
  chartsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  chartBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  chartHeader: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: SLATE_BG,
  },
  chartTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: TEAL },
  chartSub: { fontSize: 6, color: SLATE_L, marginTop: 1 },
  chartImg: { width: '100%' },

  // Tables
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  thead: { backgroundColor: TEAL, flexDirection: 'row' },
  theadCell: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  theadCellR: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'right',
  },
  trow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  trowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: SLATE_BG },
  tfoot: { flexDirection: 'row', backgroundColor: '#e7f0f3', borderTopWidth: 1, borderTopColor: '#b0c8d0' },
  tcell: { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 7, color: SLATE },
  tcellR: { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 7, color: SLATE, textAlign: 'right' },
  tcellBold: { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEAL },
  tcellAmt: { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  // Insights
  insightRow: { flexDirection: 'row', gap: 8 },
  insightCard: {
    flex: 1,
    borderRadius: 6,
    padding: 10,
  },
  insightAmber: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  insightBlue:  { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  insightTeal:  { backgroundColor: '#f0fdfa', borderWidth: 1, borderColor: '#99f6e4' },
  insightTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  insightBody: { fontSize: 7, lineHeight: 1.5, color: SLATE },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: { fontSize: 6.5, color: SLATE_L },
})

// ── Document component ────────────────────────────────────────────────────────
interface Props {
  kpis: IeepaKpis
  monthly: IeepaMonthRow[]
  topEntries: IeepaTopEntry[]
  dateFrom?: string
  dateTo?: string
  clientName?: string
  barChartImg?: string   // base64 PNG of the monthly bar chart
  donutImg?: string      // base64 PNG of the donut chart
}

export function IeepaReportDocument({
  kpis, monthly, topEntries, dateFrom, dateTo, clientName, barChartImg, donutImg,
}: Props) {
  const ieepaImpact = kpis.ieepaDuty + kpis.remediationDuty
  const generated = new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date())

  const dateRange = dateFrom && dateTo
    ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
    : 'All dates'

  return (
    <Document title="IEEPA Tariff Analysis Report" author="JD Group Trade Portal">
      {/* ── PAGE 1 ─────────────────────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.headerTitle}>IEEPA Tariff Analysis</Text>
            <Text style={s.headerSubtitle}>
              Section 232, IEEPA &amp; Reciprocal Duty Impact Report
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>
              JD Group
            </Text>
            <Text style={s.headerMeta}>Generated: {generated}</Text>
            <Text style={s.headerMeta}>Period: {dateRange}</Text>
            {clientName && <Text style={s.headerMeta}>Client: {clientName}</Text>}
          </View>
        </View>

        {/* Alert banner */}
        <View style={s.alertBanner}>
          <View style={s.alertDot} />
          <Text style={s.alertText}>
            <Text style={s.alertBold}>IEEPA Tariffs Active — </Text>
            Executive-order IEEPA duties effective February 2025.
            Reciprocal tariffs (Liberation Day) added April 2025.
            Review entry-level impacts and coordinate with trade counsel.
          </Text>
        </View>

        <View style={s.body}>

          {/* KPIs */}
          <Text style={s.sectionTitle}>Summary KPIs</Text>
          <View style={s.kpiRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Total Entries</Text>
              <Text style={s.kpiValue}>{kpis.totalEntries.toLocaleString()}</Text>
              <Text style={s.kpiSub}>In selected period</Text>
            </View>
            <View style={[s.kpiCard, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}>
              <Text style={[s.kpiLabel, { color: '#92400e' }]}>IEEPA-Affected Entries</Text>
              <Text style={[s.kpiValue, { color: '#b45309' }]}>{kpis.ieepaEntries.toLocaleString()}</Text>
              <Text style={s.kpiSub}>
                {pct(kpis.ieepaEntries, kpis.totalEntries)} of all entries
              </Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Total Entry Value</Text>
              <Text style={s.kpiValue}>{fmtM(kpis.totalValue)}</Text>
              <Text style={s.kpiSub}>Dutiable value</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Total All Duties</Text>
              <Text style={s.kpiValue}>{fmtM(kpis.totalDuty)}</Text>
              <Text style={s.kpiSub}>{pct(ieepaImpact, kpis.totalDuty)} IEEPA-related</Text>
            </View>
          </View>

          {/* IEEPA Highlights */}
          <Text style={s.sectionTitle}>IEEPA Impact Highlights</Text>
          <View style={s.highlightRow}>
            <View style={[s.highlightCard, s.hlCombined]}>
              <Text style={[s.hlLabel, { color: '#991b1b' }]}>Combined IEEPA Impact</Text>
              <Text style={[s.hlAmount, { color: RED }]}>{fmtM(ieepaImpact)}</Text>
              <Text style={s.hlPct}>{pct(ieepaImpact, kpis.totalDuty)} of total duties</Text>
            </View>
            <View style={[s.highlightCard, s.hlIeepa]}>
              <Text style={[s.hlLabel, { color: '#92400e' }]}>IEEPA Duty</Text>
              <Text style={[s.hlAmount, { color: AMBER }]}>{fmtM(kpis.ieepaDuty)}</Text>
              <Text style={s.hlPct}>{pct(kpis.ieepaDuty, kpis.totalDuty)} of total duties</Text>
            </View>
            <View style={[s.highlightCard, s.hlRemed]}>
              <Text style={[s.hlLabel, { color: '#7c2d12' }]}>Reciprocal Duty</Text>
              <Text style={[s.hlAmount, { color: '#ea580c' }]}>{fmtM(kpis.remediationDuty)}</Text>
              <Text style={s.hlPct}>{pct(kpis.remediationDuty, kpis.totalDuty)} of total duties</Text>
            </View>
          </View>

          {/* Duty composition breakdown */}
          <Text style={s.sectionTitle}>Duty Composition</Text>
          <View style={s.kpiRow}>
            {[
              { label: 'Regular Duty', value: kpis.regularDuty, color: TEAL_L },
              { label: 'Section 301', value: kpis.sec301, color: PURPLE },
              { label: 'Section 232', value: kpis.sec232, color: BLUE },
              { label: 'IEEPA Duty', value: kpis.ieepaDuty, color: AMBER },
              { label: 'Reciprocal', value: kpis.remediationDuty, color: RED },
            ].map((item) => (
              <View key={item.label} style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: item.color, flex: 1 }]}>
                <Text style={[s.kpiLabel, { color: item.color }]}>{item.label}</Text>
                <Text style={[s.kpiValue, { color: item.color, fontSize: 10 }]}>{fmtM(item.value)}</Text>
                <Text style={s.kpiSub}>{pct(item.value, kpis.totalDuty)} of total</Text>
              </View>
            ))}
          </View>

          {/* Charts */}
          {(barChartImg || donutImg) && (
            <>
              <Text style={s.sectionTitle}>Monthly Trend &amp; Duty Composition</Text>
              <View style={s.chartsRow}>
                {barChartImg && (
                  <View style={[s.chartBox, { flex: 2 }]}>
                    <View style={s.chartHeader}>
                      <Text style={s.chartTitle}>Monthly IEEPA &amp; Reciprocal Duty</Text>
                      <Text style={s.chartSub}>Stacked by duty type per month</Text>
                    </View>
                    <Image src={barChartImg} style={[s.chartImg, { padding: 6 }]} />
                  </View>
                )}
                {donutImg && (
                  <View style={[s.chartBox, { flex: 1 }]}>
                    <View style={s.chartHeader}>
                      <Text style={s.chartTitle}>Duty Composition</Text>
                      <Text style={s.chartSub}>Share of total duties</Text>
                    </View>
                    <Image src={donutImg} style={[s.chartImg, { padding: 6 }]} />
                  </View>
                )}
              </View>
            </>
          )}

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>JD Group — IEEPA Tariff Analysis · Confidential</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* ── PAGE 2 — Top Entries + Monthly Table + Insights ──────────────── */}
      <Page size="LETTER" style={s.page}>

        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.headerTitle}>IEEPA Tariff Analysis</Text>
            <Text style={s.headerSubtitle}>Top Entries &amp; Monthly Breakdown</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>JD Group</Text>
            <Text style={s.headerMeta}>{dateRange}</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* Top 10 entries */}
          {topEntries.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Top 10 Entries by IEEPA Impact</Text>
              <View style={s.table}>
                <View style={s.thead}>
                  <Text style={[s.theadCell, { flex: 1.5 }]}>Entry #</Text>
                  <Text style={s.theadCell}>Date</Text>
                  <Text style={s.theadCell}>Port</Text>
                  <Text style={[s.theadCell, { flex: 1.8 }]}>Importer</Text>
                  <Text style={s.theadCellR}>Entry Value</Text>
                  <Text style={s.theadCellR}>IEEPA Duty</Text>
                  <Text style={s.theadCellR}>Reciprocal</Text>
                  <Text style={s.theadCellR}>Combined</Text>
                </View>
                {topEntries.map((row, i) => (
                  <View key={row.recid} style={i % 2 === 0 ? s.trow : s.trowAlt}>
                    <Text style={[s.tcellBold, { flex: 1.5, fontSize: 6.5 }]}>{row.entryNo}</Text>
                    <Text style={s.tcell}>{fmtDate(row.entryDate)}</Text>
                    <Text style={s.tcell}>{row.port}</Text>
                    <Text style={[s.tcell, { flex: 1.8 }]}>{(row.custName ?? row.custKey).substring(0, 28)}</Text>
                    <Text style={s.tcellR}>{fmtM(row.entryVal)}</Text>
                    <Text style={[s.tcellAmt, { color: AMBER }]}>{fmtM(row.ieepaDuty)}</Text>
                    <Text style={[s.tcellAmt, { color: RED }]}>{fmtM(row.remediationDuty)}</Text>
                    <Text style={[s.tcellAmt, { color: TEAL, fontFamily: 'Helvetica-Bold' }]}>{fmtM(row.combinedIeepa)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Month-by-month table */}
          {monthly.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Month-by-Month IEEPA Breakdown</Text>
              <View style={s.table}>
                <View style={s.thead}>
                  <Text style={s.theadCell}>Month</Text>
                  <Text style={s.theadCellR}>Entries</Text>
                  <Text style={s.theadCellR}>IEEPA Entries</Text>
                  <Text style={s.theadCellR}>Regular Duty</Text>
                  <Text style={s.theadCellR}>Sec 301</Text>
                  <Text style={s.theadCellR}>Sec 232</Text>
                  <Text style={s.theadCellR}>IEEPA Duty</Text>
                  <Text style={s.theadCellR}>Reciprocal</Text>
                </View>
                {monthly.map((row, i) => (
                  <View key={`${row.yr}-${row.mo}`} style={i % 2 === 0 ? s.trow : s.trowAlt}>
                    <Text style={[s.tcellBold]}>{row.period}</Text>
                    <Text style={s.tcellR}>{row.entries.toLocaleString()}</Text>
                    <Text style={[s.tcellR, { color: row.ieepaEntries > 0 ? '#b45309' : SLATE_L }]}>
                      {row.ieepaEntries.toLocaleString()}
                    </Text>
                    <Text style={s.tcellR}>{fmtM(row.regularDuty)}</Text>
                    <Text style={[s.tcellR, { color: row.sec301 > 0 ? PURPLE : SLATE_L }]}>
                      {row.sec301 > 0 ? fmtM(row.sec301) : '—'}
                    </Text>
                    <Text style={[s.tcellR, { color: row.sec232 > 0 ? BLUE : SLATE_L }]}>
                      {row.sec232 > 0 ? fmtM(row.sec232) : '—'}
                    </Text>
                    <Text style={[s.tcellR, { color: row.ieepaDuty > 0 ? AMBER : SLATE_L }]}>
                      {row.ieepaDuty > 0 ? fmtM(row.ieepaDuty) : '—'}
                    </Text>
                    <Text style={[s.tcellR, { color: row.remediation > 0 ? RED : SLATE_L }]}>
                      {row.remediation > 0 ? fmtM(row.remediation) : '—'}
                    </Text>
                  </View>
                ))}
                {/* Totals row */}
                <View style={s.tfoot}>
                  <Text style={[s.tcellBold]}>Total</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: TEAL }]}>
                    {kpis.totalEntries.toLocaleString()}
                  </Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: '#b45309' }]}>
                    {kpis.ieepaEntries.toLocaleString()}
                  </Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: TEAL }]}>{fmtM(kpis.regularDuty)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: PURPLE }]}>{fmtM(kpis.sec301)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: BLUE }]}>{fmtM(kpis.sec232)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: AMBER }]}>{fmtM(kpis.ieepaDuty)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: RED }]}>{fmtM(kpis.remediationDuty)}</Text>
                </View>
              </View>
            </>
          )}

          {/* Key insights */}
          <Text style={s.sectionTitle}>Key Insights</Text>
          <View style={s.insightRow}>
            <View style={[s.insightCard, s.insightAmber]}>
              <Text style={[s.insightTitle, { color: '#92400e' }]}>IEEPA Exposure</Text>
              <Text style={s.insightBody}>
                {pct(ieepaImpact, kpis.totalDuty)} of all duties are IEEPA-related
                ({fmtM(ieepaImpact)} combined). This represents a significant
                compliance and cost burden requiring proactive management and
                HTS classification review.
              </Text>
            </View>
            <View style={[s.insightCard, s.insightBlue]}>
              <Text style={[s.insightTitle, { color: '#1e40af' }]}>Entry Rate</Text>
              <Text style={s.insightBody}>
                {pct(kpis.ieepaEntries, kpis.totalEntries)} of entries (
                {kpis.ieepaEntries.toLocaleString()} of {kpis.totalEntries.toLocaleString()})
                carry IEEPA duty. Evaluate classification and country-of-origin
                for exclusion or first-sale valuation opportunities.
              </Text>
            </View>
            <View style={[s.insightCard, s.insightTeal]}>
              <Text style={[s.insightTitle, { color: '#0f766e' }]}>Reciprocal Impact</Text>
              <Text style={s.insightBody}>
                Liberation Day reciprocal tariffs add {fmtM(kpis.remediationDuty)} on
                top of baseline IEEPA duties. Review country-of-origin documentation
                and consider supply chain diversification to reduce exposure.
              </Text>
            </View>
          </View>

          {/* Disclaimer */}
          <View style={{ marginTop: 20, padding: 10, backgroundColor: SLATE_BG, borderRadius: 4, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ fontSize: 6.5, color: SLATE_L, lineHeight: 1.5 }}>
              This report was generated by the JD Group Trade Portal based on USENTRY data for the selected period.
              Figures reflect duty amounts as recorded at time of entry. IEEPA and Reciprocal duty fields reflect
              DUTY_SEC_IEEPA and REMEDIATION_DUTY columns respectively. This document is confidential and intended
              solely for the use of the named client and their authorized representatives.
            </Text>
          </View>

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>JD Group — IEEPA Tariff Analysis · Confidential</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

// ── Export trigger ─────────────────────────────────────────────────────────────
export async function downloadIeepaReportPdf(props: Props, filename?: string) {
  const doc = <IeepaReportDocument {...props} />
  const blob = await pdf(doc).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename ?? `IEEPA_Report_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
