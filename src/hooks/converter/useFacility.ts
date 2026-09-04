import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPut } from '@/api/converterApi'
import type { FacilityDefaults } from '@/types/converter/config.types'

const EMPTY: FacilityDefaults = { applicationInfo: {}, header: {} }

export function useFacility() {
  const [facility, setFacility] = useState<FacilityDefaults>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<FacilityDefaults>('/facility')
      .then((f) => setFacility({ applicationInfo: f.applicationInfo ?? {}, header: f.header ?? {} }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load facility'))
      .finally(() => setIsLoading(false))
  }, [])

  const save = useCallback(async (next: FacilityDefaults) => {
    const saved = await apiPut<FacilityDefaults>('/facility', next)
    setFacility({ applicationInfo: saved.applicationInfo ?? {}, header: saved.header ?? {} })
  }, [])

  return { facility, isLoading, error, save }
}
