import sql from 'mssql';
import { Response } from 'express';
import { prisma } from '../db';

/** null = unrestricted (admin/broker/manager). Empty array = no access. */
export async function getAllowedCoKeys(userId: string, role: string): Promise<string[] | null> {
  if (role === 'admin' || role === 'broker' || role === 'manager') return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  return (user.clientCoKeys as string[]) ?? [];
}

export function assertCoKeyAllowed(coKey: string, allowed: string[] | null, res: Response): boolean {
  if (allowed === null) return true;
  if (allowed.includes(coKey)) return true;
  res.status(403).json({ error: 'Access denied for this client account' });
  return false;
}

/** Parse a date string to a Date, defaulting to `fallback` if missing/invalid. */
export function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

/** Default date range: start of 3 months ago → today. */
export function defaultRange(): { from: Date; to: Date } {
  const to   = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 2);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** Compute prior period of the same length immediately before dateFrom. */
export function priorPeriod(from: Date, to: Date): { priorFrom: Date; priorTo: Date } {
  const durationMs  = to.getTime() - from.getTime();
  const priorTo     = new Date(from.getTime() - 1);
  const priorFrom   = new Date(priorTo.getTime() - durationMs);
  return { priorFrom, priorTo };
}

export function appendCoKeyConditions({ r, coKey, allowed, column = 'e.CUST_KEY' }: {
  r:       sql.Request;
  coKey?:  string;
  allowed: string[] | null;
  column?: string;
}): string[] {
  const conditions: string[] = [];
  if (coKey) {
    r.input('coKey', sql.VarChar(6), coKey);
    conditions.push(`${column} = @coKey`);
  } else if (allowed !== null && allowed.length > 0) {
    const pn = allowed.map((_, i) => `@ck${i}`);
    allowed.forEach((k, i) => r.input(`ck${i}`, sql.VarChar(6), k));
    conditions.push(`${column} IN (${pn.join(',')})`);
  }
  return conditions;
}
