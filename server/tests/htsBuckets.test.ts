import { describe, it, expect } from 'vitest';
import { classifyTusa, bucketPredicates, sumTotals, HtsBreakdownRow } from '../src/api/htsBuckets';

describe('classifyTusa', () => {
  const cases: [string, string][] = [
    ['9019102090', 'regular'],
    ['0101210010', 'regular'],
    ['99038801',   'sec301'],
    ['99038915',   'sec301'],
    ['99038001',   'sec232'],
    ['99038101',   'sec232'],
    ['99038501',   'sec232'],
    ['99030124',   'ieepa'],
    ['99030125',   'ieepa'],
    ['99029952',   'other99'],   // ch-99 but not a known remedy prefix
    ['9903.01.24', 'ieepa'],     // dotted input tolerated
  ];
  it.each(cases)('%s → %s', (tusa, bucket) => {
    expect(classifyTusa(tusa)).toBe(bucket);
  });
});

describe('bucketPredicates', () => {
  const p = bucketPredicates('tusa');
  it('regular is a NOT LIKE 99%', () => expect(p.regular).toBe("tusa NOT LIKE '99%'"));
  it('sec301 covers both prefixes', () => {
    expect(p.sec301).toContain("tusa LIKE '990388%'");
    expect(p.sec301).toContain("tusa LIKE '990389%'");
  });
  it('other99 excludes every named bucket', () => {
    expect(p.other99).toContain("tusa LIKE '99%'");
    expect(p.other99).toContain('NOT');
  });
});

describe('sumTotals reconciliation', () => {
  it('bucket sums equal totalDuty sum', () => {
    const rows: HtsBreakdownRow[] = [
      { hts: '9019102090', description: 'X', lineCount: 1, enteredValue: 201.56,
        regularDuty: 0, sec301: 0, sec232: 0, ieepa: 40.4, other: 0, totalDuty: 40.4 },
      { hts: '8518302000', description: 'Y', lineCount: 2, enteredValue: 1000,
        regularDuty: 10, sec301: 25, sec232: 0, ieepa: 0, other: 5, totalDuty: 40 },
    ];
    const t = sumTotals(rows);
    expect(t.totalDuty).toBeCloseTo(80.4);
    expect(t.regularDuty + t.sec301 + t.sec232 + t.ieepa + t.other).toBeCloseTo(t.totalDuty);
    expect(t.enteredValue).toBeCloseTo(1201.56);
  });
});
