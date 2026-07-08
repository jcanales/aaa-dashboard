# HTS Duty Breakdown Page — Design

**Date:** 2026-07-08
**Status:** Approved approach A (SQL aggregation on existing Express server)

## Goal

Clicking the "Total Duties Paid" KPI card on the Dashboard opens a new page (`/duties/hts`) that breaks down total duties paid by HTS code for the selected client and date range, with comparison charts. The breakdown must reconcile exactly with the KPI card's `dutyInRange` figure.

## Data model (legacy SQL Server)

- `USENTRY` — entry header (already used). Header duty buckets: `DUTY`, `DUTY_SEC_301`, `DUTY_SEC_232`, `DUTY_SEC_IEEPA`, `REMEDIATION_DUTY`.
- `USLINE` — one row per 7501 entry line. FK `USENTRY_RECID`. Carries the line's first tariff number `TUSA`, `VALUE`, `DUTY`, `DESC1`.
- `USLINEB` — additional tariff numbers on the same line. FK `USLINE_RECID`, same shape (`TUSA`, `VALUE`, `DUTY`, `DESC1`).
- A line's full tariff set = its `USLINE` row ∪ its `USLINEB` rows. Exactly one of them is normally a non-Chapter-99 commodity HTS carrying the entered value; Chapter-99 rows (9903.xx) carry surcharge duty with VALUE = 0 (verified on entry RECID 341831: $40.40 IEEPA = 2 × $20.20 under 9903.01.24/25 attached to commodity 9019.10.2090).
- `USLINE_TR` is empty in this DB — not usable.
- Data caveat: current snapshot has entries through 2026-03-30.

### Chapter-99 classification (by TUSA prefix, digits only)

| Prefix | Bucket |
|---|---|
| not `99…` | regular (commodity HTS; carries value + regular duty) |
| `990388`, `990389` | Section 301 |
| `990380`, `990381`, `990385` | Section 232 |
| `990301` | IEEPA |
| any other `99…` | other (catch-all so totals always reconcile) |

## Backend

### Shared scope module — `server/src/api/entryScope.ts`

Extract the helpers currently duplicated in `entries.ts` / `abi.ts` / `aes.ts`: `getAllowedCoKeys`, `assertCoKeyAllowed`, `parseDate`, `defaultRange`, `priorPeriod`, `appendCoKeyConditions` (parameterized `CUST_KEY` scoping with `RTRIM`). The new route uses it; `entries.ts` is migrated in this change; abi/aes later.

### `GET /api/entries/hts-breakdown?coKey=&dateFrom=&dateTo=`

The query below runs twice — once with the current range's `@from/@to`, once with the prior range of equal length (computed via `priorPeriod`) — as two awaited queries on the same pooled request pattern:

```sql
WITH lines AS (
  SELECT l.RECID AS line_id, l.TUSA, l.VALUE, l.DUTY, l.DESC1
  FROM USLINE l JOIN USENTRY e ON e.RECID = l.USENTRY_RECID
  WHERE e.ENTRY_DATE BETWEEN @from AND @to AND <coKey scope>
  UNION ALL
  SELECT b.USLINE_RECID, b.TUSA, b.VALUE, b.DUTY, b.DESC1
  FROM USLINEB b
  JOIN USLINE l ON l.RECID = b.USLINE_RECID
  JOIN USENTRY e ON e.RECID = l.USENTRY_RECID
  WHERE e.ENTRY_DATE BETWEEN @from AND @to AND <coKey scope>
),
per_line AS (
  SELECT line_id,
    MAX(CASE WHEN TUSA NOT LIKE '99%' THEN RTRIM(TUSA) END)              AS hts,
    MAX(CASE WHEN TUSA NOT LIKE '99%' THEN DESC1 END)                    AS descr,
    SUM(CASE WHEN TUSA NOT LIKE '99%' THEN ISNULL(VALUE,0) ELSE 0 END)   AS entered_value,
    SUM(CASE WHEN TUSA NOT LIKE '99%' THEN ISNULL(DUTY,0)  ELSE 0 END)   AS regular_duty,
    SUM(CASE WHEN TUSA LIKE '990388%' OR TUSA LIKE '990389%' THEN ISNULL(DUTY,0) ELSE 0 END) AS sec301,
    SUM(CASE WHEN TUSA LIKE '990380%' OR TUSA LIKE '990381%' OR TUSA LIKE '990385%' THEN ISNULL(DUTY,0) ELSE 0 END) AS sec232,
    SUM(CASE WHEN TUSA LIKE '990301%' THEN ISNULL(DUTY,0) ELSE 0 END)    AS ieepa,
    SUM(CASE WHEN TUSA LIKE '99%'
          AND TUSA NOT LIKE '990388%' AND TUSA NOT LIKE '990389%'
          AND TUSA NOT LIKE '990380%' AND TUSA NOT LIKE '990381%' AND TUSA NOT LIKE '990385%'
          AND TUSA NOT LIKE '990301%' THEN ISNULL(DUTY,0) ELSE 0 END)    AS other99
  FROM lines GROUP BY line_id
)
SELECT ISNULL(hts, 'UNCLASSIFIED') AS hts, MAX(descr) AS descr,
       COUNT(*) AS line_count, SUM(entered_value) AS entered_value,
       SUM(regular_duty) AS regular_duty, SUM(sec301) AS sec301,
       SUM(sec232) AS sec232, SUM(ieepa) AS ieepa, SUM(other99) AS other
FROM per_line
GROUP BY ISNULL(hts, 'UNCLASSIFIED')
ORDER BY (SUM(regular_duty)+SUM(sec301)+SUM(sec232)+SUM(ieepa)+SUM(other99)) DESC
```

Response:

```ts
{
  current: HtsBreakdownRow[],   // { hts, description, lineCount, enteredValue,
  prior:   HtsBreakdownRow[],   //   regularDuty, sec301, sec232, ieepa, other, totalDuty }
  totals:  { current: DutyTotals, prior: DutyTotals },
  dateFrom, dateTo, priorFrom, priorTo
}
```

`totalDuty` computed server-side as the sum of the five buckets. Entry counts per HTS come from the entries endpoint on expand (avoids a third join here); the table column shows `lineCount`.

### `GET /api/entries/hts-breakdown/entries?hts=&coKey=&dateFrom=&dateTo=`

Entries whose lines used the given commodity HTS (or, for `hts=UNCLASSIFIED`, lines with no commodity code). Returns top 50 by combined duty: `{ recid, entryNo, entryDate, port, custKey, custName, enteredValue, regularDuty, sec301, sec232, ieepa, other, totalDuty }`. Same per-line CTE filtered to the HTS, grouped by entry. `hts` is validated (`^\d{4,10}$` or the literal `UNCLASSIFIED`) and parameterized.

Both endpoints: behind `authenticateJWT`, coKey scoping via `entryScope.ts`, `Math.max/Math.min`-clamped params with NaN guards, existing logger/error pattern (500 + logged message).

The monthly trend chart reuses the existing `GET /api/entries/ieepa/monthly` (already returns regular/301/232/IEEPA per month) — no new endpoint.

## Frontend

- **Navigation:** Dashboard "Total Duties Paid" `KpiCard` becomes clickable (hover ring + "view breakdown →" hint) → `navigate('/duties/hts')`. `KpiCard` gains an optional `onClick`/`to` prop; other cards unchanged. New sidebar item "Duties Breakdown" under OPERATIONS. Route added in `App.tsx` inside `AppShell`.
- **Page:** `src/pages/DutiesBreakdownPage.tsx`, mirroring IeepaPage structure. Filter bar: `ClientSelector` + `DateRangeSelector` + `SearchButton` (stores persist so context carries from Dashboard).
  1. **KPI tiles (5):** Total · Regular · Sec 301 · Sec 232 · IEEPA, each with prior-period delta (existing `Trend` pattern).
  2. **Chart row 1:** Top-10 HTS current vs prior (grouped horizontal bars); Monthly duty trend stacked by type (from ieepa/monthly).
  3. **Chart row 2:** Duty composition donut (Regular/301/232/IEEPA/Other); Effective duty rate (totalDuty ÷ enteredValue) per top-10 HTS.
  4. **Table:** sortable (HTS, description, lines, entered value, Regular, 301, 232, IEEPA, Total, % of total); footer totals row equal to KPI tile figures; rows expand via chevron to lazy-load entries (endpoint 2) into a nested sub-table. HTS shown formatted `9019.10.2090`.
- **API layer:** `fetchHtsBreakdown()` / `fetchHtsEntries()` in `src/api/entriesApi.ts` using the existing `get<T>()` helper (401 → logout redirect).
- Charts via Recharts, matching existing dashboard chart styling. Loading/empty/error states copied from existing pages.

## Error handling

- Empty period / no client data → tiles show $0, charts show empty state, table shows "No data available".
- Client-role user with no allowed coKeys → empty payload (same convention as existing routes).
- SQL failure → 500 `{ error }`, logged; page shows existing error treatment (console + empty state).

## Testing

- **Unit (vitest, server):** Chapter-99 prefix classification table-driven tests; reconciliation invariant (bucket sums = totalDuty); UNCLASSIFIED grouping; hts param validation.
- **Manual:** verify against entry RECID 341831 / entry no. 1422024 (known: $40.40 total = 2 × $20.20 IEEPA on commodity 9019.10.2090); verify page totals equal Dashboard `dutyInRange` for the same filters; browser walkthrough of expand rows + all four charts.

## Out of scope

- PDF/Excel export of the breakdown (can reuse existing export utils later).
- Migrating abi.ts/aes.ts to `entryScope.ts` (follow-up).
- Postgres precomputation/caching (only if live queries prove slow).
