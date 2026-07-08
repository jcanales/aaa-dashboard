import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types/common.types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api'

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      // Called by persist on rehydration. If a session is persisted but the
      // JWT is missing (e.g. stale demo-mode session from when the API was
      // down), force a logged-out state so protected API calls don't 401.

      login: async (username: string, password: string): Promise<boolean> => {
        if (!username.trim() || !password.trim()) return false

        const email = username.includes('@') ? username : `${username}@jdgroup.net`

        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })

          if (!res.ok) return false

          const data = (await res.json()) as {
            token: string
            user: { id: string; email: string; name: string; role: string; clientCoKeys: string[] }
          }
          localStorage.setItem('auth-token', data.token)
          set({
            user: {
              username,
              name:         data.user.name,
              companyCode:  'JD1249',
              companyName:  'HARMAN PROFESSIONAL INC D/HARMAN P.TIJ',
              role:         data.user.role as User['role'],
              clientCoKeys: data.user.clientCoKeys ?? [],
            },
            isAuthenticated: true,
          })
          return true
        } catch {
          // Network error reaching backend — treat as login failure rather
          // than silently dropping into an unauthenticated "demo" session.
          return false
        }
      },

      logout: () => {
        localStorage.removeItem('auth-token')
        set({ user: null, isAuthenticated: false })
      },
    }),
    {
      name: 'trade-portal-auth',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const token = localStorage.getItem('auth-token')
        if (state.isAuthenticated && !token) {
          state.user = null
          state.isAuthenticated = false
        }
      },
    }
  )
)
