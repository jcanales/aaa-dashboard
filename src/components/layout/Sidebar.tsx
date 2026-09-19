import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, ArrowLeftRight,
  Receipt, Globe, PanelLeftClose, PanelLeft, X,
  Package, PieChart, Repeat, Upload, History, Settings,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthStore } from '@/store/authStore'
import { isFtzOnlyRole } from '@/lib/permissions'

// ── Sidebar design tokens ────────────────────────────────────────────────
// Defined once here so every nav row (Dashboard, group items) shares the
// same active/idle/hover treatment and focus ring instead of repeating the
// same magic values at each call site.
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7490] focus-visible:ring-offset-2'
const ICON_SIZE = 'h-[18px] w-[18px]'
const ICON_STROKE = 1.75

// Expanded rows use a quiet active treatment (tinted background) so there's
// one clear focal point rather than a saturated block. The collapsed icon
// rail keeps the solid-fill treatment since there's no label to carry the
// active state there.
function expandedRowClasses(active: boolean) {
  return cn(
    'group flex items-center gap-3 min-h-[38px] px-2.5 py-[9px] rounded-lg transition-colors',
    FOCUS_RING,
    active ? 'bg-[#E8F1F4]' : 'hover:bg-slate-100'
  )
}
function expandedIconClasses(active: boolean) {
  return cn('shrink-0', active ? 'text-[#093B49]' : 'text-[#64748B]')
}
function expandedLabelClasses(active: boolean) {
  return cn(
    'truncate text-sm',
    active ? 'text-[#093B49] font-semibold' : 'text-[#334155] font-medium group-hover:text-[#0F172A]'
  )
}
// The only spacing source for a collapsed icon — grouped items (in a
// space-y-less <ul>) and standalone items (Dashboard, Tariff, Configuration)
// both rely solely on this margin, so every icon in the rail sits at the
// same rhythm regardless of which wrapper it's in.
function collapsedItemClasses(active: boolean) {
  return cn(
    'flex items-center justify-center h-10 w-10 mx-auto my-1 rounded-md transition-colors',
    FOCUS_RING,
    active ? 'bg-[#093B49] text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
  )
}
const GROUP_HEADER_CLASSES = cn(
  'w-full flex items-center justify-between px-2.5 min-h-[32px] rounded-md',
  'text-[11px] font-bold uppercase tracking-[0.09em] text-slate-600',
  'hover:bg-slate-100 hover:text-slate-900 transition-colors',
  FOCUS_RING
)

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
  const { user } = useAuthStore()
  const restrictedToFtz = isFtzOnlyRole(user?.role)
  // Radix's TooltipTrigger asChild clones its child (the NavLink) and reads
  // its className prop BEFORE NavLink gets a chance to resolve it — a
  // function passed there ends up stringified as the literal class attribute
  // instead of being called. Every collapsed (Tooltip-wrapped) NavLink below
  // must get a plain string className, computed from this instead of
  // NavLink's own isActive render-prop (which only works when unwrapped, as
  // in the expanded rows).
  const location = useLocation()
  const isPathActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    operations: true,
    abi: true,
    converter: true,
  })

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))

  const operationsItems = [
    { path: '/duties/hts', icon: <PieChart className={ICON_SIZE} strokeWidth={ICON_STROKE} />,   label: 'Duties Breakdown' },
    { path: '/aes',        icon: <FileText className={ICON_SIZE} strokeWidth={ICON_STROKE} />,   label: 'AES Filings' },
  ]

  const abiItems = [
    { path: '/abi/crossings',  icon: <ArrowLeftRight className={ICON_SIZE} strokeWidth={ICON_STROKE} />, label: 'Crossings' },
    { path: '/abi/statements', icon: <Receipt className={ICON_SIZE} strokeWidth={ICON_STROKE} />,        label: 'Statements' },
  ]

  const converterItems = [
    { path: '/converter/upload',  icon: <Upload className={ICON_SIZE} strokeWidth={ICON_STROKE} />,  label: 'Upload' },
    { path: '/converter/history', icon: <History className={ICON_SIZE} strokeWidth={ICON_STROKE} />, label: 'History' },
  ]

  return (
    <aside
      className={cn(
        'flex flex-col bg-[#FFFFFF] text-slate-700 flex-shrink-0 border-r border-slate-200',
        'fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-all md:duration-300',
        collapsed ? 'md:w-14' : 'md:w-64'
      )}
    >
      {/* Logo / Brand */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-slate-200">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <img
              src="/logo-jd-group.svg"
              alt="JD Group"
              className="h-[34px] w-auto object-contain"
            />
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn('hidden md:flex items-center justify-center h-9 w-9 rounded hover:bg-slate-100 transition-colors ml-auto text-slate-500', FOCUS_RING)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <button
          onClick={onMobileClose}
          className={cn('md:hidden p-1.5 rounded hover:bg-slate-100 transition-colors ml-auto text-slate-500', FOCUS_RING)}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Dashboard */}
      {!restrictedToFtz && (
        <div className="px-2 pt-3 pb-1">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink to="/dashboard" className={collapsedItemClasses(isPathActive('/dashboard'))} aria-label="Dashboard">
                  <LayoutDashboard className={ICON_SIZE} strokeWidth={ICON_STROKE} />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">Dashboard</TooltipContent>
            </Tooltip>
          ) : (
            <NavLink to="/dashboard" className={({ isActive }) => expandedRowClasses(isActive)}>
              {({ isActive }) => (
                <>
                  <LayoutDashboard className={cn(ICON_SIZE, expandedIconClasses(isActive))} strokeWidth={ICON_STROKE} />
                  <span className={expandedLabelClasses(isActive)}>Dashboard</span>
                </>
              )}
            </NavLink>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-1" aria-label="Sidebar navigation">

        {/* Operations group */}
        {!restrictedToFtz && (collapsed ? (
          <div className="py-1 border-t border-slate-200 mt-1">
            <ul>
              {operationsItems.map((item) => (
                <li key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <NavLink to={item.path} className={collapsedItemClasses(isPathActive(item.path))} aria-label={item.label}>
                        {item.icon}
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <button onClick={() => toggleGroup('operations')} className={GROUP_HEADER_CLASSES} aria-expanded={openGroups.operations}>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span>Operations</span>
              </div>
              {openGroups.operations
                ? <ChevronDown className="h-[15px] w-[15px] text-slate-600" />
                : <ChevronRight className="h-[15px] w-[15px] text-slate-600" />}
            </button>
            {openGroups.operations && (
              <ul className="ml-2 space-y-0.5 mt-0.5">
                {operationsItems.map((item) => (
                  <li key={item.path}>
                    <NavLink to={item.path} className={({ isActive }) => expandedRowClasses(isActive)}>
                      {({ isActive }) => (
                        <>
                          <span className={expandedIconClasses(isActive)}>{item.icon}</span>
                          <span className={expandedLabelClasses(isActive)}>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* ABI group */}
        {!restrictedToFtz && (collapsed ? (
          <div className="py-1 border-t border-slate-200 mt-1">
            <ul>
              {abiItems.map((item) => (
                <li key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <NavLink to={item.path} className={collapsedItemClasses(isPathActive(item.path))} aria-label={item.label}>
                        {item.icon}
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-1 border-t border-slate-200 pt-2">
            <button onClick={() => toggleGroup('abi')} className={GROUP_HEADER_CLASSES} aria-expanded={openGroups.abi}>
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                <span>ABI</span>
              </div>
              {openGroups.abi
                ? <ChevronDown className="h-[15px] w-[15px] text-slate-600" />
                : <ChevronRight className="h-[15px] w-[15px] text-slate-600" />}
            </button>
            {openGroups.abi && (
              <ul className="ml-2 space-y-0.5 mt-0.5">
                {abiItems.map((item) => (
                  <li key={item.path}>
                    <NavLink to={item.path} className={({ isActive }) => expandedRowClasses(isActive)}>
                      {({ isActive }) => (
                        <>
                          <span className={expandedIconClasses(isActive)}>{item.icon}</span>
                          <span className={expandedLabelClasses(isActive)}>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* File Converter group */}
        {collapsed ? (
          <div className="py-1 border-t border-slate-200 mt-1">
            <ul>
              {converterItems.map((item) => (
                <li key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <NavLink to={item.path} className={collapsedItemClasses(isPathActive(item.path))} aria-label={item.label}>
                        {item.icon}
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-1 border-t border-slate-200 pt-2">
            <button onClick={() => toggleGroup('converter')} className={GROUP_HEADER_CLASSES} aria-expanded={openGroups.converter}>
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                <span>File Converter</span>
              </div>
              {openGroups.converter
                ? <ChevronDown className="h-[15px] w-[15px] text-slate-600" />
                : <ChevronRight className="h-[15px] w-[15px] text-slate-600" />}
            </button>
            {openGroups.converter && (
              <ul className="ml-2 space-y-0.5 mt-0.5">
                {converterItems.map((item) => (
                  <li key={item.path}>
                    <NavLink to={item.path} className={({ isActive }) => expandedRowClasses(isActive)}>
                      {({ isActive }) => (
                        <>
                          <span className={expandedIconClasses(isActive)}>{item.icon}</span>
                          <span className={expandedLabelClasses(isActive)}>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tariff Intelligence — admin only, per explicit request */}
        {user?.role === 'admin' && (
          <div className="border-t border-slate-200 pt-2 mt-1">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink to="/tariff" className={collapsedItemClasses(isPathActive('/tariff'))} aria-label="Tariff Intelligence">
                    <Globe className={ICON_SIZE} strokeWidth={ICON_STROKE} />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">Tariff Intelligence</TooltipContent>
              </Tooltip>
            ) : (
              <NavLink to="/tariff" className={({ isActive }) => expandedRowClasses(isActive)}>
                {({ isActive }) => (
                  <>
                    <Globe className={cn(ICON_SIZE, expandedIconClasses(isActive))} strokeWidth={ICON_STROKE} />
                    <span className={expandedLabelClasses(isActive)}>Tariff Intelligence</span>
                  </>
                )}
              </NavLink>
            )}
          </div>
        )}

      </nav>

      {/* Configuration — standalone, portal-wide (not FTZ-specific). Pinned
          below the scrollable nav (not inside it) so it stays at the bottom
          of the sidebar regardless of how long the nav list gets. */}
      {!restrictedToFtz && (
        <div className="px-2 pb-1 border-t border-slate-200 pt-2 flex-shrink-0">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink to="/converter/configuracion" className={collapsedItemClasses(isPathActive('/converter/configuracion'))} aria-label="Configuration">
                  <Settings className={ICON_SIZE} strokeWidth={ICON_STROKE} />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">Configuration</TooltipContent>
            </Tooltip>
          ) : (
            <NavLink to="/converter/configuracion" className={({ isActive }) => expandedRowClasses(isActive)}>
              {({ isActive }) => (
                <>
                  <Settings className={cn(ICON_SIZE, expandedIconClasses(isActive))} strokeWidth={ICON_STROKE} />
                  <span className={expandedLabelClasses(isActive)}>Configuration</span>
                </>
              )}
            </NavLink>
          )}
        </div>
      )}

      {!collapsed && (
        <div className="px-3 py-2 border-t border-slate-200">
          <p className="text-[10px] text-slate-400">v0.2.0 · Trade Compliance</p>
        </div>
      )}
    </aside>
  )
}
