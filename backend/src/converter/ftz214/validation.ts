import type { FieldDef } from './fields';
import { APPLICATION_INFO_FIELDS, HEADER_FIELDS, BILL_OF_LADING_FIELDS, LINE_FIELDS } from './fields';
import type { Ftz214Data } from './types';

function isEmptyScalar(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

export function isFieldEmpty(field: FieldDef, raw: unknown): boolean {
  if (field.hasUnitsAttr) {
    const uv = raw as { value?: unknown } | null | undefined;
    return isEmptyScalar(uv?.value);
  }
  return isEmptyScalar(raw);
}

export function getMissingMandatoryFields(fields: FieldDef[], data: Record<string, unknown>): string[] {
  return fields.filter((f) => f.designation === 'M' && isFieldEmpty(f, data[f.name])).map((f) => f.name);
}

function scalarValue(field: FieldDef, raw: unknown): unknown {
  if (field.hasUnitsAttr) return (raw as { value?: unknown } | null | undefined)?.value;
  return raw;
}

// maxLength/allowedValues are declared on every FieldDef but were previously enforced
// nowhere — validateFtz214Data only checked presence, so an over-length or out-of-vocabulary
// value extracted from a PDF would reach the generated XML as-is. Checked against every
// field regardless of designation (M/C/O): an optional field over length is still a
// compliance risk once it's in the filing. Skips empty values — that's getMissingMandatoryFields'
// job, and an absent value can't be "too long" or "not in the allowed list".
export function getInvalidFields(fields: FieldDef[], data: Record<string, unknown>): string[] {
  const invalid: string[] = [];
  for (const field of fields) {
    const raw = data[field.name];
    if (isFieldEmpty(field, raw)) continue;
    const value = scalarValue(field, raw);

    if (field.maxLength !== undefined) {
      const length = String(value).length;
      if (length > field.maxLength) {
        invalid.push(`${field.name} (exceeds max length ${field.maxLength}, got ${length})`);
        continue;
      }
    }

    if (field.allowedValues && field.allowedValues.length > 0) {
      const allowed = field.allowedValues.map((av) => av.value);
      if (!allowed.includes(String(value))) {
        invalid.push(`${field.name} (value "${String(value)}" not in allowed values: ${allowed.join('/')})`);
      }
    }
  }
  return invalid;
}

export function validateFtz214Data(data: Ftz214Data): string[] {
  const missing = [
    ...getMissingMandatoryFields(APPLICATION_INFO_FIELDS, data.applicationInformation).map((n) => `ApplicationInformation.${n}`),
    ...getMissingMandatoryFields(HEADER_FIELDS, data.header).map((n) => `Header.${n}`),
    ...getInvalidFields(APPLICATION_INFO_FIELDS, data.applicationInformation).map((n) => `ApplicationInformation.${n}`),
    ...getInvalidFields(HEADER_FIELDS, data.header).map((n) => `Header.${n}`),
  ];

  // An empty Detail section would otherwise validate clean (zero BOLs/lines means zero
  // mandatory-field checks run) and let a "successfully generated" FTZ 214 XML through
  // with no bill of lading or products — this is the one path (extraction returning zero
  // line items) that isn't stopped by the PATCH route's zod validation, since creation
  // persists it directly without going through that route at all.
  if (data.detail.billsOfLading.length === 0) {
    missing.push('Detail.BillsOfLading');
  }

  data.detail.billsOfLading.forEach((bol, i) => {
    missing.push(...getMissingMandatoryFields(BILL_OF_LADING_FIELDS, bol.fields).map((n) => `Detail.BillsOfLading[${i}].${n}`));
    missing.push(...getInvalidFields(BILL_OF_LADING_FIELDS, bol.fields).map((n) => `Detail.BillsOfLading[${i}].${n}`));
    if (bol.lines.length === 0) {
      missing.push(`Detail.BillsOfLading[${i}].Line`);
    }
    bol.lines.forEach((line, j) => {
      missing.push(...getMissingMandatoryFields(LINE_FIELDS, line).map((n) => `Detail.BillsOfLading[${i}].Line[${j}].${n}`));
      missing.push(...getInvalidFields(LINE_FIELDS, line).map((n) => `Detail.BillsOfLading[${i}].Line[${j}].${n}`));
    });
  });

  return missing;
}
