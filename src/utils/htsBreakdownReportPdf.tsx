/**
 * Duties Paid — HTS Breakdown PDF Report — @react-pdf/renderer template
 * mirroring the live /duties/hts page. Charts are passed as pre-captured
 * base64 PNG images (html2canvas); the HTS table lists the top rows by duty
 * (the grid itself can run to hundreds of paginated rows — the report caps
 * at a readable top-N, same idea as the on-screen "Top 10" charts) while the
 * Total row always reflects the full-period grand total, not just the rows
 * shown.
 */
import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet, pdf,
} from '@react-pdf/renderer'
import type { HtsBreakdownRow, HtsBreakdownTotals } from '@/api/entriesApi'

// ── Colors ────────────────────────────────────────────────────────────────────
const TEAL    = '#073b49'
const TEAL_L  = '#0d9488'
const PURPLE  = '#6366f1'
const AMBER   = '#f59e0b'
const RED     = '#dc2626'
const SLATE   = '#475569'
const SLATE_L = '#94a3b8'
const SLATE_BG = '#f8fafc'
const BORDER  = '#e2e8f0'

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
function formatHts(code: string): string {
  if (!/^\d{6,10}$/.test(code)) return code
  const parts = [code.slice(0, 4), code.slice(4, 6), code.slice(6)].filter(Boolean)
  return parts.join('.')
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingBottom: 36,
    fontSize: 8,
    color: SLATE,
  },
  header: {
    backgroundColor: TEAL,
    paddingHorizontal: 32,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.2 },
  headerSub: { fontSize: 8.5, color: '#7fb3c0', marginTop: 3 },
  headerMeta: { fontSize: 7.5, color: '#7fb3c0', marginTop: 2, textAlign: 'right' },

  body: { paddingHorizontal: 32, paddingTop: 18 },

  sectionTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 7,
    marginTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 3,
  },

  kpiRow: { flexDirection: 'row', gap: 7 },
  kpiCard: {
    flex: 1,
    backgroundColor: SLATE_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 9,
  },
  kpiLabel: { fontSize: 6.5, color: SLATE_L, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: TEAL, marginTop: 3 },
  kpiSub: { fontSize: 6.5, color: SLATE_L, marginTop: 2 },

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

  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  thead: { backgroundColor: TEAL, flexDirection: 'row' },
  theadCell: {
    flex: 1, paddingHorizontal: 6, paddingVertical: 5,
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff',
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  theadCellR: {
    flex: 1, paddingHorizontal: 6, paddingVertical: 5,
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff',
    textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'right',
  },
  trow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  trowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: SLATE_BG },
  tfoot:   { flexDirection: 'row', backgroundColor: '#e7f0f3', borderTopWidth: 1, borderTopColor: '#b0c8d0' },
  tcell:   { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 7, color: SLATE },
  tcellR:  { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 7, color: SLATE, textAlign: 'right' },
  tcellBold: { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEAL },
  tcellAmt: { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  footer: {
    position: 'absolute', bottom: 14, left: 32, right: 32,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: SLATE_L },

  disclaimer: {
    marginTop: 14, padding: 10, backgroundColor: SLATE_BG,
    borderRadius: 4, borderWidth: 1, borderColor: BORDER,
  },
  disclaimerText: { fontSize: 6.5, color: SLATE_L, lineHeight: 1.5 },
})

// ── Document ──────────────────────────────────────────────────────────────────
const TOP_N = 25

interface Props {
  totals: HtsBreakdownTotals
  priorTotals: HtsBreakdownTotals
  topRows: HtsBreakdownRow[]   // sorted duty desc, will be sliced to TOP_N
  rowsTotal: number            // total distinct HTS codes across all pages
  dateFrom?: string
  dateTo?: string
  clientName?: string
  compareChartImg?: string   // Top 10 HTS — current vs prior
  trendChartImg?: string     // Monthly Duty Trend by Type
  donutImg?: string          // Duty Composition
  rateChartImg?: string      // Effective Duty Rate — Top HTS
}

export function HtsBreakdownReportDocument({
  totals, priorTotals, topRows, rowsTotal, dateFrom, dateTo, clientName,
  compareChartImg, trendChartImg, donutImg, rateChartImg,
}: Props) {
  const generated = new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date())

  const dateRange = dateFrom && dateTo
    ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
    : 'All dates'

  const shown = topRows.slice(0, TOP_N)

  const ReportHeader = ({ subtitle }: { subtitle: string }) => (
    <View style={s.header}>
      <View>
        <Text style={s.headerTitle}>Duties Paid — HTS Breakdown</Text>
        <Text style={s.headerSub}>{subtitle}</Text>
      </View>
      <View>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right' }}>JD Group</Text>
        <Text style={s.headerMeta}>Generated: {generated}</Text>
        <Text style={s.headerMeta}>Period: {dateRange}</Text>
        {clientName && <Text style={s.headerMeta}>Client: {clientName}</Text>}
      </View>
    </View>
  )

  const Footer = () => (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>JD Group — HTS Duty Breakdown · Confidential</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )

  return (
    <Document title="Duties Paid — HTS Breakdown Report" author="JD Group Trade Portal">

      {/* ── PAGE 1 — KPIs + Top 10 vs Prior + Monthly Trend ─────────────────── */}
      <Page size="LETTER" style={s.page}>
        <ReportHeader subtitle="Duty distribution by HTS code, current vs. prior period" />

        <View style={s.body}>

          <Text style={s.sectionTitle}>Financial Overview</Text>
          <View style={s.kpiRow}>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: TEAL }]}>
              <Text style={s.kpiLabel}>Total Duties</Text>
              <Text style={s.kpiValue}>{fmtM(totals.totalDuty)}</Text>
              <Text style={s.kpiSub}>vs {fmtM(priorTotals.totalDuty)} prior period</Text>
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: TEAL_L }]}>
              <Text style={s.kpiLabel}>Regular Duty</Text>
              <Text style={[s.kpiValue, { color: TEAL_L }]}>{fmtM(totals.regularDuty)}</Text>
              <Text style={s.kpiSub}>{pct(totals.regularDuty, totals.totalDuty)} of total</Text>
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: AMBER }]}>
              <Text style={s.kpiLabel}>Section 301</Text>
              <Text style={[s.kpiValue, { color: AMBER }]}>{fmtM(totals.sec301)}</Text>
              <Text style={s.kpiSub}>{pct(totals.sec301, totals.totalDuty)} of total</Text>
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: PURPLE }]}>
              <Text style={s.kpiLabel}>Section 232</Text>
              <Text style={[s.kpiValue, { color: PURPLE }]}>{fmtM(totals.sec232)}</Text>
              <Text style={s.kpiSub}>{pct(totals.sec232, totals.totalDuty)} of total</Text>
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: RED }]}>
              <Text style={s.kpiLabel}>IEEPA</Text>
              <Text style={[s.kpiValue, { color: RED }]}>{fmtM(totals.ieepa + totals.other)}</Text>
              <Text style={s.kpiSub}>
                {totals.other > 0 ? `incl. ${fmtM(totals.other)} other Ch-99` : `${pct(totals.ieepa, totals.totalDuty)} of total`}
              </Text>
            </View>
          </View>

          {(compareChartImg || trendChartImg) && (
            <>
              <Text style={s.sectionTitle}>Top 10 HTS Comparison &amp; Monthly Trend</Text>
              <View style={s.chartsRow}>
                {compareChartImg && (
                  <View style={[s.chartBox, { flex: 1 }]}>
                    <View style={s.chartHeader}>
                      <Text style={s.chartTitle}>Top 10 HTS — Current vs Prior</Text>
                      <Text style={s.chartSub}>By total duty</Text>
                    </View>
                    <Image src={compareChartImg} style={[s.chartImg, { padding: 6 }]} />
                  </View>
                )}
                {trendChartImg && (
                  <View style={[s.chartBox, { flex: 1 }]}>
                    <View style={s.chartHeader}>
                      <Text style={s.chartTitle}>Monthly Duty Trend by Type</Text>
                      <Text style={s.chartSub}>Regular · Sec 301 · Sec 232 · IEEPA</Text>
                    </View>
                    <Image src={trendChartImg} style={[s.chartImg, { padding: 6 }]} />
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        <Footer />
      </Page>

      {/* ── PAGE 2 — Composition + Effective Rate + Top HTS table ──────────── */}
      <Page size="LETTER" style={s.page}>
        <ReportHeader subtitle="Duty composition, effective rates, and top HTS codes" />

        <View style={s.body}>

          {(donutImg || rateChartImg) && (
            <>
              <Text style={s.sectionTitle}>Duty Composition &amp; Effective Rate</Text>
              <View style={s.chartsRow}>
                {donutImg && (
                  <View style={[s.chartBox, { flex: 1 }]}>
                    <View style={s.chartHeader}>
                      <Text style={s.chartTitle}>Duty Composition</Text>
                      <Text style={s.chartSub}>Share of total duty by type</Text>
                    </View>
                    <Image src={donutImg} style={[s.chartImg, { padding: 6 }]} />
                  </View>
                )}
                {rateChartImg && (
                  <View style={[s.chartBox, { flex: 1 }]}>
                    <View style={s.chartHeader}>
                      <Text style={s.chartTitle}>Effective Duty Rate — Top HTS</Text>
                      <Text style={s.chartSub}>Total duty ÷ entered value</Text>
                    </View>
                    <Image src={rateChartImg} style={[s.chartImg, { padding: 6 }]} />
                  </View>
                )}
              </View>
            </>
          )}

          {shown.length > 0 && (
            <>
              <Text style={s.sectionTitle}>
                Top {shown.length} of {rowsTotal} HTS Codes by Duty
              </Text>
              <View style={s.table}>
                <View style={s.thead}>
                  <Text style={[s.theadCell, { flex: 1.3 }]}>HTS</Text>
                  <Text style={[s.theadCell, { flex: 2 }]}>Description</Text>
                  <Text style={s.theadCellR}>Entry Value</Text>
                  <Text style={s.theadCellR}>Regular</Text>
                  <Text style={s.theadCellR}>Sec 301</Text>
                  <Text style={s.theadCellR}>Sec 232</Text>
                  <Text style={s.theadCellR}>IEEPA</Text>
                  <Text style={s.theadCellR}>Total Duty</Text>
                  <Text style={s.theadCellR}>% of Total</Text>
                </View>
                {shown.map((row, i) => (
                  <View key={row.hts} style={i % 2 === 0 ? s.trow : s.trowAlt}>
                    <Text style={[s.tcellBold, { flex: 1.3, fontSize: 6.5 }]}>{formatHts(row.hts)}</Text>
                    <Text style={[s.tcell, { flex: 2 }]}>{(row.description ?? '—').substring(0, 32)}</Text>
                    <Text style={s.tcellR}>{fmtM(row.enteredValue)}</Text>
                    <Text style={s.tcellR}>{fmtM(row.regularDuty)}</Text>
                    <Text style={[s.tcellR, { color: row.sec301 > 0 ? AMBER : SLATE_L }]}>{row.sec301 > 0 ? fmtM(row.sec301) : '—'}</Text>
                    <Text style={[s.tcellR, { color: row.sec232 > 0 ? PURPLE : SLATE_L }]}>{row.sec232 > 0 ? fmtM(row.sec232) : '—'}</Text>
                    <Text style={[s.tcellR, { color: (row.ieepa + row.other) > 0 ? RED : SLATE_L }]}>
                      {(row.ieepa + row.other) > 0 ? fmtM(row.ieepa + row.other) : '—'}
                    </Text>
                    <Text style={[s.tcellAmt, { color: TEAL }]}>{fmtM(row.totalDuty)}</Text>
                    <Text style={s.tcellR}>{pct(row.totalDuty, totals.totalDuty)}</Text>
                  </View>
                ))}
                <View style={s.tfoot}>
                  <Text style={[s.tcellBold, { flex: 3.3 }]}>Total (all {rowsTotal} HTS codes)</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: TEAL }]}>{fmtM(totals.enteredValue)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: TEAL }]}>{fmtM(totals.regularDuty)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: AMBER }]}>{fmtM(totals.sec301)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: PURPLE }]}>{fmtM(totals.sec232)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: RED }]}>{fmtM(totals.ieepa + totals.other)}</Text>
                  <Text style={[s.tcellAmt, { color: TEAL }]}>{fmtM(totals.totalDuty)}</Text>
                  <Text style={[s.tcellR, { fontFamily: 'Helvetica-Bold', color: TEAL }]}>100.0%</Text>
                </View>
              </View>
            </>
          )}

          <View style={s.disclaimer}>
            <Text style={s.disclaimerText}>
              This report was generated by the JD Group Trade Portal based on USENTRY/USLINE data for the selected
              period. The table above lists the top {shown.length} of {rowsTotal} distinct HTS codes by total duty;
              KPI totals and the Total row reflect the full result set across all HTS codes, not just those shown.
              This document is confidential and intended solely for the use of the named client and their
              authorized representatives.
            </Text>
          </View>
        </View>

        <Footer />
      </Page>
    </Document>
  )
}

// ── Export trigger ─────────────────────────────────────────────────────────────
export async function downloadHtsBreakdownPdf(props: Props, filename?: string) {
  const doc = <HtsBreakdownReportDocument {...props} />
  const blob = await pdf(doc).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename ?? `HTS_Breakdown_Report_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
