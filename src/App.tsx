import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DutiesBreakdownPage } from '@/pages/DutiesBreakdownPage'
import { DutyBucketDetailPage } from '@/pages/DutyBucketDetailPage'
import { EntryDetailPage } from '@/pages/EntryDetailPage'
import { AesPage } from '@/pages/AesPage'
import { AbiCrossingsPage } from '@/pages/AbiCrossingsPage'
import { AbiStatementsPage } from '@/pages/AbiStatementsPage'
import { TariffPage } from '@/pages/TariffPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { UploadPage as ConverterUploadPage } from '@/pages/converter/UploadPage'
import { ReviewPage as ConverterReviewPage } from '@/pages/converter/ReviewPage'
import { OperationReviewPage as ConverterOperationReviewPage } from '@/pages/converter/OperationReviewPage'
import { HistoryPage as ConverterHistoryPage } from '@/pages/converter/HistoryPage'
import { ConfigurationPage as ConverterConfigurationPage } from '@/pages/converter/ConfigurationPage'
import { isFtzOnlyRole } from '@/lib/permissions'

function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

// Staff are restricted to the FTZ Converter module; everyone else (coordinator,
// manager, admin) has full portal access. See src/lib/permissions.ts.
function RequireFullAccess() {
  const role = useAuthStore((s) => s.user?.role)
  if (isFtzOnlyRole(role)) return <Navigate to="/converter/upload" replace />
  return <Outlet />
}

// Tariff Intelligence is admin-only, per explicit request — narrower than
// RequireFullAccess (which also lets coordinator/manager through).
function RequireAdminOnly() {
  const role = useAuthStore((s) => s.user?.role)
  if (role !== 'admin') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function HomeRedirect() {
  const role = useAuthStore((s) => s.user?.role)
  return <Navigate to={isFtzOnlyRole(role) ? '/converter/upload' : '/dashboard'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route element={<RequireFullAccess />}>
              <Route path="dashboard"       element={<DashboardPage />} />
              <Route path="duties/hts"      element={<DutiesBreakdownPage />} />
              <Route path="duties/hts/:bucket" element={<DutyBucketDetailPage />} />
              <Route path="entries/:recid"  element={<EntryDetailPage />} />
              <Route path="aes"             element={<AesPage />} />
              <Route path="abi/crossings"   element={<AbiCrossingsPage />} />
              <Route path="abi/statements"  element={<AbiStatementsPage />} />
              <Route path="agents"          element={<AgentsPage />} />
              <Route element={<RequireAdminOnly />}>
                <Route path="tariff"        element={<TariffPage />} />
              </Route>
            </Route>

            <Route path="converter/upload"              element={<ConverterUploadPage />} />
            <Route path="converter/review/:id"           element={<ConverterReviewPage />} />
            <Route path="converter/operations/:id"       element={<ConverterOperationReviewPage />} />
            <Route path="converter/history"              element={<ConverterHistoryPage />} />
            <Route element={<RequireFullAccess />}>
              <Route path="converter/configuracion"      element={<ConverterConfigurationPage />} />
            </Route>

            <Route index element={<HomeRedirect />} />
            <Route path="*" element={<HomeRedirect />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
