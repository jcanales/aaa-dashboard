import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/api/converterApi'
import type { ConversionSummary, ConversionPage } from '@/types/converter/ftz214.types'

const POLL_INTERVAL_MS = 2500
const PAGE = 200

function query(file: string | undefined, before?: string): string {
  const qs = new URLSearchParams({ limit: String(PAGE) })
  if (file) qs.set('file', file)
  if (before) qs.set('before', before)
  return `/conversions?${qs.toString()}`
}

export function useConversions(file?: string) {
  const [conversions, setConversions] = useState<ConversionSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const page = await apiGet<ConversionPage>(query(file))
      setConversions(page.items)
      setCursor(page.nextCursor)
    } finally {
      setIsLoading(false)
    }
  }, [file])

  const loadOlder = useCallback(async () => {
    if (!cursor) return
    const page = await apiGet<ConversionPage>(query(file, cursor))
    setConversions((prev) => {
      const seen = new Set(prev.map((c) => c.id))
      return [...prev, ...page.items.filter((c) => !seen.has(c.id))]
    })
    setCursor(page.nextCursor)
  }, [cursor, file])

  useEffect(() => {
    refresh()
  }, [refresh])

  // While any conversion is still extracting, poll so the row flips to draft /
  // failed on its own — the backend owns the lifecycle, the client just watches.
  // Polling only ever re-fetches page 1: loadOlder's pages are a manually
  // requested, one-shot view further back in history.
  const anyProcessing = conversions.some((c) => c.status === 'processing')
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (!anyProcessing) return
    const timer = setInterval(() => void refreshRef.current(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [anyProcessing])

  return { conversions, isLoading, refresh, loadOlder, hasMore: cursor !== null }
}
