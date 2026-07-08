import { useEffect } from 'react'
import { useClientStore } from '@/store/clientStore'
import { fetchEntryClients } from '@/api/entriesApi'

export function useClients() {
  const { clients, isLoading, setClients, setLoading } = useClientStore()

  useEffect(() => {
    if (clients.length > 0) return
    setLoading(true)
    fetchEntryClients()
      .then(setClients)
      .catch(() => { /* silently ignore — no clients loaded */ })
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { clients, isLoading }
}
