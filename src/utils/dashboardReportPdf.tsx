/**
 * Operations Dashboard PDF Report — @react-pdf/renderer template
 * Charts are passed as pre-captured base64 PNG images (html2canvas).
 */
import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet, pdf,
} from '@react-pdf/renderer'
import type { EntryKpis, MonthlyPoint, Entry, EntryCharts } from '@/api/entriesApi'

// ── Colors ────────────────────────────────────────────────────────────────────
const TEAL    = '#073b49'
const TEAL_L  = '#0d9488'
const BLUE    = '#3A6FF9'
const RED     = '#dc2626'
const AMBER   = '#f59e0b'
const SLATE   = '#475569'
const SLATE_L = '#94a3b8'
const SLATE_BG = '#f8fafc'
const BORDER  = '#e2e8f0'
const GREEN   = '#16a34a'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return fmtUSD(n)
}
function fmtDate(v: string | Date | null) {
  if (!v) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).format(new Date(v as string))
  } catch { return String(v) }
}
function deltaStr(current: number, prev: number) {
  if (!prev) return null
  const p = ((current - prev) / prev) * 100
  return { str: `${Math.abs(p).toFixed(1)}%`, up: p >= 0 }
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

  // Header
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

  // Body
  body: { paddingHorizontal: 32, paddingTop: 18 },

  // Section heading
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

  // 4-column KPI row
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
  kpiTrend: { fontSize: 6.5, marginTop: 2 },

  // Risk flags
  riskRow: { flexDirection: 'row', gap: 7 },
  riskCard: {
    flex: 1,
    borderRadius: 5,
    padding: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  riskRed:    { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  riskAmber:  { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  riskGreen:  { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  riskLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  riskCount: { fontSize: 14, fontFamily: 'Helvetica-Bold' },

  // Charts
  chartBox: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 6, overflow: 'hidden', backgroundColor: '#ffffff',
  },
  chartHeader: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: SLATE_BG,
  },
  chartTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: TEAL },
  chartSub: { fontSize: 6, color: SLATE_L, marginTop: 1 },
  chartImg: { width: '100%' },

  // Table
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: 'hidden' },
  thead: { backgroundColor: TEAL, flexDirection: 'row' },
  theadCell: {
    flex: 1, paddingHorizontal: 7, paddingVertical: 5,
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff',
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  theadCellR: {
    flex: 1, paddingHorizontal: 7, paddingVertical: 5,
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff',
    textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'right',
  },
  trow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  trowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: SLATE_BG },
  tcell:   { flex: 1, paddingHorizontal: 7, paddingVertical: 4, fontSize: 7, color: SLATE },
  tcellMono: { flex: 1.4, paddingHorizontal: 7, paddingVertical: 4, fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: TEAL },
  tcellR:  { flex: 1, paddingHorizontal: 7, paddingVertical: 4, fontSize: 7, textAlign: 'right', color: SLATE },
  tcellAmt:{ flex: 1, paddingHorizontal: 7, paddingVertical: 4, fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  statusPill: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3, borderWidth: 1, alignSelf: 'flex-start' },

  // Footer
  footer: {
    position: 'absolute', bottom: 14, left: 32, right: 32,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: SLATE_L },
})

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  kpis: EntryKpis
  monthly: MonthlyPoint[]
  entries: Entry[]
  charts: { portBreakdown: { port: string; count: number; value: number }[] }
  dateFrom?: string
  dateTo?: string
  rangeLabel: string
  clientName?: string
  // chart images
  monthlyChartImg?: string
  portPieImg?: string
  chartsRow2Img?: string
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string }> = {
    pending:    { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
    released:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
    liquidated: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  }
  const c = cfg[status] ?? { bg: SLATE_BG, border: BORDER, text: SLATE }
  return (
    <View style={[s.statusPill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={{ fontSize: 6, color: c.text, fontFamily: 'Helvetica-Bold' }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  )
}

// ── Document ──────────────────────────────────────────────────────────────────
export function DashboardReportDocument({
  kpis, monthly, entries, charts,
  dateFrom, dateTo, rangeLabel, clientName,
  monthlyChartImg, portPieImg, chartsRow2Img,
}: Props) {
  const generated = new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date())

  const tariffTotal = (kpis.sec301InRange || 0) + (kpis.sec232InRange || 0) + (kpis.ieepaInRange || 0)
  const liveRate = kpis.valueInRange > 0
    ? `${((kpis.dutyInRange / kpis.valueInRange) * 100).toFixed(2)}%`
    : '—'
  const dutyTrend  = deltaStr(kpis.dutyInRange,    kpis.dutyPrior)
  const entryTrend = deltaStr(kpis.entriesInRange,  kpis.entriesPrior)

  return (
    <Document title="Operations Dashboard Report" author="JD Group Trade Portal">

      {/* ── PAGE 1 ─────────────────────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Operations Dashboard</Text>
            <Text style={s.headerSub}>Trade compliance overview — {rangeLabel}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right' }}>JD Group</Text>
            <Text style={s.headerMeta}>Generated: {generated}</Text>
            {clientName && <Text style={s.headerMeta}>{clientName}</Text>}
          </View>
        </View>

        <View style={s.body}>

          {/* Financial Summary */}
          <Text style={s.sectionTitle}>Financial Summary</Text>
          <View style={s.kpiRow}>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: TEAL }]}>
              <Text style={s.kpiLabel}>Total Duties Paid</Text>
              <Text style={s.kpiValue}>{fmtM(kpis.dutyInRange)}</Text>
              {dutyTrend && (
                <Text style={[s.kpiTrend, { color: dutyTrend.up ? GREEN : RED }]}>
                  {dutyTrend.up ? '▲' : '▼'} {dutyTrend.str} vs prior period
                </Text>
              )}
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: BLUE }]}>
              <Text style={s.kpiLabel}>Total Entry Value</Text>
              <Text style={[s.kpiValue, { color: BLUE }]}>{fmtM(kpis.valueInRange)}</Text>
              <Text style={s.kpiSub}>Declared dutiable value</Text>
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: '#64748b' }]}>
              <Text style={s.kpiLabel}>Effective Duty Rate</Text>
              <Text style={[s.kpiValue, { color: '#334155' }]}>{liveRate}</Text>
              <Text style={s.kpiSub}>Duties ÷ Entry Value</Text>
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: RED }]}>
              <Text style={s.kpiLabel}>Tariff Duties (301/232/IEEPA)</Text>
              <Text style={[s.kpiValue, { color: RED }]}>{fmtM(tariffTotal)}</Text>
              <Text style={s.kpiSub}>Section 301 + 232 + IEEPA</Text>
            </View>
          </View>

          {/* Operational Health */}
          <Text style={s.sectionTitle}>Operational Health</Text>
          <View style={s.kpiRow}>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: TEAL }]}>
              <Text style={s.kpiLabel}>Entries in Period</Text>
              <Text style={s.kpiValue}>{kpis.entriesInRange.toLocaleString()}</Text>
              {entryTrend && (
                <Text style={[s.kpiTrend, { color: entryTrend.up ? GREEN : RED }]}>
                  {entryTrend.up ? '▲' : '▼'} {entryTrend.str} vs prior period
                </Text>
              )}
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: BLUE }]}>
              <Text style={s.kpiLabel}>Avg. Release Time</Text>
              <Text style={[s.kpiValue, { color: BLUE }]}>
                {kpis.avgReleaseDays != null ? `${kpis.avgReleaseDays}d` : '—'}
              </Text>
              <Text style={s.kpiSub}>Entry filing → CBP release</Text>
            </View>
            <View style={[s.kpiCard, {
              borderLeftWidth: 3,
              borderLeftColor: kpis.entriesPending > 10 ? AMBER : '#64748b',
              backgroundColor: kpis.entriesPending > 10 ? '#fffbeb' : SLATE_BG,
            }]}>
              <Text style={s.kpiLabel}>Pending Release</Text>
              <Text style={[s.kpiValue, { color: kpis.entriesPending > 10 ? AMBER : TEAL }]}>
                {kpis.entriesPending.toLocaleString()}
              </Text>
              <Text style={s.kpiSub}>Awaiting CBP release</Text>
            </View>
            <View style={[s.kpiCard, { borderLeftWidth: 3, borderLeftColor: AMBER }]}>
              <Text style={s.kpiLabel}>Remediation Duties</Text>
              <Text style={[s.kpiValue, { color: AMBER }]}>{fmtM(kpis.remediationInRange)}</Text>
              <Text style={s.kpiSub}>Remediation duty in period</Text>
            </View>
          </View>

          {/* Charts row 1 */}
          {(monthlyChartImg || portPieImg) && (
            <>
              <Text style={s.sectionTitle}>Monthly Trends &amp; Port Distribution</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {monthlyChartImg && (
                  <View style={[s.chartBox, { flex: 2 }]}>
                    <View style={s.chartHeader}>
                      <Text style={s.chartTitle}>Monthly Duty Spend</Text>
                      <Text style={s.chartSub}>Live CBP entries — {rangeLabel}</Text>
                    </View>
                    <Image src={monthlyChartImg} style={[s.chartImg, { padding: 5 }]} />
                  </View>
                )}
                {portPieImg && (
                  <View style={[s.chartBox, { flex: 1 }]}>
                    <View style={s.chartHeader}>
                      <Text style={s.chartTitle}>Entries by Port</Text>
                      <Text style={s.chartSub}>{rangeLabel}</Text>
                    </View>
                    <Image src={portPieImg} style={[s.chartImg, { padding: 5 }]} />
                  </View>
                )}
              </View>
            </>
          )}

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>JD Group — Operations Dashboard · Confidential</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* ── PAGE 2 ─────────────────────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>

        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Operations Dashboard</Text>
            <Text style={s.headerSub}>Entry Activity &amp; Recent Transactions</Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right' }}>JD Group</Text>
            <Text style={s.headerMeta}>{rangeLabel}</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* Charts row 2 */}
          {chartsRow2Img && (
            <>
              <Text style={s.sectionTitle}>Entry Activity Charts</Text>
              <View style={s.chartBox}>
                <View style={s.chartHeader}>
                  <Text style={s.chartTitle}>Entries by Day · Clearance Time Distribution · Top Ports by Value</Text>
                </View>
                <Image src={chartsRow2Img} style={[s.chartImg, { padding: 5 }]} />
              </View>
            </>
          )}

          {/* Monthly duty table */}
          {monthly.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Monthly Summary</Text>
              <View style={s.table}>
                <View style={s.thead}>
                  <Text style={s.theadCell}>Month</Text>
                  <Text style={s.theadCellR}>Entries</Text>
                  <Text style={s.theadCellR}>Entry Value</Text>
                  <Text style={s.theadCellR}>Duties</Text>
                  <Text style={s.theadCellR}>Tariff Duties</Text>
                </View>
                {monthly.map((row, i) => (
                  <View key={row.period} style={i % 2 === 0 ? s.trow : s.trowAlt}>
                    <Text style={[s.tcell, { fontFamily: 'Helvetica-Bold', color: TEAL }]}>{row.period}</Text>
                    <Text style={s.tcellR}>{row.entries.toLocaleString()}</Text>
                    <Text style={s.tcellR}>{fmtM(row.value)}</Text>
                    <Text style={[s.tcellAmt, { color: TEAL }]}>{fmtM(row.duties)}</Text>
                    <Text style={[s.tcellAmt, { color: RED }]}>{row.tariff > 0 ? fmtM(row.tariff) : '—'}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Recent entries table */}
          {entries.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Recent Entries</Text>
              <View style={s.table}>
                <View style={s.thead}>
                  <Text style={[s.theadCell, { flex: 1.4 }]}>Entry #</Text>
                  <Text style={s.theadCell}>Date</Text>
                  <Text style={s.theadCell}>Port</Text>
                  <Text style={[s.theadCell, { flex: 1.8 }]}>Importer</Text>
                  <Text style={s.theadCell}>Status</Text>
                  <Text style={s.theadCellR}>Duty</Text>
                  <Text style={s.theadCellR}>Value</Text>
                </View>
                {entries.map((e, i) => (
                  <View key={e.recid} style={i % 2 === 0 ? s.trow : s.trowAlt}>
                    <Text style={s.tcellMono}>{e.entryNo}</Text>
                    <Text style={s.tcell}>{fmtDate(e.entryDate)}</Text>
                    <Text style={s.tcell}>{e.portCod}</Text>
                    <Text style={[s.tcell, { flex: 1.8 }]}>{(e.custName ?? e.custKey).substring(0, 26)}</Text>
                    <View style={[s.tcell, { justifyContent: 'center' }]}>
                      <StatusPill status={e.status} />
                    </View>
                    <Text style={[s.tcellAmt, { color: TEAL }]}>{fmtUSD(e.duty)}</Text>
                    <Text style={s.tcellR}>{fmtM(e.entryVal)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>JD Group — Operations Dashboard · Confidential</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

// ── Export trigger ────────────────────────────────────────────────────────────
export async function downloadDashboardPdf(props: Props, filename?: string) {
  const doc  = <DashboardReportDocument {...props} />
  const blob = await pdf(doc).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename ?? `Dashboard_Report_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
