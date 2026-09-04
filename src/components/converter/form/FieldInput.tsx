import type { FieldDef, FieldValue, UnitValue } from '@/types/converter/ftz214.types'
import { cn } from '@/lib/utils'
import { toDateInputValue, fromDateInputValue } from '@/lib/converter/validation'

function isUnitValue(v: unknown): v is UnitValue {
  return typeof v === 'object' && v !== null && 'value' in v
}

interface FieldInputProps {
  field: FieldDef
  value: FieldValue | undefined
  onChange: (value: FieldValue) => void
  missing: boolean
  /** DOM id for the primary control, so the validation banner can jump to it. */
  id?: string
}

export function FieldInput({ field, value, onChange, missing, id }: FieldInputProps) {
  const unitValue: UnitValue = field.hasUnitsAttr && isUnitValue(value) ? value : { value: null, units: null }
  const baseInputClass = cn(
    'w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    missing ? 'border-destructive' : 'border-input'
  )

  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">
        {field.label}
        {field.designation === 'M' && <span className="text-destructive"> *</span>}
      </span>
      <span className="text-xs text-muted-foreground">{field.description}</span>

      {field.allowedValues ? (
        <select
          id={id}
          className={baseInputClass}
          aria-invalid={missing}
          required={field.designation === 'M'}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {field.allowedValues.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.value} — {opt.label}</option>
          ))}
        </select>
      ) : field.hasUnitsAttr ? (
        <div className="flex gap-2">
          <input
            id={id}
            className={baseInputClass}
            aria-invalid={missing}
            required={field.designation === 'M'}
            type={field.type === 'N' ? 'number' : 'text'}
            value={unitValue.value ?? ''}
            maxLength={field.maxLength}
            onChange={(e) =>
              onChange({ value: field.type === 'N' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value, units: unitValue.units })
            }
          />
          <input
            className={cn(baseInputClass, 'w-24')}
            type="text"
            aria-label={`${field.label} units`}
            placeholder="Units"
            value={unitValue.units ?? ''}
            onChange={(e) => onChange({ value: unitValue.value, units: e.target.value })}
          />
        </div>
      ) : field.type === 'D' ? (
        // The wire format is 8-char YYYYMMDD, but <input type="date"> only reads/writes
        // YYYY-MM-DD — converting at this boundary is required or a valid extracted date
        // renders blank (format mismatch) while validation still reports it as filled.
        <input
          id={id}
          className={baseInputClass}
          aria-invalid={missing}
          required={field.designation === 'M'}
          type="date"
          value={toDateInputValue(value)}
          onChange={(e) => onChange(fromDateInputValue(e.target.value))}
        />
      ) : (
        <input
          id={id}
          className={baseInputClass}
          aria-invalid={missing}
          required={field.designation === 'M'}
          type={field.type === 'N' ? 'number' : 'text'}
          value={(value as string | number | null) ?? ''}
          maxLength={field.maxLength}
          onChange={(e) => onChange(field.type === 'N' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
        />
      )}
    </label>
  )
}
