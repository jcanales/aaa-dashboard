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
