import { useState } from 'react'
import { Users, Plus, Trash2, Check, X } from 'lucide-react'
import { useConverterClients } from '@/hooks/converter/useConverterClients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FtzClient } from '@/types/converter/config.types'

type Draft = { name: string; irsNumber: string; companyKey: string }
const EMPTY_DRAFT: Draft = { name: '', irsNumber: '', companyKey: '' }

export function ClientsTab() {
  const { clients, isLoading, error, createClient, updateClient, deleteClient } = useConverterClients()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT)
  const [rowError, setRowError] = useState<string | null>(null)

  async function submitNew() {
    setRowError(null)
    try {
      await createClient({ name: draft.name, irsNumber: draft.irsNumber || null, companyKey: draft.companyKey })
      setDraft(EMPTY_DRAFT)
      setAdding(false)
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to add client')
    }
  }

  function startEdit(c: FtzClient) {
    setEditId(c.id)
    setEditDraft({ name: c.name, irsNumber: c.irsNumber ?? '', companyKey: c.companyKey })
  }

  async function submitEdit() {
    if (!editId) return
    setRowError(null)
    try {
      await updateClient(editId, {
        name: editDraft.name,
        irsNumber: editDraft.irsNumber || null,
        companyKey: editDraft.companyKey,
      })
      setEditId(null)
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to save client')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <p className="text-sm font-semibold text-slate-700">Clients</p>
          <p className="text-xs text-slate-400">
            The EDI Company Key RBSystems/Broker assigns per importer. The IRS number is the value printed in the
            invoice&apos;s &ldquo;Imported by&rdquo; block.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> Add client
        </Button>
      </div>

      {(error || rowError) && (
        <div className="mx-4 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error ?? rowError}
        </div>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
            <th className="px-4 py-2">Name</th>
            <th className="px-3 py-2">IRS number</th>
            <th className="px-3 py-2">EDI Company Key</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {adding && (
            <tr className="bg-slate-50">
              <td className="px-4 py-2">
                <Input
                  aria-label="New client name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="WHOOP INC."
                />
              </td>
              <td className="px-3 py-2">
                <Input
                  aria-label="New client IRS number"
                  value={draft.irsNumber}
                  onChange={(e) => setDraft({ ...draft, irsNumber: e.target.value })}
                  placeholder="45-4312359"
                />
              </td>
              <td className="px-3 py-2">
                <Input
                  aria-label="New client company key"
                  value={draft.companyKey}
                  maxLength={6}
                  onChange={(e) => setDraft({ ...draft, companyKey: e.target.value })}
                  placeholder="WHP01"
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={submitNew} aria-label="Save new client" className="p-1.5 text-green-600 hover:bg-green-50 rounded-md">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT) }} aria-label="Cancel" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          )}

          {isLoading ? (
            <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>
          ) : clients.length === 0 && !adding ? (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center">
                <Users className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400">No clients yet.</p>
              </td>
            </tr>
          ) : (
            clients.map((c) =>
              editId === c.id ? (
                <tr key={c.id} className="bg-slate-50">
                  <td className="px-4 py-2">
                    <Input aria-label="Client name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <Input aria-label="Client IRS number" value={editDraft.irsNumber} onChange={(e) => setEditDraft({ ...editDraft, irsNumber: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <Input aria-label="Client company key" value={editDraft.companyKey} maxLength={6} onChange={(e) => setEditDraft({ ...editDraft, companyKey: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={submitEdit} aria-label="Save client" className="p-1.5 text-green-600 hover:bg-green-50 rounded-md">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditId(null)} aria-label="Cancel edit" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td className="px-4 py-2.5">
                    <button className="font-medium text-slate-800 hover:text-brand-600" onClick={() => startEdit(c)}>
                      {c.name}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{c.irsNumber ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-700">{c.companyKey}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete client "${c.name}"?`)) deleteClient(c.id)
                        }}
                        aria-label={`Delete ${c.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )
          )}
        </tbody>
      </table>
    </div>
  )
}
