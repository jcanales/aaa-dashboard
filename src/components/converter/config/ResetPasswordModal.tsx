import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AppUser } from '@/types/converter/user.types'

interface ResetPasswordModalProps {
  open: boolean
  user: AppUser | null
  onClose: () => void
  onSubmit: (password: string) => Promise<void>
}

export function ResetPasswordModal({ open, user, onClose, onSubmit }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setError(null)
    setSaving(false)
  }, [open])

  async function submit() {
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSaving(true)
    try {
      await onSubmit(password)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset the password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Reset password for ${user?.username ?? 'user'}`}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={saving}>
            Set password
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <p className="text-xs text-muted-foreground">
          The user keeps their current session until it expires; the new password applies at their next login.
        </p>
        {error && (
          <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}
      </div>
    </Dialog>
  )
}
