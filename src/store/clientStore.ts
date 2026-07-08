import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface MssqlClient {
  coKey:      string
  name:       string
  irsNo:      string | null
  entryCount: number
}

interface ClientState {
  clients:        MssqlClient[]
  selectedClient: MssqlClient | null
  isLoading:      boolean
  setClients:     (clients: MssqlClient[]) => void
  setSelected:    (client: MssqlClient | null) => void
  setLoading:     (v: boolean) => void
  reset:          () => void
}

export const useClientStore = create<ClientState>()(
  persist(
    (set) => ({
      clients:        [],
      selectedClient: null,
      isLoading:      false,

      setClients:  (clients) => set({ clients }),
      setSelected: (selectedClient) => set({ selectedClient }),
      setLoading:  (isLoading) => set({ isLoading }),
      reset:       () => set({ clients: [], selectedClient: null, isLoading: false }),
    }),
    {
      name: 'trade-portal-client',
      // Only persist the selected client key — re-fetch the full list on mount
      partialize: (state) => ({ selectedClient: state.selectedClient }),
    },
  ),
)
