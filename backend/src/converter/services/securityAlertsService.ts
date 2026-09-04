import { prisma } from '../../db';

export class AlertNotFoundError extends Error {}

export async function listAlerts(status: 'open' | 'all') {
  return prisma.securityAlert.findMany({
    where: status === 'open' ? { acknowledgedAt: null } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function acknowledgeAlert(id: string, adminId: string) {
  try {
    return await prisma.securityAlert.update({
      where: { id },
      data: { acknowledgedAt: new Date(), acknowledgedById: adminId },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') throw new AlertNotFoundError('Alert not found');
    throw err;
  }
}
