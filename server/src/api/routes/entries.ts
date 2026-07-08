import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { getMssqlPool } from '../../db/mssql';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getAllowedCoKeys(userId: string, role: string): Promise<string[] | null> {
  if (role === 'admin' || role === 'broker') return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  return (user.clientCoKeys as string[]) ?? [];
}

function assertCoKeyAllowed(coKey: string, allowed: string[] | null, res: Response): boolean {
  if (allowed === null) return true;
  if (allowed.includes(coKey)) return true;
  res.status(403).json({ error: 'Access denied for this client account' });
  return false;
}

/** Parse a date string to a Date, defaulting to `fallback` if missing/invalid. */
function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

/** Default date range: start of 3 months ago → today. */
function defaultRange(): { from: Date; to: Date } {
  const to   = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 2);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** Compute prior period of the same length immediately before dateFrom. */
function priorPeriod(from: Date, to: Date): { priorFrom: Date; priorTo: Date } {
  const durationMs  = to.getTime() - from.getTime();
  const priorTo     = new Date(from.getTime() - 1); // 1ms before start of current range
  const priorFrom   = new Date(priorTo.getTime() - durationMs);
  return { priorFrom, priorTo };
}

// ── Scope builder ─────────────────────────────────────────────────────────────

interface ScopeParams {
  r:       sql.Request;
  coKey?:  string;
  allowed: string[] | null;
}

function appendCoKeyConditions({ r, coKey, allowed }: ScopeParams): string[] {
  const conditions: string[] = [];
  if (coKey) {
    r.input('coKey', sql.VarChar(6), coKey);
    conditions.push('e.CUST_KEY = @coKey');
  } else if (allowed !== null && allowed.length > 0) {
    const pn = allowed.map((_, i) => `@ck${i}`);
    allowed.forEach((k, i) => r.input(`ck${i}`, sql.VarChar(6), k));
    conditions.push(`e.CUST_KEY IN (${pn.join(',')})`);
  }
  return conditions;
}

// ── GET /api/entries/clients ───────────────────────────────────────────────────
router.get('/clients', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const role   = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);
    const pool    = await getMssqlPool();
    const request = pool.request();

    let whereClause = "WHERE m.IS_CUSTOMER = 1 AND m.ACTIVE = 1 AND m.CO_NAME <> ''";

    if (allowed !== null && allowed.length > 0) {
      const paramNames = allowed.map((_, i) => `@ck${i}`);
      allowed.forEach((k, i) => request.input(`ck${i}`, sql.VarChar(6), k));
      whereClause += ` AND m.CO_KEY IN (${paramNames.join(',')})`;
    } else if (allowed !== null && allowed.length === 0) {
      res.json([]);
      return;
    }

    const result = await request.query<{
      CO_KEY: string; CO_NAME: string; IRS_NO: string | null; ENTRY_COUNT: number;
    }>(`
      SELECT m.CO_KEY, m.CO_NAME, m.IRS_NO, COUNT(e.RECID) AS ENTRY_COUNT
      FROM   MST m
      LEFT   JOIN USENTRY e ON e.CUST_KEY = m.CO_KEY
      ${whereClause}
      GROUP  BY m.CO_KEY, m.CO_NAME, m.IRS_NO
      ORDER  BY ENTRY_COUNT DESC, m.CO_NAME
    `);

    res.json(result.recordset.map(r => ({
      coKey:      r.CO_KEY.trim(),
      name:       r.CO_NAME.trim(),
      irsNo:      r.IRS_NO?.trim() ?? null,
      entryCount: Number(r.ENTRY_COUNT),
    })));
  } catch (err) {
    logger.error('GET /entries/clients failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch client list' });
  }
});

// ── GET /api/entries/kpis?coKey=&dateFrom=&dateTo= ────────────────────────────
router.get('/kpis', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coKey, dateFrom: dfStr, dateTo: dtStr } = req.query as {
      coKey?: string; dateFrom?: string; dateTo?: string;
    };
    const userId  = req.user!.userId;
    const role    = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) { res.json(buildEmptyKpis()); return; }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);
    const { priorFrom, priorTo } = priorPeriod(from, to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('dateFrom',  sql.DateTime, from);
    r.input('dateTo',    sql.DateTime, to);
    r.input('priorFrom', sql.DateTime, priorFrom);
    r.input('priorTo',   sql.DateTime, priorTo);

    const conditions = appendCoKeyConditions({ r, coKey, allowed });
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await r.query<{
      ENTRIES_IN_RANGE:  number;
      ENTRIES_PRIOR:     number;
      DUTY_IN_RANGE:     number;
      DUTY_PRIOR:        number;
      VALUE_IN_RANGE:    number;
      SEC301_IN_RANGE:   number;
      SEC232_IN_RANGE:   number;
      IEEPA_IN_RANGE:    number;
      REMED_IN_RANGE:    number;
      AVG_RELEASE_DAYS:  number | null;
      ENTRIES_PENDING:   number;
    }>(`
      SELECT
        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @dateFrom  AND @dateTo   THEN 1 ELSE 0 END) AS ENTRIES_IN_RANGE,
        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @priorFrom AND @priorTo  THEN 1 ELSE 0 END) AS ENTRIES_PRIOR,

        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @dateFrom  AND @dateTo   THEN ISNULL(e.DUTY,0) ELSE 0 END) AS DUTY_IN_RANGE,
        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @priorFrom AND @priorTo  THEN ISNULL(e.DUTY,0) ELSE 0 END) AS DUTY_PRIOR,

        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @dateFrom  AND @dateTo   THEN ISNULL(e.ENTRY_VAL,0) ELSE 0 END) AS VALUE_IN_RANGE,

        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @dateFrom  AND @dateTo
                 THEN ISNULL(e.DUTY_SEC_301,0)   ELSE 0 END) AS SEC301_IN_RANGE,
        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @dateFrom  AND @dateTo
                 THEN ISNULL(e.DUTY_SEC_232,0)   ELSE 0 END) AS SEC232_IN_RANGE,
        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @dateFrom  AND @dateTo
                 THEN ISNULL(e.DUTY_SEC_IEEPA,0) ELSE 0 END) AS IEEPA_IN_RANGE,
        SUM(CASE WHEN e.ENTRY_DATE BETWEEN @dateFrom  AND @dateTo
                 THEN ISNULL(e.REMEDIATION_DUTY,0) ELSE 0 END) AS REMED_IN_RANGE,

        AVG(CASE WHEN e.REL_DATE IS NOT NULL AND e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo
                 THEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) END) AS AVG_RELEASE_DAYS,

        SUM(CASE WHEN e.REL_DATE IS NULL THEN 1 ELSE 0 END) AS ENTRIES_PENDING
      FROM USENTRY e
      ${where}
    `);

    const row = result.recordset[0];
    res.json({
      entriesInRange:  Number(row.ENTRIES_IN_RANGE),
      entriesPrior:    Number(row.ENTRIES_PRIOR),
      dutyInRange:     Number(row.DUTY_IN_RANGE),
      dutyPrior:       Number(row.DUTY_PRIOR),
      valueInRange:    Number(row.VALUE_IN_RANGE),
      sec301InRange:   Number(row.SEC301_IN_RANGE),
      sec232InRange:   Number(row.SEC232_IN_RANGE),
      ieepaInRange:    Number(row.IEEPA_IN_RANGE),
      remediationInRange: Number(row.REMED_IN_RANGE),
      avgReleaseDays:  row.AVG_RELEASE_DAYS !== null ? Number(row.AVG_RELEASE_DAYS) : null,
      entriesPending:  Number(row.ENTRIES_PENDING),
      dateFrom:        from.toISOString().slice(0, 10),
      dateTo:          to.toISOString().slice(0, 10),
    });
  } catch (err) {
    logger.error('GET /entries/kpis failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// ── GET /api/entries/monthly?coKey=&dateFrom=&dateTo= ────────────────────────
router.get('/monthly', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coKey, dateFrom: dfStr, dateTo: dtStr } = req.query as {
      coKey?: string; dateFrom?: string; dateTo?: string;
    };
    const userId  = req.user!.userId;
    const role    = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) { res.json([]); return; }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);

    const conditions = [
      'e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo',
      ...appendCoKeyConditions({ r, coKey, allowed }),
    ];

    const result = await r.query<{
      YR: number; MO: number;
      ENTRIES: number; DUTIES: number; VALUE: number; TARIFF: number;
    }>(`
      SELECT
        YEAR(e.ENTRY_DATE)  AS YR,
        MONTH(e.ENTRY_DATE) AS MO,
        COUNT(*)            AS ENTRIES,
        SUM(ISNULL(e.DUTY,0))       AS DUTIES,
        SUM(ISNULL(e.ENTRY_VAL,0))  AS VALUE,
        SUM(ISNULL(e.DUTY_SEC_301,0) + ISNULL(e.DUTY_SEC_232,0) + ISNULL(e.DUTY_SEC_IEEPA,0)) AS TARIFF
      FROM USENTRY e
      WHERE ${conditions.join(' AND ')}
      GROUP BY YEAR(e.ENTRY_DATE), MONTH(e.ENTRY_DATE)
      ORDER BY YR, MO
    `);

    const ML = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    res.json(result.recordset.map(row => ({
      period:  `${ML[Number(row.MO) - 1]} ${String(row.YR).slice(2)}`,
      entries: Number(row.ENTRIES),
      duties:  Number(row.DUTIES),
      value:   Number(row.VALUE),
      tariff:  Number(row.TARIFF),
    })));
  } catch (err) {
    logger.error('GET /entries/monthly failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch monthly data' });
  }
});

// ── GET /api/entries?coKey=&page=&limit=&dateFrom=&dateTo=&status= ────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      coKey, page = '1', limit = '25',
      dateFrom: dfStr, dateTo: dtStr, status,
    } = req.query as {
      coKey?: string; page?: string; limit?: string;
      dateFrom?: string; dateTo?: string; status?: string;
    };

    const userId   = req.user!.userId;
    const role     = req.user!.role;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * pageSize;
    const allowed  = await getAllowedCoKeys(userId, role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) {
      res.json({ data: [], total: 0, page: pageNum, pageSize });
      return;
    }

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('offset',   sql.Int, offset);
    r.input('pageSize', sql.Int, pageSize);

    const conditions = appendCoKeyConditions({ r, coKey, allowed });

    if (dfStr) {
      r.input('dateFrom', sql.DateTime, new Date(dfStr));
      conditions.push('e.ENTRY_DATE >= @dateFrom');
    }
    if (dtStr) {
      r.input('dateTo', sql.DateTime, new Date(dtStr));
      conditions.push('e.ENTRY_DATE <= @dateTo');
    }
    if (status === 'pending')    conditions.push('e.REL_DATE IS NULL');
    if (status === 'released')   conditions.push('e.REL_DATE IS NOT NULL AND e.LIQ_DATE IS NULL');
    if (status === 'liquidated') conditions.push('e.LIQ_DATE IS NOT NULL');

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult, dataResult] = await Promise.all([
      r.query<{ TOTAL: number }>(`SELECT COUNT(*) AS TOTAL FROM USENTRY e ${where}`),
      r.query<{
        RECID: string; ENT_NO: string; ENTRY_TYPE: string;
        ENTRY_DATE: Date; REL_DATE: Date | null; LIQ_DATE: Date | null;
        PORT_COD: string; CUST_KEY: string; CO_NAME: string | null;
        DUTY: number; TAX: number; OTHER: number; TOTAL: number;
        ENTRY_VAL: number; SEC301: number; SEC232: number; IEEPA: number;
      }>(`
        SELECT
          e.RECID,
          RTRIM(e.ENTRY_FIL)+'-'+RTRIM(e.ENTRY)+RTRIM(e.ENTRY_DIG) AS ENT_NO,
          e.ENTRY_TYPE, e.ENTRY_DATE, e.REL_DATE, e.LIQ_DATE,
          e.PORT_COD, e.CUST_KEY, m.CO_NAME,
          ISNULL(e.DUTY,0)            AS DUTY,
          ISNULL(e.TAX,0)             AS TAX,
          ISNULL(e.OTHER,0)           AS OTHER,
          ISNULL(e.TOTAL,0)           AS TOTAL,
          ISNULL(e.ENTRY_VAL,0)       AS ENTRY_VAL,
          ISNULL(e.DUTY_SEC_301,0)    AS SEC301,
          ISNULL(e.DUTY_SEC_232,0)    AS SEC232,
          ISNULL(e.DUTY_SEC_IEEPA,0)  AS IEEPA
        FROM USENTRY e
        LEFT JOIN MST m ON m.CO_KEY = e.CUST_KEY
        ${where}
        ORDER BY e.ENTRY_DATE DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `),
    ]);

    res.json({
      data: dataResult.recordset.map(row => ({
        recid:     String(row.RECID),
        entryNo:   row.ENT_NO.trim(),
        entryType: row.ENTRY_TYPE.trim(),
        entryDate: row.ENTRY_DATE,
        relDate:   row.REL_DATE,
        liqDate:   row.LIQ_DATE,
        portCod:   row.PORT_COD.trim(),
        custKey:   row.CUST_KEY.trim(),
        custName:  row.CO_NAME?.trim() ?? null,
        duty:      Number(row.DUTY),
        tax:       Number(row.TAX),
        other:     Number(row.OTHER),
        total:     Number(row.TOTAL),
        entryVal:  Number(row.ENTRY_VAL),
        sec301:    Number(row.SEC301),
        sec232:    Number(row.SEC232),
        ieepa:     Number(row.IEEPA),
        status:    !row.REL_DATE ? 'pending' : (!row.LIQ_DATE ? 'released' : 'liquidated'),
      })),
      total:    Number(countResult.recordset[0].TOTAL),
      page:     pageNum,
      pageSize,
    });
  } catch (err) {
    logger.error('GET /entries failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// ── GET /api/entries/charts?coKey=&dateFrom=&dateTo= ──────────────────────────
// Returns daily entry counts, clearance time buckets, and port breakdown.
router.get('/charts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coKey, dateFrom: dfStr, dateTo: dtStr } = req.query as {
      coKey?: string; dateFrom?: string; dateTo?: string;
    };
    const userId  = req.user!.userId;
    const role    = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) {
      res.json({ dailyCounts: [], clearanceBuckets: [], portBreakdown: [] });
      return;
    }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);

    const scopeConds = appendCoKeyConditions({ r, coKey, allowed });
    const dateWhere  = ['e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo', ...scopeConds].join(' AND ');

    const [dailyRes, clearanceRes, portRes] = await Promise.all([
      // Daily entry counts
      r.query<{ D: string; CNT: number }>(`
        SELECT CONVERT(VARCHAR(10), e.ENTRY_DATE, 120) AS D, COUNT(*) AS CNT
        FROM   USENTRY e
        WHERE  ${dateWhere}
        GROUP  BY CONVERT(VARCHAR(10), e.ENTRY_DATE, 120)
        ORDER  BY D
      `),

      // Clearance time buckets (only released entries)
      r.query<{ BUCKET: string; CNT: number }>(`
        SELECT
          CASE
            WHEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) = 0            THEN 'Same Day'
            WHEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) = 1            THEN '1 Day'
            WHEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) BETWEEN 2 AND 3 THEN '2–3 Days'
            WHEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) BETWEEN 4 AND 5 THEN '4–5 Days'
            ELSE '5+ Days'
          END AS BUCKET,
          COUNT(*) AS CNT
        FROM   USENTRY e
        WHERE  ${dateWhere} AND e.REL_DATE IS NOT NULL
        GROUP  BY
          CASE
            WHEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) = 0            THEN 'Same Day'
            WHEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) = 1            THEN '1 Day'
            WHEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) BETWEEN 2 AND 3 THEN '2–3 Days'
            WHEN DATEDIFF(DAY, e.ENTRY_DATE, e.REL_DATE) BETWEEN 4 AND 5 THEN '4–5 Days'
            ELSE '5+ Days'
          END
      `),

      // Top 8 ports by entry count
      r.query<{ PORT: string; CNT: number; VAL: number }>(`
        SELECT TOP 8
          RTRIM(e.PORT_COD) AS PORT,
          COUNT(*)          AS CNT,
          SUM(ISNULL(e.ENTRY_VAL, 0)) AS VAL
        FROM   USENTRY e
        WHERE  ${dateWhere}
        GROUP  BY RTRIM(e.PORT_COD)
        ORDER  BY CNT DESC
      `),
    ]);

    const BUCKET_ORDER = ['Same Day', '1 Day', '2–3 Days', '4–5 Days', '5+ Days'];
    const bucketMap: Record<string, number> = {};
    clearanceRes.recordset.forEach(row => { bucketMap[row.BUCKET] = Number(row.CNT); });

    res.json({
      dailyCounts: dailyRes.recordset.map(row => ({
        date:  row.D,
        count: Number(row.CNT),
      })),
      clearanceBuckets: BUCKET_ORDER.map(label => ({
        label,
        count: bucketMap[label] ?? 0,
      })),
      portBreakdown: portRes.recordset.map(row => ({
        port:  row.PORT,
        count: Number(row.CNT),
        value: Number(row.VAL),
      })),
    });
  } catch (err) {
    logger.error('GET /entries/charts failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// ── GET /api/entries/ieepa/kpis ───────────────────────────────────────────────
router.get('/ieepa/kpis', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coKey, dateFrom: dfStr, dateTo: dtStr } = req.query as {
      coKey?: string; dateFrom?: string; dateTo?: string;
    };
    const userId  = req.user!.userId;
    const role    = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) {
      res.json({ totalEntries: 0, ieepaEntries: 0, totalValue: 0, regularDuty: 0, sec301: 0, sec232: 0, ieepaDuty: 0, remediationDuty: 0, totalDuty: 0 });
      return;
    }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);

    const conditions = [
      'e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo',
      ...appendCoKeyConditions({ r, coKey, allowed }),
    ];

    const result = await r.query<{
      TOTAL_ENTRIES: number; IEEPA_ENTRIES: number; TOTAL_VALUE: number;
      REGULAR_DUTY: number; SEC301: number; SEC232: number;
      IEEPA_DUTY: number; REMEDIATION_DUTY: number; TOTAL_DUTY: number;
    }>(`
      SELECT
        COUNT(*) AS TOTAL_ENTRIES,
        SUM(CASE WHEN ISNULL(e.DUTY_SEC_IEEPA,0) + ISNULL(e.REMEDIATION_DUTY,0) > 0 THEN 1 ELSE 0 END) AS IEEPA_ENTRIES,
        SUM(ISNULL(e.ENTRY_VAL,0))        AS TOTAL_VALUE,
        SUM(ISNULL(e.DUTY,0))             AS REGULAR_DUTY,
        SUM(ISNULL(e.DUTY_SEC_301,0))     AS SEC301,
        SUM(ISNULL(e.DUTY_SEC_232,0))     AS SEC232,
        SUM(ISNULL(e.DUTY_SEC_IEEPA,0))   AS IEEPA_DUTY,
        SUM(ISNULL(e.REMEDIATION_DUTY,0)) AS REMEDIATION_DUTY,
        SUM(ISNULL(e.DUTY,0) + ISNULL(e.DUTY_SEC_301,0) + ISNULL(e.DUTY_SEC_232,0)
            + ISNULL(e.DUTY_SEC_IEEPA,0) + ISNULL(e.REMEDIATION_DUTY,0)) AS TOTAL_DUTY
      FROM USENTRY e
      WHERE ${conditions.join(' AND ')}
    `);

    const row = result.recordset[0];
    res.json({
      totalEntries:    Number(row.TOTAL_ENTRIES),
      ieepaEntries:    Number(row.IEEPA_ENTRIES),
      totalValue:      Number(row.TOTAL_VALUE),
      regularDuty:     Number(row.REGULAR_DUTY),
      sec301:          Number(row.SEC301),
      sec232:          Number(row.SEC232),
      ieepaDuty:       Number(row.IEEPA_DUTY),
      remediationDuty: Number(row.REMEDIATION_DUTY),
      totalDuty:       Number(row.TOTAL_DUTY),
    });
  } catch (err) {
    logger.error('GET /entries/ieepa/kpis failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch IEEPA KPIs' });
  }
});

// ── GET /api/entries/ieepa/monthly ────────────────────────────────────────────
router.get('/ieepa/monthly', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coKey, dateFrom: dfStr, dateTo: dtStr } = req.query as {
      coKey?: string; dateFrom?: string; dateTo?: string;
    };
    const userId  = req.user!.userId;
    const role    = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) { res.json([]); return; }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);

    const conditions = [
      'e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo',
      ...appendCoKeyConditions({ r, coKey, allowed }),
    ];

    const result = await r.query<{
      YR: number; MO: number; ENTRIES: number; IEEPA_ENTRIES: number;
      REGULAR_DUTY: number; SEC301: number; SEC232: number;
      IEEPA_DUTY: number; REMEDIATION: number;
    }>(`
      SELECT
        YEAR(e.ENTRY_DATE)  AS YR,
        MONTH(e.ENTRY_DATE) AS MO,
        COUNT(*) AS ENTRIES,
        SUM(CASE WHEN ISNULL(e.DUTY_SEC_IEEPA,0) + ISNULL(e.REMEDIATION_DUTY,0) > 0 THEN 1 ELSE 0 END) AS IEEPA_ENTRIES,
        SUM(ISNULL(e.DUTY,0))             AS REGULAR_DUTY,
        SUM(ISNULL(e.DUTY_SEC_301,0))     AS SEC301,
        SUM(ISNULL(e.DUTY_SEC_232,0))     AS SEC232,
        SUM(ISNULL(e.DUTY_SEC_IEEPA,0))   AS IEEPA_DUTY,
        SUM(ISNULL(e.REMEDIATION_DUTY,0)) AS REMEDIATION
      FROM USENTRY e
      WHERE ${conditions.join(' AND ')}
      GROUP BY YEAR(e.ENTRY_DATE), MONTH(e.ENTRY_DATE)
      ORDER BY YR, MO
    `);

    const ML = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    res.json(result.recordset.map(row => ({
      period:       `${ML[Number(row.MO) - 1]} ${String(row.YR).slice(2)}`,
      yr:           Number(row.YR),
      mo:           Number(row.MO),
      entries:      Number(row.ENTRIES),
      ieepaEntries: Number(row.IEEPA_ENTRIES),
      regularDuty:  Number(row.REGULAR_DUTY),
      sec301:       Number(row.SEC301),
      sec232:       Number(row.SEC232),
      ieepaDuty:    Number(row.IEEPA_DUTY),
      remediation:  Number(row.REMEDIATION),
    })));
  } catch (err) {
    logger.error('GET /entries/ieepa/monthly failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch IEEPA monthly data' });
  }
});

// ── GET /api/entries/ieepa/top-entries ────────────────────────────────────────
router.get('/ieepa/top-entries', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coKey, dateFrom: dfStr, dateTo: dtStr } = req.query as {
      coKey?: string; dateFrom?: string; dateTo?: string;
    };
    const userId  = req.user!.userId;
    const role    = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);

    if (coKey && !assertCoKeyAllowed(coKey, allowed, res)) return;
    if (allowed !== null && allowed.length === 0) { res.json([]); return; }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);

    const conditions = [
      'e.ENTRY_DATE BETWEEN @dateFrom AND @dateTo',
      '(ISNULL(e.DUTY_SEC_IEEPA,0) + ISNULL(e.REMEDIATION_DUTY,0)) > 0',
      ...appendCoKeyConditions({ r, coKey, allowed }),
    ];

    const result = await r.query<{
      RECID: string; ENT_NO: string; ENTRY_DATE: Date;
      PORT_COD: string; CUST_KEY: string; CO_NAME: string | null;
      ENTRY_VAL: number; IEEPA_DUTY: number; REMEDIATION_DUTY: number; COMBINED_IEEPA: number;
    }>(`
      SELECT TOP 10
        e.RECID,
        RTRIM(e.ENTRY_FIL)+'-'+RTRIM(e.ENTRY)+RTRIM(e.ENTRY_DIG) AS ENT_NO,
        e.ENTRY_DATE, e.PORT_COD, e.CUST_KEY, m.CO_NAME,
        ISNULL(e.ENTRY_VAL,0)        AS ENTRY_VAL,
        ISNULL(e.DUTY_SEC_IEEPA,0)   AS IEEPA_DUTY,
        ISNULL(e.REMEDIATION_DUTY,0) AS REMEDIATION_DUTY,
        ISNULL(e.DUTY_SEC_IEEPA,0) + ISNULL(e.REMEDIATION_DUTY,0) AS COMBINED_IEEPA
      FROM USENTRY e
      LEFT JOIN MST m ON m.CO_KEY = e.CUST_KEY
      WHERE ${conditions.join(' AND ')}
      ORDER BY COMBINED_IEEPA DESC
    `);

    res.json(result.recordset.map(row => ({
      recid:           String(row.RECID),
      entryNo:         row.ENT_NO.trim(),
      entryDate:       row.ENTRY_DATE,
      port:            row.PORT_COD.trim(),
      custKey:         row.CUST_KEY.trim(),
      custName:        row.CO_NAME?.trim() ?? null,
      entryVal:        Number(row.ENTRY_VAL),
      ieepaDuty:       Number(row.IEEPA_DUTY),
      remediationDuty: Number(row.REMEDIATION_DUTY),
      combinedIeepa:   Number(row.COMBINED_IEEPA),
    })));
  } catch (err) {
    logger.error('GET /entries/ieepa/top-entries failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch IEEPA top entries' });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildEmptyKpis() {
  return {
    entriesInRange: 0, entriesPrior: 0,
    dutyInRange: 0, dutyPrior: 0, valueInRange: 0,
    sec301InRange: 0, sec232InRange: 0, ieepaInRange: 0, remediationInRange: 0,
    avgReleaseDays: null, entriesPending: 0,
    dateFrom: '', dateTo: '',
  };
}

export default router;
