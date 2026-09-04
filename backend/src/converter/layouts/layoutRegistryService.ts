import { prisma } from '../../db';
import { jaccardSimilarity } from './fingerprint';

export const LAYOUT_MATCH_THRESHOLD = 0.6;

export type LayoutStatus = 'detected' | 'validated' | 'rejected';
export const LAYOUT_STATUSES: LayoutStatus[] = ['detected', 'validated', 'rejected'];

export class LayoutNotFoundError extends Error {}

export interface LayoutMatch {
  id: string;
  fieldMap: Record<string, string | null>;
}

export async function findMatchingLayout(fingerprint: string[]): Promise<LayoutMatch | null> {
  // Only validated layouts drive extraction — a freshly auto-registered
  // ('detected') fingerprint waits for an admin to confirm it.
  const layouts = await prisma.invoiceLayout.findMany({
    where: { status: 'validated' },
    select: { id: true, fingerprint: true, fieldMap: true },
  });
  const incoming = new Set(fingerprint);

  let best: { id: string; fieldMap: Record<string, string | null>; score: number } | null = null;
  for (const layout of layouts) {
    const stored = new Set(layout.fingerprint as string[]);
    const score = jaccardSimilarity(incoming, stored);
    if (score >= LAYOUT_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { id: layout.id, fieldMap: layout.fieldMap as Record<string, string | null>, score };
    }
  }
  return best ? { id: best.id, fieldMap: best.fieldMap } : null;
}

export async function createLayout(
  fingerprint: string[],
  fieldMap: Record<string, string | null>,
  label?: string | null
) {
  return prisma.invoiceLayout.create({
    data: { fingerprint, fieldMap, label: label ?? null },
  });
}

export async function listLayouts() {
  const layouts = await prisma.invoiceLayout.findMany({
    select: {
      id: true,
      label: true,
      status: true,
      fieldMap: true,
      createdAt: true,
      validatedAt: true,
      _count: { select: { conversions: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return layouts.map((layout) => ({
    id: layout.id,
    label: layout.label,
    status: layout.status as LayoutStatus,
    fieldMap: layout.fieldMap as Record<string, string | null>,
    createdAt: layout.createdAt,
    validatedAt: layout.validatedAt,
    conversionCount: layout._count.conversions,
  }));
}

export async function updateLayout(
  id: string,
  patch: { label?: string | null; status?: LayoutStatus },
  validatedById: string
) {
  const existing = await prisma.invoiceLayout.findUnique({ where: { id } });
  if (!existing) throw new LayoutNotFoundError('Layout not found');

  const data: { label?: string | null; status?: string; validatedAt?: Date | null; validatedById?: string | null } = {};
  if (patch.label !== undefined) data.label = patch.label;
  if (patch.status !== undefined) {
    data.status = patch.status;
    if (patch.status === 'validated') {
      data.validatedAt = new Date();
      data.validatedById = validatedById;
    } else {
      data.validatedAt = null;
      data.validatedById = null;
    }
  }

  return prisma.invoiceLayout.update({ where: { id }, data });
}

export async function deleteLayout(id: string): Promise<void> {
  const existing = await prisma.invoiceLayout.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new LayoutNotFoundError('Layout not found');
  // Conversion.layoutId is an optional relation → Prisma's default onDelete is
  // SetNull, so deleting a layout keeps every conversion and its extracted data.
  await prisma.invoiceLayout.delete({ where: { id } });
}
