import type { FieldValues } from './ftz214.types'

export interface OperationSummary {
  id: string
  name: string | null
  status: 'draft' | 'generated'
  customerName: string | null
  memberCount: number
  lineCount: number
  createdAt: string
  updatedAt: string
}

export interface OperationMemberSummary {
  conversionId: string
  pdfFilename: string
  customerName: string | null
  lineCount: number
  extractionDurationMs: number | null
  position: number
  lineAnchors: Array<{ page: number; y: number }>
  createdAt: string
  updatedAt: string
}

export interface FieldConflict {
  section: 'applicationInformation' | 'header' | 'billOfLading'
  field: string
  values: Array<{ pdfFilename: string; value: string | null }>
}

export type OperationLine = Record<string, unknown> & { _source?: string | null }

export interface OperationDetail {
  id: string
  name: string | null
  status: 'draft' | 'generated'
  applicationData: FieldValues
  headerData: FieldValues
  billOfLadingData: FieldValues
  detailData: { lines: OperationLine[] }
  xml: string | null
  members: OperationMemberSummary[]
  conflicts: FieldConflict[]
  createdAt: string
  updatedAt: string
}
