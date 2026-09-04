import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/api/converterApi'
import type { FtzClient } from '@/types/converter/config.types'

type ClientInput = { name: string; irsNumber: string | null; companyKey: string }

export function useConverterClients() {
  const [clients, setClients] = useState<FtzClient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      setClients(await apiGet<FtzClient[]>('/ftz-clients'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clients')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createClient = useCallback(async (input: ClientInput) => {
    const created = await apiPost<FtzClient>('/ftz-clients', input)
    setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  const updateClient = useCallback(async (id: string, input: Partial<ClientInput>) => {
    const updated = await apiPatch<FtzClient>(`/ftz-clients/${id}`, input)
    setClients((prev) => prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  const deleteClient = useCallback(async (id: string) => {
    await apiDelete(`/ftz-clients/${id}`)
    setClients((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return { clients, isLoading, error, createClient, updateClient, deleteClient }
}
