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
