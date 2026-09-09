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

export interface AesRow {
  recid:     string
  reference: string
  custRef:   string
  coKey:     string
  coName:    string | null
  status:    string
  rawStatus: string
  date:      string | null
}

export interface AesPage {
  data:     AesRow[]
  total:    number
  page:     number
  pageSize: number
}

export async function fetchAesList(params: {
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
  page?:     number
  limit?:    number
  status?:   string
}): Promise<AesPage> {
  return get<AesPage>('/aes', params as Record<string, string | number | undefined>)
}
