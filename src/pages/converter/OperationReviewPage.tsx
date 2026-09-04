import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileSearch } from 'lucide-react'
import { apiDelete, apiGet, apiPatch, apiPost, ApiError, downloadOperationXml } from '@/api/converterApi'
import { useFtz214Fields } from '@/hooks/converter/useFtz214Fields'
import { FieldGroup } from '@/components/converter/form/FieldGroup'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AddInvoicesPicker } from '@/components/converter/operations/AddInvoicesPicker'
import { PdfTabs } from '@/components/converter/review/PdfTabs'
import type { PdfViewerHandle } from '@/components/converter/review/PdfViewer'
import { countMissingMandatory } from '@/lib/converter/validation'
import { flashElement } from '@/lib/converter/flashElement'
import type { FieldValue, FieldValues } from '@/types/converter/ftz214.types'
import type { FieldConflict, OperationDetail, OperationLine } from '@/types/converter/operation.types'

function sectionLabel(section: FieldConflict['section']): string {
  if (section === 'applicationInformation') return 'App info'
  if (section === 'header') return 'Header'
  return 'Bill of Lading'
}

function conflictFieldId(conflict: FieldConflict): string {
  const prefix =
    conflict.section === 'applicationInformation'
      ? 'field-appinfo'
      : conflict.section === 'header'
        ? 'field-header'
        : 'field-bol'
  return `${prefix}-${conflict.field}`
}

const MANUAL_KEY = '__manual__'

type PendingConfirm =
  | { kind: 'removeMembers'; ids: string[]; names: string }
  | { kind: 'ungroup'; reason: 'direct' | 'tooFew' }

function confirmDialogProps(action: PendingConfirm): { title: string; message: string; confirmLabel: string } {
  if (action.kind === 'removeMembers') {
    return {
      title: 'Remove invoices',
      message: `Remove ${action.names} from this operation? They return to the invoice list as drafts.`,
      confirmLabel: 'Remove',
    }
  }
  return {
    title: 'Ungroup operation',
    message:
      action.reason === 'tooFew'
        ? 'Removing the selected invoices would leave fewer than two. Ungroup this operation instead? All invoices will return to the list.'
        : 'Ungroup this operation? The invoices return to the list as drafts.',
    confirmLabel: 'Ungroup',
  }
}

interface GroupedLine {
  line: OperationLine
  globalIndex: number
  sourceIndex: number
}
interface LineGroup {
  source: string | null
  key: string
  entries: GroupedLine[]
}

// Group the flat lines array by `_source` (first-seen order), then push the
// null/absent-source bucket ("Added manually") to the end. `sourceIndex` is a
// line's ordinal within its own source group — it maps to that member's
// `lineAnchors` for the "in PDF" jump.
function groupLines(lines: OperationLine[]): LineGroup[] {
  const groups: LineGroup[] = []
  const bySource = new Map<string, LineGroup>()
  lines.forEach((line, globalIndex) => {
    const source = line._source ?? null
    const key = source ?? MANUAL_KEY
    let group = bySource.get(key)
    if (!group) {
      group = { source, key, entries: [] }
      bySource.set(key, group)
      groups.push(group)
    }
    group.entries.push({ line, globalIndex, sourceIndex: group.entries.length })
  })
  return groups.sort((a, b) => (a.source === null ? 1 : 0) - (b.source === null ? 1 : 0))
}

export function OperationReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fields, error: fieldsError } = useFtz214Fields()

  const [operation, setOperation] = useState<OperationDetail | null>(null)
  const [applicationData, setApplicationData] = useState<FieldValues>({})
  const [headerData, setHeaderData] = useState<FieldValues>({})
  const [billOfLadingData, setBillOfLadingData] = useState<FieldValues>({})
  const [lines, setLines] = useState<OperationLine[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [activePdf, setActivePdf] = useState<string | null>(null)
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [showAddPicker, setShowAddPicker] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [ftzNotice, setFtzNotice] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const pdfRef = useRef<PdfViewerHandle>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const data = await apiGet<OperationDetail>(`/operations/${id}`)
      setOperation(data)
      setApplicationData(data.applicationData)
      setHeaderData(data.headerData)
      setBillOfLadingData(data.billOfLadingData)
      setLines(data.detailData.lines)
      setActivePdf(data.members[0]?.conversionId ?? null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load operation')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loadError || fieldsError) {
    return <p className="text-sm text-destructive">{loadError ?? fieldsError}</p>
  }
  if (!operation || !fields) return <p className="text-sm text-muted-foreground">Loading…</p>

  const isReadOnly = operation.status === 'generated'
  const missingCount =
    countMissingMandatory(fields.applicationInformation, applicationData) +
    countMissingMandatory(fields.header, headerData) +
    countMissingMandatory(fields.billOfLading, billOfLadingData) +
    lines.reduce((sum, line) => sum + countMissingMandatory(fields.line, line), 0)

  const groups = groupLines(lines)
  const activeConversionId = activePdf ?? operation.members[0]?.conversionId ?? null

  function updateLine(globalIndex: number, name: string, value: FieldValue) {
    setLines((prev) => prev.map((line, i) => (i !== globalIndex ? line : { ...line, [name]: value })))
  }
  function removeLine(globalIndex: number) {
    setLines((prev) => prev.filter((_, i) => i !== globalIndex))
  }
  function addLine(source: string | null) {
    setLines((prev) => [...prev, { _source: source }])
  }
  function toggleGroup(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }))
  }

  function jumpToConflict(conflict: FieldConflict) {
    const el = document.getElementById(conflictFieldId(conflict))
    if (el) flashElement(el)
  }

  function jumpToPdfLine(source: string | null, sourceIndex: number) {
    if (!operation) return
    const member = operation.members.find((m) => m.pdfFilename === source)
    if (!member) return
    setActivePdf(member.conversionId)
    const anchor = member.lineAnchors[sourceIndex]
    if (anchor) pdfRef.current?.scrollToAnchor(anchor.page, anchor.y)
  }

  async function persist() {
    await apiPatch(`/operations/${id}`, { applicationData, headerData, billOfLadingData, detailData: { lines } })
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    setMissingFields([])
    try {
      await persist()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleGenerate() {
    if (!operation) return
    setIsSaving(true)
    setError(null)
    setMissingFields([])
    setFtzNotice(null)
    try {
      await persist()
      const draftFtz = headerData.FtzNumber
      const updated = await apiPost<OperationDetail>(`/operations/${id}/generate`)
      const finalFtz = updated.headerData.FtzNumber
      if (finalFtz && draftFtz && String(finalFtz) !== String(draftFtz)) {
        setFtzNotice(
          `FTZ number assigned: ${finalFtz} (your draft had ${draftFtz} — another admission was filed first).`
        )
      }
      setOperation(updated)
      setHeaderData(updated.headerData)
      await downloadOperationXml(id!, `${operation.name ?? `operation-${id}`}.xml`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setMissingFields((err.body as { missingFields?: string[] })?.missingFields ?? [])
      }
      setError(err instanceof Error ? err.message : 'Failed to generate XML')
    } finally {
      setIsSaving(false)
    }
  }

  function toggleMember(conversionId: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(conversionId)) next.delete(conversionId)
      else next.add(conversionId)
      return next
    })
  }

  function applyOperationUpdate(updated: OperationDetail) {
    setOperation(updated)
    setApplicationData(updated.applicationData)
    setHeaderData(updated.headerData)
    setBillOfLadingData(updated.billOfLadingData)
    setLines(updated.detailData.lines)
    setSelectedMembers(new Set())
    setActivePdf((prev) =>
      prev && updated.members.some((m) => m.conversionId === prev)
        ? prev
        : (updated.members[0]?.conversionId ?? null)
    )
  }

  function requestRemoveMembers() {
    if (!operation) return
    const ids = [...selectedMembers]
    if (ids.length === 0) return
    if (operation.members.length - ids.length < 2) {
      setPendingConfirm({ kind: 'ungroup', reason: 'tooFew' })
      return
    }
    const names = operation.members
      .filter((m) => ids.includes(m.conversionId))
      .map((m) => m.pdfFilename)
      .join(', ')
    setPendingConfirm({ kind: 'removeMembers', ids, names })
  }

  function requestUngroup() {
    setPendingConfirm({ kind: 'ungroup', reason: 'direct' })
  }

  async function handleConfirm() {
    const action = pendingConfirm
    setPendingConfirm(null)
    if (!action) return
    setError(null)
    if (action.kind === 'ungroup') {
      try {
        await apiDelete(`/operations/${id}`)
        navigate('/converter/upload')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to ungroup')
      }
      return
    }
    try {
      const updated = await apiPost<OperationDetail>(`/operations/${id}/members/remove`, { conversionIds: action.ids })
      applyOperationUpdate(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the selected invoices')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-page-title">{operation.name ?? `Operation ${operation.id}`}</h1>
        <p className="text-page-subtitle">
          Status: <span className="uppercase">{operation.status}</span>
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,48%)] xl:grid-cols-[minmax(0,1fr)_minmax(560px,56%)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-6">
          {(missingCount > 0 || missingFields.length > 0) && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {missingCount > 0 && (
                <div>
                  {missingCount} required field{missingCount === 1 ? '' : 's'} missing.
                </div>
              )}
              {missingFields.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {missingFields.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {ftzNotice && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{ftzNotice}</div>
          )}

          {operation.conflicts.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Some invoices disagree on shared fields — the first invoice&apos;s value was kept:</p>
              <ul className="mt-1 list-disc pl-5">
                {operation.conflicts.map((c) => (
                  <li key={`${c.section}-${c.field}`}>
                    <button
                      type="button"
                      onClick={() => jumpToConflict(c)}
                      className="text-left underline decoration-dotted underline-offset-2 hover:text-amber-950"
                    >
                      {`${sectionLabel(c.section)} · ${c.field} — ${c.values
                        .map((v) => `${v.pdfFilename}: ${v.value ?? '(empty)'}`)
                        .join(' · ')}`}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isReadOnly && (
            <div className="rounded-md border border-slate-200 bg-card p-3 text-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-medium">
                  Invoices in this operation{' '}
                  <span className="font-normal text-muted-foreground">
                    · {lines.length} line{lines.length === 1 ? '' : 's'} in this operation
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  {selectedMembers.size > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={requestRemoveMembers}
                      title={
                        operation.members.length - selectedMembers.size < 2
                          ? 'Removing these invoices would ungroup the operation'
                          : undefined
                      }
                    >
                      Remove selected ({selectedMembers.size})
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddPicker((v) => !v)}
                  >
                    ＋ Add invoices
                  </Button>
                </div>
              </div>
              <ul className="flex flex-col gap-1">
                {operation.members.map((m) => (
                  <li key={m.conversionId} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedMembers.has(m.conversionId)}
                      onChange={() => toggleMember(m.conversionId)}
                      aria-label={`Select ${m.pdfFilename}`}
                    />
                    <span className="text-slate-700">
                      {m.pdfFilename}{' '}
                      <span className="text-muted-foreground">
                        · {m.lineCount} line{m.lineCount === 1 ? '' : 's'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {showAddPicker && (
                <div className="mt-2">
                  <AddInvoicesPicker
                    operationId={id!}
                    excludeIds={new Set(operation.members.map((m) => m.conversionId))}
                    onAdded={applyOperationUpdate}
                    onClose={() => setShowAddPicker(false)}
                  />
                </div>
              )}
            </div>
          )}

          <fieldset disabled={isReadOnly} className="flex flex-col gap-6">
            <div id="op-appinfo" className="transition-shadow">
              <FieldGroup
                title="Application Information"
                idPrefix="field-appinfo"
                fields={fields.applicationInformation}
                values={applicationData}
                onChange={(name, value) => setApplicationData((prev) => ({ ...prev, [name]: value }))}
              />
            </div>
            <div id="op-header" className="transition-shadow">
              <FieldGroup
                title="Header"
                idPrefix="field-header"
                fields={fields.header}
                values={headerData}
                onChange={(name, value) => setHeaderData((prev) => ({ ...prev, [name]: value }))}
              />
            </div>
            <div id="op-bol" className="transition-shadow">
              <FieldGroup
                title="Bill of Lading"
                idPrefix="field-bol"
                fields={fields.billOfLading}
                values={billOfLadingData}
                onChange={(name, value) => setBillOfLadingData((prev) => ({ ...prev, [name]: value }))}
              />
            </div>

            {groups.map((group) => {
              const isOpen = expanded[group.key] ?? false
              const title = `${group.source ?? 'Added manually'} — ${group.entries.length} lines`
              return (
                <div key={group.key} className="flex flex-col gap-3 rounded-lg border-2 bg-card p-4">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex items-center gap-2 text-left text-card-title"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {title}
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-4">
                      {group.entries.map(({ line, globalIndex, sourceIndex }) => {
                        const member = operation.members.find((m) => m.pdfFilename === line._source)
                        const hasAnchor = !!member?.lineAnchors[sourceIndex]
                        return (
                          <div
                            key={globalIndex}
                            id={`op-line-${globalIndex + 1}`}
                            className="flex flex-col gap-2 rounded-md border bg-card p-3 transition-shadow"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold">Line {globalIndex + 1}</h3>
                                {hasAnchor && (
                                  <button
                                    type="button"
                                    onClick={() => jumpToPdfLine(line._source ?? null, sourceIndex)}
                                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                                    title="Show this line in the PDF"
                                  >
                                    <FileSearch className="h-3 w-3" /> in PDF
                                  </button>
                                )}
                              </div>
                              <Button type="button" variant="outline" onClick={() => removeLine(globalIndex)}>
                                Remove
                              </Button>
                            </div>
                            <FieldGroup
                              title=""
                              idPrefix={`field-line-${globalIndex}`}
                              fields={fields.line}
                              values={line as FieldValues}
                              onChange={(name, value) => updateLine(globalIndex, name, value)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            <Button type="button" variant="outline" onClick={() => addLine(null)}>
              + Add line
            </Button>
          </fieldset>

          {!isReadOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleSave} disabled={isSaving}>
                Save draft
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={isSaving || missingCount > 0}
                title={missingCount > 0 ? 'Fill every required field before generating the XML' : undefined}
              >
                Generate &amp; download XML
              </Button>
              {missingCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {missingCount} required field{missingCount === 1 ? '' : 's'} left
                </span>
              )}
              <Button type="button" variant="outline" onClick={requestUngroup} disabled={isSaving}>
                Ungroup
              </Button>
            </div>
          )}
          {isReadOnly && (
            <div className="flex items-center gap-3">
              {operation.xml && (
                <Button
                  onClick={() =>
                    downloadOperationXml(operation.id, `${operation.name ?? `operation-${operation.id}`}.xml`).catch((err) =>
                      setError(err instanceof Error ? err.message : 'Failed to download XML')
                    )
                  }
                >
                  Re-download XML
                </Button>
              )}
              <Button type="button" variant="outline" onClick={requestUngroup}>
                Ungroup
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6 h-[75vh] lg:mt-0 lg:sticky lg:top-2 lg:h-[calc(100vh-6rem)]">
          {operation.members.length > 0 && activeConversionId && (
            <PdfTabs
              ref={pdfRef}
              operationId={operation.id}
              members={operation.members}
              activeConversionId={activeConversionId}
              onSelect={setActivePdf}
            />
          )}
        </div>
      </div>
      {pendingConfirm && (
        <ConfirmDialog
          open
          destructive
          onCancel={() => setPendingConfirm(null)}
          onConfirm={handleConfirm}
          {...confirmDialogProps(pendingConfirm)}
        />
      )}
    </div>
  )
}
