export interface CrossingReportRow {
  id: string
  entryDate: string
  entry: string
  scac: string
  custRef: string
  certified: string
  relDate: string
}

export interface EntryReport5Row extends CrossingReportRow {}

export interface EntryReport7Row {
  id: string
  entryDate: string
  entry: string
  scac: string
  custRef: string
  certified: string
  relDate: string
  mot: string
  port: string
  importer: string
  totalValue: number
  dutyAmount: number
  status: string
}

export interface StatementReportRow {
  id: string
  statementDate: string
  statementNumber: string
  type: string
  port: string
  checkNo: string
  submitted: string
  pAmount: number
  fAmount: number
  importer: string
}

export interface FDAReportRow {
  id: string
  entry: string
  fdaLine: string
  productCode: string
  program: string
  processingResult: string
  actionCode: string
  entityName: string
  quantity: string
  entryDate: string
  port: string
}

export interface EDIFileRow {
  id: string
  date: string
  fileName: string
  fileExt: string
  docType: string
  docId: string
}
