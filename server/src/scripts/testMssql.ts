import * as dotenv from 'dotenv';
import * as path from 'path';
import * as sql from 'mssql';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config: sql.config = {
  server:   process.env.MSSQL_HOST     ?? '',
  port:     parseInt(process.env.MSSQL_PORT ?? '1433', 10),
  database: process.env.MSSQL_DATABASE ?? '',
  user:     process.env.MSSQL_USER     ?? '',
  password: process.env.MSSQL_PASSWORD ?? '',
  options: {
    trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERT === 'true',
    encrypt:                process.env.MSSQL_ENCRYPT === 'true',
  },
  connectionTimeout: 15000,
};

async function main() {
  console.log(`Connecting to ${config.server}:${config.port} → ${config.database} as ${config.user} …`);
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT TOP 5
        TABLE_SCHEMA AS [schema],
        TABLE_NAME   AS [table],
        TABLE_TYPE   AS [type]
      FROM INFORMATION_SCHEMA.TABLES
      ORDER BY TABLE_NAME
    `);
    console.log('\nConnection successful. Sample tables:\n');
    console.table(result.recordset);
    await pool.close();
  } catch (err) {
    console.error('\nConnection failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
