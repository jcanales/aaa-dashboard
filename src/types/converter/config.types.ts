export interface ParserTemplate {
  id: string
  name: string
  description: string
  enabled: boolean
  conversionCount: number
}

export type LayoutStatus = 'detected' | 'validated' | 'rejected'

export interface DetectedLayout {
  id: string
  label: string | null
  status: LayoutStatus
  fieldMap: Record<string, string | null>
  createdAt: string
  validatedAt: string | null
  conversionCount: number
}

export interface FacilityDefaults {
  applicationInfo: Record<string, string | number | null>
  header: Record<string, string | number | null>
}

// Distinct from duties-dashboard's own tariff-domain `Client` type — this is
// an FTZ importer (see backend/prisma/schema.prisma's FtzClient model).
export interface FtzClient {
  id: string
  name: string
  irsNumber: string | null
  companyKey: string
  createdAt: string
  updatedAt: string
}

// Kept in sync with backend/src/converter/ftz214/facilityFields.ts.
// CustomerName is per-importer (from the invoice + RB lookup), not a facility constant.
export const FACILITY_APPLICATION_FIELDS = ['SoftwareProvider', 'Module', 'Version']
// Customer / CompanyKey are per-importer (filled from the RB Systems lookup), not here.
export const FACILITY_HEADER_FIELDS = [
  'FtzNumber',
  'ZoneId',
  'ZoneAddress',
  'ZoneCity',
  'ZoneWhse',
  'Port',
  'FirmsCode',
  'ApplicantName',
  'ZoneOperatorId',
]
