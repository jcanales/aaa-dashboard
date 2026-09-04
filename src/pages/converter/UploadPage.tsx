import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  History,
  ChevronRight,
  ChevronDown,
  Layers,
  Search,
  MoreVertical,
} from 'lucide-react'
import { apiUploadPdf, apiPost, apiGet, apiDelete, apiPatch } from '@/api/converterApi'
import { formatExtractionDuration } from '@/lib/converter/formatDuration'
import { useConversions } from '@/hooks/converter/useConversions'
import { useOperations } from '@/hooks/converter/useOperations'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AlertDialog } from '@/components/ui/AlertDialog'
import { PromptDialog } from '@/components/ui/PromptDialog'
import { AddInvoicesPicker } from '@/components/converter/operations/AddInvoicesPicker'
import { ExtractionProgress } from '@/components/converter/upload/ExtractionProgress'
import { getEstimateMs, recordDurationMs } from '@/lib/converter/extractionEstimate'
import type { Conversion, ConversionSummary } from '@/types/converter/ftz214.types'
import type { OperationSummary, OperationDetail } from '@/types/converter/operation.types'

// Tracks only the in-flight POST — once it resolves the row is persisted as
// 'processing' and everything else is driven off the polled conversions list.
interface PendingUpload {
  key: string
  filename: string
  status: 'uploading' | 'error'
  error?: string
}

// Conversion rows and operation rows share one table; each is tagged so the
// merged list can be sorted by recency and rendered by kind.
type GridRow =
  | { kind: 'operation'; key: string; sort: number; op: OperationSummary }
  | { kind: 'conversion'; key: string; sort: number; conversion: ConversionSummary }

const rowTimestamp = (x: { updatedAt?: string | null; createdAt: string }): number =>
  Date.parse(x.updatedAt ?? x.createdAt)

export function UploadPage() {
  const { conversions, refresh } = useConversions()
  const { operations, refresh: refreshOps } = useOperations()
  const [uploads, setUploads] = useState<PendingUpload[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupError, setGroupError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{ opId: string; x: number; y: number } | null>(null)
  const [renameTarget, setRenameTarget] = useState<OperationSummary | null>(null)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLElement | null>(null)
  const navigate = useNavigate()

  // Closes the operation context menu on an outside click/right-click,
  // scrolling away, or Escape. One listener set for the whole page rather
  // than one per row — a right-click that opens a NEW row's menu just
  // overwrites contextMenu, which already replaces whichever menu was open.
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  // Keyboard support: move focus into the menu when it opens (so it's
  // operable via Enter/Escape once opened from the keyboard-focusable
  // "Operation actions" button), and back to whatever opened it on close.
  useEffect(() => {
    if (!contextMenu) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      menuTriggerRef.current?.focus()
      menuTriggerRef.current = null
    }
  }, [contextMenu])

  async function submitRename(op: OperationSummary, value: string) {
    setRenameTarget(null)
    const trimmed = value.trim()
    if (trimmed === '' || trimmed === op.name) return
    try {
      await apiPatch(`/operations/${op.id}`, { name: trimmed })
      await Promise.all([refresh(), refreshOps()])
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : 'Failed to rename this operation')
    }
  }

  const toggle = useCallback((id: string) => {
    setGroupError(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => {
        // Unique per attempt — re-uploading the same filename (a corrected
        // invoice) is a distinct run, not a replacement.
        const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        setUploads((prev) => [...prev, { key, filename: file.name, status: 'uploading' }])
        apiUploadPdf<Conversion>('/conversions', file)
          .then(() => {
            setUploads((prev) => prev.filter((u) => u.key !== key))
            refresh()
          })
          .catch((err) => {
            setUploads((prev) =>
              prev.map((u) =>
                u.key === key ? { ...u, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : u
              )
            )
          })
      })
    },
    [refresh]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: true })

  // When a row leaves 'processing', feed its real duration back into the estimate.
  const processingSince = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    const seen = processingSince.current
    for (const c of conversions) {
      if (c.status === 'processing' && !seen.has(c.id)) seen.set(c.id, Date.parse(c.createdAt))
      if (c.status !== 'processing' && seen.has(c.id)) {
        if (c.status === 'draft' || c.status === 'generated') recordDurationMs(Date.now() - seen.get(c.id)!)
        seen.delete(c.id)
      }
    }
  }, [conversions])

  // conversions arrive newest-first; the first row per filename is its latest run.
  const { latestPerFile, runCounts } = useMemo(() => {
    const latest = new Map<string, ConversionSummary>()
    const counts = new Map<string, number>()
    for (const c of conversions) {
      if (c.operationId) continue
      if (!latest.has(c.pdfFilename)) latest.set(c.pdfFilename, c)
      counts.set(c.pdfFilename, (counts.get(c.pdfFilename) ?? 0) + 1)
    }
    return { latestPerFile: [...latest.values()], runCounts: counts }
  }, [conversions])

  // Operations and conversions interleave in one table, most recent first.
  const gridRows = useMemo<GridRow[]>(() => {
    const merged: GridRow[] = [
      ...operations.map((op) => ({ kind: 'operation' as const, key: `op-${op.id}`, sort: rowTimestamp(op), op })),
      ...latestPerFile.map((c) => ({
        kind: 'conversion' as const,
        key: c.pdfFilename,
        sort: rowTimestamp(c),
        conversion: c,
      })),
    ]
    // Groups still in review (draft operations) float to the top regardless
    // of recency; everything else stays newest-first.
    const priority = (r: GridRow) => (r.kind === 'operation' && r.op.status === 'draft' ? 0 : 1)
    return merged.sort((a, b) => priority(a) - priority(b) || b.sort - a.sort)
  }, [operations, latestPerFile])

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return gridRows
    return gridRows.filter((r) =>
      r.kind === 'conversion'
        ? r.conversion.pdfFilename.toLowerCase().includes(q) ||
          (r.conversion.customerName ?? '').toLowerCase().includes(q)
        : (r.op.name ?? '').toLowerCase().includes(q) ||
          (r.op.customerName ?? '').toLowerCase().includes(q)
    )
  }, [gridRows, query])

  const estimateMs = getEstimateMs()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title">FTZ Converter — Upload</h1>
        <p className="text-page-subtitle">Drop one or more invoice PDFs to start an FTZ 214 conversion for each.</p>
      </div>

      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-12 text-center ${isDragActive ? 'border-primary bg-accent' : 'border-input'}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">Drag &amp; drop PDF invoices here, or click to browse</p>
      </div>

      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          {uploads.map((u) => (
            <div key={u.key} className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm">{u.filename}</span>
              </div>
              {u.status === 'uploading' && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </span>
              )}
              {u.status === 'error' && (
                <span className="flex items-center gap-1 text-sm text-destructive">
                  <XCircle className="h-4 w-4" /> {u.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardContent>
          <h2 className="mb-3 mt-4 text-card-title">Files converted</h2>

          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by file or client…"
              className="w-full max-w-sm rounded border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              aria-label="Search converted files"
            />
          </div>

          {selected.size >= 2 && (
            <div className="mb-3 flex flex-col gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                <span>{selected.size} invoices selected</span>
                <Button
                  size="sm"
                  onClick={async () => {
                    setGroupError(null)
                    try {
                      const op = await apiPost<OperationSummary>('/operations', { conversionIds: [...selected] })
                      setSelected(new Set())
                      await Promise.all([refresh(), refreshOps()])
                      navigate(`/converter/operations/${op.id}`)
                    } catch (err) {
                      setGroupError(err instanceof Error ? err.message : 'Could not group these invoices')
                      await refresh()
                    }
                  }}
                >
                  Group {selected.size} invoices into one FTZ operation
                </Button>
              </div>
              {groupError && <p className="mt-2 text-sm text-destructive">{groupError}</p>}
            </div>
          )}

          {visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {query.trim() ? 'No files match your search.' : 'No conversions yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 py-2" />
                    <th className="py-2 pr-4">File</th>
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4 text-center">Lines</th>
                    <th className="py-2 pr-4 text-center">Runs</th>
                    <th className="py-2 pr-4 text-center">Extraction</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleRows.map((r) =>
                    r.kind === 'operation' ? (
                      <OperationRow
                        key={r.key}
                        op={r.op}
                        onOpen={() => navigate(`/converter/operations/${r.op.id}`)}
                        onChanged={async () => {
                          await Promise.all([refresh(), refreshOps()])
                        }}
                        onOpenMenu={(pos, trigger) => {
                          menuTriggerRef.current = trigger ?? null
                          setContextMenu({ opId: r.op.id, ...pos })
                        }}
                      />
                    ) : (
                      <ConversionRow
                        key={r.key}
                        conversion={r.conversion}
                        estimateMs={estimateMs}
                        runCount={runCounts.get(r.conversion.pdfFilename) ?? 1}
                        selected={selected.has(r.conversion.id)}
                        onToggle={() => toggle(r.conversion.id)}
                        onOpen={() => navigate(`/converter/review/${r.conversion.id}`)}
                        onHistory={() => navigate(`/converter/history?file=${encodeURIComponent(r.conversion.pdfFilename)}`)}
                      />
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {contextMenu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 min-w-[8rem] rounded-md border bg-popover p-1 text-sm shadow-md"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 48),
              left: Math.min(contextMenu.x, window.innerWidth - 152),
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const op = operations.find((o) => o.id === contextMenu.opId)
                setContextMenu(null)
                if (op) setRenameTarget(op)
              }}
              className="block w-full rounded-sm px-2 py-1 text-left hover:bg-accent"
            >
              Rename
            </button>
          </div>,
          document.body
        )}
      <PromptDialog
        open={renameTarget !== null}
        title="Rename this operation"
        label="Name"
        defaultValue={renameTarget?.name ?? ''}
        confirmLabel="Save"
        onCancel={() => setRenameTarget(null)}
        onSubmit={(value) => {
          if (renameTarget) submitRename(renameTarget, value)
        }}
      />
      <AlertDialog
        open={alertMessage !== null}
        title="Error"
        message={alertMessage ?? ''}
        onClose={() => setAlertMessage(null)}
      />
    </div>
  )
}

function ConversionRow({
  conversion: c,
  estimateMs,
  runCount,
  selected,
  onToggle,
  onOpen,
  onHistory,
}: {
  conversion: ConversionSummary
  estimateMs: number
  runCount: number
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onHistory: () => void
}) {
  const extractedAt = new Date(c.updatedAt ?? c.createdAt)
  return (
    <tr>
      <td className="py-2.5 pr-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary disabled:opacity-40"
          checked={selected}
          disabled={c.status !== 'draft'}
          onChange={onToggle}
          aria-label={`Select ${c.pdfFilename}`}
        />
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{c.pdfFilename}</span>
        </div>
      </td>
      <td className="py-2.5 pr-4 text-muted-foreground">{c.customerName ?? '—'}</td>
      <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{extractedAt.toLocaleDateString()}</td>
      <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
        {extractedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </td>
      <td className="py-2.5 pr-4 text-center tabular-nums text-muted-foreground">
        {c.lineCount ?? '—'}
      </td>
      <td className="py-2.5 pr-4 text-center">
        {runCount > 1 ? (
          <button
            onClick={onHistory}
            aria-label={`${runCount} runs`}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            title="View every processing run for this file"
          >
            <History className="h-3 w-3" />
            {runCount}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">1</span>
        )}
      </td>
      <td className="py-2.5 pr-4 text-center tabular-nums text-muted-foreground">
        {formatExtractionDuration(c.extractionDurationMs)}
      </td>
      <td className="py-2.5 text-right">
        {c.status === 'processing' && (
          <div className="flex justify-end">
            <ExtractionProgress startedAt={Date.parse(c.createdAt)} estimateMs={estimateMs} state="pending" />
          </div>
        )}
        {(c.status === 'draft' || c.status === 'generated') && (
          <button className="inline-flex items-center gap-1 text-sm font-medium text-primary" onClick={onOpen}>
            <CheckCircle2 className="h-4 w-4" /> {c.status === 'draft' ? 'Ready for review' : 'View'}
          </button>
        )}
        {c.status === 'failed' && (
          <span className="inline-flex items-center gap-1 text-sm text-destructive">
            <XCircle className="h-4 w-4 shrink-0" />
            {c.extractionError ?? 'Extraction failed'} — re-upload
          </span>
        )}
      </td>
    </tr>
  )
}

function OperationRow({
  op,
  onOpen,
  onChanged,
  onOpenMenu,
}: {
  op: OperationSummary
  onOpen: () => void
  onChanged: () => Promise<void>
  onOpenMenu: (pos: { x: number; y: number }, trigger?: HTMLElement) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<OperationDetail | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [confirmUngroup, setConfirmUngroup] = useState(false)

  // Fetch the member list once, the first time the row is opened.
  useEffect(() => {
    if (!expanded || detail) return
    let cancelled = false
    apiGet<OperationDetail>(`/operations/${op.id}`)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch(() => {
        /* leave the list empty; opening the operation shows the real error */
      })
    return () => {
      cancelled = true
    }
  }, [expanded, detail, op.id])

  const when = new Date(op.updatedAt)
  return (
    <>
      <tr
        className="cursor-pointer hover:bg-accent/40"
        onClick={() => setExpanded((v) => !v)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onOpenMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <td className="w-8 py-2.5 pr-2" />
        <td className="py-2.5 pr-4">
          <div className="flex min-w-0 items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{`${op.name ?? 'Operation'} · ${op.memberCount} invoices`}</span>
          </div>
        </td>
        <td className="py-2.5 pr-4 text-muted-foreground">{op.customerName ?? '—'}</td>
        <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{when.toLocaleDateString()}</td>
        <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
          {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </td>
        <td className="py-2.5 pr-4 text-center tabular-nums text-muted-foreground">{op.lineCount}</td>
        {/* Runs counts re-uploads of one file — only meaningful on an
            individual invoice row, so it stays blank here (and on member rows
            below), not the invoice-count total already shown in the File cell. */}
        <td className="py-2.5 pr-4" />
        <td className="py-2.5 pr-4" />
        <td className="py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              className="inline-flex items-center gap-1 text-sm font-medium text-primary"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> {op.status === 'draft' ? 'Review' : 'View'}
            </button>
            <button
              type="button"
              aria-label="Operation actions"
              onClick={(e) => {
                e.stopPropagation()
                const trigger = e.currentTarget
                const rect = trigger.getBoundingClientRect()
                onOpenMenu({ x: rect.left, y: rect.bottom + 4 }, trigger)
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
      {expanded && !detail && (
        <tr>
          <td />
          <td colSpan={8} className="pb-3">
            <span className="ml-6 text-xs text-muted-foreground">Loading members…</span>
          </td>
        </tr>
      )}
      {expanded && removeError && (
        <tr>
          <td />
          <td colSpan={8} className="pb-2">
            <span className="ml-6 text-xs text-destructive">{removeError}</span>
          </td>
        </tr>
      )}
      {expanded &&
        detail?.members.map((m) => {
          const when = new Date(m.updatedAt)
          return (
            <tr key={m.conversionId} className="bg-muted/20 text-xs text-muted-foreground">
              <td className="w-8 py-2 pr-2" />
              <td className="py-2 pr-4">
                <div className="flex min-w-0 items-center gap-2 pl-6">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{m.pdfFilename}</span>
                </div>
              </td>
              <td className="py-2 pr-4">{m.customerName ?? '—'}</td>
              <td className="py-2 pr-4 whitespace-nowrap">{when.toLocaleDateString()}</td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-2 pr-4 text-center tabular-nums">{m.lineCount}</td>
              <td className="py-2 pr-4" />
              <td className="py-2 pr-4 text-center tabular-nums">{formatExtractionDuration(m.extractionDurationMs)}</td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  onClick={async () => {
                    if (!detail) return
                    setRemoveError(null)
                    if (detail.members.length <= 2) {
                      setConfirmUngroup(true)
                      return
                    }
                    setRemoving(m.conversionId)
                    try {
                      const updated = await apiPost<OperationDetail>(`/operations/${op.id}/members/remove`, {
                        conversionIds: [m.conversionId],
                      })
                      setDetail(updated)
                      await onChanged()
                    } catch (err) {
                      setRemoveError(err instanceof Error ? err.message : 'Failed to remove this invoice')
                    } finally {
                      setRemoving(null)
                    }
                  }}
                  disabled={removing !== null}
                  title={
                    detail.members.length <= 2
                      ? 'Removing this invoice would ungroup the operation'
                      : 'Remove from this operation'
                  }
                  className="text-xs text-destructive hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Remove
                </button>
              </td>
            </tr>
          )
        })}
      {expanded && detail && (
        <tr className="bg-muted/10">
          <td />
          <td colSpan={8} className="py-2 pl-6">
            {showAdd ? (
              <AddInvoicesPicker
                operationId={op.id}
                excludeIds={new Set(detail.members.map((m) => m.conversionId))}
                onAdded={(updated) => {
                  setDetail(updated)
                  onChanged()
                }}
                onClose={() => setShowAdd(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="text-xs font-medium text-primary hover:underline"
              >
                ＋ Add invoice
              </button>
            )}
          </td>
        </tr>
      )}
      <ConfirmDialog
        open={confirmUngroup}
        title="Ungroup this operation?"
        message="Removing this invoice would leave the group with only one. Ungroup this operation instead? All invoices will return to the list."
        confirmLabel="Ungroup"
        destructive
        onCancel={() => setConfirmUngroup(false)}
        onConfirm={async () => {
          setConfirmUngroup(false)
          setRemoving(op.id)
          try {
            await apiDelete(`/operations/${op.id}`)
            await onChanged()
          } catch (err) {
            setRemoveError(err instanceof Error ? err.message : 'Failed to ungroup')
          } finally {
            setRemoving(null)
          }
        }}
      />
    </>
  )
}
