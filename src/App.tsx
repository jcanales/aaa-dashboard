import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { IeepaPage } from '@/pages/IeepaPage'
import { DutiesBreakdownPage } from '@/pages/DutiesBreakdownPage'
import { AesPage } from '@/pages/AesPage'
import { AbiCrossingsPage } from '@/pages/AbiCrossingsPage'
import { AbiStatementsPage } from '@/pages/AbiStatementsPage'
import { TariffPage } from '@/pages/TariffPage'
import { AgentsPage } from '@/pages/AgentsPage'

function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="dashboard"       element={<DashboardPage />} />
            <Route path="ieepa"           element={<IeepaPage />} />
            <Route path="duties/hts"      element={<DutiesBreakdownPage />} />
            <Route path="aes"             element={<AesPage />} />
            <Route path="abi/crossings"   element={<AbiCrossingsPage />} />
            <Route path="abi/statements"  element={<AbiStatementsPage />} />
            <Route path="tariff"          element={<TariffPage />} />
            <Route path="agents"          element={<AgentsPage />} />
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
