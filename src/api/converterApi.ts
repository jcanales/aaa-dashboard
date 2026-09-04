import { useAuthStore } from '@/store/authStore'

const BASE_URL: string = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api') + '/converter'

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('auth-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export class ApiError extends Error {
  status: number
  body?: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

function onUnauthorized() {
  useAuthStore.getState().logout()
  window.location.href = '/login'
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    if (res.status === 401) onUnauthorized()
    throw new ApiError(body.error ?? res.statusText, res.status, body)
  }
  return res.json() as Promise<T>
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(`${BASE_URL}${path}`, { headers: { ...authHeaders() } }))
}

export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    if (res.status === 401) onUnauthorized()
    throw new ApiError(res.statusText, res.status)
  }
  return res.blob()
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return handle<T>(
    await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    })
  )
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return handle<T>(
    await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    })
  )
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  )
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers: { ...authHeaders() } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    if (res.status === 401) onUnauthorized()
    throw new ApiError(body.error ?? res.statusText, res.status, body)
  }
}

export async function apiUploadPdf<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  return handle<T>(await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { ...authHeaders() }, body: form }))
}

export async function downloadConversionXml(id: string, filename: string): Promise<void> {
  await downloadXml(`/conversions/${id}/xml`, filename, 'this conversion')
}

export async function downloadOperationXml(id: string, filename: string): Promise<void> {
  await downloadXml(`/operations/${id}/xml`, filename, 'this operation')
}

async function downloadXml(path: string, filename: string, noun: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(res.status === 404 ? `XML not found for ${noun}` : `Failed to download XML (${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // Appended to the DOM before clicking, and the object URL revoked on a timeout
  // rather than synchronously right after .click() — some browsers (Firefox in
  // particular) don't reliably start a download from a detached anchor or an
  // already-revoked URL.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
