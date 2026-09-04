import { useState } from 'react'
import { Layers, Check, Ban, Trash2, Pencil, ChevronDown, ChevronRight } from 'lucide-react'
import { useDetectedLayouts } from '@/hooks/converter/useDetectedLayouts'
import type { DetectedLayout, LayoutStatus } from '@/types/converter/config.types'

const STATUS_PILL: Record<LayoutStatus, string> = {
  detected: 'bg-amber-100 text-amber-700',
  validated: 'bg-green-100 text-green-700',
  rejected: 'bg-slate-100 text-slate-500',
}

function LayoutRow({
  layout,
  onUpdate,
  onDelete,
}: {
  layout: DetectedLayout
  onUpdate: (patch: { label?: string | null; status?: LayoutStatus }) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const fieldMapEntries = Object.entries(layout.fieldMap ?? {})

  return (
    <>
      <tr className={layout.status === 'rejected' ? 'opacity-60' : ''}>
        <td className="px-4 py-2.5">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 font-medium text-slate-800 hover:text-brand-600"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {layout.label ?? <span className="font-mono text-slate-400">{layout.id.slice(0, 10)}…</span>}
          </button>
        </td>
        <td className="px-3 py-2.5 text-center">
          <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_PILL[layout.status]}`}>
            {layout.status}
          </span>
        </td>
        <td className="px-3 py-2.5 text-slate-400">{new Date(layout.createdAt).toLocaleDateString()}</td>
        <td className="px-3 py-2.5 text-slate-400">
          {layout.validatedAt ? new Date(layout.validatedAt).toLocaleDateString() : '—'}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{layout.conversionCount}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => {
                const next = window.prompt('Rename layout', layout.label ?? '')
                if (next !== null) onUpdate({ label: next.trim() || null })
              }}
              title="Rename"
              aria-label={`Rename layout ${layout.label ?? layout.id}`}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {layout.status !== 'validated' && (
              <button
                onClick={() => onUpdate({ status: 'validated' })}
                title="Validate"
                aria-label={`Validate layout ${layout.label ?? layout.id}`}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            {layout.status !== 'rejected' && (
              <button
                onClick={() => onUpdate({ status: 'rejected' })}
                title="Reject"
                aria-label={`Reject layout ${layout.label ?? layout.id}`}
                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => {
                if (window.confirm('Delete this layout? Conversions that used it keep their data.')) onDelete()
              }}
              title="Delete"
              aria-label={`Delete layout ${layout.label ?? layout.id}`}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="px-6 pb-3 pt-1 bg-slate-50">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Field map</p>
            {fieldMapEntries.length === 0 ? (
              <p className="text-xs text-slate-400">No field hints.</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
                {fieldMapEntries.map(([field, hint]) => (
                  <div key={field} className="text-xs">
                    <span className="font-mono text-slate-600">{field}</span>
                    <span className="text-slate-400"> → {hint ?? '∅'}</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function LayoutsTab() {
  const { layouts, isLoading, error, updateLayout, deleteLayout } = useDetectedLayouts()

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-700">Detected invoice layouts</p>
        <p className="text-xs text-slate-400">
          Auto-registered when a new invoice format reaches the AI extractor. Only <strong>validated</strong> layouts are
          matched against future invoices.
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {isLoading ? (
        <div className="px-5 py-10 text-center text-xs text-slate-400">Loading…</div>
      ) : layouts.length === 0 ? (
        <div className="text-center py-12">
          <Layers className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No layouts detected yet.</p>
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="px-4 py-2">Layout</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2">Detected</th>
              <th className="px-3 py-2">Validated</th>
              <th className="px-3 py-2 text-right">Invoices</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {layouts.map((l) => (
              <LayoutRow
                key={l.id}
                layout={l}
                onUpdate={(patch) => updateLayout(l.id, patch)}
                onDelete={() => deleteLayout(l.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
