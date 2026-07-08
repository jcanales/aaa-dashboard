export interface TariffChange {
  id: string
  sourceId: string
  documentNumber: string
  title: string
  summary: string
  impactScore: number
  impactRationale: string
  htsCodes: string[]
  dutyBefore: unknown  // JSON column — may be { rate: "25%" } or string or null
  dutyAfter: unknown   // JSON column — may be { rate: "35%" } or string or null
  effectiveDate: string | null
  publicationDate: string
  sourceUrl: string
  status: 'pending' | 'reviewed' | 'approved' | 'suppressed'
  reviewedBy: string | null
  reviewedAt: string | null
  alertsSent: number
  createdAt: string
  clientMatches?: ClientHtsMatch[]  // included on single-record fetch
  alerts?: TariffAlert[]            // included on single-record fetch
}

export interface TariffSource {
  id: string
  name: string
  lastPolled: string | null
  lastHash: string | null
  createdAt: string
}

export interface TariffClient {
  id: string
  code: string
  name: string
  email: string
  slackChannel: string | null
  isActive: boolean
  createdAt: string
}

export interface ClientHtsPortfolio {
  id: string
  clientId: string
  htsCode: string
  description: string
  annualValue: number
  addedAt: string
}

export interface ClientHtsMatch {
  id: string
  changeId: string
  clientId: string
  matchedHtsCodes: string[]
  estimatedDutyImpact: number
  createdAt: string
}

export interface TariffAlert {
  id: string
  changeId: string
  clientId: string
  channel: 'email' | 'slack' | 'dashboard'
  status: 'queued' | 'sent' | 'failed'
  sentAt: string | null
  createdAt: string
}

export interface TariffKpis {
  changesToday: number
  pendingReview: number
  alertsSentThisWeek: number
  clientsAffected: number
  highestImpactScore: number
}
