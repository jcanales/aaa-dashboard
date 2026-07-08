import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, FileText, ArrowLeftRight,
  Receipt, Globe, Bot, PanelLeftClose, PanelLeft, X,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean
  onToggle: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    operations: true,
    abi: true,
  })

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
      isActive ? 'bg-brand-500 text-white' : 'text-teal-100 hover:bg-teal-700 hover:text-white'
    )

  const iconLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex justify-center p-2 rounded-md my-0.5 transition-colors',
      isActive ? 'bg-brand-500 text-white' : 'text-teal-200 hover:bg-teal-700 hover:text-white'
    )

  const operationsItems = [
    { path: '/ieepa',  icon: <TrendingUp className="h-4 w-4" />, label: 'IEEPA Analysis' },
    { path: '/aes',    icon: <FileText className="h-4 w-4" />,   label: 'AES Filings' },
  ]

  const abiItems = [
    { path: '/abi/crossings',  icon: <ArrowLeftRight className="h-4 w-4" />, label: 'Crossings' },
    { path: '/abi/statements', icon: <Receipt className="h-4 w-4" />,        label: 'Statements' },
  ]

  return (
    <aside
      className={cn(
        'flex flex-col bg-teal-800 text-white flex-shrink-0',
        'fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-all md:duration-300',
        collapsed ? 'md:w-14' : 'md:w-64'
      )}
    >
      {/* Brand */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-teal-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="bg-white rounded px-2 py-1">
              <img
                src="https://www.jdgroup.net/wp-content/uploads/2023/05/logo-jd-group@2.png"
                alt="JD Group"
                className="h-6 w-auto object-contain"
              />
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="hidden md:flex p-1.5 rounded hover:bg-teal-700 transition-colors ml-auto"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <button
          onClick={onMobileClose}
          className="md:hidden p-1.5 rounded hover:bg-teal-700 transition-colors ml-auto"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Dashboard */}
      <div className="px-2 pt-3 pb-1">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink to="/dashboard" className={iconLinkClass}>
                <LayoutDashboard className="h-4 w-4" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">Dashboard</TooltipContent>
          </Tooltip>
        ) : (
          <NavLink to="/dashboard" className={linkClass}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">

        {/* Operations group */}
        {collapsed ? (
          <div className="py-1 border-t border-teal-700 mt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center text-teal-300 py-1.5">
                  <Package className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Operations</TooltipContent>
            </Tooltip>
            {operationsItems.map((item) => (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <NavLink to={item.path} className={iconLinkClass}>{item.icon}</NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div className="mt-2 border-t border-teal-700 pt-2">
            <button
              onClick={() => toggleGroup('operations')}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-teal-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span>Operations</span>
              </div>
              <span className="text-teal-400 text-[10px]">{openGroups.operations ? '▾' : '▸'}</span>
            </button>
            {openGroups.operations && (
              <div className="ml-2 space-y-0.5 mt-0.5">
                {operationsItems.map((item) => (
                  <NavLink key={item.path} to={item.path} className={linkClass}>
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABI group */}
        {collapsed ? (
          <div className="py-1 border-t border-teal-700 mt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center text-teal-300 py-1.5">
                  <ArrowLeftRight className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">ABI</TooltipContent>
            </Tooltip>
            {abiItems.map((item) => (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <NavLink to={item.path} className={iconLinkClass}>{item.icon}</NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div className="mt-1 border-t border-teal-700 pt-2">
            <button
              onClick={() => toggleGroup('abi')}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-teal-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                <span>ABI</span>
              </div>
              <span className="text-teal-400 text-[10px]">{openGroups.abi ? '▾' : '▸'}</span>
            </button>
            {openGroups.abi && (
              <div className="ml-2 space-y-0.5 mt-0.5">
                {abiItems.map((item) => (
                  <NavLink key={item.path} to={item.path} className={linkClass}>
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tariff Intelligence */}
        <div className="border-t border-teal-700 pt-2 mt-1">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink to="/tariff" className={iconLinkClass}>
                  <Globe className="h-4 w-4" />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">Tariff Intelligence</TooltipContent>
            </Tooltip>
          ) : (
            <NavLink to="/tariff" className={linkClass}>
              <Globe className="h-4 w-4 shrink-0" />
              <span>Tariff Intelligence</span>
            </NavLink>
          )}
        </div>

        {/* AI Agents */}
        <div className="border-t border-teal-700 pt-2 mt-1">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink to="/agents" className={iconLinkClass}>
                  <Bot className="h-4 w-4" />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">AI Agents</TooltipContent>
            </Tooltip>
          ) : (
            <NavLink to="/agents" className={linkClass}>
              <Bot className="h-4 w-4 shrink-0" />
              <span>AI Agents</span>
            </NavLink>
          )}
        </div>

      </nav>

      {!collapsed && (
        <div className="px-3 py-2 border-t border-teal-700">
          <p className="text-[10px] text-teal-400">v0.1.0 · Trade Compliance</p>
        </div>
      )}
    </aside>
  )
}
