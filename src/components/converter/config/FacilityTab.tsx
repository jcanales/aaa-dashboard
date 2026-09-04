import { useEffect, useMemo, useState } from 'react'
import { useFacility } from '@/hooks/converter/useFacility'
import { useFtz214Fields } from '@/hooks/converter/useFtz214Fields'
import { FieldGroup } from '@/components/converter/form/FieldGroup'
import { Button } from '@/components/ui/button'
import { FACILITY_APPLICATION_FIELDS, FACILITY_HEADER_FIELDS } from '@/types/converter/config.types'
import type { FieldValue, FieldValues } from '@/types/converter/ftz214.types'

export function FacilityTab() {
  const { facility, isLoading, error, save } = useFacility()
  const { fields, error: fieldsError } = useFtz214Fields()

  const [appInfo, setAppInfo] = useState<FieldValues>({})
  const [header, setHeader] = useState<FieldValues>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    setAppInfo(facility.applicationInfo)
    setHeader(facility.header)
  }, [facility])

  const appFields = useMemo(
    () => (fields ? fields.applicationInformation.filter((f) => FACILITY_APPLICATION_FIELDS.includes(f.name)) : []),
    [fields]
  )
  const headerFields = useMemo(
    () => (fields ? fields.header.filter((f) => FACILITY_HEADER_FIELDS.includes(f.name)) : []),
    [fields]
  )

  async function handleSave() {
    setIsSaving(true)
    setSaveError(null)
    try {
      await save({
        applicationInfo: appInfo as Record<string, string | number | null>,
        header: header as Record<string, string | number | null>,
      })
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  if (error || fieldsError) {
    return <p className="text-sm text-destructive">{error ?? fieldsError}</p>
  }
  if (isLoading || !fields) {
    return <p className="text-xs text-slate-400">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
        These values are constant for the FTZ facility and pre-fill the Application Information and Header of every new
        conversion — the operator only fills the shipment-specific fields. Company Key is per client (see the Clients tab).
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <FieldGroup
          title="Application Information"
          idPrefix="facility-appinfo"
          fields={appFields}
          values={appInfo}
          onChange={(name: string, value: FieldValue) => setAppInfo((p) => ({ ...p, [name]: value }))}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <FieldGroup
          title="Header — facility constants"
          idPrefix="facility-header"
          fields={headerFields}
          values={header}
          onChange={(name: string, value: FieldValue) => setHeader((p) => ({ ...p, [name]: value }))}
        />
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save facility defaults'}
        </Button>
        {savedAt && !isSaving && <span className="text-xs text-green-600">Saved.</span>}
      </div>
    </div>
  )
}
