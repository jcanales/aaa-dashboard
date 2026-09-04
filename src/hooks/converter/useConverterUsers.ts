import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch } from '@/api/converterApi'
import type { AppUser, CreateUserInput, UpdateUserInput } from '@/types/converter/user.types'

export function useConverterUsers() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      setUsers(await apiGet<AppUser[]>('/users'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createUser = useCallback(async (input: CreateUserInput) => {
    const created = await apiPost<AppUser>('/users', input)
    setUsers((prev) => [...prev, created])
  }, [])

  const updateUser = useCallback(async (id: string, input: UpdateUserInput) => {
    const updated = await apiPatch<AppUser>(`/users/${id}`, input)
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)))
  }, [])

  const resetPassword = useCallback(async (id: string, password: string) => {
    await apiPost<{ success: boolean }>(`/users/${id}/reset-password`, { password })
  }, [])

  return { users, isLoading, error, createUser, updateUser, resetPassword, refresh }
}
