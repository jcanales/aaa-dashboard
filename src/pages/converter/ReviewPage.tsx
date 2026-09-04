import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, FileSearch } from 'lucide-react'
import { apiGet, apiPatch, apiPost, ApiError, downloadConversionXml } from '@/api/converterApi'
import { useFtz214Fields } from '@/hooks/converter/useFtz214Fields'
import { FieldGroup } from '@/components/converter/form/FieldGroup'
import { Button } from '@/components/ui/button'
import { PdfViewer, type PdfViewerHandle } from '@/components/converter/review/PdfViewer'
import { countMissingMandatory } from '@/lib/converter/validation'
import { flashElement } from '@/lib/converter/flashElement'
import type { Conversion, FieldValues, BillOfLadingData, LineData, FieldValue } from '@/types/converter/ftz214.types'

function emptyLine(): LineData {
  return {}
}
function emptyBillOfLading(): BillOfLadingData {
  return { fields: {}, lines: [emptyLine()] }
}

function jumpToWarningTarget(warning: { line?: number; field: string }) {
  const el = document.getElementById(warning.line ? `review-line-${warning.line}` : 'review-detail-top')
  if (el) flashElement(el)
}

// A server missingField path looks like `Header.FtzNumber`,
// `Detail.BillsOfLading[0].Line[3].Packages`, or the same with a trailing
// ` (exceeds max length 15, got 16)` note. Turn it into a friendly label and a
// DOM id (field control id, falling back to the line block, then the detail top).
function parseMissingField(path: string): { label: string; targetId: string; fallbackId?: string } {
  const note = path.match(/\((.*)\)\s*$/)?.[1]
  const clean = path.replace(/\s*\(.*\)\s*$/, '').trim()
  const withNote = (label: string) => (note ? `${label} (${note})` : label)

  let m: RegExpMatchArray | null
  if ((m = clean.match(/^ApplicationInformation\.(.+)$/)))
    return { label: withNote(`App info · ${m[1]}`), targetId: `field-appinfo-${m[1]}`, fallbackId: 'review-appinfo' }
  if ((m = clean.match(/^Header\.(.+)$/)))
    return { label: withNote(`Header · ${m[1]}`), targetId: `field-header-${m[1]}`, fallbackId: 'review-header' }
  if ((m = clean.match(/^Detail\.BillsOfLading\[(\d+)\]\.Line\[(\d+)\]\.(.+)$/))) {
    const lineNo = Number(m[2]) + 1
    return { label: withNote(`Line ${lineNo} · ${m[3]}`), targetId: `field-bol${m[1]}-line${m[2]}-${m[3]}`, fallbackId: `review-line-${lineNo}` }
  }
  if ((m = clean.match(/^Detail\.BillsOfLading\[(\d+)\]\.(.+)$/)))
    return { label: withNote(`Bill of Lading · ${m[2]}`), targetId: `field-bol${m[1]}-${m[2]}`, fallbackId: 'review-detail-top' }
  return { label: withNote(clean), targetId: '', fallbackId: 'review-detail-top' }
}

function jumpToMissingField(path: string) {
  const { targetId, fallbackId } = parseMissingField(path)
  const el =
    (targetId && document.getElementById(targetId)) ||
    (fallbackId && document.getElementById(fallbackId)) ||
    null
  if (el) flashElement(el)
}

// A record from runExtraction on extraction failure — or a real extraction
// that legitimately found no line items — is persisted as
// `{ billsOfLading: [{ fields: {}, lines: [] }] }`: one BOL with zero
// lines, NOT an empty billsOfLading array. The PATCH route enforces `lines.min(1)`,
// so loading this shape verbatim and clicking "Save draft" 400s
// immediately with no indication why. Normalize per-BOL, not just when the whole
// array is empty.
function normalizeBillsOfLading(billsOfLading: BillOfLadingData[]): BillOfLadingData[] {
  if (billsOfLading.length === 0) return [emptyBillOfLading()]
  return billsOfLading.map((bol) => (bol.lines.length > 0 ? bol : { ...bol, lines: [emptyLine()] }))
}

export function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const { fields, error: fieldsError } = useFtz214Fields()

  const [conversion, setConversion] = useState<Conversion | null>(null)
  const [applicationData, setApplicationData] = useState<FieldValues>({})
  const [headerData, setHeaderData] = useState<FieldValues>({})
  const [billsOfLading, setBillsOfLading] = useState<BillOfLadingData[]>([emptyBillOfLading()])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [ftzNotice, setFtzNotice] = useState<string | null>(null)
  const pdfRef = useRef<PdfViewerHandle>(null)

  // Scroll the side-by-side PDF to a line's spot on the invoice (index 0-based).
  const jumpToPdfLine = useCallback(
    (lineIndex: number) => {
      const a = conversion?.lineAnchors?.[lineIndex]
      if (a) pdfRef.current?.scrollToAnchor(a.page, a.y)
    },
    [conversion?.lineAnchors]
  )

  const load = useCallback(async () => {
    if (!id) return
    try {
      const data = await apiGet<Conversion>(`/conversions/${id}`)
      setConversion(data)
      setApplicationData(data.applicationData)
      setHeaderData(data.headerData)
      setBillsOfLading(normalizeBillsOfLading(data.detailData.billsOfLading))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load conversion')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Extraction runs in the background — poll until the row leaves 'processing'.
  useEffect(() => {
    if (conversion?.status !== 'processing') return
    const timer = setInterval(load, 2500)
    return () => clearInterval(timer)
  }, [conversion?.status, load])

  if (loadError || fieldsError) {
    return <p className="text-sm text-destructive">{loadError ?? fieldsError}</p>
  }
  if (!conversion || !fields) return <p className="text-sm text-muted-foreground">Loading…</p>

  if (conversion.status === 'processing') {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-page-title">{conversion.pdfFilename}</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Extraction in progress — this page will update automatically.
        </p>
      </div>
    )
  }

  const isReadOnly = conversion.status === 'generated'
  const missingCount =
    countMissingMandatory(fields.applicationInformation, applicationData) +
    countMissingMandatory(fields.header, headerData) +
    billsOfLading.reduce(
      (sum, bol) =>
        sum + countMissingMandatory(fields.billOfLading, bol.fields) + bol.lines.reduce((s, line) => s + countMissingMandatory(fields.line, line), 0),
      0
    )

  async function persist() {
    await apiPatch(`/conversions/${id}`, { applicationData, headerData, detailData: { billsOfLading } })
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
    setIsSaving(true)
    setError(null)
    setMissingFields([])
    setFtzNotice(null)
    try {
      await persist()
      const draftFtz = headerData.FtzNumber
      const updated = await apiPost<Conversion>(`/conversions/${id}/generate`)
      const finalFtz = updated.headerData.FtzNumber
      if (finalFtz && draftFtz && String(finalFtz) !== String(draftFtz)) {
        setFtzNotice(`FTZ number assigned: ${finalFtz} (your draft had ${draftFtz} — another admission was filed first).`)
      }
      setConversion(updated)
      setHeaderData(updated.headerData)
      await downloadConversionXml(updated.id, updated.pdfFilename.replace(/\.pdf$/i, '.xml'))
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setMissingFields((err.body as { missingFields?: string[] })?.missingFields ?? [])
      }
      setError(err instanceof Error ? err.message : 'Failed to generate XML')
    } finally {
      setIsSaving(false)
    }
  }

  function updateBillOfLading(bolIndex: number, name: string, value: FieldValue) {
    setBillsOfLading((prev) =>
      prev.map((bol, i) => (i !== bolIndex ? bol : { ...bol, fields: { ...bol.fields, [name]: value } }))
    )
  }

  function updateLine(bolIndex: number, lineIndex: number, name: string, value: FieldValue) {
    setBillsOfLading((prev) =>
      prev.map((bol, i) =>
        i !== bolIndex ? bol : { ...bol, lines: bol.lines.map((line, j) => (j !== lineIndex ? line : { ...line, [name]: value })) }
      )
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-page-title">{conversion.pdfFilename}</h1>
        <p className="text-page-subtitle">
          Status: <span className="uppercase">{conversion.status}</span>
          {conversion.extractionError && <span className="ml-2 text-destructive">Extraction issue: {conversion.extractionError}</span>}
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,48%)] xl:grid-cols-[minmax(0,1fr)_minmax(560px,56%)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-6">
      {(missingCount > 0 || missingFields.length > 0) && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {missingCount > 0 && (
            <div>{missingCount} required field{missingCount === 1 ? '' : 's'} missing.</div>
          )}
          {/* Server-reported list — hoisted out of the missingCount>0 check because two
              mandatory rules (an empty BillsOfLading array, or a BOL with zero Line
              entries) are enforced server-side only and contribute 0 to the client's
              per-field count, so this list must render even when missingCount is 0. */}
          {missingFields.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {missingFields.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => {
                      jumpToMissingField(path)
                      const m = path.match(/\.Line\[(\d+)\]\./)
                      if (m) jumpToPdfLine(Number(m[1]))
                    }}
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    {parseMissingField(path).label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {ftzNotice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {ftzNotice}
        </div>
      )}

      {Array.isArray(conversion.parseWarnings) && conversion.parseWarnings.length > 0 && (
        <div className="rounded-md border border-input bg-accent p-3 text-sm text-accent-foreground">
          <p className="font-medium">Parsed automatically — double-check these:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {conversion.parseWarnings.map((w, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    jumpToWarningTarget(w)
                    if (w.line != null) jumpToPdfLine(w.line - 1)
                  }}
                  className="text-left underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  {w.line ? `Line ${w.line}: ` : ''}
                  {w.field} — {w.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset disabled={isReadOnly} className="flex flex-col gap-6">
        <div id="review-appinfo" className="transition-shadow">
          <FieldGroup title="Application Information" idPrefix="field-appinfo" fields={fields.applicationInformation} values={applicationData} onChange={(name, value) => setApplicationData((prev) => ({ ...prev, [name]: value }))} />
        </div>
        <div id="review-header" className="transition-shadow">
          <FieldGroup title="Header" idPrefix="field-header" fields={fields.header} values={headerData} onChange={(name, value) => setHeaderData((prev) => ({ ...prev, [name]: value }))} />
        </div>

        {billsOfLading.map((bol, bolIndex) => (
          <div
            key={bolIndex}
            id={bolIndex === 0 ? 'review-detail-top' : undefined}
            className="flex flex-col gap-4 rounded-lg border-2 bg-card p-4 transition-shadow"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-card-title">Bill of Lading {bolIndex + 1}</h2>
              {billsOfLading.length > 1 && (
                <Button type="button" variant="outline" onClick={() => setBillsOfLading((prev) => prev.filter((_, i) => i !== bolIndex))}>
                  Remove
                </Button>
              )}
            </div>
            <FieldGroup title="Bill of Lading details" idPrefix={`field-bol${bolIndex}`} fields={fields.billOfLading} values={bol.fields} onChange={(name, value) => updateBillOfLading(bolIndex, name, value)} />
            {bol.lines.map((line, lineIndex) => (
              <div
                key={lineIndex}
                id={bolIndex === 0 ? `review-line-${lineIndex + 1}` : undefined}
                className="flex flex-col gap-2 rounded-md border bg-card p-3 transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Line {lineIndex + 1}</h3>
                    {bolIndex === 0 && conversion.lineAnchors?.[lineIndex] && (
                      <button
                        type="button"
                        onClick={() => jumpToPdfLine(lineIndex)}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                        title="Show this line in the PDF"
                      >
                        <FileSearch className="h-3 w-3" /> in PDF
                      </button>
                    )}
                  </div>
                  {bol.lines.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBillsOfLading((prev) => prev.map((b, i) => (i !== bolIndex ? b : { ...b, lines: b.lines.filter((_, j) => j !== lineIndex) })))}
                    >
                      Remove line
                    </Button>
                  )}
                </div>
                <FieldGroup title="" idPrefix={`field-bol${bolIndex}-line${lineIndex}`} fields={fields.line} values={line} onChange={(name, value) => updateLine(bolIndex, lineIndex, name, value)} />
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setBillsOfLading((prev) => prev.map((b, i) => (i !== bolIndex ? b : { ...b, lines: [...b.lines, emptyLine()] })))}>
              + Add line
            </Button>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={() => setBillsOfLading((prev) => [...prev, emptyBillOfLading()])}>
          + Add Bill of Lading
        </Button>
      </fieldset>

      {!isReadOnly && (
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={isSaving}>Save draft</Button>
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
        </div>
      )}
      {isReadOnly && conversion.xml && (
        <Button
          onClick={() =>
            downloadConversionXml(conversion.id, conversion.pdfFilename.replace(/\.pdf$/i, '.xml')).catch((err) =>
              setError(err instanceof Error ? err.message : 'Failed to download XML')
            )
          }
        >
          Re-download XML
        </Button>
      )}
        </div>

        <div className="mt-6 h-[75vh] lg:mt-0 lg:sticky lg:top-2 lg:h-[calc(100vh-6rem)]">
          <PdfViewer ref={pdfRef} conversionId={conversion.id} />
        </div>
      </div>
    </div>
  )
}
