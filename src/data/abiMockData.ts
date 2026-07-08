import { CrossingReportRow, EntryReport7Row, StatementReportRow, FDAReportRow, EDIFileRow } from '@/types/abi.types'
import { randomDateInLastNDays } from '@/utils/dateUtils'

const scacCodes = ['DHLG', 'UPSN', 'FXFE', 'MSCU', 'MAEU', 'FBTX']
const ports = ['2506', '5401', '3901', '2709', '0101']

function generateEntry(): string {
  return `${Math.floor(Math.random() * 999)}-${String(Math.floor(Math.random() * 9999999)).padStart(7, '0')}-${Math.floor(Math.random() * 9)}`
}

function generateCustRef(): string {
  return `CR${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`
}

// Crossing Report / Entry Report 5 (shared structure)
export const crossingReportMockData: CrossingReportRow[] = Array.from({ length: 30 }, (_, i) => ({
  id: `cross-${i + 1}`,
  entryDate: randomDateInLastNDays(30),
  entry: generateEntry(),
  scac: scacCodes[Math.floor(Math.random() * scacCodes.length)],
  custRef: generateCustRef(),
  certified: Math.random() > 0.3 ? randomDateInLastNDays(25) : 'PENDING',
  relDate: randomDateInLastNDays(28),
}))

export const entryReport5MockData: CrossingReportRow[] = Array.from({ length: 30 }, (_, i) => ({
  id: `er5-${i + 1}`,
  entryDate: randomDateInLastNDays(30),
  entry: generateEntry(),
  scac: scacCodes[Math.floor(Math.random() * scacCodes.length)],
  custRef: generateCustRef(),
  certified: Math.random() > 0.3 ? randomDateInLastNDays(25) : 'PENDING',
  relDate: randomDateInLastNDays(28),
}))

// Entry Report 7 (extended)
const importers = [
  'HARMAN PROFESSIONAL INC',
  'HARMAN DE MEXICO S DE RL DE CV',
  'SAMSUNG ELECTRONICS AMERICA INC',
]
const motTypes = ['Truck', 'Ocean', 'Air']
const statuses = ['Released', 'Held', 'Intensive Exam', 'Document Review']

export const entryReport7MockData: EntryReport7Row[] = Array.from({ length: 30 }, (_, i) => ({
  id: `er7-${i + 1}`,
  entryDate: randomDateInLastNDays(30),
  entry: generateEntry(),
  scac: scacCodes[Math.floor(Math.random() * scacCodes.length)],
  custRef: generateCustRef(),
  certified: Math.random() > 0.3 ? randomDateInLastNDays(25) : 'PENDING',
  relDate: randomDateInLastNDays(28),
  mot: motTypes[Math.floor(Math.random() * motTypes.length)],
  port: ports[Math.floor(Math.random() * ports.length)],
  importer: importers[Math.floor(Math.random() * importers.length)],
  totalValue: parseFloat((Math.random() * 50000 + 1000).toFixed(2)),
  dutyAmount: parseFloat((Math.random() * 2000 + 100).toFixed(2)),
  status: statuses[Math.floor(Math.random() * statuses.length)],
}))

// CBP Statement Report
const statementTypes = ['Daily', 'Weekly', 'Monthly']
const statementStatuses = ['Paid', 'Pending', 'Submitted', 'Rejected']

export const statementReportMockData: StatementReportRow[] = Array.from({ length: 20 }, (_, i) => {
  const type = statementTypes[Math.floor(Math.random() * statementTypes.length)]
  const pAmount = parseFloat((Math.random() * 20000 + 500).toFixed(2))
  return {
    id: `stmt-${i + 1}`,
    statementDate: randomDateInLastNDays(90),
    statementNumber: `CBP-${String(Math.floor(Math.random() * 9999999)).padStart(7, '0')}`,
    type,
    port: ports[Math.floor(Math.random() * ports.length)],
    checkNo: `CHK${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
    submitted: randomDateInLastNDays(85),
    pAmount,
    fAmount: parseFloat((pAmount * (0.95 + Math.random() * 0.1)).toFixed(2)),
    importer: importers[Math.floor(Math.random() * importers.length)],
  }
})

// FDA Report
const programs = ['DRUG', 'FOOD', 'DEVICE', 'COSMET', 'RAD']
const processingResults = ['MAY PROCEED', 'HOLD', 'REFUSED', 'DETAINED']
const actionCodes = ['AP', 'HO', 'RE', 'DT', 'MA']

export const fdaReportMockData: FDAReportRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: `fda-${i + 1}`,
  entry: generateEntry(),
  fdaLine: String(Math.floor(Math.random() * 10) + 1).padStart(3, '0'),
  productCode: `${programs[Math.floor(Math.random() * programs.length)]}${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
  program: programs[Math.floor(Math.random() * programs.length)],
  processingResult: processingResults[Math.floor(Math.random() * processingResults.length)],
  actionCode: actionCodes[Math.floor(Math.random() * actionCodes.length)],
  entityName: importers[Math.floor(Math.random() * importers.length)],
  quantity: `${Math.floor(Math.random() * 500) + 1} ${['KG', 'LB', 'EA', 'MT'][Math.floor(Math.random() * 4)]}`,
  entryDate: randomDateInLastNDays(30),
  port: ports[Math.floor(Math.random() * ports.length)],
}))

// EDI Files
const docTypes = ['315', '214', '856', '810', '204', '997', '824']
const fileExts = ['.edi', '.txt', '.x12', '.edi']

export const ediFilesMockData: EDIFileRow[] = Array.from({ length: 20 }, (_, i) => {
  const docType = docTypes[Math.floor(Math.random() * docTypes.length)]
  const ext = fileExts[Math.floor(Math.random() * fileExts.length)]
  return {
    id: `edi-${i + 1}`,
    date: randomDateInLastNDays(30),
    fileName: `HARMAN_${docType}_${String(Date.now() + i).slice(-8)}${ext}`,
    fileExt: ext,
    docType,
    docId: `DOC${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
  }
})
