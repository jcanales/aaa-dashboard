import express from 'express';
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
import { startPollers } from '../pollers/pollerManager';
import { logger } from '../utils/logger';

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

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`JD Tariff Monitor API listening on port ${PORT}`, {
    nodeEnv: process.env.NODE_ENV,
    port: PORT,
  });

  if (process.env.NODE_ENV !== 'test') {
    startPollers();
  }
});

export default app;
