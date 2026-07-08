export interface AesListRow {
  id: string
  reference: string
  mot: string
  scac: string
  unladingPort: string
  estExpDate: string
  exporter: string
  consignee: string
  port: string
  sedStatus: string
  severity: string
  partNumber: string
  value: number
  itn: string
  traffic: string
  // hidden columns
  action?: string
  arInvoice?: string
  consigneeId?: string
  countryDest?: string
  created?: string
  equipment?: string
  exporterId?: string
  fillOption?: string
  hazardous?: string
  inbondCode?: string
  license?: string
  origin?: string
  stateDest?: string
  user?: string
}

export interface AesListDetailRow extends AesListRow {
  line: number
  hts: string
  qty: number
}
