// Reference tables transcribed from CBP Form 7501 (02/26)'s own printed
// instructions (Blocks 2 and 9) — not guessed. Used to show a human-readable
// label next to the raw two-digit codes already stored on USENTRY.
export const MOT_LABELS: Record<string, string> = {
  '10': 'Vessel, non-container',
  '11': 'Vessel, container',
  '12': 'Border, waterborne',
  '20': 'Rail, non-container',
  '21': 'Rail, container',
  '30': 'Truck, non-container',
  '31': 'Truck, container',
  '32': 'Auto',
  '33': 'Pedestrian',
  '34': 'Road, other',
  '40': 'Air, non-container',
  '41': 'Air, container',
  '50': 'Mail',
  '60': 'Passenger, hand-carried',
  '70': 'Fixed transport installation',
}

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  '01': 'Consumption — Free and Dutiable',
  '02': 'Consumption — Quota/Visa',
  '03': 'Consumption — AD/CVD',
  '04': 'Consumption — Appraisement',
  '05': 'Consumption — Vessel Repair',
  '06': 'Consumption — FTZ Consumption',
  '07': 'Consumption — Quota/Visa + AD/CVD',
  '08': 'Consumption — Duty Deferral',
  '11': 'Informal — Free and Dutiable',
  '12': 'Informal — Quota (other than textiles)',
  '21': 'Warehouse',
  '22': 'Re-Warehouse',
  '23': 'Warehouse — Temporary Importation Bond',
  '24': 'Warehouse — Trade Fair',
  '25': 'Warehouse — Permanent Exhibition',
  '26': 'Warehouse — FTZ Admission',
  '31': 'Warehouse Withdrawal — For Consumption',
  '32': 'Warehouse Withdrawal — Quota/Visa',
  '34': 'Warehouse Withdrawal — AD/CVD',
  '38': 'Warehouse Withdrawal — Quota/Visa + AD/CVD',
  '51': 'Government — DCMAO NY (Military)',
  '52': 'Government — Other Federal Agency',
  '61': 'Transportation — Immediate Transportation',
  '62': 'Transportation — Transportation and Exportation',
  '63': 'Transportation — Immediate Exportation',
}

export function motLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return MOT_LABELS[code] ?? null
}

export function entryTypeLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return ENTRY_TYPE_LABELS[code] ?? null
}
