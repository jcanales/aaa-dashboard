import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { apiGet, apiPost } from '@/api/converterApi'
import { Button } from '@/components/ui/button'
import type { ConversionSummary } from '@/types/converter/ftz214.types'
import type { OperationDetail } from '@/types/converter/operation.types'

interface Props {
  operationId: string
  /** conversionIds already in this operation — hidden from the list. */
  excludeIds: Set<string>
  onAdded: (updated: OperationDetail) => void
  onClose: () => void
}

// Search + multi-select list of invoices that are available to add to an
// operation (status 'draft', not already in any group). Used on the operation
// review page and inside the Upload page's expanded operation row.
export function AddInvoicesPicker({ operationId, excludeIds, onAdded, onClose }: Props) {
  const [all, setAll] = useState<ConversionSummary[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiGet<ConversionSummary[]>('/conversions')
      .then((rows) => {
        if (!cancelled) setAll(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load invoices')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((c) => c.status === 'draft' && !c.operationId && !excludeIds.has(c.id))
      .filter(
        (c) =>
          q === '' ||
          c.pdfFilename.toLowerCase().includes(q) ||
          (c.customerName ?? '').toLowerCase().includes(q)
      )
  }, [all, query, excludeIds])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function add() {
    if (selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const updated = await apiPost<OperationDetail>(`/operations/${operationId}/members/add`, {
        conversionIds: [...selected],
      })
      onAdded(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the selected invoices')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoices by file or client…"
          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
          aria-label="Search available invoices"
        />
      </div>
      {error && <p className="mb-2 text-destructive">{error}</p>}
      {available.length === 0 ? (
        <p className="text-muted-foreground">No available invoices{query ? ' match your search' : ''}.</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto">
          {available.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                aria-label={`Add ${c.pdfFilename}`}
              />
              <span className="text-slate-700">
                {c.pdfFilename}{' '}
                <span className="text-muted-foreground">· {c.customerName ?? '—'}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" size="sm" onClick={add} disabled={selected.size === 0 || busy}>
          Add selected ({selected.size})
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
