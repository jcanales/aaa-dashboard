import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/api/converterApi'
import type { ConversionLog, ConversionLogStats, ConversionLogsResult } from '@/types/converter/config.types'

export interface LogFilters {
  page: number
  pageSize: number
  from?: string
  to?: string
}

export function useConversionLogs(filters: LogFilters) {
  const [rows, setRows] = useState<ConversionLog[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<ConversionLogStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Filter/page changes can fire requests faster than they resolve (fast typing
  // in the date inputs, React StrictMode's double-invoke) — the fetch that
  // *finishes* last isn't always the one that was *sent* last, so a plain
  // setState-on-resolve would let a stale response clobber a newer one.
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) })
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      const result = await apiGet<ConversionLogsResult>(`/logs?${params.toString()}`)
      if (requestId !== requestIdRef.current) return
      setRows(result.rows)
      setTotal(result.total)
      setStats(result.stats)
      setError(null)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load logs')
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [filters.page, filters.pageSize, filters.from, filters.to]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh()
  }, [refresh])

  return { rows, total, stats, isLoading, error, refresh }
}
