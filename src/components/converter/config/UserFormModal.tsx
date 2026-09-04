import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AppUser } from '@/types/converter/user.types'

// staff: FTZ Converter only. coordinator / manager: full portal access.
// admin: full portal access, reserved for future admin-only functionality.
const ROLES: { value: string; label: string }[] = [
  { value: 'staff', label: 'Staff — FTZ Converter only' },
  { value: 'coordinator', label: 'Coordinator — full access' },
  { value: 'manager', label: 'Manager — full access' },
  { value: 'admin', label: 'Admin — full access' },
]

export interface UserFormValues {
  username: string
  email: string
  name: string
  role: string
  /** Present only when creating. */
  password?: string
}

interface UserFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  user?: AppUser
  onClose: () => void
  onSubmit: (values: UserFormValues) => Promise<void>
}

export function UserFormModal({ open, mode, user, onClose, onSubmit }: UserFormModalProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('staff')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Re-seed whenever the dialog opens — the target (or create-vs-edit) may differ
  // from last time it was shown.
  useEffect(() => {
    if (!open) return
    setUsername(user?.username ?? '')
    setEmail(user?.email ?? '')
    setName(user?.name ?? '')
    setRole(user?.role && ROLES.some((r) => r.value === user.role) ? user.role : 'staff')
    setPassword('')
    setConfirm('')
    setError(null)
    setSaving(false)
  }, [open, user])

  async function submit() {
    setError(null)
    if (!username.trim() || !email.trim() || !name.trim()) {
      setError('Username, email and name are required.')
      return
    }
    if (mode === 'create') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirm) {
        setError('The passwords do not match.')
        return
      }
    }

    setSaving(true)
    try {
      await onSubmit({
        username: username.trim(),
        email: email.trim(),
        name: name.trim(),
        role,
        ...(mode === 'create' ? { password } : {}),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the user.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Add user' : `Edit ${user?.username ?? 'user'}`}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={saving}>
            {mode === 'create' ? 'Create user' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="user-username">Username</Label>
          <Input
            id="user-username"
            value={username}
            autoComplete="off"
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="user-name">Name</Label>
          <Input
            id="user-name"
            value={name}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="user-email">Email</Label>
          <Input
            id="user-email"
            type="email"
            value={email}
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode === 'create' && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="user-password">Password</Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="user-confirm">Confirm password</Label>
              <Input
                id="user-confirm"
                type="password"
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="user-role">Role</Label>
          <select
            id="user-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}
      </div>
    </Dialog>
  )
}
