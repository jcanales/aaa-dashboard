import { prisma } from '../../db';
import { securityConfig } from '../config/security';
import { notifySecurityAlert } from './notificationsService';
import { encodeCursor, decodeCursor } from '../lib/cursor';

export interface AccessEntry {
  userId: string | null;
  username: string | null;
  method: string;
  route: string;
  path: string;
  query: string | null;
  statusCode: number;
  rowCount: number | null;
  ip: string | null;
  userAgent: string | null;
  durationMs: number;
}

// Called fire-and-forget from the accessLog middleware — must never throw and
// must never block the request.
export async function recordAccess(entry: AccessEntry): Promise<void> {
  try {
    await prisma.accessLog.create({ data: entry });
    if (entry.method === 'GET' && entry.userId && (entry.rowCount ?? 0) > 0) {
      await checkReadVolume(entry.userId, entry.username);
    }
  } catch (err) {
    console.error('[accessLog] write failed', err);
  }
}

// Raise a SecurityAlert when a user's read rate over the sampling window exceeds
// the threshold, debounced so one spike does not produce a stream of alerts.
export async function checkReadVolume(userId: string, username: string | null): Promise<void> {
  const cfg = securityConfig();
  const now = new Date();
  const windowFrom = new Date(now.getTime() - cfg.anomalyWindowMs);

  const readCount = await prisma.accessLog.count({
    where: { userId, method: 'GET', createdAt: { gte: windowFrom } },
  });
  if (readCount <= cfg.anomalyThreshold) return;

  const cooldownStart = new Date(now.getTime() - cfg.anomalyCooldownMs);
  const recent = await prisma.securityAlert.findFirst({
    where: { userId, kind: 'high-read-volume', createdAt: { gte: cooldownStart } },
  });
  if (recent) return;

  const alert = await prisma.securityAlert.create({
    data: {
      userId,
      username,
      kind: 'high-read-volume',
      detail: `${readCount} reads in ${Math.round(cfg.anomalyWindowMs / 60_000)} min (threshold ${cfg.anomalyThreshold})`,
      windowFrom,
      windowTo: now,
      readCount,
    },
  });
  notifySecurityAlert(alert);
}

export async function sweepOldAccessLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - securityConfig().accessLogRetentionMs);
  const { count } = await prisma.accessLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

export async function listAccessLog(filter: {
  userId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  before?: string;
}) {
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 50), 1), 100);
  const cursor = filter.before ? decodeCursor(filter.before) : null;
  const createdAt: Record<string, Date> = {};
  if (filter.from) createdAt.gte = filter.from;
  if (filter.to) createdAt.lte = filter.to;

  const rows = await prisma.accessLog.findMany({
    where: {
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
}

// One-shot per-user read counts for the "who's been hammering the API" admin
// view — distinct from checkReadVolume's per-request threshold alerting.
export async function accessLogSummary(sinceMs: number) {
  const since = new Date(Date.now() - sinceMs);
  const grouped = await prisma.accessLog.groupBy({
    by: ['userId'],
    where: { method: 'GET', createdAt: { gte: since } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  // One lookup for usernames (denormalized on the row; take the most recent per user).
  const names = await prisma.accessLog.findMany({
    where: {
      userId: { in: grouped.map((g) => g.userId).filter((x): x is string => !!x) },
      createdAt: { gte: since },
    },
    distinct: ['userId'],
    orderBy: { createdAt: 'desc' },
    select: { userId: true, username: true },
  });
  const nameOf = new Map(names.map((n) => [n.userId, n.username]));
  return grouped
    .map((g) => ({
      userId: g.userId,
      username: nameOf.get(g.userId) ?? null,
      reads: g._count._all,
      lastSeen: g._max.createdAt!,
    }))
    .sort((a, b) => b.reads - a.reads);
}
