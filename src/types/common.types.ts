export interface User {
  username:     string
  name:         string
  companyCode:  string
  companyName:  string
  role?:        'viewer' | 'broker' | 'admin'
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
