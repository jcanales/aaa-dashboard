# HTS Duty Breakdown Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the Dashboard's "Total Duties Paid" KPI opens `/duties/hts`, a page breaking down duties by commodity HTS code (with Sec 301/232/IEEPA surcharges folded in) plus four comparison charts, reconciling exactly with the KPI figure.

**Architecture:** Two new SQL-aggregation endpoints on the existing Express server union `USLINE` + `USLINEB` per entry line and classify Chapter-99 tariff numbers by prefix. A new shared `entryScope.ts` module centralizes the per-client scoping helpers (also migrating `entries.ts` off its private copies). A new React page renders KPI tiles, charts (Recharts), and a sortable/expandable table.

**Tech Stack:** Express + `mssql` (parameterized), vitest, React 18 + TypeScript + Recharts + zustand + Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-08-hts-duty-breakdown-design.md`

## Global Constraints

- All SQL must be parameterized (`request.input(...)`); the only string interpolation allowed is SQL fragments built from the hardcoded digit-only prefix constants in `htsBuckets.ts` and condition arrays built by `entryScope.ts`.
- Every `/api/entries/*` route enforces coKey scoping: `admin`/`broker` roles see everything; other roles only their `clientCoKeys`.
- Route URL contract: `GET /api/entries/hts-breakdown` and `GET /api/entries/hts-breakdown/entries`.
- Frontend follows existing page patterns (IeepaPage/DashboardPage): local `KpiCard`, `fmtUSD`, filter bar with `ClientSelector` + `DateRangeSelector` + `SearchButton`, refetch on `searchTrigger`/client change.
- TypeScript strict; `npx tsc --noEmit` must pass in both root and `server/` after every task.
- Server dev: `npm run dev` in `server/` (port 3001). Frontend: `npm run dev` in root (port 5175).
- Known fixture: entry RECID **341831** (entry no. ends 1422024, 2026-02-24): total duty $40.40 = $20.20 IEEPA on `USLINE` (9903.01.24) + $20.20 IEEPA on `USLINEB` (9903.01.25), commodity HTS 9019102090 with value $201.56, regular duty $0.

---

### Task 0: Initialize git repository

**Files:**
- Create: `.gitignore`

**Interfaces:**
- Produces: a git repo so later tasks can commit.

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
dist/
.env
.env.local
.DS_Store
datasync/airbyte-data/
```

- [ ] **Step 2: Init and make the baseline commit**

```bash
cd /Users/jonathanc/Documents/Projects/sinergya-projects/clients/jdgroup/duties-dashboard
git init
git add -A
git commit -m "chore: baseline commit of duties-dashboard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: commit succeeds; `git status` clean. Verify `.env` files are NOT in `git ls-files`.

---

### Task 1: Shared scope module `entryScope.ts` + migrate `entries.ts`

**Files:**
- Create: `server/src/api/entryScope.ts`
- Create: `server/tests/entryScope.test.ts`
- Modify: `server/src/api/routes/entries.ts` (delete its local copies of `getAllowedCoKeys`, `assertCoKeyAllowed`, `parseDate`, `defaultRange`, `priorPeriod`, `appendCoKeyConditions`; import from `../entryScope`)

**Interfaces:**
- Produces (exact exports of `server/src/api/entryScope.ts`):
  - `getAllowedCoKeys(userId: string, role: string): Promise<string[] | null>` — `null` = unrestricted (admin/broker)
  - `assertCoKeyAllowed(coKey: string, allowed: string[] | null, res: Response): boolean`
  - `parseDate(s: string | undefined, fallback: Date): Date`
  - `defaultRange(): { from: Date; to: Date }`
  - `priorPeriod(from: Date, to: Date): { priorFrom: Date; priorTo: Date }`
  - `appendCoKeyConditions(opts: { r: sql.Request; coKey?: string; allowed: string[] | null; column?: string }): string[]` — `column` defaults to `'e.CUST_KEY'`

- [ ] **Step 1: Write failing tests**

`server/tests/entryScope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDate, defaultRange, priorPeriod } from '../src/api/entryScope';

describe('parseDate', () => {
  const fb = new Date('2026-01-01');
  it('returns fallback for undefined', () => expect(parseDate(undefined, fb)).toBe(fb));
  it('returns fallback for garbage', () => expect(parseDate('not-a-date', fb)).toBe(fb));
  it('parses a valid ISO date', () =>
    expect(parseDate('2026-03-15', fb).toISOString().slice(0, 10)).toBe('2026-03-15'));
});

describe('defaultRange', () => {
  it('starts on the 1st at midnight, two months back', () => {
    const { from, to } = defaultRange();
    expect(from.getDate()).toBe(1);
    expect(from.getHours()).toBe(0);
    expect(from.getTime()).toBeLessThan(to.getTime());
  });
});

describe('priorPeriod', () => {
  it('returns an equal-length window ending 1ms before from', () => {
    const from = new Date('2026-06-01T00:00:00Z');
    const to   = new Date('2026-07-01T00:00:00Z');
    const { priorFrom, priorTo } = priorPeriod(from, to);
    expect(priorTo.getTime()).toBe(from.getTime() - 1);
    expect(priorTo.getTime() - priorFrom.getTime()).toBe(to.getTime() - from.getTime());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/entryScope.test.ts`
Expected: FAIL — `Cannot find module '../src/api/entryScope'`

- [ ] **Step 3: Create `server/src/api/entryScope.ts`**

Move the implementations verbatim from `server/src/api/routes/entries.ts:11-69` (they are the canonical copies), with `appendCoKeyConditions` gaining the `column` option:

```ts
import sql from 'mssql';
import { Response } from 'express';
import { prisma } from '../db';

/** null = unrestricted (admin/broker). Empty array = no access. */
export async function getAllowedCoKeys(userId: string, role: string): Promise<string[] | null> {
  if (role === 'admin' || role === 'broker') return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  return (user.clientCoKeys as string[]) ?? [];
}

export function assertCoKeyAllowed(coKey: string, allowed: string[] | null, res: Response): boolean {
  if (allowed === null) return true;
  if (allowed.includes(coKey)) return true;
  res.status(403).json({ error: 'Access denied for this client account' });
  return false;
}

/** Parse a date string to a Date, defaulting to `fallback` if missing/invalid. */
export function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

/** Default date range: start of 3 months ago → today. */
export function defaultRange(): { from: Date; to: Date } {
  const to   = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 2);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** Compute prior period of the same length immediately before dateFrom. */
export function priorPeriod(from: Date, to: Date): { priorFrom: Date; priorTo: Date } {
  const durationMs  = to.getTime() - from.getTime();
  const priorTo     = new Date(from.getTime() - 1);
  const priorFrom   = new Date(priorTo.getTime() - durationMs);
  return { priorFrom, priorTo };
}

export function appendCoKeyConditions({ r, coKey, allowed, column = 'e.CUST_KEY' }: {
  r:       sql.Request;
  coKey?:  string;
  allowed: string[] | null;
  column?: string;
}): string[] {
  const conditions: string[] = [];
  if (coKey) {
    r.input('coKey', sql.VarChar(6), coKey);
    conditions.push(`${column} = @coKey`);
  } else if (allowed !== null && allowed.length > 0) {
    const pn = allowed.map((_, i) => `@ck${i}`);
    allowed.forEach((k, i) => r.input(`ck${i}`, sql.VarChar(6), k));
    conditions.push(`${column} IN (${pn.join(',')})`);
  }
  return conditions;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/entryScope.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Migrate `entries.ts`**

In `server/src/api/routes/entries.ts`: delete the local definitions of `getAllowedCoKeys`, `assertCoKeyAllowed`, `parseDate`, `defaultRange`, `priorPeriod` (lines 11-48) and `appendCoKeyConditions` + its `ScopeParams` interface (lines 50-69). Add:

```ts
import {
  getAllowedCoKeys, assertCoKeyAllowed, parseDate,
  defaultRange, priorPeriod, appendCoKeyConditions,
} from '../entryScope';
```

All existing call sites (`appendCoKeyConditions({ r, coKey, allowed })` etc.) keep working unchanged because signatures are identical (the new `column` option defaults to the value entries.ts used).

- [ ] **Step 6: Verify full suite + typecheck**

Run: `cd server && npx vitest run && npx tsc --noEmit`
Expected: 45 tests pass (40 existing + 5 new), tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/src/api/entryScope.ts server/tests/entryScope.test.ts server/src/api/routes/entries.ts
git commit -m "refactor: extract shared entry scoping helpers into entryScope module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Chapter-99 bucket classification `htsBuckets.ts`

**Files:**
- Create: `server/src/api/htsBuckets.ts`
- Create: `server/tests/htsBuckets.test.ts`

**Interfaces:**
- Produces (exact exports of `server/src/api/htsBuckets.ts`):
  - `type DutyBucket = 'regular' | 'sec301' | 'sec232' | 'ieepa' | 'other99'`
  - `classifyTusa(tusa: string): DutyBucket`
  - `bucketPredicates(col: string): Record<DutyBucket, string>` — SQL boolean predicates over a digits-only tariff column
  - `interface HtsBreakdownRow { hts: string; description: string | null; lineCount: number; enteredValue: number; regularDuty: number; sec301: number; sec232: number; ieepa: number; other: number; totalDuty: number }`
  - `sumTotals(rows: HtsBreakdownRow[]): { enteredValue: number; regularDuty: number; sec301: number; sec232: number; ieepa: number; other: number; totalDuty: number }`

- [ ] **Step 1: Write failing tests**

`server/tests/htsBuckets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/htsBuckets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/api/htsBuckets.ts`**

```ts
export type DutyBucket = 'regular' | 'sec301' | 'sec232' | 'ieepa' | 'other99';

// Chapter-99 tariff prefixes (digits only) per bucket. Single source of truth
// for both the TS classifier and the SQL predicates.
const SEC301_PREFIXES = ['990388', '990389'];
const SEC232_PREFIXES = ['990380', '990381', '990385'];
const IEEPA_PREFIXES  = ['990301'];

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/htsBuckets.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/api/htsBuckets.ts server/tests/htsBuckets.test.ts
git commit -m "feat: chapter-99 duty bucket classification helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Breakdown endpoint `GET /api/entries/hts-breakdown`

**Files:**
- Create: `server/src/api/routes/htsBreakdown.ts`
- Modify: `server/src/api/server.ts` (import + mount)

**Interfaces:**
- Consumes: `entryScope.ts` exports (Task 1), `htsBuckets.ts` exports (Task 2).
- Produces: JSON response
  ```ts
  {
    current: HtsBreakdownRow[],  // sorted by totalDuty desc
    prior:   HtsBreakdownRow[],
    totals:  { current: ReturnType<typeof sumTotals>, prior: ReturnType<typeof sumTotals> },
    dateFrom: string, dateTo: string, priorFrom: string, priorTo: string  // ISO yyyy-mm-dd
  }
  ```
  Also produces the module-internal `queryBreakdownRows(pool, from, to, coKey, allowed)` used again by Task 4's file (same file, shared function).

- [ ] **Step 1: Create `server/src/api/routes/htsBreakdown.ts`**

```ts
import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { getMssqlPool } from '../../db/mssql';
import {
  getAllowedCoKeys, assertCoKeyAllowed, parseDate, defaultRange,
  priorPeriod, appendCoKeyConditions,
} from '../entryScope';
import { bucketPredicates, sumTotals, HtsBreakdownRow } from '../htsBuckets';
import { logger } from '../../utils/logger';

const router = Router();

const p = bucketPredicates('tusa');

/**
 * CTE producing one row per tariff number per entry line in scope:
 * the line's own TUSA (USLINE) plus its additional tariff numbers (USLINEB),
 * normalized to digits (RTRIM + dots stripped), then re-grouped per line
 * with the chapter-99 duties bucketed and the commodity HTS extracted.
 */
function perLineCte(scopeConds: string[]): string {
  const where = ['e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo', ...scopeConds].join(' AND ');
  return `
    WITH lines AS (
      SELECT l.RECID AS line_id,
             REPLACE(RTRIM(l.TUSA), '.', '') AS tusa,
             ISNULL(l.VALUE, 0) AS val,
             ISNULL(l.DUTY,  0) AS duty,
             l.DESC1 AS descr
      FROM   USLINE l
      JOIN   USENTRY e ON e.RECID = l.USENTRY_RECID
      WHERE  ${where}
      UNION ALL
      SELECT b.USLINE_RECID,
             REPLACE(RTRIM(b.TUSA), '.', ''),
             ISNULL(b.VALUE, 0),
             ISNULL(b.DUTY,  0),
             b.DESC1
      FROM   USLINEB b
      JOIN   USLINE  l ON l.RECID = b.USLINE_RECID
      JOIN   USENTRY e ON e.RECID = l.USENTRY_RECID
      WHERE  ${where}
    ),
    per_line AS (
      SELECT line_id,
        MAX(CASE WHEN ${p.regular} THEN tusa  END)          AS hts,
        MAX(CASE WHEN ${p.regular} THEN descr END)          AS descr,
        SUM(CASE WHEN ${p.regular} THEN val  ELSE 0 END)    AS entered_value,
        SUM(CASE WHEN ${p.regular} THEN duty ELSE 0 END)    AS regular_duty,
        SUM(CASE WHEN ${p.sec301}  THEN duty ELSE 0 END)    AS sec301,
        SUM(CASE WHEN ${p.sec232}  THEN duty ELSE 0 END)    AS sec232,
        SUM(CASE WHEN ${p.ieepa}   THEN duty ELSE 0 END)    AS ieepa,
        SUM(CASE WHEN ${p.other99} THEN duty ELSE 0 END)    AS other99
      FROM lines
      GROUP BY line_id
    )
  `;
}

interface BreakdownRecord {
  HTS: string; DESCR: string | null; LINE_COUNT: number; ENTERED_VALUE: number;
  REGULAR_DUTY: number; SEC301: number; SEC232: number; IEEPA: number; OTHER99: number;
}

function mapRow(r: BreakdownRecord): HtsBreakdownRow {
  const regularDuty = Number(r.REGULAR_DUTY);
  const sec301 = Number(r.SEC301);
  const sec232 = Number(r.SEC232);
  const ieepa  = Number(r.IEEPA);
  const other  = Number(r.OTHER99);
  return {
    hts:          r.HTS,
    description:  r.DESCR?.trim() || null,
    lineCount:    Number(r.LINE_COUNT),
    enteredValue: Number(r.ENTERED_VALUE),
    regularDuty, sec301, sec232, ieepa, other,
    totalDuty:    regularDuty + sec301 + sec232 + ieepa + other,
  };
}

async function queryBreakdownRows(
  pool: sql.ConnectionPool,
  from: Date,
  to: Date,
  coKey: string | undefined,
  allowed: string[] | null,
): Promise<HtsBreakdownRow[]> {
  const r = pool.request();
  r.input('dateFrom', sql.DateTime, from);
  r.input('dateTo',   sql.DateTime, to);
  const scopeConds = appendCoKeyConditions({ r, coKey, allowed });

  const result = await r.query<BreakdownRecord>(`
    ${perLineCte(scopeConds)}
    SELECT ISNULL(hts, 'UNCLASSIFIED') AS HTS,
           MAX(descr)                  AS DESCR,
           COUNT(*)                    AS LINE_COUNT,
           SUM(entered_value)          AS ENTERED_VALUE,
           SUM(regular_duty)           AS REGULAR_DUTY,
           SUM(sec301)                 AS SEC301,
           SUM(sec232)                 AS SEC232,
           SUM(ieepa)                  AS IEEPA,
           SUM(other99)                AS OTHER99
    FROM   per_line
    GROUP  BY ISNULL(hts, 'UNCLASSIFIED')
    ORDER  BY SUM(regular_duty + sec301 + sec232 + ieepa + other99) DESC
  `);

  return result.recordset.map(mapRow);
}

// ── GET /api/entries/hts-breakdown?coKey=&dateFrom=&dateTo= ──────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coKey, dateFrom: dfStr, dateTo: dtStr } = req.query as {
      coKey?: string; dateFrom?: string; dateTo?: string;
    };
    const allowed = await getAllowedCoKeys(req.user!.userId, req.user!.role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) {
      const empty = sumTotals([]);
      res.json({ current: [], prior: [], totals: { current: empty, prior: empty },
                 dateFrom: '', dateTo: '', priorFrom: '', priorTo: '' });
      return;
    }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);
    const { priorFrom, priorTo } = priorPeriod(from, to);

    const pool = await getMssqlPool();
    const [current, prior] = await Promise.all([
      queryBreakdownRows(pool, from, to, coKey, allowed),
      queryBreakdownRows(pool, priorFrom, priorTo, coKey, allowed),
    ]);

    res.json({
      current,
      prior,
      totals: { current: sumTotals(current), prior: sumTotals(prior) },
      dateFrom:  from.toISOString().slice(0, 10),
      dateTo:    to.toISOString().slice(0, 10),
      priorFrom: priorFrom.toISOString().slice(0, 10),
      priorTo:   priorTo.toISOString().slice(0, 10),
    });
  } catch (err) {
    logger.error('GET /entries/hts-breakdown failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch HTS breakdown' });
  }
});

export default router;
export { queryBreakdownRows, perLineCte };
```

- [ ] **Step 2: Mount in `server/src/api/server.ts`**

After the existing imports add:

```ts
import htsBreakdownRouter from './routes/htsBreakdown';
```

In the routes block, add **before** `app.use('/api/entries', entriesRouter);`:

```ts
app.use('/api/entries/hts-breakdown', htsBreakdownRouter);
```

(The entries router has no `/hts-breakdown` route, so ordering is not load-bearing, but mounting the more specific path first documents intent.)

- [ ] **Step 3: Typecheck + full test suite**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: exit 0, all tests pass.

- [ ] **Step 4: Manual verification against the fixture entry**

With the server running (`npm run dev` in `server/`), obtain a token and hit the endpoint scoped to the fixture entry's date window:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<dev user email>","password":"<dev password>"}' | jq -r .token)

curl -s "http://localhost:3001/api/entries/hts-breakdown?dateFrom=2026-02-24&dateTo=2026-02-24" \
  -H "Authorization: Bearer $TOKEN" | jq '.totals.current, .current[] | select(.hts=="9019102090")'
```

Expected: the `9019102090` row shows `ieepa: 40.4`, `regularDuty: 0`, `enteredValue: 201.56`, `totalDuty: 40.4` (plus whatever other entries share that date in `totals`).

Also sanity-check reconciliation for a wide range:

```bash
curl -s "http://localhost:3001/api/entries/hts-breakdown?dateFrom=2026-01-01&dateTo=2026-03-31" \
  -H "Authorization: Bearer $TOKEN" | jq '.totals.current.totalDuty'
curl -s "http://localhost:3001/api/entries/kpis?dateFrom=2026-01-01&dateTo=2026-03-31" \
  -H "Authorization: Bearer $TOKEN" | jq '.dutyInRange + .sec301InRange + .sec232InRange + .ieepaInRange'
```

Expected: the two numbers are close; investigate before proceeding if they diverge by more than ~1% (header vs line-level bookkeeping differences must be understood, not ignored — document the finding in the PR/commit message).

- [ ] **Step 5: Commit**

```bash
git add server/src/api/routes/htsBreakdown.ts server/src/api/server.ts
git commit -m "feat: HTS duty breakdown endpoint with ch-99 bucket attribution

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Entries-per-HTS endpoint `GET /api/entries/hts-breakdown/entries`

**Files:**
- Modify: `server/src/api/routes/htsBreakdown.ts`

**Interfaces:**
- Consumes: `perLineCte` from Task 3 (same file).
- Produces: JSON array (top 50 by totalDuty):
  ```ts
  { recid: string, entryNo: string, entryDate: string, port: string,
    custKey: string, custName: string | null, enteredValue: number,
    regularDuty: number, sec301: number, sec232: number, ieepa: number,
    other: number, totalDuty: number }[]
  ```

- [ ] **Step 1: Add the route to `htsBreakdown.ts`** (before `export default router;`)

```ts
// ── GET /api/entries/hts-breakdown/entries?hts=&coKey=&dateFrom=&dateTo= ─────
router.get('/entries', async (req: Request, res: Response): Promise<void> => {
  try {
    const { hts, coKey, dateFrom: dfStr, dateTo: dtStr } = req.query as {
      hts?: string; coKey?: string; dateFrom?: string; dateTo?: string;
    };

    if (!hts || !(/^\d{4,10}$/.test(hts) || hts === 'UNCLASSIFIED')) {
      res.status(400).json({ error: 'hts must be 4-10 digits or UNCLASSIFIED' });
      return;
    }

    const allowed = await getAllowedCoKeys(req.user!.userId, req.user!.role);
    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) { res.json([]); return; }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);
    r.input('hts',      sql.VarChar(12), hts);
    const scopeConds = appendCoKeyConditions({ r, coKey, allowed });

    const result = await r.query<{
      RECID: string; ENT_NO: string; ENTRY_DATE: Date; PORT_COD: string;
      CUST_KEY: string; CO_NAME: string | null; ENTERED_VALUE: number;
      REGULAR_DUTY: number; SEC301: number; SEC232: number; IEEPA: number; OTHER99: number;
    }>(`
      ${perLineCte(scopeConds)}
      SELECT TOP 50
        e.RECID,
        RTRIM(e.ENTRY_FIL)+'-'+RTRIM(e.ENTRY)+RTRIM(e.ENTRY_DIG) AS ENT_NO,
        e.ENTRY_DATE, e.PORT_COD, e.CUST_KEY, m.CO_NAME,
        SUM(pl.entered_value) AS ENTERED_VALUE,
        SUM(pl.regular_duty)  AS REGULAR_DUTY,
        SUM(pl.sec301)        AS SEC301,
        SUM(pl.sec232)        AS SEC232,
        SUM(pl.ieepa)         AS IEEPA,
        SUM(pl.other99)       AS OTHER99
      FROM  per_line pl
      JOIN  USLINE  l ON l.RECID = pl.line_id
      JOIN  USENTRY e ON e.RECID = l.USENTRY_RECID
      LEFT  JOIN MST m ON m.CO_KEY = e.CUST_KEY
      WHERE ISNULL(pl.hts, 'UNCLASSIFIED') = @hts
      GROUP BY e.RECID, e.ENTRY_FIL, e.ENTRY, e.ENTRY_DIG,
               e.ENTRY_DATE, e.PORT_COD, e.CUST_KEY, m.CO_NAME
      ORDER BY SUM(pl.regular_duty + pl.sec301 + pl.sec232 + pl.ieepa + pl.other99) DESC
    `);

    res.json(result.recordset.map((row) => {
      const regularDuty = Number(row.REGULAR_DUTY);
      const sec301 = Number(row.SEC301);
      const sec232 = Number(row.SEC232);
      const ieepa  = Number(row.IEEPA);
      const other  = Number(row.OTHER99);
      return {
        recid:        String(row.RECID),
        entryNo:      row.ENT_NO.trim(),
        entryDate:    row.ENTRY_DATE,
        port:         row.PORT_COD?.trim() ?? '',
        custKey:      row.CUST_KEY?.trim() ?? '',
        custName:     row.CO_NAME?.trim() ?? null,
        enteredValue: Number(row.ENTERED_VALUE),
        regularDuty, sec301, sec232, ieepa, other,
        totalDuty:    regularDuty + sec301 + sec232 + ieepa + other,
      };
    }));
  } catch (err) {
    logger.error('GET /entries/hts-breakdown/entries failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch entries for HTS' });
  }
});
```

- [ ] **Step 2: Typecheck + tests**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: exit 0, all pass.

- [ ] **Step 3: Manual verification**

```bash
curl -s "http://localhost:3001/api/entries/hts-breakdown/entries?hts=9019102090&dateFrom=2026-02-24&dateTo=2026-02-24" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0]'
```

Expected: one row, `entryNo` ending `1422024`, `ieepa: 40.4`, `totalDuty: 40.4`.
Also verify validation: `curl -s "...entries?hts=DROP%20TABLE" -H ...` → `400`.

- [ ] **Step 4: Commit**

```bash
git add server/src/api/routes/htsBreakdown.ts
git commit -m "feat: per-HTS entry list endpoint for duty breakdown drill-down

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend API layer

**Files:**
- Modify: `src/api/entriesApi.ts` (append at end of file)

**Interfaces:**
- Consumes: existing private `get<T>(path, params)` helper in the same file.
- Produces (used by Task 6/7):
  - `interface HtsBreakdownRow` (same shape as server), `interface HtsBreakdownTotals`, `interface HtsBreakdownResponse`, `interface HtsEntryRow`
  - `fetchHtsBreakdown(params: { coKey?: string; dateFrom?: string; dateTo?: string }): Promise<HtsBreakdownResponse>`
  - `fetchHtsEntries(params: { hts: string; coKey?: string; dateFrom?: string; dateTo?: string }): Promise<HtsEntryRow[]>`

- [ ] **Step 1: Append to `src/api/entriesApi.ts`**

```ts
// ── HTS duty breakdown ─────────────────────────────────────────────────────────

export interface HtsBreakdownRow {
  hts:          string
  description:  string | null
  lineCount:    number
  enteredValue: number
  regularDuty:  number
  sec301:       number
  sec232:       number
  ieepa:        number
  other:        number
  totalDuty:    number
}

export interface HtsBreakdownTotals {
  enteredValue: number
  regularDuty:  number
  sec301:       number
  sec232:       number
  ieepa:        number
  other:        number
  totalDuty:    number
}

export interface HtsBreakdownResponse {
  current:   HtsBreakdownRow[]
  prior:     HtsBreakdownRow[]
  totals:    { current: HtsBreakdownTotals; prior: HtsBreakdownTotals }
  dateFrom:  string
  dateTo:    string
  priorFrom: string
  priorTo:   string
}

export interface HtsEntryRow {
  recid:        string
  entryNo:      string
  entryDate:    string
  port:         string
  custKey:      string
  custName:     string | null
  enteredValue: number
  regularDuty:  number
  sec301:       number
  sec232:       number
  ieepa:        number
  other:        number
  totalDuty:    number
}

export async function fetchHtsBreakdown(params: {
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
}): Promise<HtsBreakdownResponse> {
  return get<HtsBreakdownResponse>('/entries/hts-breakdown', params as Record<string, string | undefined>)
}

export async function fetchHtsEntries(params: {
  hts:       string
  coKey?:    string
  dateFrom?: string
  dateTo?:   string
}): Promise<HtsEntryRow[]> {
  return get<HtsEntryRow[]>('/entries/hts-breakdown/entries', params as Record<string, string | undefined>)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` (project root)
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/api/entriesApi.ts
git commit -m "feat: frontend API client for HTS duty breakdown endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Breakdown page (tiles + table), route, sidebar, clickable KPI

**Files:**
- Create: `src/pages/DutiesBreakdownPage.tsx`
- Modify: `src/App.tsx` (import + route)
- Modify: `src/components/layout/Sidebar.tsx` (`operationsItems` array, line ~43)
- Modify: `src/pages/DashboardPage.tsx` (`KpiCard` gains optional `onClick`; Total Duties Paid card uses it)

**Interfaces:**
- Consumes: `fetchHtsBreakdown`, `fetchHtsEntries`, `fetchIeepaMonthly` and their types from `@/api/entriesApi`; `useClientStore`, `useDateStore` (existing).
- Produces: exported `DutiesBreakdownPage` component; route `/duties/hts`. Charts are added in Task 7 into the two placeholder grid sections created here.

- [ ] **Step 1: Create `src/pages/DutiesBreakdownPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, DollarSign, Landmark, Percent, ShieldAlert, Layers } from 'lucide-react'
import { ClientSelector } from '@/components/ui/ClientSelector'
import { DateRangeSelector } from '@/components/ui/DateRangeSelector'
import { SearchButton } from '@/components/ui/SearchButton'
import { useClients } from '@/hooks/useClients'
import { useClientStore } from '@/store/clientStore'
import { useDateStore } from '@/store/dateStore'
import {
  fetchHtsBreakdown, fetchHtsEntries, fetchIeepaMonthly,
  type HtsBreakdownResponse, type HtsBreakdownRow, type HtsEntryRow, type IeepaMonthRow,
} from '@/api/entriesApi'

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export function formatHts(code: string): string {
  if (!/^\d{6,10}$/.test(code)) return code
  const parts = [code.slice(0, 4), code.slice(4, 6), code.slice(6)].filter(Boolean)
  return parts.join('.')
}

function KpiCard({ title, value, sub, icon }: {
  title: string; value: string; sub?: string; icon: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium">{title}</p>
        <span className="text-teal-600">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

type SortKey = 'hts' | 'enteredValue' | 'regularDuty' | 'sec301' | 'sec232' | 'ieepa' | 'totalDuty'

export function DutiesBreakdownPage() {
  useClients()
  const { selectedClient } = useClientStore()
  const { dateFrom, dateTo, searchTrigger } = useDateStore()

  const [data, setData] = useState<HtsBreakdownResponse | null>(null)
  const [monthly, setMonthly] = useState<IeepaMonthRow[]>([])
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('totalDuty')
  const [sortDesc, setSortDesc] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, HtsEntryRow[] | 'loading'>>({})

  const params = { coKey: selectedClient?.coKey, dateFrom, dateTo }

  useEffect(() => {
    setLoading(true)
    setExpanded({})
    Promise.all([fetchHtsBreakdown(params), fetchIeepaMonthly(params)])
      .then(([b, m]) => { setData(b); setMonthly(m) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [searchTrigger, selectedClient?.coKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  function toggleExpand(hts: string) {
    if (expanded[hts]) {
      setExpanded((e) => { const { [hts]: _, ...rest } = e; return rest })
      return
    }
    setExpanded((e) => ({ ...e, [hts]: 'loading' }))
    fetchHtsEntries({ hts, ...params })
      .then((rows) => setExpanded((e) => ({ ...e, [hts]: rows })))
      .catch(() => setExpanded((e) => { const { [hts]: _, ...rest } = e; return rest }))
  }

  const rows = [...(data?.current ?? [])].sort((a, b) => {
    const va = a[sortKey]; const vb = b[sortKey]
    const cmp = typeof va === 'string' ? String(va).localeCompare(String(vb)) : Number(va) - Number(vb)
    return sortDesc ? -cmp : cmp
  })
  const t = data?.totals.current

  const SortHeader = ({ k, label, right = true }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 ${right ? 'text-right' : 'text-left'}`}
    >
      {label}{sortKey === k ? (sortDesc ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <ClientSelector />
        <DateRangeSelector />
        <SearchButton />
        {loading && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="h-3.5 w-3.5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
            Loading…
          </span>
        )}
        <div className="ml-auto">
          <h1 className="text-sm font-semibold text-slate-700">Duties Paid — HTS Breakdown</h1>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="Total Duties"   value={fmtUSD(t?.totalDuty ?? 0)}
                 sub={data ? `vs ${fmtUSD(data.totals.prior.totalDuty)} prior period` : undefined}
                 icon={<DollarSign className="h-4 w-4" />} />
        <KpiCard title="Regular Duty"   value={fmtUSD(t?.regularDuty ?? 0)} icon={<Landmark className="h-4 w-4" />} />
        <KpiCard title="Section 301"    value={fmtUSD(t?.sec301 ?? 0)}      icon={<Percent className="h-4 w-4" />} />
        <KpiCard title="Section 232"    value={fmtUSD(t?.sec232 ?? 0)}      icon={<Layers className="h-4 w-4" />} />
        <KpiCard title="IEEPA"          value={fmtUSD((t?.ieepa ?? 0) + (t?.other ?? 0))}
                 sub={t && t.other > 0 ? `incl. ${fmtUSD(t.other)} other Ch-99` : undefined}
                 icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      {/* Chart rows — populated in Task 7 */}
      <div id="hts-chart-row-1" className="grid grid-cols-1 lg:grid-cols-2 gap-4" />
      <div id="hts-chart-row-2" className="grid grid-cols-1 lg:grid-cols-2 gap-4" />

      {/* HTS table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Duties by HTS Code</h2>
          {data && (
            <p className="text-[11px] text-slate-400">
              {format(parseISO(data.dateFrom), 'MMM d, yyyy')} – {format(parseISO(data.dateTo), 'MMM d, yyyy')}
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-8" />
                <SortHeader k="hts" label="HTS" right={false} />
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-left">Description</th>
                <SortHeader k="enteredValue" label="Entry Value" />
                <SortHeader k="regularDuty"  label="Regular" />
                <SortHeader k="sec301"       label="Sec 301" />
                <SortHeader k="sec232"       label="Sec 232" />
                <SortHeader k="ieepa"        label="IEEPA" />
                <SortHeader k="totalDuty"    label="Total Duty" />
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No data available</td></tr>
              )}
              {rows.map((row) => (
                <React.Fragment key={row.hts}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => toggleExpand(row.hts)}>
                    <td className="pl-3 text-slate-400">
                      {expanded[row.hts] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{formatHts(row.hts)}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate">{row.description ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.enteredValue)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.regularDuty)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.sec301)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.sec232)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtUSD(row.ieepa + row.other)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtUSD(row.totalDuty)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {t && t.totalDuty > 0 ? `${((row.totalDuty / t.totalDuty) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                  {expanded[row.hts] === 'loading' && (
                    <tr><td colSpan={10} className="px-10 py-3 text-slate-400 text-[11px]">Loading entries…</td></tr>
                  )}
                  {Array.isArray(expanded[row.hts]) && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={10} className="px-10 py-2">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-slate-400">
                              <th className="py-1 text-left font-medium">Entry #</th>
                              <th className="py-1 text-left font-medium">Date</th>
                              <th className="py-1 text-left font-medium">Importer</th>
                              <th className="py-1 text-right font-medium">Value</th>
                              <th className="py-1 text-right font-medium">Total Duty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(expanded[row.hts] as HtsEntryRow[]).map((en) => (
                              <tr key={en.recid} className="border-t border-slate-100">
                                <td className="py-1 text-slate-600">{en.entryNo}</td>
                                <td className="py-1 text-slate-500">{format(new Date(en.entryDate), 'MMM d, yyyy')}</td>
                                <td className="py-1 text-slate-500">{en.custName ?? en.custKey}</td>
                                <td className="py-1 text-right text-slate-600">{fmtUSD(en.enteredValue)}</td>
                                <td className="py-1 text-right font-medium text-slate-700">{fmtUSD(en.totalDuty)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            {t && rows.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr className="font-semibold text-slate-700">
                  <td />
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.enteredValue)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.regularDuty)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.sec301)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.sec232)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.ieepa + t.other)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(t.totalDuty)}</td>
                  <td className="px-3 py-2 text-right">100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register the route in `src/App.tsx`**

Add import: `import { DutiesBreakdownPage } from '@/pages/DutiesBreakdownPage'`
Add inside the `AppShell` route group, after the `ieepa` route:

```tsx
<Route path="duties/hts" element={<DutiesBreakdownPage />} />
```

- [ ] **Step 3: Sidebar item**

In `src/components/layout/Sidebar.tsx`, add `PieChart` to the existing `lucide-react` import and extend `operationsItems` (line ~43):

```tsx
const operationsItems = [
  { path: '/ieepa',      icon: <TrendingUp className="h-4 w-4" />, label: 'IEEPA Analysis' },
  { path: '/duties/hts', icon: <PieChart className="h-4 w-4" />,   label: 'Duties Breakdown' },
  { path: '/aes',        icon: <FileText className="h-4 w-4" />,   label: 'AES Filings' },
]
```

- [ ] **Step 4: Clickable "Total Duties Paid" card in `src/pages/DashboardPage.tsx`**

Extend the local `KpiCard` (line ~44) with an optional `onClick`:

```tsx
function KpiCard({ title, value, sub, icon, trend, onClick }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; trend?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm ${
        onClick ? 'cursor-pointer transition-shadow hover:shadow-md hover:border-teal-300' : ''
      }`}
    >
      {/* existing inner markup unchanged */}
```

Add `import { useNavigate } from 'react-router-dom'` and `const navigate = useNavigate()` inside `DashboardPage`. On the "Total Duties Paid" card (line ~139) add:

```tsx
onClick={() => navigate('/duties/hts')}
sub="View HTS breakdown →"
```

- [ ] **Step 5: Typecheck + browser verification**

Run: `npx tsc --noEmit` (root). Expected: exit 0.
With both servers running, in the browser: Dashboard → click "Total Duties Paid" → page loads at `/duties/hts` with tiles + table; sort by clicking headers; expand an HTS row and see its entries; sidebar shows "Duties Breakdown"; filters carry over from Dashboard.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DutiesBreakdownPage.tsx src/App.tsx src/components/layout/Sidebar.tsx src/pages/DashboardPage.tsx
git commit -m "feat: duties breakdown page with HTS table, route, and clickable KPI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: The four comparison charts

**Files:**
- Modify: `src/pages/DutiesBreakdownPage.tsx` (replace the two placeholder chart-row divs)

**Interfaces:**
- Consumes: `data: HtsBreakdownResponse | null`, `monthly: IeepaMonthRow[]`, `formatHts`, `fmtUSD` from Task 6 (same file).

- [ ] **Step 1: Add imports**

```tsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from 'recharts'
```

- [ ] **Step 2: Add derived chart data inside the component (after `const t = ...`)**

```tsx
const BUCKET_COLORS = { regular: '#0f766e', sec301: '#f59e0b', sec232: '#6366f1', ieepa: '#dc2626', other: '#94a3b8' }

const top10 = rowsByDuty(data?.current ?? []).slice(0, 10)
const priorByHts = new Map((data?.prior ?? []).map((r) => [r.hts, r.totalDuty]))
const compareData = top10.map((r) => ({
  hts: formatHts(r.hts), Current: r.totalDuty, Prior: priorByHts.get(r.hts) ?? 0,
}))

const trendData = monthly.map((m) => ({
  period: m.period, Regular: m.regularDuty, 'Sec 301': m.sec301, 'Sec 232': m.sec232,
  IEEPA: m.ieepaDuty + m.remediation,
}))

const donutData = t ? [
  { name: 'Regular', value: t.regularDuty, color: BUCKET_COLORS.regular },
  { name: 'Sec 301', value: t.sec301,      color: BUCKET_COLORS.sec301 },
  { name: 'Sec 232', value: t.sec232,      color: BUCKET_COLORS.sec232 },
  { name: 'IEEPA',   value: t.ieepa,       color: BUCKET_COLORS.ieepa },
  { name: 'Other',   value: t.other,       color: BUCKET_COLORS.other },
].filter((d) => d.value > 0) : []

const rateData = top10
  .filter((r) => r.enteredValue > 0)
  .map((r) => ({ hts: formatHts(r.hts), 'Effective Rate %': (r.totalDuty / r.enteredValue) * 100 }))
```

And above the component, the helper:

```tsx
function rowsByDuty(rows: HtsBreakdownRow[]): HtsBreakdownRow[] {
  return [...rows].sort((a, b) => b.totalDuty - a.totalDuty)
}
```

- [ ] **Step 3: Replace the placeholder divs with the chart cards**

```tsx
{/* Chart row 1 */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  <ChartCard title="Top 10 HTS — Current vs Prior Period">
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={compareData} layout="vertical" margin={{ left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtUSD} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="hts" width={90} tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v: number) => fmtUSD(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Current" fill="#0f766e" radius={[0, 3, 3, 0]} />
        <Bar dataKey="Prior"   fill="#94a3b8" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </ChartCard>
  <ChartCard title="Monthly Duty Trend by Type">
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={trendData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={fmtUSD} tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v: number) => fmtUSD(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Regular" stackId="d" fill="#0f766e" />
        <Bar dataKey="Sec 301" stackId="d" fill="#f59e0b" />
        <Bar dataKey="Sec 232" stackId="d" fill="#6366f1" />
        <Bar dataKey="IEEPA"   stackId="d" fill="#dc2626" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </ChartCard>
</div>

{/* Chart row 2 */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  <ChartCard title="Duty Composition">
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
          {donutData.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip formatter={(v: number) => fmtUSD(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  </ChartCard>
  <ChartCard title="Effective Duty Rate — Top HTS">
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rateData} layout="vertical" margin={{ left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="hts" width={90} tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
        <Bar dataKey="Effective Rate %" fill="#0f766e" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </ChartCard>
</div>
```

And the `ChartCard` helper above the page component:

```tsx
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">{title}</h2>
      {children}
    </div>
  )
}
```

Remove the `id="hts-chart-row-1"` / `id="hts-chart-row-2"` placeholder divs.

- [ ] **Step 4: Typecheck + full verification**

Run: `npx tsc --noEmit` (root). Expected: exit 0.

Browser (both servers running):
1. Dashboard: note the "Total Duties Paid" value for a client + range with data (e.g., Jan 1 – Mar 31 2026).
2. Click the card → breakdown page: **Total Duties tile must match** the dashboard figure for the same filters.
3. All four charts render with data; donut segments sum to the total; table footer equals the tiles.
4. Expand the top HTS row → entries load.
5. Set the range to exactly 2026-02-24 with the fixture entry's client → table shows HTS 9019.10.2090 with IEEPA $40.40, matching the known 7501.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DutiesBreakdownPage.tsx
git commit -m "feat: comparison charts for duties breakdown page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
