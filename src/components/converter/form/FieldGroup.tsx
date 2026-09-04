import type { FieldDef, FieldValue, FieldValues } from '@/types/converter/ftz214.types'
import { FieldInput } from './FieldInput'
import { isFieldEmpty } from '@/lib/converter/validation'

interface FieldGroupProps {
  title: string
  fields: FieldDef[]
  values: FieldValues
  onChange: (name: string, value: FieldValue) => void
  /** When set, each control gets id `${idPrefix}-${field.name}` for jump-to-field. */
  idPrefix?: string
}

export function FieldGroup({ title, fields, values, onChange, idPrefix }: FieldGroupProps) {
  return (
    <fieldset className="rounded-lg border bg-card p-4">
      {title && <legend className="px-2 text-sm font-semibold">{title}</legend>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            id={idPrefix ? `${idPrefix}-${field.name}` : undefined}
            value={values[field.name]}
            missing={field.designation === 'M' && isFieldEmpty(field, values[field.name])}
            onChange={(value) => onChange(field.name, value)}
          />
        ))}
      </div>
    </fieldset>
  )
}
