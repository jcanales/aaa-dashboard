export type DutyBucket = 'regular' | 'sec301' | 'sec232' | 'ieepa' | 'other99';

// Chapter-99 tariff prefixes (digits only) per bucket. Single source of truth
// for both the TS classifier and the SQL predicates. Verified against
// per-entry header bucket fields (USENTRY.DUTY_SEC_301/232/IEEPA) over
// 7,387 Q1-2026 entries — see task-3-report.md. 990303 (border/fentanyl
// IEEPA order) is intentionally excluded: the legacy headers do not count
// it in DUTY_SEC_IEEPA, so it stays in other99.
const SEC301_PREFIXES = ['990388', '990389', '990391'];
const SEC232_PREFIXES = ['990380', '990381', '990385', '990376', '990378', '990379', '990394'];
const IEEPA_PREFIXES  = ['990301', '990302'];

export function classifyTusa(tusa: string): DutyBucket {
  const code = tusa.replace(/\D/g, '');
  if (!code.startsWith('99')) return 'regular';
  if (SEC301_PREFIXES.some((p) => code.startsWith(p))) return 'sec301';
  if (SEC232_PREFIXES.some((p) => code.startsWith(p))) return 'sec232';
  if (IEEPA_PREFIXES.some((p) => code.startsWith(p)))  return 'ieepa';
  return 'other99';
}

function anyPrefix(col: string, prefixes: string[]): string {
  return '(' + prefixes.map((p) => `${col} LIKE '${p}%'`).join(' OR ') + ')';
}

/** SQL boolean predicates over a digits-only tariff-number column. */
export function bucketPredicates(col: string): Record<DutyBucket, string> {
  const sec301 = anyPrefix(col, SEC301_PREFIXES);
  const sec232 = anyPrefix(col, SEC232_PREFIXES);
  const ieepa  = anyPrefix(col, IEEPA_PREFIXES);
  return {
    regular: `${col} NOT LIKE '99%'`,
    sec301,
    sec232,
    ieepa,
    other99: `(${col} LIKE '99%' AND NOT ${sec301} AND NOT ${sec232} AND NOT ${ieepa})`,
  };
}

export interface HtsBreakdownRow {
  hts:          string;
  description:  string | null;
  lineCount:    number;
  enteredValue: number;
  regularDuty:  number;
  sec301:       number;
  sec232:       number;
  ieepa:        number;
  other:        number;
  totalDuty:    number;
}

/**
 * Per-entry duty buckets computed from actual line-level tariff numbers
 * (USLINE/USLINEB.TUSA), grouped by entry instead of by HTS — used by the
 * IEEPA report to replace the legacy USENTRY header fields
 * (DUTY_SEC_301/232/IEEPA, REMEDIATION_DUTY). Those header fields stopped
 * reliably tracking which program a duty dollar belongs to once reciprocal
 * tariffs were suspended: REMEDIATION_DUTY on post-suspension entries was
 * found to just re-sum DUTY_SEC_301 + DUTY_SEC_232, and DUTY_SEC_301 itself
 * absorbs at least one non-301 chapter-99 code (9903.05.xx) that this line-
 * level classifier correctly keeps out of both sec301 and ieepa (it lands in
 * other99). See docs/superpowers for the investigation this replaced.
 *
 * Produces CTEs `entries_scope` (one row per entry in scope, with header
 * ENTRY_VAL/ENTRY_DATE/etc.) and `per_entry` (bucketed duty sums per entry,
 * only for entries whose header DUTY > 0 — same "line duty never actually
 * assessed otherwise" rationale as perLineCte in htsBreakdown.ts). Callers
 * LEFT JOIN per_entry onto entries_scope so entries with no chapter-99 lines
 * (or header DUTY = 0) still appear with all-zero buckets.
 */
export function perEntryDutyCte(scopeConds: string[]): string {
  const where = ['e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo', ...scopeConds].join(' AND ');
  const p = bucketPredicates('tusa');
  return `
    WITH entries_scope AS (
      SELECT e.RECID, e.ENTRY_DATE, ISNULL(e.ENTRY_VAL,0) AS ENTRY_VAL, ISNULL(e.DUTY,0) AS HDR_DUTY,
             e.CUST_KEY, e.PORT_COD, e.ENTRY_FIL, e.ENTRY, e.ENTRY_DIG
      FROM   USENTRY e
      WHERE  ${where}
    ),
    lines AS (
      SELECT l.USENTRY_RECID AS entry_id,
             REPLACE(RTRIM(l.TUSA), '.', '') AS tusa,
             ISNULL(l.DUTY, 0) AS duty
      FROM   USLINE l
      JOIN   entries_scope es ON es.RECID = l.USENTRY_RECID
      WHERE  es.HDR_DUTY > 0
      UNION ALL
      SELECT l.USENTRY_RECID AS entry_id,
             REPLACE(RTRIM(b.TUSA), '.', '') AS tusa,
             ISNULL(b.DUTY, 0) AS duty
      FROM   USLINEB b
      JOIN   USLINE  l  ON l.RECID = b.USLINE_RECID
      JOIN   entries_scope es ON es.RECID = l.USENTRY_RECID
      WHERE  es.HDR_DUTY > 0
    ),
    per_entry AS (
      SELECT entry_id,
        SUM(CASE WHEN ${p.regular} THEN duty ELSE 0 END) AS regular_duty,
        SUM(CASE WHEN ${p.sec301}  THEN duty ELSE 0 END) AS sec301,
        SUM(CASE WHEN ${p.sec232}  THEN duty ELSE 0 END) AS sec232,
        SUM(CASE WHEN ${p.ieepa}   THEN duty ELSE 0 END) AS ieepa,
        SUM(CASE WHEN ${p.other99} THEN duty ELSE 0 END) AS other99
      FROM lines
      GROUP BY entry_id
    )
  `;
}

export function sumTotals(rows: HtsBreakdownRow[]) {
  return rows.reduce(
    (t, r) => ({
      enteredValue: t.enteredValue + r.enteredValue,
      regularDuty:  t.regularDuty + r.regularDuty,
      sec301:       t.sec301 + r.sec301,
      sec232:       t.sec232 + r.sec232,
      ieepa:        t.ieepa + r.ieepa,
      other:        t.other + r.other,
      totalDuty:    t.totalDuty + r.totalDuty,
    }),
    { enteredValue: 0, regularDuty: 0, sec301: 0, sec232: 0, ieepa: 0, other: 0, totalDuty: 0 },
  );
}
