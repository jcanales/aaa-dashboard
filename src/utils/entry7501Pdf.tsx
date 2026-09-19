/**
 * CBP Form 7501 (Entry Summary) recreation for one entry — @react-pdf/renderer,
 * following the block numbering and labels from the form's own printed
 * instructions (CBP Form 7501, rev. 02/26). This is a best-effort internal
 * reference reconstructed from JD Group's own system of record — NOT a legal
 * substitute for the entry summary actually filed with CBP. Fields this
 * system has no record of (declarant signature, broker phone, MPF/HMF fee
 * amounts, IT numbers, visa/certificate numbers, missing-document codes)
 * are left blank rather than guessed — see the disclaimer rendered on the
 * PDF itself. Blocks 21-24 (Section 232 steel/aluminum melt-and-pour/smelt
 * country reporting) are omitted entirely: they only apply to steel/aluminum
 * articles, this system doesn't track them, and showing empty boxes for
 * fields that don't apply to a given entry would be more confusing than
 * omitting the section.
 */
import React from 'react'
import {
  Document, Page, View, Text, StyleSheet, pdf,
} from '@react-pdf/renderer'
import type { Cbp7501Data } from '@/api/entriesApi'
import { motLabel, entryTypeLabel } from './cbpCodes'

const TEAL   = '#073b49'
const AMBER  = '#92400e'
const SLATE  = '#334155'
const SLATE_L = '#94a3b8'
const BORDER = '#0f172a'

function fmtUSD0(n: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))
}
function fmtDate(iso: string | null) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(iso))
  } catch { return '' }
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    padding: 24,
    fontSize: 7,
    color: SLATE,
  },
  titleBlock: { alignItems: 'center', marginBottom: 6 },
  titleAgency: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  titleForm: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 2, letterSpacing: 0.5 },
  omb: { position: 'absolute', top: 24, right: 24, fontSize: 6, color: SLATE_L, textAlign: 'right' },

  disclaimer: {
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: 3, padding: 6, marginBottom: 8,
  },
  disclaimerText: { fontSize: 6.5, color: AMBER, lineHeight: 1.4 },

  grid: { borderWidth: 1, borderColor: BORDER, marginBottom: 0 },
  row: { flexDirection: 'row' },
  box: {
    flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
    padding: 3, minHeight: 24,
  },
  boxLast: {
    flex: 1, borderBottomWidth: 1, borderColor: BORDER,
    padding: 3, minHeight: 24,
  },
  boxLabel: { fontSize: 5.5, color: SLATE_L, marginBottom: 1 },
  boxValue: { fontSize: 7.5, color: '#0f172a' },
  boxSub: { fontSize: 6, color: SLATE_L, marginTop: 1 },

  partyBox: {
    flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
    padding: 4, minHeight: 52,
  },
  partyBoxLast: {
    flex: 1, borderBottomWidth: 1, borderColor: BORDER,
    padding: 4, minHeight: 52,
  },

  sectionTitle: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEAL,
    marginTop: 8, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  table: { borderWidth: 1, borderColor: BORDER },
  thead: { flexDirection: 'row', backgroundColor: TEAL },
  th: { padding: 3, fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  trow: { flexDirection: 'row', borderTopWidth: 1, borderColor: BORDER },
  td: { padding: 3, fontSize: 6.5, color: SLATE },

  totalsRow: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: BORDER },
  totalsBox: { flex: 1, borderRightWidth: 1, borderColor: BORDER, padding: 4 },
  totalsBoxLast: { flex: 1, padding: 4 },
  totalsLabel: { fontSize: 5.5, color: SLATE_L },
  totalsValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginTop: 1 },

  declaration: {
    borderWidth: 1, borderTopWidth: 0, borderColor: BORDER, padding: 5, marginBottom: 8,
  },
  declarationText: { fontSize: 5.8, color: SLATE, lineHeight: 1.4 },

  footer: {
    position: 'absolute', bottom: 16, left: 24, right: 24,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 4,
  },
  footerText: { fontSize: 6, color: SLATE_L },
})

function Box({ n, label, value, sub, last }: {
  n?: string; label: string; value: string; sub?: string; last?: boolean
}) {
  return (
    <View style={last ? s.boxLast : s.box}>
      <Text style={s.boxLabel}>{n ? `${n}. ` : ''}{label}</Text>
      <Text style={s.boxValue}>{value || ' '}</Text>
      {sub && <Text style={s.boxSub}>{sub}</Text>}
    </View>
  )
}

function PartyBox({ n, label, name, addr1, addr2, city, state, zip, irsNo, last }: {
  n: string; label: string
  name: string | null; addr1: string | null; addr2: string | null
  city: string | null; state: string | null; zip: string | null; irsNo: string | null
  last?: boolean
}) {
  return (
    <View style={last ? s.partyBoxLast : s.partyBox}>
      <Text style={s.boxLabel}>{n}. {label}</Text>
      <Text style={s.boxValue}>{name || ' '}</Text>
      {addr1 && <Text style={s.boxSub}>{addr1}</Text>}
      {addr2 && <Text style={s.boxSub}>{addr2}</Text>}
      {(city || state || zip) && <Text style={s.boxSub}>{[city, state, zip].filter(Boolean).join(', ')}</Text>}
      {irsNo && <Text style={s.boxSub}>IRS #: {irsNo}</Text>}
    </View>
  )
}

export function Entry7501Document({ data }: { data: Cbp7501Data }) {
  const generated = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())

  return (
    <Document title={`CBP Form 7501 — ${data.entryNo}`} author="JD Group Trade Portal">
      <Page size="LETTER" style={s.page}>
        <View style={s.titleBlock}>
          <Text style={s.titleAgency}>DEPARTMENT OF HOMELAND SECURITY{'\n'}U.S. Customs and Border Protection</Text>
          <Text style={s.titleForm}>ENTRY SUMMARY</Text>
        </View>
        <Text style={s.omb}>OMB CONTROL NUMBER 1651-0022{'\n'}CBP FORM 7501 (02/26)</Text>

        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            Reconstructed for internal reference from JD Group's own system of record — this is NOT the entry
            summary actually filed with CBP and has no legal effect. Blank fields (declarant signature, broker
            information, IT numbers, visa/certificate numbers, missing-document codes, MPF/HMF fee amounts) are
            not tracked in this system, not omitted in error.
          </Text>
        </View>

        {/* Blocks 1-7 */}
        <View style={s.grid}>
          <View style={s.row}>
            <Box n="1" label="Filer Code / Entry Number" value={data.entryNo} />
            <Box n="2" label="Entry Type" value={data.entryType ?? ''} sub={entryTypeLabel(data.entryType) ?? undefined} />
            <Box n="4" label="Surety Number" value={data.surety ?? ''} />
            <Box n="5" label="Bond Type" value={data.bondType ?? ''} />
            <Box n="6" label="Port Code" value={data.port ?? ''} />
            <Box n="7" label="Entry Date" value={fmtDate(data.entryDate)} last />
          </View>
          {/* Blocks 9-11 */}
          <View style={s.row}>
            <Box n="9" label="Mode of Transport" value={data.mot ?? ''} sub={motLabel(data.mot) ?? undefined} />
            <Box n="10" label="Country of Origin" value={data.originCo ?? ''} />
            <Box n="11" label="Import Date" value={fmtDate(data.importDate)} last />
          </View>
          {/* Blocks 13-15 */}
          <View style={s.row}>
            <Box n="13" label="Manufacturer ID" value={data.lines[0]?.mid ?? ''} sub={data.lines.length > 1 ? 'see line items' : undefined} />
            <Box n="14" label="Exporting Country" value={data.exporCo ?? ''} />
            <Box n="15" label="Export Date" value={fmtDate(data.exportDate)} last />
          </View>
          {/* Blocks 19-20 */}
          <View style={s.row}>
            <Box n="19" label="Foreign Port of Lading" value={data.foreignPortOfLading ?? ''} />
            <Box n="20" label="U.S. Port of Unlading" value={data.usPortOfUnlading ?? ''} last />
          </View>
        </View>

        {/* Blocks 29-30 */}
        <View style={[s.grid, { marginTop: 0 }]}>
          <View style={s.row}>
            <PartyBox n="29" label="Ultimate Consignee Name and Address" {...data.ultimateConsignee} />
            <PartyBox n="30" label="Importer of Record Name and Address" {...data.importerOfRecord} last />
          </View>
        </View>

        {/* Line items — Blocks 31-38 */}
        <Text style={s.sectionTitle}>Line Items (Blocks 31-38)</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 0.5 }]}>31. Line</Text>
            <Text style={[s.th, { flex: 1.2 }]}>33A. HTS No.</Text>
            <Text style={[s.th, { flex: 3 }]}>32. Description of Merchandise</Text>
            <Text style={[s.th, { flex: 1 }]}>34A. Gross Wt.</Text>
            <Text style={[s.th, { flex: 1.2 }]}>35. Net Qty.</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: 'right' }]}>36A. Entered Value</Text>
            <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>37A. Rate</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: 'right' }]}>38. Duty &amp; Tax</Text>
          </View>
          {data.lines.map((l) => (
            <View key={l.lineNo} style={s.trow}>
              <Text style={[s.td, { flex: 0.5 }]}>{l.lineNo}</Text>
              <Text style={[s.td, { flex: 1.2, fontFamily: 'Courier' }]}>{l.hts ? l.hts.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1.$2.$3.$4') : ''}</Text>
              <Text style={[s.td, { flex: 3 }]}>{l.description ?? ''}</Text>
              <Text style={[s.td, { flex: 1 }]}>{l.grossWeight != null && l.grossWeight > 0 ? `${l.grossWeight} kg` : ''}</Text>
              <Text style={[s.td, { flex: 1.2 }]}>{l.netQty != null && l.netQty > 0 ? `${l.netQty} ${l.units ?? ''}` : ''}</Text>
              <Text style={[s.td, { flex: 1.2, textAlign: 'right' }]}>{fmtUSD0(l.enteredValue)}</Text>
              <Text style={[s.td, { flex: 0.8, textAlign: 'right' }]}>{l.dutyRate > 0 ? `${l.dutyRate.toFixed(1)}%` : 'Free'}</Text>
              <Text style={[s.td, { flex: 1.2, textAlign: 'right' }]}>{fmtUSD0(l.totalDuty)}</Text>
            </View>
          ))}
        </View>

        {/* Totals — Blocks 39, 41-44 */}
        <View style={s.totalsRow}>
          <View style={s.totalsBox}>
            <Text style={s.totalsLabel}>39. Total Entered Value</Text>
            <Text style={s.totalsValue}>${fmtUSD0(data.entryVal)}</Text>
          </View>
          <View style={s.totalsBox}>
            <Text style={s.totalsLabel}>41. Duty</Text>
            <Text style={s.totalsValue}>${fmtUSD0(data.totalDuty)}</Text>
          </View>
          <View style={s.totalsBox}>
            <Text style={s.totalsLabel}>42. Tax</Text>
            <Text style={s.totalsValue}>$0</Text>
          </View>
          <View style={s.totalsBox}>
            <Text style={s.totalsLabel}>43. Other</Text>
            <Text style={s.totalsValue}>$0</Text>
          </View>
          <View style={s.totalsBoxLast}>
            <Text style={s.totalsLabel}>44. Total</Text>
            <Text style={s.totalsValue}>${fmtUSD0(data.totalDuty)}</Text>
          </View>
        </View>

        {/* Block 40 — static declaration boilerplate, unsigned */}
        <View style={s.declaration}>
          <Text style={[s.boxLabel, { marginBottom: 2 }]}>40. Declaration of Importer of Record (Owner or Purchaser) or Authorized Agent</Text>
          <Text style={s.declarationText}>
            I declare that I am the Importer of record and that the actual owner, purchaser, or consignee for CBP
            purposes is as shown above, OR owner or purchaser or agent thereof. I further declare that the
            merchandise was obtained pursuant to a purchase or agreement to purchase and that the prices set forth
            in the invoices are true, OR was not obtained pursuant to a purchase or agreement to purchase and the
            statements in the invoices as to value or price are true to the best of my knowledge and belief. I also
            declare that the statements in the documents herein filed fully disclose to the best of my knowledge and
            belief the true prices, values, quantities, rebates, drawbacks, fees, commissions, and royalties and are
            true and correct, and that all goods or services provided to the seller of the merchandise either free or
            at reduced cost are fully disclosed. I will immediately furnish to the appropriate CBP officer any
            information showing a different statement of facts.
          </Text>
          <Text style={[s.boxSub, { marginTop: 4 }]}>45. Declarant Name / Title / Signature / Date — not on file in this system</Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>JD Group Trade Portal — internal reconstruction, not a filed CBP document · Generated {generated}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function generateEntry7501PdfBlob(data: Cbp7501Data): Promise<Blob> {
  const doc = <Entry7501Document data={data} />
  return pdf(doc).toBlob()
}

export async function downloadEntry7501Pdf(data: Cbp7501Data, filename?: string) {
  const blob = await generateEntry7501PdfBlob(data)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `CBP7501_${data.entryNo}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
