export type FieldType = 'A' | 'N' | 'AN' | 'D'
export type Designation = 'M' | 'C' | 'O'

export interface AllowedValue { value: string; label: string }

export interface FieldDef {
  name: string
  label: string
  description: string
  type: FieldType
  maxLength?: number
  designation: Designation
  allowedValues?: AllowedValue[]
  hasUnitsAttr?: boolean
}

export interface FieldSchemaResponse {
  applicationInformation: FieldDef[]
  header: FieldDef[]
  billOfLading: FieldDef[]
  line: FieldDef[]
}

export interface UnitValue { value: string | number | null; units: string | null }
export type FieldValue = string | number | null | UnitValue
export type FieldValues = Record<string, FieldValue>

export type LineData = FieldValues

export interface BillOfLadingData {
  fields: FieldValues
  lines: LineData[]
}

export type ConversionStatus = 'processing' | 'draft' | 'generated' | 'failed'

export interface ConversionSummary {
  id: string
  pdfFilename: string
  status: ConversionStatus
  extractionError?: string | null
  customerName?: string | null
  lineCount?: number
  extractionDurationMs?: number | null
  operationId?: string | null
  createdAt: string
  updatedAt?: string
}

export interface ConversionPage {
  items: ConversionSummary[]
  nextCursor: string | null
}

export interface Conversion {
  id: string
  pdfFilename: string
  status: ConversionStatus
  extractionError: string | null
  applicationData: FieldValues
  headerData: FieldValues
  detailData: { billsOfLading: BillOfLadingData[] }
  xml: string | null
  parseSource?: string | null
  parseWarnings?: Array<{ line?: number; field: string; message: string }> | null
  lineAnchors?: Array<{ page: number; y: number }> | null
  createdAt: string
  updatedAt: string
}
