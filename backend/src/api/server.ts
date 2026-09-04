import express from 'express';
import multer from 'multer';
import { authenticateJWT } from './middleware/authenticateJWT';
import { apiRateLimiter } from './middleware/rateLimiter';
import authRouter from './routes/auth';
import changesRouter from './routes/changes';
import clientsRouter from './routes/clients';
import reviewRouter from './routes/review';
import alertsRouter from './routes/alerts';
import entriesRouter from './routes/entries';
import aesRouter from './routes/aes';
import abiRouter from './routes/abi';
import htsBreakdownRouter from './routes/htsBreakdown';
import converterConversionsRouter, { InvalidFileTypeError } from './routes/converterConversions';
import converterOperationsRouter from './routes/converterOperations';
import converterLayoutsRouter from './routes/converterLayouts';
import converterTemplatesRouter from './routes/converterTemplates';
import converterFacilityRouter from './routes/converterFacility';
import converterFtzClientsRouter from './routes/converterFtzClients';
import converterFtz214FieldsRouter from './routes/converterFtz214Fields';
import converterUsersRouter from './routes/converterUsers';
import { accessLog as converterAccessLog } from '../converter/middleware/accessLog';
import { startPollers } from '../pollers/pollerManager';
import { sweepStaleProcessingConversions } from '../converter/services/staleConversions';
import { sweepOldAccessLogs } from '../converter/services/accessLogService';
import { logger } from '../utils/logger';
import { prisma } from '../db';
import { closeMssqlPool } from '../db/mssql';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.PORTAL_URL ?? 'https://tradeportal.jdgroup.net',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5176',
  'http://localhost:3000',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Global rate limiter ───────────────────────────────────────────────────────
app.use('/api/', apiRateLimiter);

// ── Health check (no auth required) ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Auth routes (no JWT required) ────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── All other routes require JWT ──────────────────────────────────────────────
app.use('/api', authenticateJWT);
app.use('/api/changes', changesRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/review', reviewRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/entries/hts-breakdown', htsBreakdownRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/aes', aesRouter);
app.use('/api/abi', abiRouter);

// ── FTZ Converter (ported from AAA-Converter) ──────────────────────────────────
app.use('/api/converter', converterAccessLog);
app.use('/api/converter/conversions', converterConversionsRouter);
app.use('/api/converter/operations', converterOperationsRouter);
app.use('/api/converter/layouts', converterLayoutsRouter);
app.use('/api/converter/templates', converterTemplatesRouter);
app.use('/api/converter/facility', converterFacilityRouter);
app.use('/api/converter/ftz-clients', converterFtzClientsRouter);
app.use('/api/converter/ftz214/fields', converterFtz214FieldsRouter);
app.use('/api/converter/users', converterUsersRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Catches errors from middleware that runs BEFORE a converter route handler's own
// try/catch can — specifically multer's fileFilter/size-limit errors on
// /api/converter/conversions, which it reports via `next(err)` rather than by
// calling the route handler at all.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof InvalidFileTypeError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File exceeds the 15MB size limit' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Without this, a container stop (SIGTERM) or Ctrl+C (SIGINT) kills the process
// mid-request and leaves the Prisma/MSSQL pool connections dangling on the DB
// server's side until they time out on their own.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close();
  await Promise.allSettled([
    prisma.$disconnect(),
    closeMssqlPool(),
  ]);
  clearTimeout(forceExit);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info(`JD Tariff Monitor API listening on port ${PORT}`, {
    nodeEnv: process.env.NODE_ENV,
    port: PORT,
  });

  if (process.env.NODE_ENV !== 'test') {
    startPollers();

    // FTZ Converter: recover conversions stranded in 'processing' by a prior
    // crash (the extraction queue is in-memory, so a restart abandons whatever
    // it held), then keep sweeping.
    void sweepStaleProcessingConversions().catch((err) => logger.error('[startup] stale conversion sweep failed', { message: (err as Error).message }));
    const staleSweepTimer = setInterval(
      () => void sweepStaleProcessingConversions().catch((err) => logger.error('[sweep] stale conversion sweep failed', { message: (err as Error).message })),
      5 * 60 * 1000,
    );
    staleSweepTimer.unref();

    // Prune AccessLog rows past the retention window (default 90 days).
    void sweepOldAccessLogs().catch((err) => logger.error('[startup] access-log sweep failed', { message: (err as Error).message }));
    const accessLogSweepTimer = setInterval(
      () => void sweepOldAccessLogs().catch((err) => logger.error('[sweep] access-log sweep failed', { message: (err as Error).message })),
      6 * 60 * 60 * 1000,
    );
    accessLogSweepTimer.unref();
  }
});

export default app;
