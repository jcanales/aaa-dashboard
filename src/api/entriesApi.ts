import type { MssqlClient } from '@/store/clientStore'
import { useAuthStore } from '@/store/authStore'

const BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api'

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('auth-token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    })
  }
  const res = await fetch(url.toString(), { headers: authHeaders() })
  if (res.status === 401) {
    useAuthStore.getState().logout()
    window.location.href = '/login'
    throw new Error('Session expired. Please log in again.')
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EntryKpis {
  entriesInRange:    number
  entriesPrior:      number
  dutyInRange:       number
  dutyPrior:         number
  valueInRange:      number
  sec301InRange:     number
  sec232InRange:     number
  ieepaInRange:      number
  remediationInRange: number
  avgReleaseDays:    number | null
  entriesPending:    number
  dateFrom:          string
  dateTo:            string
}

export interface MonthlyPoint {
  period:  string
  entries: number
  duties:  number
  value:   number
  tariff:  number
}

export interface Entry {
  recid:     string
  entryNo:   string
  entryType: string
  entryDate: string
  relDate:   string | null
  liqDate:   string | null
  portCod:   string
  custKey:   string
  custName:  string | null
  duty:      number
  tax:       number
  other:     number
  total:     number
  entryVal:  number
  sec301:    number
  sec232:    number
  ieepa:     number
  status:    'pending' | 'released' | 'liquidated'
}

export interface EntriesPage {
  data:     Entry[]
  total:    number
  page:     number
  pageSize: number
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function fetchEntryClients(): Promise<MssqlClient[]> {
  return get<MssqlClient[]>('/entries/clients')
}

export async function fetchEntryKpis(params: {
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
}): Promise<EntryKpis> {
  return get<EntryKpis>('/entries/kpis', params as Record<string, string | undefined>)
}

export async function fetchMonthlyData(params: {
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
}): Promise<MonthlyPoint[]> {
  return get<MonthlyPoint[]>('/entries/monthly', params as Record<string, string | undefined>)
}

export interface EntryCharts {
  dailyCounts:      { date: string; count: number }[]
  clearanceBuckets: { label: string; count: number }[]
  portBreakdown:    { port: string; count: number; value: number }[]
}

export async function fetchEntryCharts(params: {
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
}): Promise<EntryCharts> {
  return get<EntryCharts>('/entries/charts', params as Record<string, string | undefined>)
}

export async function fetchEntries(params: {
  coKey?:    string
  page?:     number
  limit?:    number
  dateFrom?: string
  dateTo?:   string
  status?:   string
}): Promise<EntriesPage> {
  return get<EntriesPage>('/entries', params as Record<string, string | number | undefined>)
}

// ── IEEPA ──────────────────────────────────────────────────────────────────────

export interface IeepaKpis {
  totalEntries:    number
  ieepaEntries:    number
  totalValue:      number
  regularDuty:     number
  sec301:          number
  sec232:          number
  ieepaDuty:       number
  remediationDuty: number
  totalDuty:       number
}

export interface IeepaMonthRow {
  period:       string
  yr:           number
  mo:           number
  entries:      number
  ieepaEntries: number
  regularDuty:  number
  sec301:       number
  sec232:       number
  ieepaDuty:    number
  remediation:  number
}

export interface IeepaTopEntry {
  recid:           string
  entryNo:         string
  entryDate:       string
  port:            string
  custKey:         string
  custName:        string | null
  entryVal:        number
  ieepaDuty:       number
  remediationDuty: number
  combinedIeepa:   number
}

type IeepaParams = { coKey?: string; dateFrom?: string; dateTo?: string }

export async function fetchIeepaKpis(params: IeepaParams): Promise<IeepaKpis> {
  return get<IeepaKpis>('/entries/ieepa/kpis', params as Record<string, string | undefined>)
}

export async function fetchIeepaMonthly(params: IeepaParams): Promise<IeepaMonthRow[]> {
  return get<IeepaMonthRow[]>('/entries/ieepa/monthly', params as Record<string, string | undefined>)
}

export async function fetchIeepaTopEntries(params: IeepaParams): Promise<IeepaTopEntry[]> {
  return get<IeepaTopEntry[]>('/entries/ieepa/top-entries', params as Record<string, string | undefined>)
}

// ── HTS duty breakdown ─────────────────────────────────────────────────────────

export interface HtsBreakdownRow {
  hts:          string
  description:  string | null
  lineCount:    number
  enteredValue: number
  regularDuty:  number
  sec301:       number
  sec232:       number
  ieepa:        number
  other:        number
  totalDuty:    number
}

export interface HtsBreakdownTotals {
  enteredValue: number
  regularDuty:  number
  sec301:       number
  sec232:       number
  ieepa:        number
  other:        number
  totalDuty:    number
}

export interface HtsBreakdownResponse {
  current:   HtsBreakdownRow[]
  prior:     HtsBreakdownRow[]
  totals:    { current: HtsBreakdownTotals; prior: HtsBreakdownTotals }
  page:      number
  limit:     number
  total:     number
  dateFrom:  string
  dateTo:    string
  priorFrom: string
  priorTo:   string
}

export interface HtsEntryRow {
  recid:        string
  entryNo:      string
  entryDate:    string
  port:         string
  custKey:      string
  custName:     string | null
  enteredValue: number
  regularDuty:  number
  sec301:       number
  sec232:       number
  ieepa:        number
  other:        number
  totalDuty:    number
}

export async function fetchHtsBreakdown(params: {
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
  page?:     number
  limit?:    number
}): Promise<HtsBreakdownResponse> {
  return get<HtsBreakdownResponse>('/entries/hts-breakdown', params as Record<string, string | number | undefined>)
}

export async function fetchHtsEntries(params: {
  hts:       string
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
}): Promise<HtsEntryRow[]> {
  return get<HtsEntryRow[]>('/entries/hts-breakdown/entries', params as Record<string, string | undefined>)
}
