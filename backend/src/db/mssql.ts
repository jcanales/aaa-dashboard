import sql from 'mssql';
import { logger } from '../utils/logger';

// Fail fast on a missing required var rather than silently connecting to the
// wrong (or a hardcoded) server — a typo'd or unset .env should be a startup
// crash, not a quiet fallback to whatever was hardcoded here at some point.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (set it in .env)`);
  return value;
}

function buildPoolConfig(): sql.config {
  return {
    server:   requireEnv('MSSQL_HOST'),
    port:     parseInt(process.env.MSSQL_PORT ?? '1433', 10),
    database: requireEnv('MSSQL_DATABASE'),
    user:     requireEnv('MSSQL_USER'),
    password: requireEnv('MSSQL_PASSWORD'),
    options: {
      // Default to an encrypted connection — only disable it via env for a
      // legacy on-prem SQL Server instance that genuinely can't negotiate TLS.
      encrypt: process.env.MSSQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERT !== 'false',
    },
    connectionTimeout: 15_000,
    requestTimeout:    30_000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  };
}

let _pool: sql.ConnectionPool | null = null;

export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (_pool?.connected) return _pool;

  const poolConfig = buildPoolConfig();
  _pool = new sql.ConnectionPool(poolConfig);
  _pool.on('error', (err) => {
    logger.error('MSSQL pool error', { message: err.message });
    _pool = null;
  });

  await _pool.connect();
  logger.info('MSSQL pool connected', { server: poolConfig.server, db: poolConfig.database });
  return _pool;
}

export async function closeMssqlPool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

// ── RB Systems (SmartBorder) FTZ lookups ────────────────────────────────────────
// Read-only queries against the same MST / US214 tables `entryScope`/`entries`
// already query on this pool — used by the FTZ Converter module to resolve an
// invoice's importer to its RB Systems Company/Customer key and to look up the
// next free FTZ admission number.

export interface RbClientMatch {
  companyKey: string;
  customerKey: string;
  name: string;
  irs: string;
}

const digitsOnly = (s: string) => s.replace(/[^0-9]/g, '');

// `MST.CO_KEY` is the id filled into both CompanyKey and Customer. `CUST_KEY`,
// when set, is a billing/parent alias — prefer it for the Customer field, fall
// back to CO_KEY. Match on the IRS digits first (exact, unique), name second.
const RB_CLIENT_LOOKUP_SQL = `
  SELECT TOP 1
    LTRIM(RTRIM(CO_KEY))                                            AS companyKey,
    COALESCE(NULLIF(LTRIM(RTRIM(CUST_KEY)), ''), LTRIM(RTRIM(CO_KEY))) AS customerKey,
    LTRIM(RTRIM(CO_NAME))                                           AS name,
    LTRIM(RTRIM(ISNULL(IRS_NO, '')))                                AS irs
  FROM MST
  WHERE
    ( @irs <> '' AND LEN(REPLACE(REPLACE(REPLACE(ISNULL(IRS_NO,''),'-',''),' ',''),'.','')) >= 8
      AND ( REPLACE(REPLACE(REPLACE(ISNULL(IRS_NO,''),'-',''),' ',''),'.','') LIKE @irs + '%'
         OR @irs LIKE REPLACE(REPLACE(REPLACE(ISNULL(IRS_NO,''),'-',''),' ',''),'.','') + '%' ) )
    OR ( @irs = '' AND @name <> '' AND CO_NAME LIKE '%' + @name + '%' )
  ORDER BY
    CASE WHEN @name <> '' AND CO_NAME LIKE '%' + @name + '%' THEN 0 ELSE 1 END,
    CO_KEY
`;

export async function lookupRbClient(input: { name?: string | null; irs?: string | null }): Promise<RbClientMatch | null> {
  const irs = digitsOnly(input.irs ?? '');
  const name = (input.name ?? '').trim().replace(/[.,]+$/, '');
  if (!irs && !name) return null;

  const pool = await getMssqlPool();
  const result = await pool
    .request()
    .input('irs', sql.VarChar, irs)
    .input('name', sql.VarChar, name)
    .query<RbClientMatch>(RB_CLIENT_LOOKUP_SQL);
  return result.recordset[0] ?? null;
}

// The highest FTZ admission number currently on file in RB (0 if the table is
// empty). RB stores it in US214.FTZ_NUMBER — a zero-padded varchar(8) running
// one per zone admission for this broker DB.
export async function getRbMaxFtzNumber(): Promise<number> {
  const pool = await getMssqlPool();
  const result = await pool
    .request()
    .query<{ maxN: number | null }>('SELECT MAX(CAST(FTZ_NUMBER AS INT)) AS maxN FROM US214');
  return result.recordset[0]?.maxN ?? 0;
}
