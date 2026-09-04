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
  // Header DUTY is authoritative for duties actually owed; entries like
  // type 23 (TIB) carry computed line duty that was never assessed.
  // Excluding them closes the header-vs-line reconciliation gap to ~$95
  // on $18.35M (Q1 2026) — see task-3-report.md.
  const where = [
    'e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo',
    'ISNULL(e.DUTY,0) > 0',
    ...scopeConds,
  ].join(' AND ');
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

/**
 * Paginated variant of queryBreakdownRows for the "Duties by HTS Code" grid.
 * COUNT(*) OVER() and SUM(SUM(...)) OVER() ride along on the grouped result
 * set — both are logically evaluated across all groups before OFFSET/FETCH
 * trims the page — so one query pass yields the page, the total group count,
 * AND the full-period grand totals (needed by the KPI/donut/chart cards,
 * which must reflect the whole result set, not just the current page).
 * A second full scan of per_line (which joins/unions the full USLINE +
 * USLINEB range) was timing out against the 30s MSSQL request limit for
 * broad "all clients" queries — this collapses that back down to one scan.
 */
async function queryBreakdownRowsPage(
  pool: sql.ConnectionPool,
  from: Date,
  to: Date,
  coKey: string | undefined,
  allowed: string[] | null,
  page: number,
  limit: number,
): Promise<{ rows: HtsBreakdownRow[]; total: number; totals: ReturnType<typeof sumTotals> }> {
  const r = pool.request();
  r.input('dateFrom', sql.DateTime, from);
  r.input('dateTo',   sql.DateTime, to);
  r.input('offset',   sql.Int, (page - 1) * limit);
  r.input('limit',    sql.Int, limit);
  const scopeConds = appendCoKeyConditions({ r, coKey, allowed });

  const result = await r.query<BreakdownRecord & {
    TOTAL_GROUPS: number;
    GRAND_ENTERED_VALUE: number; GRAND_REGULAR_DUTY: number; GRAND_SEC301: number;
    GRAND_SEC232: number; GRAND_IEEPA: number; GRAND_OTHER99: number;
  }>(`
    ${perLineCte(scopeConds)}
    SELECT ISNULL(hts, 'UNCLASSIFIED') AS HTS,
           MAX(descr)                  AS DESCR,
           COUNT(*)                    AS LINE_COUNT,
           SUM(entered_value)          AS ENTERED_VALUE,
           SUM(regular_duty)           AS REGULAR_DUTY,
           SUM(sec301)                 AS SEC301,
           SUM(sec232)                 AS SEC232,
           SUM(ieepa)                  AS IEEPA,
           SUM(other99)                AS OTHER99,
           COUNT(*)            OVER()  AS TOTAL_GROUPS,
           SUM(SUM(entered_value)) OVER() AS GRAND_ENTERED_VALUE,
           SUM(SUM(regular_duty))  OVER() AS GRAND_REGULAR_DUTY,
           SUM(SUM(sec301))        OVER() AS GRAND_SEC301,
           SUM(SUM(sec232))        OVER() AS GRAND_SEC232,
           SUM(SUM(ieepa))         OVER() AS GRAND_IEEPA,
           SUM(SUM(other99))       OVER() AS GRAND_OTHER99
    FROM   per_line
    GROUP  BY ISNULL(hts, 'UNCLASSIFIED')
    ORDER  BY SUM(regular_duty + sec301 + sec232 + ieepa + other99) DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const first = result.recordset[0];
  const total = first ? Number(first.TOTAL_GROUPS) : 0;
  const regularDuty = Number(first?.GRAND_REGULAR_DUTY ?? 0);
  const sec301 = Number(first?.GRAND_SEC301 ?? 0);
  const sec232 = Number(first?.GRAND_SEC232 ?? 0);
  const ieepa  = Number(first?.GRAND_IEEPA ?? 0);
  const other  = Number(first?.GRAND_OTHER99 ?? 0);
  const totals = {
    enteredValue: Number(first?.GRAND_ENTERED_VALUE ?? 0),
    regularDuty, sec301, sec232, ieepa, other,
    totalDuty: regularDuty + sec301 + sec232 + ieepa + other,
  };

  return { rows: result.recordset.map(mapRow), total, totals };
}

// ── GET /api/entries/hts-breakdown?coKey=&dateFrom=&dateTo=&page=&limit= ─────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coKey, dateFrom: dfStr, dateTo: dtStr, page: pageStr, limit: limitStr } = req.query as {
      coKey?: string; dateFrom?: string; dateTo?: string; page?: string; limit?: string;
    };
    const allowed = await getAllowedCoKeys(req.user!.userId, req.user!.role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;

    const page  = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitStr ?? '100', 10) || 100));

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);
    const { priorFrom, priorTo } = priorPeriod(from, to);

    if (allowed !== null && allowed.length === 0) {
      const empty = sumTotals([]);
      res.json({
        current: [], prior: [], totals: { current: empty, prior: empty },
        page, limit, total: 0,
        dateFrom:  from.toISOString().slice(0, 10),
        dateTo:    to.toISOString().slice(0, 10),
        priorFrom: priorFrom.toISOString().slice(0, 10),
        priorTo:   priorTo.toISOString().slice(0, 10),
      });
      return;
    }

    const pool = await getMssqlPool();
    const [{ rows: current, total, totals: currentTotals }, prior] = await Promise.all([
      queryBreakdownRowsPage(pool, from, to, coKey, allowed, page, limit),
      queryBreakdownRows(pool, priorFrom, priorTo, coKey, allowed),
    ]);

    res.json({
      current,
      prior,
      totals: { current: currentTotals, prior: sumTotals(prior) },
      page, limit, total,
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

export default router;
