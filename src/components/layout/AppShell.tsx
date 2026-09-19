import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <TopBar onMobileMenuToggle={() => setMobileOpen((v) => !v)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* h-full + flex column give a page's root div a real height to opt
                into (via its own h-full) for an internally-scrolling layout —
                a plain block child would otherwise never receive one, since
                this wrapper had no definite height to pass down. Pages that
                don't opt in (most of them, using natural content height) are
                unaffected: a flex column's cross axis is width, not height,
                so a content-sized child isn't stretched vertically. */}
            <div className="max-w-[1600px] mx-auto h-full flex flex-col">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
