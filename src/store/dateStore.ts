import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  subMonths, subYears, endOfDay, format,
} from 'date-fns'

export type DatePreset =
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'ytd'
  | 'last-year'
  | 'custom'

export const PRESET_LABELS: Record<DatePreset, string> = {
  'this-month':    'This Month',
  'last-month':    'Last Month',
  'last-3-months': 'Last 3M',
  'last-6-months': 'Last 6M',
  'ytd':           'YTD',
  'last-year':     'Last Year',
  'custom':        'Custom',
}

export function computePresetRange(preset: Exclude<DatePreset, 'custom'>): { from: Date; to: Date } {
  const today = new Date()
  switch (preset) {
    case 'this-month':
      return { from: startOfMonth(today), to: endOfDay(today) }
    case 'last-month': {
      const last = subMonths(today, 1)
      return { from: startOfMonth(last), to: endOfMonth(last) }
    }
    case 'last-3-months':
      return { from: startOfMonth(subMonths(today, 2)), to: endOfDay(today) }
    case 'last-6-months':
      return { from: startOfMonth(subMonths(today, 5)), to: endOfDay(today) }
    case 'ytd':
      return { from: startOfYear(today), to: endOfDay(today) }
    case 'last-year': {
      const lastYear = subYears(today, 1)
      return { from: startOfYear(lastYear), to: endOfYear(lastYear) }
    }
  }
}

function initialRange() {
  return computePresetRange('ytd')
}

interface DateState {
  preset:        DatePreset
  dateFrom:      string   // ISO string — serialisable for localStorage
  dateTo:        string
  searchTrigger: number   // incremented by the lookup button to force a refetch
  setPreset:      (preset: Exclude<DatePreset, 'custom'>) => void
  setCustomRange: (from: Date, to: Date) => void
  triggerSearch:  () => void
  // Helpers
  getRange: () => { from: Date; to: Date }
}

export const useDateStore = create<DateState>()(
  persist(
    (set, get) => ({
      preset:        'ytd',
      dateFrom:      format(initialRange().from, 'yyyy-MM-dd'),
      dateTo:        format(initialRange().to,   'yyyy-MM-dd'),
      searchTrigger: 0,

      setPreset: (preset) => {
        const { from, to } = computePresetRange(preset)
        set({
          preset,
          dateFrom: format(from, 'yyyy-MM-dd'),
          dateTo:   format(to,   'yyyy-MM-dd'),
        })
      },

      setCustomRange: (from, to) => {
        set({
          preset:   'custom',
          dateFrom: format(from, 'yyyy-MM-dd'),
          dateTo:   format(to,   'yyyy-MM-dd'),
        })
      },

      triggerSearch: () => set((s) => ({ searchTrigger: s.searchTrigger + 1 })),

      getRange: () => ({
        from: new Date(get().dateFrom),
        to:   new Date(get().dateTo),
      }),
    }),
    {
      name: 'trade-portal-dates',
      version: 2,
      migrate: (_state, _version) => {
        const { from, to } = computePresetRange('ytd')
        return {
          preset:   'ytd' as DatePreset,
          dateFrom: format(from, 'yyyy-MM-dd'),
          dateTo:   format(to,   'yyyy-MM-dd'),
        }
      },
    },
  ),
)
