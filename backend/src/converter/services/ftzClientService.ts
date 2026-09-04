import { prisma } from '../../db';

export class FtzClientNotFoundError extends Error {}

export interface FtzClientInput {
  name: string;
  irsNumber?: string | null;
  companyKey: string;
}

export async function listFtzClients() {
  return prisma.ftzClient.findMany({ orderBy: { name: 'asc' }, take: 200 });
}

export async function createFtzClient(input: FtzClientInput) {
  return prisma.ftzClient.create({
    data: {
      name: input.name.trim(),
      irsNumber: input.irsNumber?.trim() || null,
      companyKey: input.companyKey.trim(),
    },
  });
}

export async function updateFtzClient(id: string, input: Partial<FtzClientInput>) {
  const existing = await prisma.ftzClient.findUnique({ where: { id } });
  if (!existing) throw new FtzClientNotFoundError('Client not found');
  return prisma.ftzClient.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.irsNumber !== undefined ? { irsNumber: input.irsNumber?.trim() || null } : {}),
      ...(input.companyKey !== undefined ? { companyKey: input.companyKey.trim() } : {}),
    },
  });
}

export async function deleteFtzClient(id: string): Promise<void> {
  const existing = await prisma.ftzClient.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new FtzClientNotFoundError('Client not found');
  await prisma.ftzClient.delete({ where: { id } });
}
