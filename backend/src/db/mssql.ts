import sql from 'mssql';
import { logger } from '../utils/logger';

const poolConfig: sql.config = {
  server:   process.env.MSSQL_SERVER   ?? '10.10.10.223',
  port:     parseInt(process.env.MSSQL_PORT ?? '1433', 10),
  database: process.env.MSSQL_DATABASE ?? 'db_2506BIM',
  user:     process.env.MSSQL_USER     ?? 'chatbot',
  password: process.env.MSSQL_PASSWORD ?? '***REMOVED-LEAKED-CREDENTIAL***',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 15_000,
  requestTimeout:    30_000,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
};

let _pool: sql.ConnectionPool | null = null;

export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (_pool?.connected) return _pool;

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
