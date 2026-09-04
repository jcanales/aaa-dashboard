import React from 'react'
import { LogOut, Bell, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useClientStore } from '@/store/clientStore'
import { useNavigate } from 'react-router-dom'

interface TopBarProps {
  onMobileMenuToggle?: () => void
}

export function TopBar({ onMobileMenuToggle }: TopBarProps) {
  const { user, logout } = useAuthStore()
  const { reset: resetClient } = useClientStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    resetClient()
    navigate('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          className="md:hidden p-1.5 rounded hover:bg-slate-100 transition-colors"
          onClick={onMobileMenuToggle}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-slate-600" />
        </button>
        <span className="text-xs font-semibold text-teal-800 uppercase tracking-widest">
          Trade Compliance Portal
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="flex items-center justify-center h-9 w-9 rounded hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7490] focus-visible:ring-offset-2"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4 text-slate-500" />
        </button>
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-800 leading-tight">{user.name}</p>
              <p className="text-xs text-slate-500 leading-tight capitalize">{user.role ?? 'viewer'}</p>
            </div>
            <div className="h-7 w-7 rounded-full bg-teal-800 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-600 hover:text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Logout</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
