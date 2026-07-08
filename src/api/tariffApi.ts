import type {
  TariffChange,
  TariffClient,
  ClientHtsPortfolio,
  ClientHtsMatch,
  TariffAlert,
  TariffKpis,
} from '@/types/tariff.types'
import { useAuthStore } from '@/store/authStore'

const BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth-token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  })
  if (res.status === 401) {
    useAuthStore.getState().logout()
    window.location.href = '/login'
    throw new Error('Session expired. Please log in again.')
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ── Mock data for development fallback ──────────────────────────────────────

const MOCK_CHANGES: TariffChange[] = [
  {
    id: 'chg-001',
    sourceId: 'src-fr',
    documentNumber: 'FR-2026-07312',
    title: 'Section 301 Tariff Rate Increase on Consumer Electronics from China',
    summary:
      'The USTR has proposed increasing Section 301 duties on consumer electronics imported from China from 25% to 35%, affecting a broad range of HTS codes under chapters 84 and 85. The proposed rule is open for public comment through May 15, 2026.',
    impactScore: 9,
    impactRationale:
      'High volume category with significant annual import value. Estimated 10% increase in landed cost for affected SKUs.',
    htsCodes: ['8471.30.0100', '8517.12.0050', '8528.72.6400', '8544.42.9000'],
    dutyBefore: '25%',
    dutyAfter: '35%',
    effectiveDate: '2026-07-01',
    publicationDate: '2026-04-01',
    sourceUrl: 'https://www.federalregister.gov/documents/2026/04/01/example',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    alertsSent: 0,
    createdAt: '2026-04-01T08:00:00Z',
  },
  {
    id: 'chg-002',
    sourceId: 'src-cbp',
    documentNumber: 'CBP-HTSUS-2026-003',
    title: 'HTUSUS Classification Update — Audio Equipment Chapter 85',
    summary:
      'CBP has issued a binding ruling clarifying the classification of wireless audio devices, moving certain Bluetooth speakers from 8518.22 to 8518.29 with an associated duty rate change.',
    impactScore: 6,
    impactRationale:
      'Moderate impact affecting wireless speaker product lines. Reclassification may require retroactive duty adjustments on prior entries.',
    htsCodes: ['8518.22.0000', '8518.29.0000'],
    dutyBefore: '2%',
    dutyAfter: '4.9%',
    effectiveDate: '2026-05-01',
    publicationDate: '2026-03-28',
    sourceUrl: 'https://rulings.cbp.gov/ruling/example',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    alertsSent: 0,
    createdAt: '2026-03-28T10:30:00Z',
  },
  {
    id: 'chg-003',
    sourceId: 'src-usitc',
    documentNumber: 'USITC-INV-337-1234',
    title: 'Section 337 Investigation — Network Interface Devices',
    summary:
      'USITC has initiated a Section 337 investigation into certain network interface devices. An exclusion order, if issued, could bar importation of affected products.',
    impactScore: 8,
    impactRationale:
      'Potential exclusion order would halt imports of key networking products. Legal exposure requires immediate review.',
    htsCodes: ['8517.62.0050', '8517.69.0000'],
    dutyBefore: null,
    dutyAfter: null,
    effectiveDate: null,
    publicationDate: '2026-04-05',
    sourceUrl: 'https://www.usitc.gov/investigations/example',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    alertsSent: 0,
    createdAt: '2026-04-05T14:00:00Z',
  },
  {
    id: 'chg-004',
    sourceId: 'src-fr',
    documentNumber: 'FR-2026-06891',
    title: 'Antidumping Duty Order — Printed Circuit Assemblies from Vietnam',
    summary:
      'Commerce Department has issued a final antidumping duty order on printed circuit assemblies from Vietnam with rates ranging from 8.5% to 22.3% depending on manufacturer.',
    impactScore: 7,
    impactRationale:
      'Significant cost increase for PCB supply chain. Manufacturer-specific rates require careful invoice documentation.',
    htsCodes: ['8534.00.0020', '8534.00.0040'],
    dutyBefore: '0%',
    dutyAfter: '8.5% – 22.3%',
    effectiveDate: '2026-04-15',
    publicationDate: '2026-03-20',
    sourceUrl: 'https://www.federalregister.gov/documents/2026/03/20/example',
    status: 'approved',
    reviewedBy: 'jcanales',
    reviewedAt: '2026-03-22T09:15:00Z',
    alertsSent: 3,
    createdAt: '2026-03-20T07:00:00Z',
  },
  {
    id: 'chg-005',
    sourceId: 'src-ustr',
    documentNumber: 'USTR-2026-0012',
    title: 'GSP Renewal — Duty-Free Treatment for Eligible Developing Countries',
    summary:
      'USTR announces renewal of the Generalized System of Preferences program, restoring duty-free treatment for eligible articles from designated beneficiary countries through December 31, 2027.',
    impactScore: 3,
    impactRationale:
      'Favorable change restoring duty savings on eligible goods. Low urgency — review to identify qualifying imports.',
    htsCodes: ['6204.62.4010', '6110.20.2075'],
    dutyBefore: '12%',
    dutyAfter: '0%',
    effectiveDate: '2026-06-01',
    publicationDate: '2026-04-03',
    sourceUrl: 'https://ustr.gov/gsp/renewal-2026',
    status: 'reviewed',
    reviewedBy: 'jcanales',
    reviewedAt: '2026-04-04T11:00:00Z',
    alertsSent: 2,
    createdAt: '2026-04-03T09:00:00Z',
  },
  {
    id: 'chg-006',
    sourceId: 'src-cbp',
    documentNumber: 'CBP-ADD-2026-008',
    title: 'ADD Rate Revision — Steel Wire Rod from Mexico',
    summary:
      'CBP has revised the antidumping duty rate for steel wire rod from Mexico following an administrative review. New cash deposit rate effective immediately.',
    impactScore: 2,
    impactRationale:
      'Minor impact — applicable only to steel wire rod, not a core import category.',
    htsCodes: ['7213.91.3011'],
    dutyBefore: '3.2%',
    dutyAfter: '1.8%',
    effectiveDate: '2026-04-08',
    publicationDate: '2026-04-07',
    sourceUrl: 'https://rulings.cbp.gov/add/example',
    status: 'suppressed',
    reviewedBy: 'jcanales',
    reviewedAt: '2026-04-07T15:00:00Z',
    alertsSent: 0,
    createdAt: '2026-04-07T12:00:00Z',
  },
  {
    id: 'chg-007',
    sourceId: 'src-fr',
    documentNumber: 'FR-2026-08103',
    title: 'Proposed Rule: Exclusion from Section 232 Steel Tariffs for Qualifying Products',
    summary:
      'Commerce proposes a product exclusion process for downstream manufacturers unable to source domestically produced steel. Comment period open through May 30, 2026.',
    impactScore: 5,
    impactRationale:
      'Potential tariff relief if exclusion granted. Requires filing exclusion requests by deadline.',
    htsCodes: ['7207.20.0025', '7208.51.0060'],
    dutyBefore: '25%',
    dutyAfter: 'TBD (exclusion)',
    effectiveDate: null,
    publicationDate: '2026-04-08',
    sourceUrl: 'https://www.federalregister.gov/documents/2026/04/08/example',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    alertsSent: 0,
    createdAt: '2026-04-08T06:00:00Z',
  },
]

const MOCK_CLIENTS: TariffClient[] = [
  {
    id: 'cli-001',
    code: 'JD1249',
    name: 'HARMAN PROFESSIONAL INC',
    email: 'imports@harman.com',
    slackChannel: '#trade-alerts-harman',
    isActive: true,
    createdAt: '2025-01-15T00:00:00Z',
  },
  {
    id: 'cli-002',
    code: 'JD1301',
    name: 'SAMSUNG ELECTRONICS AMERICA',
    email: 'customs@samsung.com',
    slackChannel: '#trade-alerts-sea',
    isActive: true,
    createdAt: '2025-02-01T00:00:00Z',
  },
  {
    id: 'cli-003',
    code: 'JD1089',
    name: 'INTEL CORPORATION',
    email: 'trade.compliance@intel.com',
    slackChannel: null,
    isActive: true,
    createdAt: '2024-11-01T00:00:00Z',
  },
  {
    id: 'cli-004',
    code: 'JD1450',
    name: 'BOSCH HOME APPLIANCES',
    email: 'imports@bosch-home.com',
    slackChannel: '#bosch-alerts',
    isActive: false,
    createdAt: '2025-03-10T00:00:00Z',
  },
]

const MOCK_PORTFOLIOS: ClientHtsPortfolio[] = [
  { id: 'port-001', clientId: 'cli-001', htsCode: '8471.30.0100', description: 'Portable digital ADP machines', annualValue: 4200000, addedAt: '2025-01-15T00:00:00Z' },
  { id: 'port-002', clientId: 'cli-001', htsCode: '8517.12.0050', description: 'Telephones for cellular networks', annualValue: 8900000, addedAt: '2025-01-15T00:00:00Z' },
  { id: 'port-003', clientId: 'cli-001', htsCode: '8528.72.6400', description: 'Color video monitors', annualValue: 1300000, addedAt: '2025-02-20T00:00:00Z' },
  { id: 'port-004', clientId: 'cli-001', htsCode: '8518.22.0000', description: 'Single loudspeakers, mounted', annualValue: 650000, addedAt: '2025-03-01T00:00:00Z' },
  { id: 'port-005', clientId: 'cli-002', htsCode: '8517.62.0050', description: 'Machines for reception of voice', annualValue: 12000000, addedAt: '2025-02-01T00:00:00Z' },
  { id: 'port-006', clientId: 'cli-002', htsCode: '8534.00.0020', description: 'Printed circuits', annualValue: 3400000, addedAt: '2025-02-01T00:00:00Z' },
  { id: 'port-007', clientId: 'cli-003', htsCode: '8534.00.0040', description: 'Printed circuit assemblies', annualValue: 6700000, addedAt: '2024-11-01T00:00:00Z' },
  { id: 'port-008', clientId: 'cli-003', htsCode: '8544.42.9000', description: 'Electric conductors', annualValue: 2100000, addedAt: '2024-11-01T00:00:00Z' },
  { id: 'port-009', clientId: 'cli-004', htsCode: '7213.91.3011', description: 'Wire rod of iron', annualValue: 890000, addedAt: '2025-03-10T00:00:00Z' },
]

const MOCK_MATCHES: ClientHtsMatch[] = [
  { id: 'match-001', changeId: 'chg-001', clientId: 'cli-001', matchedHtsCodes: ['8471.30.0100', '8517.12.0050', '8528.72.6400'], estimatedDutyImpact: 1340000, createdAt: '2026-04-01T08:05:00Z' },
  { id: 'match-002', changeId: 'chg-001', clientId: 'cli-002', matchedHtsCodes: ['8517.12.0050'], estimatedDutyImpact: 890000, createdAt: '2026-04-01T08:05:00Z' },
  { id: 'match-003', changeId: 'chg-002', clientId: 'cli-001', matchedHtsCodes: ['8518.22.0000'], estimatedDutyImpact: 18850, createdAt: '2026-03-28T10:35:00Z' },
  { id: 'match-004', changeId: 'chg-003', clientId: 'cli-002', matchedHtsCodes: ['8517.62.0050'], estimatedDutyImpact: 0, createdAt: '2026-04-05T14:05:00Z' },
  { id: 'match-005', changeId: 'chg-004', clientId: 'cli-002', matchedHtsCodes: ['8534.00.0020'], estimatedDutyImpact: 289000, createdAt: '2026-03-20T07:05:00Z' },
  { id: 'match-006', changeId: 'chg-004', clientId: 'cli-003', matchedHtsCodes: ['8534.00.0040'], estimatedDutyImpact: 570000, createdAt: '2026-03-20T07:05:00Z' },
]

const MOCK_ALERTS: TariffAlert[] = [
  { id: 'alrt-001', changeId: 'chg-004', clientId: 'cli-002', channel: 'email', status: 'sent', sentAt: '2026-03-22T09:20:00Z', createdAt: '2026-03-22T09:15:00Z' },
  { id: 'alrt-002', changeId: 'chg-004', clientId: 'cli-002', channel: 'slack', status: 'sent', sentAt: '2026-03-22T09:21:00Z', createdAt: '2026-03-22T09:15:00Z' },
  { id: 'alrt-003', changeId: 'chg-004', clientId: 'cli-003', channel: 'email', status: 'sent', sentAt: '2026-03-22T09:22:00Z', createdAt: '2026-03-22T09:15:00Z' },
  { id: 'alrt-004', changeId: 'chg-005', clientId: 'cli-001', channel: 'email', status: 'sent', sentAt: '2026-04-04T11:05:00Z', createdAt: '2026-04-04T11:00:00Z' },
  { id: 'alrt-005', changeId: 'chg-005', clientId: 'cli-001', channel: 'slack', status: 'sent', sentAt: '2026-04-04T11:06:00Z', createdAt: '2026-04-04T11:00:00Z' },
  { id: 'alrt-006', changeId: 'chg-001', clientId: 'cli-001', channel: 'email', status: 'queued', sentAt: null, createdAt: '2026-04-08T07:00:00Z' },
  { id: 'alrt-007', changeId: 'chg-001', clientId: 'cli-002', channel: 'slack', status: 'failed', sentAt: null, createdAt: '2026-04-08T07:00:00Z' },
]

const MOCK_KPIS: TariffKpis = {
  changesToday: 2,
  pendingReview: 3,
  alertsSentThisWeek: 5,
  clientsAffected: 3,
  highestImpactScore: 9,
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function fetchChanges(params?: {
  status?: string
  limit?: number
  page?: number
}): Promise<{ data: TariffChange[]; total: number }> {
  try {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.page) query.set('page', String(params.page))
    const qs = query.toString()
    const res = await request<{ data: TariffChange[]; pagination: { total: number } }>(
      `/changes${qs ? `?${qs}` : ''}`
    )
    return { data: res.data, total: res.pagination.total }
  } catch {
    let data = [...MOCK_CHANGES]
    if (params?.status && params.status !== 'all') {
      data = data.filter((c) => c.status === params.status)
    }
    const page = params?.page ?? 1
    const limit = params?.limit ?? 20
    const start = (page - 1) * limit
    return { data: data.slice(start, start + limit), total: data.length }
  }
}

export async function fetchChange(id: string): Promise<TariffChange> {
  try {
    return await request<TariffChange>(`/changes/${id}`)
  } catch {
    const found = MOCK_CHANGES.find((c) => c.id === id)
    if (!found) throw new Error(`Change ${id} not found`)
    return found
  }
}

export async function reviewChange(
  id: string,
  action: 'approved' | 'suppressed'
): Promise<TariffChange> {
  try {
    return await request<TariffChange>(`/review/${id}`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    })
  } catch {
    const found = MOCK_CHANGES.find((c) => c.id === id)
    if (!found) throw new Error(`Change ${id} not found`)
    return {
      ...found,
      status: action,
      reviewedBy: 'jcanales',
      reviewedAt: new Date().toISOString(),
    }
  }
}

export async function fetchClients(): Promise<TariffClient[]> {
  try {
    return await request<TariffClient[]>('/clients')
  } catch {
    return MOCK_CLIENTS
  }
}

export async function fetchClient(
  id: string
): Promise<TariffClient & { htsPortfolio: ClientHtsPortfolio[]; matches: ClientHtsMatch[] }> {
  try {
    return await request<TariffClient & { htsPortfolio: ClientHtsPortfolio[]; matches: ClientHtsMatch[] }>(
      `/clients/${id}`
    )
  } catch {
    const client = MOCK_CLIENTS.find((c) => c.id === id)
    if (!client) throw new Error(`Client ${id} not found`)
    return {
      ...client,
      htsPortfolio: MOCK_PORTFOLIOS.filter((p) => p.clientId === id),
      matches: MOCK_MATCHES.filter((m) => m.clientId === id),
    }
  }
}

export async function fetchAlerts(params?: {
  clientId?: string
}): Promise<TariffAlert[]> {
  try {
    const query = new URLSearchParams()
    if (params?.clientId) query.set('clientId', params.clientId)
    const qs = query.toString()
    const res = await request<{ data: TariffAlert[] }>(`/alerts${qs ? `?${qs}` : ''}`)
    return Array.isArray(res) ? res : (res.data ?? [])
  } catch {
    let data = [...MOCK_ALERTS]
    if (params?.clientId) {
      data = data.filter((a) => a.clientId === params.clientId)
    }
    return data
  }
}

export async function fetchKpis(): Promise<TariffKpis> {
  try {
    return await request<TariffKpis>('/changes/kpis')
  } catch {
    return MOCK_KPIS
  }
}
