import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { getMssqlPool } from '../../db/mssql';
import { logger } from '../../utils/logger';
import {
  getAllowedCoKeys, assertCoKeyAllowed, parseDate,
  defaultRange, priorPeriod, appendCoKeyConditions,
} from '../entryScope';
import { perEntryDutyCte, bucketPredicates } from '../htsBuckets';

const router = Router();

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
      res.json({ totalEntries: 0, ieepaEntries: 0, totalValue: 0, regularDuty: 0, sec301: 0, sec232: 0, ieepaDuty: 0, other99Duty: 0, totalDuty: 0 });
      return;
    }

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);

    const conditions = appendCoKeyConditions({ r, coKey, allowed });

    const result = await r.query<{
      TOTAL_ENTRIES: number; IEEPA_ENTRIES: number; TOTAL_VALUE: number;
      REGULAR_DUTY: number; SEC301: number; SEC232: number;
      IEEPA_DUTY: number; OTHER99_DUTY: number;
    }>(`
      ${perEntryDutyCte(conditions)}
      SELECT
        COUNT(*) AS TOTAL_ENTRIES,
        SUM(CASE WHEN ISNULL(pe.ieepa,0) > 0 THEN 1 ELSE 0 END) AS IEEPA_ENTRIES,
        SUM(es.ENTRY_VAL)               AS TOTAL_VALUE,
        SUM(ISNULL(pe.regular_duty,0))  AS REGULAR_DUTY,
        SUM(ISNULL(pe.sec301,0))        AS SEC301,
        SUM(ISNULL(pe.sec232,0))        AS SEC232,
        SUM(ISNULL(pe.ieepa,0))         AS IEEPA_DUTY,
        SUM(ISNULL(pe.other99,0))       AS OTHER99_DUTY
      FROM entries_scope es
      LEFT JOIN per_entry pe ON pe.entry_id = es.RECID
    `);

    const row = result.recordset[0];
    const regularDuty = Number(row.REGULAR_DUTY);
    const sec301 = Number(row.SEC301);
    const sec232 = Number(row.SEC232);
    const ieepaDuty = Number(row.IEEPA_DUTY);
    const other99Duty = Number(row.OTHER99_DUTY);
    res.json({
      totalEntries: Number(row.TOTAL_ENTRIES),
      ieepaEntries: Number(row.IEEPA_ENTRIES),
      totalValue:   Number(row.TOTAL_VALUE),
      regularDuty, sec301, sec232, ieepaDuty, other99Duty,
      totalDuty:    regularDuty + sec301 + sec232 + ieepaDuty + other99Duty,
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

    const conditions = appendCoKeyConditions({ r, coKey, allowed });

    const result = await r.query<{
      YR: number; MO: number; ENTRIES: number; IEEPA_ENTRIES: number;
      REGULAR_DUTY: number; SEC301: number; SEC232: number;
      IEEPA_DUTY: number; OTHER99_DUTY: number;
    }>(`
      ${perEntryDutyCte(conditions)}
      SELECT
        YEAR(es.ENTRY_DATE)  AS YR,
        MONTH(es.ENTRY_DATE) AS MO,
        COUNT(*) AS ENTRIES,
        SUM(CASE WHEN ISNULL(pe.ieepa,0) > 0 THEN 1 ELSE 0 END) AS IEEPA_ENTRIES,
        SUM(ISNULL(pe.regular_duty,0)) AS REGULAR_DUTY,
        SUM(ISNULL(pe.sec301,0))       AS SEC301,
        SUM(ISNULL(pe.sec232,0))       AS SEC232,
        SUM(ISNULL(pe.ieepa,0))        AS IEEPA_DUTY,
        SUM(ISNULL(pe.other99,0))      AS OTHER99_DUTY
      FROM entries_scope es
      LEFT JOIN per_entry pe ON pe.entry_id = es.RECID
      GROUP BY YEAR(es.ENTRY_DATE), MONTH(es.ENTRY_DATE)
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
      other99Duty:  Number(row.OTHER99_DUTY),
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

    const conditions = appendCoKeyConditions({ r, coKey, allowed });

    const result = await r.query<{
      RECID: string; ENT_NO: string; ENTRY_DATE: Date;
      PORT_COD: string; CUST_KEY: string; CO_NAME: string | null;
      ENTRY_VAL: number; IEEPA_DUTY: number; OTHER99_DUTY: number; COMBINED_IEEPA: number;
    }>(`
      ${perEntryDutyCte(conditions)}
      SELECT TOP 10
        es.RECID,
        RTRIM(es.ENTRY_FIL)+'-'+RTRIM(es.ENTRY)+RTRIM(es.ENTRY_DIG) AS ENT_NO,
        es.ENTRY_DATE, es.PORT_COD, es.CUST_KEY, m.CO_NAME,
        es.ENTRY_VAL                  AS ENTRY_VAL,
        ISNULL(pe.ieepa,0)            AS IEEPA_DUTY,
        ISNULL(pe.other99,0)          AS OTHER99_DUTY,
        ISNULL(pe.ieepa,0) + ISNULL(pe.other99,0) AS COMBINED_IEEPA
      FROM entries_scope es
      LEFT JOIN per_entry pe ON pe.entry_id = es.RECID
      LEFT JOIN MST m ON m.CO_KEY = es.CUST_KEY
      WHERE (ISNULL(pe.ieepa,0) + ISNULL(pe.other99,0)) > 0
      ORDER BY COMBINED_IEEPA DESC
    `);

    res.json(result.recordset.map(row => ({
      recid:        String(row.RECID),
      entryNo:      row.ENT_NO.trim(),
      entryDate:    row.ENTRY_DATE,
      port:         row.PORT_COD?.trim() ?? '',
      custKey:      row.CUST_KEY?.trim() ?? '',
      custName:     row.CO_NAME?.trim() ?? null,
      entryVal:     Number(row.ENTRY_VAL),
      ieepaDuty:    Number(row.IEEPA_DUTY),
      other99Duty:  Number(row.OTHER99_DUTY),
      combinedIeepa: Number(row.COMBINED_IEEPA),
    })));
  } catch (err) {
    logger.error('GET /entries/ieepa/top-entries failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch IEEPA top entries' });
  }
});

// ── GET /api/entries/:recid ─────────────────────────────────────────────────────
// Full single-entry detail: header, duty composition by bucket, and a
// per-line breakdown. Line-level classification mirrors htsBreakdown.ts's
// perLineCte — grouped by USLINE.RECID ("line_id"), which is what actually
// ties a commodity's entered value (often on a USLINEB child) to whichever
// chapter-99 duty programs (on the parent and/or sibling children) apply to
// that same physical line — see docs/superpowers for the investigation that
// worked this structure out from real data before this endpoint existed.
router.get('/:recid', async (req: Request, res: Response): Promise<void> => {
  try {
    const recid = String(req.params.recid);
    if (!/^\d+$/.test(recid)) {
      res.status(400).json({ error: 'recid must be numeric' });
      return;
    }

    const userId  = req.user!.userId;
    const role    = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('recid', sql.BigInt, BigInt(recid));

    const headerResult = await r.query<{
      RECID: string; ENTRY_FIL: string; ENTRY: string; ENTRY_DIG: string;
      ENTRY_DATE: Date | null; REL_DATE: Date | null; LIQ_DATE: Date | null;
      PORT_COD: string | null; CUST_KEY: string; CO_NAME: string | null;
      ORIGIN_CO: string | null; EXPOR_CO: string | null; MOT: string | null;
      ENTRY_TYPE: string | null; ENTRY_VAL: number;
    }>(`
      SELECT
        e.RECID, RTRIM(e.ENTRY_FIL) AS ENTRY_FIL, RTRIM(e.ENTRY) AS ENTRY, RTRIM(e.ENTRY_DIG) AS ENTRY_DIG,
        e.ENTRY_DATE, e.REL_DATE, e.LIQ_DATE,
        RTRIM(e.PORT_COD) AS PORT_COD, RTRIM(e.CUST_KEY) AS CUST_KEY, m.CO_NAME,
        RTRIM(e.ORIGIN_CO) AS ORIGIN_CO, RTRIM(e.EXPOR_CO) AS EXPOR_CO,
        RTRIM(e.MOT) AS MOT, RTRIM(e.ENTRY_TYPE) AS ENTRY_TYPE,
        ISNULL(e.ENTRY_VAL,0) AS ENTRY_VAL
      FROM USENTRY e
      LEFT JOIN MST m ON m.CO_KEY = RTRIM(e.CUST_KEY)
      WHERE e.RECID = @recid
    `);

    const header = headerResult.recordset[0];
    if (!header) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    if (!assertCoKeyAllowed(header.CUST_KEY, allowed, res)) return;

    const p = bucketPredicates('tusa');
    const linesResult = await r.query<{
      LINE_ID: string; HTS: string | null; DESCR: string | null;
      ENTERED_VALUE: number; REGULAR_DUTY: number; SEC301: number;
      SEC232: number; IEEPA: number; OTHER99: number;
    }>(`
      WITH lines AS (
        SELECT l.RECID AS line_id, REPLACE(RTRIM(l.TUSA), '.', '') AS tusa,
               ISNULL(l.VALUE, 0) AS val, ISNULL(l.DUTY, 0) AS duty, l.DESC1 AS descr
        FROM   USLINE l
        WHERE  l.USENTRY_RECID = @recid
        UNION ALL
        SELECT b.USLINE_RECID AS line_id, REPLACE(RTRIM(b.TUSA), '.', '') AS tusa,
               ISNULL(b.VALUE, 0) AS val, ISNULL(b.DUTY, 0) AS duty, b.DESC1 AS descr
        FROM   USLINEB b
        JOIN   USLINE  l ON l.RECID = b.USLINE_RECID
        WHERE  l.USENTRY_RECID = @recid
      )
      SELECT
        line_id AS LINE_ID,
        MAX(CASE WHEN ${p.regular} THEN tusa  END)          AS HTS,
        MAX(CASE WHEN ${p.regular} THEN descr END)          AS DESCR,
        SUM(CASE WHEN ${p.regular} THEN val  ELSE 0 END)    AS ENTERED_VALUE,
        SUM(CASE WHEN ${p.regular} THEN duty ELSE 0 END)    AS REGULAR_DUTY,
        SUM(CASE WHEN ${p.sec301}  THEN duty ELSE 0 END)    AS SEC301,
        SUM(CASE WHEN ${p.sec232}  THEN duty ELSE 0 END)    AS SEC232,
        SUM(CASE WHEN ${p.ieepa}   THEN duty ELSE 0 END)    AS IEEPA,
        SUM(CASE WHEN ${p.other99} THEN duty ELSE 0 END)    AS OTHER99
      FROM lines
      GROUP BY line_id
      ORDER BY ENTERED_VALUE DESC
    `);

    const lines = linesResult.recordset.map(row => {
      const regularDuty = Number(row.REGULAR_DUTY);
      const sec301 = Number(row.SEC301);
      const sec232 = Number(row.SEC232);
      const ieepa  = Number(row.IEEPA);
      const other99 = Number(row.OTHER99);
      return {
        lineId:       String(row.LINE_ID),
        hts:          row.HTS,
        description:  row.DESCR?.trim() || null,
        enteredValue: Number(row.ENTERED_VALUE),
        regularDuty, sec301, sec232, ieepa, other99,
        totalDuty:    regularDuty + sec301 + sec232 + ieepa + other99,
      };
    });

    const totals = lines.reduce((t, l) => ({
      regularDuty: t.regularDuty + l.regularDuty,
      sec301:      t.sec301 + l.sec301,
      sec232:      t.sec232 + l.sec232,
      ieepa:       t.ieepa + l.ieepa,
      other99:     t.other99 + l.other99,
    }), { regularDuty: 0, sec301: 0, sec232: 0, ieepa: 0, other99: 0 });
    const totalDuty = totals.regularDuty + totals.sec301 + totals.sec232 + totals.ieepa + totals.other99;

    res.json({
      recid:      String(header.RECID),
      entryNo:    `${header.ENTRY_FIL}-${header.ENTRY}-${header.ENTRY_DIG}`,
      custKey:    header.CUST_KEY,
      custName:   header.CO_NAME?.trim() ?? null,
      entryDate:  header.ENTRY_DATE ? header.ENTRY_DATE.toISOString() : null,
      relDate:    header.REL_DATE ? header.REL_DATE.toISOString() : null,
      liqDate:    header.LIQ_DATE ? header.LIQ_DATE.toISOString() : null,
      port:       header.PORT_COD,
      originCo:   header.ORIGIN_CO,
      exporCo:    header.EXPOR_CO,
      mot:        header.MOT,
      entryType:  header.ENTRY_TYPE,
      entryVal:   Number(header.ENTRY_VAL),
      ...totals,
      totalDuty,
      lines,
    });
  } catch (err) {
    logger.error('GET /entries/:recid failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch entry detail' });
  }
});

// ── GET /api/entries/:recid/cbp7501 ─────────────────────────────────────────────
// Data to recreate CBP Form 7501 (Entry Summary) for one entry. This is a
// best-effort approximation for internal reference, NOT a legal substitute
// for the entry summary actually filed with CBP: fields this system has no
// record of (declarant signature, broker phone, MPF/HMF fee amounts, missing-
// document codes, IT numbers, visa/certificate numbers) come back null and
// must render blank, never guessed. Field mapping follows the block numbers
// in CBP Form 7501 (02/26)'s own instructions (see docs/superpowers).
router.get('/:recid/cbp7501', async (req: Request, res: Response): Promise<void> => {
  try {
    const recid = String(req.params.recid);
    if (!/^\d+$/.test(recid)) {
      res.status(400).json({ error: 'recid must be numeric' });
      return;
    }

    const userId  = req.user!.userId;
    const role    = req.user!.role;
    const allowed = await getAllowedCoKeys(userId, role);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('recid', sql.BigInt, BigInt(recid));

    const headerResult = await r.query<{
      RECID: string; ENTRY_FIL: string; ENTRY: string; ENTRY_DIG: string;
      ENTRY_TYPE: string | null; ENTRY_DATE: Date | null; SURETY: string | null;
      BOND_TYPE: string | null; PORT_COD: string | null; MOT: string | null;
      ORIGIN_CO: string | null; IMPOR_DATE: Date | null; EXPOR_CO: string | null;
      EXPOR_DATE: Date | null; FN_PORT_LAD: string | null; US_PORT_UNLD: string | null;
      CUST_KEY: string; ENTRY_VAL: number;
      IMP_NAME: string | null; IMP_ADDR1: string | null; IMP_ADDR2: string | null;
      IMP_CITY: string | null; IMP_ST: string | null; IMP_ZIP: string | null; IMP_IRS: string | null;
      CONS_NAME: string | null; CONS_ADDR1: string | null; CONS_ADDR2: string | null;
      CONS_CITY: string | null; CONS_ST: string | null; CONS_ZIP: string | null; CONS_IRS: string | null;
    }>(`
      SELECT
        e.RECID, RTRIM(e.ENTRY_FIL) AS ENTRY_FIL, RTRIM(e.ENTRY) AS ENTRY, RTRIM(e.ENTRY_DIG) AS ENTRY_DIG,
        RTRIM(e.ENTRY_TYPE) AS ENTRY_TYPE, e.ENTRY_DATE, RTRIM(e.SURETY) AS SURETY,
        RTRIM(e.BOND_TYPE) AS BOND_TYPE, RTRIM(e.PORT_COD) AS PORT_COD, RTRIM(e.MOT) AS MOT,
        RTRIM(e.ORIGIN_CO) AS ORIGIN_CO, e.IMPOR_DATE, RTRIM(e.EXPOR_CO) AS EXPOR_CO,
        e.EXPOR_DATE, RTRIM(e.FN_PORT_LAD) AS FN_PORT_LAD, RTRIM(e.US_PORT_UNLD) AS US_PORT_UNLD,
        RTRIM(e.CUST_KEY) AS CUST_KEY, ISNULL(e.ENTRY_VAL,0) AS ENTRY_VAL,
        imp.CO_NAME AS IMP_NAME, imp.ADDR1 AS IMP_ADDR1, imp.ADDR2 AS IMP_ADDR2,
        imp.CITY AS IMP_CITY, imp.ST AS IMP_ST, imp.ZIP AS IMP_ZIP, imp.IRS_NO AS IMP_IRS,
        cons.CO_NAME AS CONS_NAME, cons.ADDR1 AS CONS_ADDR1, cons.ADDR2 AS CONS_ADDR2,
        cons.CITY AS CONS_CITY, cons.ST AS CONS_ST, cons.ZIP AS CONS_ZIP, cons.IRS_NO AS CONS_IRS
      FROM USENTRY e
      LEFT JOIN MST imp  ON imp.CO_KEY  = RTRIM(e.IMPOR_KEY)
      LEFT JOIN MST cons ON cons.CO_KEY = RTRIM(e.CONS_KEY)
      WHERE e.RECID = @recid
    `);

    const header = headerResult.recordset[0];
    if (!header) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    if (!assertCoKeyAllowed(header.CUST_KEY, allowed, res)) return;

    const p = bucketPredicates('tusa');
    const linesResult = await r.query<{
      LINE_ID: string; HTS: string | null; DESCR: string | null; MID: string | null;
      GROSS_WEIGHT: number | null; NET_QTY: number | null; UNITS: string | null;
      ENTERED_VALUE: number; REGULAR_DUTY: number; SEC301: number;
      SEC232: number; IEEPA: number; OTHER99: number;
    }>(`
      WITH lines AS (
        SELECT l.RECID AS line_id, REPLACE(RTRIM(l.TUSA), '.', '') AS tusa,
               ISNULL(l.VALUE, 0) AS val, ISNULL(l.DUTY, 0) AS duty, l.DESC1 AS descr,
               l.MANUF_ID AS mid, l.GROSS AS gross, l.NET_QTY1 AS net_qty, RTRIM(l.UNITS_1) AS units
        FROM   USLINE l
        WHERE  l.USENTRY_RECID = @recid
        UNION ALL
        SELECT b.USLINE_RECID AS line_id, REPLACE(RTRIM(b.TUSA), '.', '') AS tusa,
               ISNULL(b.VALUE, 0) AS val, ISNULL(b.DUTY, 0) AS duty, b.DESC1 AS descr,
               NULL AS mid, NULL AS gross, NULL AS net_qty, NULL AS units
        FROM   USLINEB b
        JOIN   USLINE  l ON l.RECID = b.USLINE_RECID
        WHERE  l.USENTRY_RECID = @recid
      )
      SELECT
        line_id AS LINE_ID,
        MAX(CASE WHEN ${p.regular} THEN tusa  END)          AS HTS,
        MAX(CASE WHEN ${p.regular} THEN descr END)          AS DESCR,
        MAX(mid)                                            AS MID,
        MAX(gross)                                          AS GROSS_WEIGHT,
        MAX(net_qty)                                        AS NET_QTY,
        MAX(units)                                          AS UNITS,
        SUM(CASE WHEN ${p.regular} THEN val  ELSE 0 END)    AS ENTERED_VALUE,
        SUM(CASE WHEN ${p.regular} THEN duty ELSE 0 END)    AS REGULAR_DUTY,
        SUM(CASE WHEN ${p.sec301}  THEN duty ELSE 0 END)    AS SEC301,
        SUM(CASE WHEN ${p.sec232}  THEN duty ELSE 0 END)    AS SEC232,
        SUM(CASE WHEN ${p.ieepa}   THEN duty ELSE 0 END)    AS IEEPA,
        SUM(CASE WHEN ${p.other99} THEN duty ELSE 0 END)    AS OTHER99
      FROM lines
      GROUP BY line_id
      ORDER BY ENTERED_VALUE DESC
    `);

    const lines = linesResult.recordset.map((row, i) => {
      const regularDuty = Number(row.REGULAR_DUTY);
      const sec301 = Number(row.SEC301);
      const sec232 = Number(row.SEC232);
      const ieepa  = Number(row.IEEPA);
      const other99 = Number(row.OTHER99);
      const totalDuty = regularDuty + sec301 + sec232 + ieepa + other99;
      return {
        lineNo:       String(i + 1).padStart(3, '0'),
        hts:          row.HTS,
        description:  row.DESCR?.trim() || null,
        mid:          row.MID?.trim() || null,
        grossWeight:  row.GROSS_WEIGHT != null ? Number(row.GROSS_WEIGHT) : null,
        netQty:       row.NET_QTY != null ? Number(row.NET_QTY) : null,
        units:        row.UNITS || null,
        enteredValue: Number(row.ENTERED_VALUE),
        dutyRate:     Number(row.ENTERED_VALUE) > 0 ? (totalDuty / Number(row.ENTERED_VALUE)) * 100 : 0,
        totalDuty,
      };
    });

    const totalDuty = lines.reduce((s, l) => s + l.totalDuty, 0);

    const addr = (name: string | null, a1: string | null, a2: string | null, city: string | null, st: string | null, zip: string | null, irs: string | null) => ({
      name: name?.trim() || null,
      addr1: a1?.trim() || null,
      addr2: a2?.trim() || null,
      city: city?.trim() || null,
      state: st?.trim() || null,
      zip: zip?.trim() || null,
      irsNo: irs?.trim() || null,
    });

    res.json({
      recid:        String(header.RECID),
      entryNo:      `${header.ENTRY_FIL}-${header.ENTRY}-${header.ENTRY_DIG}`,
      entryType:    header.ENTRY_TYPE,
      entryDate:    header.ENTRY_DATE ? header.ENTRY_DATE.toISOString() : null,
      surety:       header.SURETY,
      bondType:     header.BOND_TYPE,
      port:         header.PORT_COD,
      mot:          header.MOT,
      originCo:     header.ORIGIN_CO,
      importDate:   header.IMPOR_DATE ? header.IMPOR_DATE.toISOString() : null,
      exporCo:      header.EXPOR_CO,
      exportDate:   header.EXPOR_DATE ? header.EXPOR_DATE.toISOString() : null,
      foreignPortOfLading: header.FN_PORT_LAD,
      usPortOfUnlading:    header.US_PORT_UNLD,
      entryVal:     Number(header.ENTRY_VAL),
      totalDuty,
      importerOfRecord: addr(header.IMP_NAME, header.IMP_ADDR1, header.IMP_ADDR2, header.IMP_CITY, header.IMP_ST, header.IMP_ZIP, header.IMP_IRS),
      ultimateConsignee: addr(header.CONS_NAME, header.CONS_ADDR1, header.CONS_ADDR2, header.CONS_CITY, header.CONS_ST, header.CONS_ZIP, header.CONS_IRS),
      lines,
    });
  } catch (err) {
    logger.error('GET /entries/:recid/cbp7501 failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch CBP Form 7501 data' });
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
