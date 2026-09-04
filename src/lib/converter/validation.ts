import type { FieldDef } from '@/types/converter/ftz214.types'

function isEmptyScalar(value: unknown): boolean {
  if (value === null || value === undefined) return true
  return typeof value === 'string' && value.trim() === ''
}

export function isFieldEmpty(field: FieldDef, raw: unknown): boolean {
  if (field.hasUnitsAttr) {
    const uv = raw as { value?: unknown } | null | undefined
    return isEmptyScalar(uv?.value)
  }
  return isEmptyScalar(raw)
}

export function countMissingMandatory(fields: FieldDef[], values: Record<string, unknown>): number {
  return fields.filter((f) => f.designation === 'M' && isFieldEmpty(f, values[f.name])).length
}

// The wire format for every `type: 'D'` field is 8-char YYYYMMDD (fields.ts's
// maxLength: 8) — <input type="date"> only accepts/emits YYYY-MM-DD, so this
// boundary conversion is required in both directions or a valid date silently
// fails to display (and, on edit, gets written back in the wrong format).
export function toDateInputValue(wireValue: unknown): string {
  if (typeof wireValue !== 'string' || !/^\d{8}$/.test(wireValue)) return ''
  return `${wireValue.slice(0, 4)}-${wireValue.slice(4, 6)}-${wireValue.slice(6, 8)}`
}

export function fromDateInputValue(inputValue: string): string {
  return inputValue.replace(/-/g, '')
}
