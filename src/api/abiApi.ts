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
  // Base arg lets BASE_URL be either relative ('/api', for same-origin nginx
  // proxying in production) or absolute (local dev) — a bare relative string
  // passed to `new URL()` with no base throws "Invalid URL".
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
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

// ── Crossing ──────────────────────────────────────────────────────────────────

export interface CrossingRow {
  recid:      string
  trafficNo:  string
  entryNo:    string | null
  entryRecid: string | null
  date:       string | null
  coKey:      string
  coName:     string | null
  custRef:    string | null
  value:      number | null
  port:       string | null
  pedimento:  string | null
  status:     string
  rawStatus:  string
}

export interface CrossingPage {
  data:     CrossingRow[]
  total:    number
  page:     number
  pageSize: number
}

export async function fetchCrossings(params: {
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
  page?:     number
  limit?:    number
  status?:   string
}): Promise<CrossingPage> {
  return get<CrossingPage>('/abi/crossing', params as Record<string, string | number | undefined>)
}

// ── Statements ────────────────────────────────────────────────────────────────

export interface StatementRow {
  recid:       string
  stmtNo:      string
  date:        string | null
  dueDate:     string | null
  status:      string
  statusLabel: string
  amount:      number | null
  entryCount:  number | null
  port:        string | null
  coKey:       string
  coName:      string | null
  impOfRecord: string | null
  checkNo:     string | null
}

export interface StatementsPage {
  data:     StatementRow[]
  total:    number
  page:     number
  pageSize: number
}

export async function fetchStatements(params: {
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
  page?:     number
  limit?:    number
}): Promise<StatementsPage> {
  return get<StatementsPage>('/abi/statements', params as Record<string, string | number | undefined>)
}
