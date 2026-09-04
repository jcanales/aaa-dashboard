import { prisma } from '../../db';
import { getRbMaxFtzNumber, isRbConfigured } from './rbSystemsService';

const FTZ_ALLOC_LOCK_KEY = 4712;
export const FTZ_NUMBER_WIDTH = 8;

export function formatFtzNumber(n: number): string {
  return String(n).padStart(FTZ_NUMBER_WIDTH, '0');
}

export type FtzAllocationOwner = { conversionId: string } | { operationId: string };
export interface FtzAllocationResult {
  /** The zero-padded number now permanently assigned to this owner. */
  number: string;
}

// A Prisma `where` that finds this owner's allocation row, and a `data` fragment
// that creates one. Exactly one of conversionId / operationId is ever set.
function ownerWhere(owner: FtzAllocationOwner) {
  return 'conversionId' in owner ? { conversionId: owner.conversionId } : { operationId: owner.operationId };
}

// Claim the definitive FTZ admission number for a conversion or an operation.
// Idempotent: an owner that already holds an allocation gets the same number
// back. Concurrent callers serialize on an advisory lock and the FtzAllocation
// primary key is the final backstop, so no two owners can ever share a number.
//
// Returns null when RB Systems is not configured (local/dev). Throws if RB is
// configured but unreachable — we must not hand out an unchecked number.
export async function allocateFtzNumber(owner: FtzAllocationOwner): Promise<FtzAllocationResult | null> {
  if (!isRbConfigured()) return null;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FTZ_ALLOC_LOCK_KEY})`;

    const existing = await tx.ftzAllocation.findUnique({ where: ownerWhere(owner) });
    if (existing) return { number: formatFtzNumber(existing.number) };

    const rbMax = await getRbMaxFtzNumber();
    const localMax = (await tx.ftzAllocation.aggregate({ _max: { number: true } }))._max.number ?? 0;

    let candidate = Math.max(rbMax, localMax) + 1;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await tx.ftzAllocation.create({ data: { number: candidate, ...ownerWhere(owner) } });
        return { number: formatFtzNumber(candidate) };
      } catch (err) {
        if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002') {
          candidate++;
          continue;
        }
        throw err;
      }
    }
    throw new Error('Could not allocate an FTZ number after 5 attempts');
  });
}

export async function getAllocatedFtzNumber(owner: FtzAllocationOwner): Promise<string | null> {
  const row = await prisma.ftzAllocation.findUnique({ where: ownerWhere(owner) });
  return row ? formatFtzNumber(row.number) : null;
}
