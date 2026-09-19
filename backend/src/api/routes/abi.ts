import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { getMssqlPool } from '../../db/mssql';
import { logger } from '../../utils/logger';
import { getAllowedCoKeys, assertCoKeyAllowed, parseDate, defaultRange } from '../entryScope';

const router = Router();

// ── Status mappings ───────────────────────────────────────────────────────────

function mapTrafficStatus(raw: string): string {
  switch (raw) {
    case 'O': return 'Open';
    case 'C': return 'Closed';
    default:  return raw;
  }
}

function mapStmtStatus(raw: string): string {
  switch (raw) {
    case 'P': return 'Paid';
    case 'A': return 'Pending';
    case 'S': return 'Submitted';
    case 'R': return 'Rejected';
    default:  return raw;
  }
}

// ── Scope builder for TRAF (CUST_KEY) ────────────────────────────────────────

function appendTrafCoKeyConditions({ r, coKey, allowed }: {
  r: sql.Request;
  coKey?: string;
  allowed: string[] | null;
}): string[] {
  const conditions: string[] = [];
  if (coKey) {
    r.input('coKey', sql.VarChar(6), coKey);
    conditions.push('RTRIM(t.CUST_KEY) = @coKey');
  } else if (allowed !== null && allowed.length > 0) {
    const pn = allowed.map((_, i) => `@ck${i}`);
    allowed.forEach((k, i) => r.input(`ck${i}`, sql.VarChar(6), k));
    conditions.push(`RTRIM(t.CUST_KEY) IN (${pn.join(',')})`);
  }
  return conditions;
}

// ── Scope builder for USDSTMT (IMP_KEY) ──────────────────────────────────────

function appendStmtCoKeyConditions({ r, coKey, allowed }: {
  r: sql.Request;
  coKey?: string;
  allowed: string[] | null;
}): string[] {
  const conditions: string[] = [];
  if (coKey) {
    r.input('coKey', sql.VarChar(6), coKey);
    conditions.push('RTRIM(s.IMP_KEY) = @coKey');
  } else if (allowed !== null && allowed.length > 0) {
    const pn = allowed.map((_, i) => `@ck${i}`);
    allowed.forEach((k, i) => r.input(`ck${i}`, sql.VarChar(6), k));
    conditions.push(`RTRIM(s.IMP_KEY) IN (${pn.join(',')})`);
  }
  return conditions;
}

// ── GET /api/abi/crossing?coKey=&dateFrom=&dateTo=&page=&limit=&status= ───────
router.get('/crossing', async (req: Request, res: Response): Promise<void> => {
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

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('offset',   sql.Int,      offset);
    r.input('pageSize', sql.Int,      pageSize);
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);

    const conditions: string[] = [
      't.TRAF_DATE BETWEEN @dateFrom AND @dateTo',
      ...appendTrafCoKeyConditions({ r, coKey, allowed }),
    ];

    if (status) {
      // Accept friendly label or raw single-char value
      const rawStatus = (() => {
        switch (status.toLowerCase()) {
          case 'open':   return 'O';
          case 'closed': return 'C';
          default:       return status.toUpperCase();
        }
      })();
      r.input('status', sql.Char(1), rawStatus);
      conditions.push('t.TRAF_STAT = @status');
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const [countResult, dataResult] = await Promise.all([
      r.query<{ TOTAL: number }>(`
        SELECT COUNT(*) AS TOTAL
        FROM   TRAF t
        ${where}
      `),
      r.query<{
        RECID:      string;
        TRAF_NO:    string;
        ENTRY_NO:   string | null;
        ENTRY_RECID: string | null;
        TRAF_DATE:  Date;
        CUST_KEY:   string;
        CO_NAME:    string | null;
        CUST_REF1:  string | null;
        CREF_VALUE: number | null;
        PORT_COD:   string | null;
        PEDIMENTO:  string | null;
        TRAF_STAT:  string;
      }>(`
        SELECT
          t.RECID,
          RTRIM(t.TRAF_NO)   AS TRAF_NO,
          RTRIM(tc.DOC_ID)   AS ENTRY_NO,
          e.RECID            AS ENTRY_RECID,
          t.TRAF_DATE,
          RTRIM(t.CUST_KEY)  AS CUST_KEY,
          m.CO_NAME,
          RTRIM(t.CUST_REF1) AS CUST_REF1,
          t.CREF_VALUE,
          RTRIM(t.PORT_COD)  AS PORT_COD,
          RTRIM(t.PEDIMENTO) AS PEDIMENTO,
          RTRIM(t.TRAF_STAT) AS TRAF_STAT
        FROM   TRAF t
        LEFT   JOIN MST m ON m.CO_KEY = RTRIM(t.CUST_KEY)
        -- One TRAFC 'ENTRY' doc per TRAF_NO at most (verified — no TRAF_NO
        -- carries more than one), so this LEFT JOIN can't fan out rows.
        LEFT   JOIN TRAFC tc ON tc.TRAF_NO = t.TRAF_NO AND tc.DOC_TYPE = 'ENTRY'
        LEFT   JOIN USENTRY e ON RTRIM(e.ENTRY_FIL)+'-'+RTRIM(e.ENTRY)+'-'+RTRIM(e.ENTRY_DIG) = RTRIM(tc.DOC_ID)
        ${where}
        ORDER  BY t.TRAF_DATE DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `),
    ]);

    res.json({
      data: dataResult.recordset.map(row => {
        const rawSt = row.TRAF_STAT.trim();
        return {
          recid:      String(row.RECID),
          trafficNo:  row.TRAF_NO.trim(),
          entryNo:    row.ENTRY_NO?.trim() || null,
          entryRecid: row.ENTRY_RECID != null ? String(row.ENTRY_RECID) : null,
          date:       row.TRAF_DATE ? row.TRAF_DATE.toISOString().slice(0, 10) : null,
          coKey:      row.CUST_KEY.trim(),
          coName:     row.CO_NAME?.trim() ?? null,
          custRef:    row.CUST_REF1?.trim() ?? null,
          value:      row.CREF_VALUE !== null ? Number(row.CREF_VALUE) : null,
          port:       row.PORT_COD?.trim() ?? null,
          pedimento:  row.PEDIMENTO?.trim() || null,
          status:     mapTrafficStatus(rawSt),
          rawStatus:  rawSt,
        };
      }),
      total:    Number(countResult.recordset[0].TOTAL),
      page:     pageNum,
      pageSize,
    });
  } catch (err) {
    logger.error('GET /abi/crossing failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch ABI crossing records' });
  }
});

// ── GET /api/abi/statements?coKey=&dateFrom=&dateTo=&page=&limit= ─────────────
router.get('/statements', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      coKey, page = '1', limit = '25',
      dateFrom: dfStr, dateTo: dtStr,
    } = req.query as {
      coKey?: string; page?: string; limit?: string;
      dateFrom?: string; dateTo?: string;
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

    const def  = defaultRange();
    const from = parseDate(dfStr, def.from);
    const to   = parseDate(dtStr, def.to);

    const pool = await getMssqlPool();
    const r    = pool.request();
    r.input('offset',   sql.Int,      offset);
    r.input('pageSize', sql.Int,      pageSize);
    r.input('dateFrom', sql.DateTime, from);
    r.input('dateTo',   sql.DateTime, to);

    const conditions: string[] = [
      's.REC_DATE BETWEEN @dateFrom AND @dateTo',
      ...appendStmtCoKeyConditions({ r, coKey, allowed }),
    ];

    const where = 'WHERE ' + conditions.join(' AND ');

    const [countResult, dataResult] = await Promise.all([
      r.query<{ TOTAL: number }>(`
        SELECT COUNT(*) AS TOTAL
        FROM   USDSTMT s
        ${where}
      `),
      r.query<{
        RECID:       string;
        STMT_NO:     string;
        REC_DATE:    Date;
        DUE_DATE:    Date | null;
        STATUS:      string;
        AMT:         number | null;
        ENTRY_COUNT: number | null;
        PORT_PROC:   string | null;
        IMP_KEY:     string;
        CO_NAME:     string | null;
        IMP_OF_REC:  string | null;
        CHECK_NO:    string | null;
      }>(`
        SELECT
          s.RECID,
          RTRIM(s.STMT_NO)    AS STMT_NO,
          s.REC_DATE,
          s.DUE_DATE,
          RTRIM(s.STATUS)     AS STATUS,
          s.AMT,
          s.ENTRY_COUNT,
          RTRIM(s.PORT_PROC)  AS PORT_PROC,
          RTRIM(s.IMP_KEY)    AS IMP_KEY,
          m.CO_NAME,
          RTRIM(s.IMP_OF_REC) AS IMP_OF_REC,
          RTRIM(s.CHECK_NO)   AS CHECK_NO
        FROM   USDSTMT s
        LEFT   JOIN MST m ON m.CO_KEY = RTRIM(s.IMP_KEY)
        ${where}
        ORDER  BY s.REC_DATE DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `),
    ]);

    res.json({
      data: dataResult.recordset.map(row => {
        const rawSt = row.STATUS.trim();
        return {
          recid:       String(row.RECID),
          stmtNo:      row.STMT_NO.trim(),
          date:        row.REC_DATE  ? row.REC_DATE.toISOString().slice(0, 10)  : null,
          dueDate:     row.DUE_DATE  ? row.DUE_DATE.toISOString().slice(0, 10)  : null,
          status:      rawSt,
          statusLabel: mapStmtStatus(rawSt),
          amount:      row.AMT         !== null ? Number(row.AMT)         : null,
          entryCount:  row.ENTRY_COUNT !== null ? Number(row.ENTRY_COUNT) : null,
          port:        row.PORT_PROC?.trim() ?? null,
          coKey:       row.IMP_KEY.trim(),
          coName:      row.CO_NAME?.trim() ?? null,
          impOfRecord: row.IMP_OF_REC?.trim() ?? null,
          checkNo:     row.CHECK_NO?.trim() ?? null,
        };
      }),
      total:    Number(countResult.recordset[0].TOTAL),
      page:     pageNum,
      pageSize,
    });
  } catch (err) {
    logger.error('GET /abi/statements failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch ABI statements' });
  }
});

export default router;
