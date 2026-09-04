import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch, apiDelete } from '@/api/converterApi'
import type { DetectedLayout, LayoutStatus } from '@/types/converter/config.types'

export function useDetectedLayouts() {
  const [layouts, setLayouts] = useState<DetectedLayout[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      setLayouts(await apiGet<DetectedLayout[]>('/layouts'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load layouts')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const updateLayout = useCallback(
    async (id: string, patch: { label?: string | null; status?: LayoutStatus }) => {
      try {
        const updated = await apiPatch<DetectedLayout>(`/layouts/${id}`, patch)
        setLayouts((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)))
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update layout')
      }
    },
    []
  )

  const deleteLayout = useCallback(async (id: string) => {
    try {
      await apiDelete(`/layouts/${id}`)
      setLayouts((prev) => prev.filter((l) => l.id !== id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete layout')
    }
  }, [])

  return { layouts, isLoading, error, updateLayout, deleteLayout }
}
