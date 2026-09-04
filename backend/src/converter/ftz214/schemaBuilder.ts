import { z, type ZodTypeAny } from 'zod';
import { BILL_OF_LADING_FIELDS, LINE_FIELDS, type FieldDef } from './fields';

function zodTypeForField(field: FieldDef): ZodTypeAny {
  // z.coerce.number() tolerates Claude occasionally emitting a numeric value as a
  // JSON string (e.g. "100") — genuinely non-numeric strings still fail validation
  // (coercion produces NaN, which z.number() rejects), so this doesn't weaken the
  // "no invented values" guarantee, it just isn't strict about int-vs-string wire
  // formatting for a value that IS a number.
  const base: ZodTypeAny = field.type === 'N' ? z.coerce.number() : z.string();
  if (field.hasUnitsAttr) {
    return z
      .object({ value: base.nullable().optional(), units: z.string().nullable().optional() })
      .nullable()
      .optional();
  }
  return base.nullable().optional();
}

export function buildGroupSchema(fields: FieldDef[]) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const field of fields) shape[field.name] = zodTypeForField(field);
  return z.object(shape);
}

const billOfLadingShape = buildGroupSchema(BILL_OF_LADING_FIELDS);
const lineShape = buildGroupSchema(LINE_FIELDS);

export const DetailExtractionSchema = z.object({
  billOfLading: billOfLadingShape.extend({
    // preprocess (not .optional().default([])) so a missing key AND an explicit
    // `null` (a plausible Claude response for "no line items visible") both
    // normalize to [] — .default() alone only fires on `undefined`.
    Line: z.preprocess((v) => v ?? [], z.array(lineShape)),
  }),
});

export const LayoutAnalysisSchema = DetailExtractionSchema.extend({
  fieldMap: z.record(z.string().nullable()),
});

// z.infer on a dynamically-built z.object(Record<string, ZodTypeAny>) erases per-field
// typing (every field collapses to `any`, and `Line` infers as `unknown` despite the
// preprocess above always producing an array) — useless as the typed contract the
// service layer needs. Declared explicitly instead; zod is used here purely for runtime
// validation, not as the source of the TypeScript type.
export interface ExtractedUnitsValue {
  value?: number | null;
  units?: string | null;
}
export type ExtractedFieldValue = string | number | ExtractedUnitsValue | null | undefined;
export interface DetailExtractionResult {
  billOfLading: Record<string, ExtractedFieldValue> & {
    Line: Record<string, ExtractedFieldValue>[];
  };
}
