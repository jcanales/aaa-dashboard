export interface UnitValue {
  value: string | number | null;
  units: string | null;
}
export type FieldValue = string | number | null | UnitValue;
export type FieldValues = Record<string, FieldValue>;

export type LineData = FieldValues;

export interface BillOfLadingData {
  fields: FieldValues;
  lines: LineData[];
}

export interface Ftz214Data {
  applicationInformation: FieldValues;
  header: FieldValues;
  detail: { billsOfLading: BillOfLadingData[] };
}
