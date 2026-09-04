// staff: FTZ Converter only. coordinator / manager: full portal access.
// admin: full portal access, reserved for future admin-only functionality.
export type UserRole = 'staff' | 'coordinator' | 'manager' | 'admin'

export interface User {
  username:     string
  name:         string
  companyCode:  string
  companyName:  string
  role?:        UserRole
  clientCoKeys: string[]   // MST CO_KEY values this user may access; empty = all (admin/broker)
}

export interface FilterState {
  datesBasedOn: string
  dateFrom: Date | null
  dateTo: Date | null
  port: string
  otherFilter: string
}

export type ExportFormat = 'pdf' | 'xlsx' | 'csv'

export interface Column {
  id: string
  label: string
  visible: boolean
  required?: boolean
}

export interface PaginationState {
  pageIndex: number
  pageSize: number
}
