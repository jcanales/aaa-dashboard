import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { FacilityTab } from '@/components/converter/config/FacilityTab'
import { ClientsTab } from '@/components/converter/config/ClientsTab'
import { TemplatesTab } from '@/components/converter/config/TemplatesTab'
import { LayoutsTab } from '@/components/converter/config/LayoutsTab'
import { UsersTab } from '@/components/converter/config/UsersTab'
import { LogsTab } from '@/components/converter/config/LogsTab'

type Tab = 'facility' | 'clients' | 'templates' | 'layouts' | 'users' | 'logs'

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'facility', label: 'FTZ Facility' },
  { id: 'clients', label: 'Clients' },
  { id: 'templates', label: 'Parser templates' },
  { id: 'layouts', label: 'Detected layouts' },
  { id: 'users', label: 'Users' },
]

// Narrower than the other tabs (which are coordinator+manager+admin, matching
// their backend requireRole gates) — Logs surfaces AI token cost, restricted
// to manager/admin per explicit request. GET /api/converter/logs enforces the
// same gate server-side; this only keeps the tab from appearing for a role
// that would just get a 403 from it.
const LOGS_TAB = { id: 'logs' as const, label: 'Logs' }

export function ConfigurationPage() {
  const role = useAuthStore((s) => s.user?.role)
  const tabs = useMemo(() => (role === 'admin' || role === 'manager' ? [...BASE_TABS, LOGS_TAB] : BASE_TABS), [role])
  const [tab, setTab] = useState<Tab>('facility')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title">Configuration</h1>
        <p className="text-page-subtitle">FTZ facility defaults, clients, invoice parsers, and portal users.</p>
      </div>

      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'facility' && <FacilityTab />}
      {tab === 'clients' && <ClientsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'layouts' && <LayoutsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'logs' && (role === 'admin' || role === 'manager') && <LogsTab />}
    </div>
  )
}
