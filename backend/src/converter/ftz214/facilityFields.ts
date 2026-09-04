// The Application-Information and Header fields that are constant for an FTZ
// facility (same on every 214 admission for that zone). Everything else in the
// Header is shipment-specific and stays on the review form.
// CustomerName ("Name of Importer Submitting the File") is per-importer — filled
// from the invoice / RB Systems lookup, not a facility constant.
export const FACILITY_APPLICATION_FIELDS = ['SoftwareProvider', 'Module', 'Version'] as const;

// `Customer` (Customer Key) and `CompanyKey` are NOT here — they are per-importer
// and filled from the RB Systems MST lookup at extraction time.
export const FACILITY_HEADER_FIELDS = [
  'FtzNumber',
  'ZoneId',
  'ZoneAddress',
  'ZoneCity',
  'ZoneWhse',
  'Port',
  'FirmsCode',
  'ApplicantName',
  'ZoneOperatorId',
] as const;

const APP_SET = new Set<string>(FACILITY_APPLICATION_FIELDS);
const HEADER_SET = new Set<string>(FACILITY_HEADER_FIELDS);

/** Keep only the recognised facility keys from an arbitrary object. */
export function pickFacilityApplication(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([k]) => APP_SET.has(k)));
}
export function pickFacilityHeader(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([k]) => HEADER_SET.has(k)));
}
