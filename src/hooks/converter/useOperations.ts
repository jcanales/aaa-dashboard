import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/api/converterApi'
import type { OperationSummary } from '@/types/converter/operation.types'

const POLL_INTERVAL_MS = 2500

export function useOperations() {
  const [operations, setOperations] = useState<OperationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      setOperations(await apiGet<OperationSummary[]>('/operations'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // While any operation is still a draft, poll so the row flips to generated on
  // its own — a concurrently-generated operation's row updates without a manual
  // refresh.
  const anyDraft = operations.some((o) => o.status === 'draft')
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (!anyDraft) return
    const timer = setInterval(() => void refreshRef.current(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [anyDraft])

  return { operations, isLoading, refresh }
}
