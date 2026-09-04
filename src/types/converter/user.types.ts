// Shaped after the ported /api/converter/users contract (backend/src/converter/services/converterUsersService.ts),
// which operates on duties-dashboard's shared User table — role is a plain string
// ('admin' | 'user'), not AAA-Converter's original isAdmin boolean.
export interface AppUser {
  id: string
  username: string
  email: string
  name: string
  role: string
  active: boolean
  createdAt: string
}

export interface CreateUserInput {
  username: string
  email: string
  name: string
  password: string
  role?: string
  active?: boolean
}

export interface UpdateUserInput {
  username?: string
  email?: string
  name?: string
  role?: string
  active?: boolean
}
