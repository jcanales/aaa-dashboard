import { useEffect, useState } from 'react'
import { apiGet } from '@/api/converterApi'
import type { FieldSchemaResponse } from '@/types/converter/ftz214.types'

export function useFtz214Fields() {
  const [fields, setFields] = useState<FieldSchemaResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<FieldSchemaResponse>('/ftz214/fields')
      .then(setFields)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load field schema'))
  }, [])

  return { fields, error, isLoading: !fields && !error }
}
