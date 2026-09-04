import { prisma } from '../../db';

// The extraction queue (extractionQueue.ts) holds job state only in memory, so a
// server restart mid-extraction leaves rows stranded in 'processing' forever.
// This sweep — run at startup and on an interval from server.ts — fails any row
// that has been 'processing' longer than a real extraction could plausibly take.
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

export async function sweepStaleProcessingConversions(maxAgeMs = STALE_PROCESSING_MS): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const { count } = await prisma.conversion.updateMany({
    where: { status: 'processing', createdAt: { lt: cutoff } },
    data: {
      status: 'failed',
      extractionError: 'Extraction did not complete (the server may have restarted). Re-upload the invoice.',
    },
  });
  if (count > 0) console.warn(`[staleConversions] marked ${count} stalled conversion(s) as failed`);
  return count;
}
