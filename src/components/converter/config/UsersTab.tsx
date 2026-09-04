import { useState } from 'react'
import { Ban, KeyRound, Pencil, UserCheck, UserPlus, Users } from 'lucide-react'
import { useConverterUsers } from '@/hooks/converter/useConverterUsers'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { UserFormModal, type UserFormValues } from './UserFormModal'
import { ResetPasswordModal } from './ResetPasswordModal'
import type { AppUser } from '@/types/converter/user.types'

export function UsersTab() {
  const { users, isLoading, error, createUser, updateUser, resetPassword } = useConverterUsers()
  const currentUsername = useAuthStore((s) => s.user?.username)

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<AppUser | null>(null)
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<AppUser | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleFormSubmit(values: UserFormValues) {
    if (formMode === 'create') {
      await createUser({ username: values.username, email: values.email, name: values.name, password: values.password!, role: values.role })
    } else if (editTarget) {
      await updateUser(editTarget.id, { username: values.username, email: values.email, name: values.name, role: values.role })
    }
  }

  async function runRowAction(fn: () => Promise<void>) {
    setActionError(null)
    try {
      await fn()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The action failed.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <p className="text-sm font-semibold text-slate-700">Users</p>
          <p className="text-xs text-slate-400">
            Everyone who can sign in. Deactivate a user to revoke access without deleting their history.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null)
            setFormMode('create')
          }}
        >
          <UserPlus className="h-3.5 w-3.5" /> Add user
        </Button>
      </div>

      {(error || actionError) && (
        <div className="mx-4 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error ?? actionError}
        </div>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
            <th className="px-4 py-2">Username</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                Loading…
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-5 py-10 text-center">
                <Users className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400">No users yet.</p>
              </td>
            </tr>
          ) : (
            users.map((u) => {
              const isSelf = u.username === currentUsername
              const roleLabel = u.role.charAt(0).toUpperCase() + u.role.slice(1)
              return (
                <tr key={u.id} className={u.active ? undefined : 'bg-slate-50/60'}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {u.username}
                    {isSelf && <span className="ml-1.5 text-[10px] font-normal text-slate-400">(you)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{u.email}</td>
                  <td className="px-3 py-2.5 text-slate-600">{roleLabel}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        u.active
                          ? 'inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700'
                          : 'inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500'
                      }
                    >
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditTarget(u)
                          setFormMode('edit')
                        }}
                        aria-label={`Edit ${u.username}`}
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-md"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setResetTarget(u)}
                        aria-label={`Reset password for ${u.username}`}
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-md"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      {u.active
                        ? !isSelf && (
                            <button
                              onClick={() => setDeactivateTarget(u)}
                              aria-label={`Deactivate ${u.username}`}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )
                        : (
                            <button
                              onClick={() => runRowAction(() => updateUser(u.id, { active: true }))}
                              aria-label={`Activate ${u.username}`}
                              className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-md"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      <UserFormModal
        open={formMode !== null}
        mode={formMode ?? 'create'}
        user={formMode === 'edit' ? editTarget ?? undefined : undefined}
        onClose={() => setFormMode(null)}
        onSubmit={handleFormSubmit}
      />

      <ResetPasswordModal
        open={resetTarget !== null}
        user={resetTarget}
        onClose={() => setResetTarget(null)}
        onSubmit={(password) => resetPassword(resetTarget!.id, password)}
      />

      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate user"
        message={`${deactivateTarget?.username ?? 'This user'} will no longer be able to sign in. Their conversions and operations stay in the history.`}
        confirmLabel="Deactivate user"
        destructive
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          const target = deactivateTarget!
          setDeactivateTarget(null)
          await runRowAction(() => updateUser(target.id, { active: false }))
        }}
      />
    </div>
  )
}
