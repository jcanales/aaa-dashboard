import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch } from '@/api/converterApi'
import type { ParserTemplate } from '@/types/converter/config.types'

export function useParserTemplates() {
  const [templates, setTemplates] = useState<ParserTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      setTemplates(await apiGet<ParserTemplate[]>('/templates'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setEnabled = useCallback(async (id: string, enabled: boolean) => {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)))
    try {
      await apiPatch(`/templates/${id}`, { enabled })
    } catch (err) {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !enabled } : t)))
      setError(err instanceof Error ? err.message : 'Failed to update template')
    }
  }, [])

  return { templates, isLoading, error, setEnabled }
}
