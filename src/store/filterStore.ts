import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FilterConfig {
  datesBasedOn: string
  dateFrom: string
  dateTo: string
  port: string
  otherFilter: string
}

const defaultFilter: FilterConfig = {
  datesBasedOn: 'Created Date',
  dateFrom: '',
  dateTo: '',
  port: 'ALL',
  otherFilter: 'ALL',
}

interface FilterStore {
  filters: Record<string, FilterConfig>
  setFilter: (reportKey: string, filter: Partial<FilterConfig>) => void
  resetFilter: (reportKey: string) => void
  getFilter: (reportKey: string) => FilterConfig
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      filters: {},
      setFilter: (reportKey, filter) =>
        set((state) => ({
          filters: {
            ...state.filters,
            [reportKey]: { ...(state.filters[reportKey] ?? defaultFilter), ...filter },
          },
        })),
      resetFilter: (reportKey) =>
        set((state) => ({
          filters: { ...state.filters, [reportKey]: defaultFilter },
        })),
      getFilter: (reportKey) => get().filters[reportKey] ?? defaultFilter,
    }),
    { name: 'trade-portal-filters' }
  )
)
