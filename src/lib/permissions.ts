import type { UserRole } from '@/types/common.types'

// The only role restricted to the FTZ Converter module — everyone else
// (coordinator, manager, admin, or any legacy/unrecognized role) gets full
// portal access. Keep this as the single source of truth so the sidebar and
// route guards can never drift apart.
export function isFtzOnlyRole(role: UserRole | string | undefined): boolean {
  return role === 'staff'
}
