import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { getMssqlPool } from '../../db/mssql';
import { logger } from '../../utils/logger';
import { getAllowedCoKeys, assertCoKeyAllowed, parseDate, defaultRange } from '../entryScope';

const router = Router();

// ── Scope builder ─────────────────────────────────────────────────────────────
// Not the same as entryScope.ts's appendCoKeyConditions — this one wraps the
// column in RTRIM() to match against a padded CHAR column, kept file-local
// deliberately rather than forced through the generic (unpadded) version.

function appendCoKeyConditions({ r, coKey, allowed }: {
  r: sql.Request;
  coKey?: string;
  allowed: string[] | null;
}): string[] {
  const conditions: string[] = [];
  if (coKey) {
    r.input('coKey', sql.VarChar(6), coKey);
    conditions.push('RTRIM(e.IMPOR_KEY) = @coKey');
  } else if (allowed !== null && allowed.length > 0) {
    const pn = allowed.map((_, i) => `@ck${i}`);
    allowed.forEach((k, i) => r.input(`ck${i}`, sql.VarChar(6), k));
    conditions.push(`RTRIM(e.IMPOR_KEY) IN (${pn.join(',')})`);
  }
  return conditions;
}

// ── Status mapping ─────────────────────────────────────────────────────────────

function mapAesStatus(raw: string): string {
  switch (raw) {
    case 'PROCESS_OK':  return 'ACCEPTED';
    case 'P_ERROR':     return 'ERROR';
    case 'CANCEL':      return 'CANCELLED';
    case 'CONVERTED':   return 'FILED';
    case 'DUPLICATED':  return 'DUPLICATED';
    case 'INUSE_P':     return 'PROCESSING';
    default:            return raw;
  }
}

/** Strip trailing extension like '.EDA' from a reference string. */
function stripRefExtension(ref: string): string {
  const dotIdx = ref.lastIndexOf('.');
  if (dotIdx === -1) return ref;
  return ref.slice(0, dotIdx);
}

// ── GET /api/aes?coKey=&dateFrom=&dateTo=&page=&limit=&status= ────────────────
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
      "e.DOC_TYPE = 'SED'",
      'e.REC_DATE BETWEEN @dateFrom AND @dateTo',
      ...appendCoKeyConditions({ r, coKey, allowed }),
    ];

    if (status) {
      // Accept either the friendly label or the raw MSSQL value
      const rawStatus = (() => {
        switch (status.toUpperCase()) {
          case 'ACCEPTED':   return 'PROCESS_OK';
          case 'ERROR':      return 'P_ERROR';
          case 'CANCELLED':  return 'CANCEL';
          case 'FILED':      return 'CONVERTED';
          case 'DUPLICATED': return 'DUPLICATED';
          case 'PROCESSING': return 'INUSE_P';
          default:           return status.toUpperCase();
        }
      })();
      r.input('status', sql.VarChar(20), rawStatus);
      conditions.push('e.STATUS = @status');
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const [countResult, dataResult] = await Promise.all([
      r.query<{ TOTAL: number }>(`
        SELECT COUNT(*) AS TOTAL
        FROM   EDI_FILES e
        ${where}
      `),
      r.query<{
        RECID:      string;
        DOC_ID:     string;
        IMPOR_KEY:  string;
        REFERENCE:  string;
        STATUS:     string;
        REC_DATE:   Date;
        CO_NAME:    string | null;
      }>(`
        SELECT
          e.RECID,
          RTRIM(e.DOC_ID)    AS DOC_ID,
          RTRIM(e.IMPOR_KEY) AS IMPOR_KEY,
          RTRIM(e.REFERENCE) AS REFERENCE,
          RTRIM(e.STATUS)    AS STATUS,
          e.REC_DATE,
          m.CO_NAME
        FROM   EDI_FILES e
        LEFT   JOIN MST m ON m.CO_KEY = RTRIM(e.IMPOR_KEY)
        ${where}
        ORDER  BY e.REC_DATE DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `),
    ]);

    res.json({
      data: dataResult.recordset.map(row => {
        const fullRef  = row.REFERENCE.trim();
        const custRef  = stripRefExtension(fullRef);
        const rawSt    = row.STATUS.trim();
        return {
          recid:     String(row.RECID),
          reference: row.DOC_ID.trim(),
          custRef,
          coKey:     row.IMPOR_KEY.trim(),
          coName:    row.CO_NAME?.trim() ?? null,
          status:    mapAesStatus(rawSt),
          rawStatus: rawSt,
          date:      row.REC_DATE ? row.REC_DATE.toISOString().slice(0, 10) : null,
        };
      }),
      total:    Number(countResult.recordset[0].TOTAL),
      page:     pageNum,
      pageSize,
    });
  } catch (err) {
    logger.error('GET /aes failed', { message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch AES filings' });
  }
});

export default router;
