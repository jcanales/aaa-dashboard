import { prisma } from '../db';
import { classifyTariffNotice } from '../ai/claudeClassifier';
import { matchClientsToChange } from '../matching/clientMatcher';
import { logger } from '../utils/logger';

export interface RawNotice {
  sourceId: string;
  documentNumber?: string;
  title: string;
  rawContent: string;
  publicationDate: Date;
  effectiveDate?: Date;
  sourceUrl: string;
  rawPayloadHash: string;
}

/**
 * Process a single regulatory notice:
 *   1. Classify it with Claude
 *   2. Persist a TariffChange record (status = 'pending')
 *   3. Run client HTS matching
 *
 * Returns the new TariffChange id, or null if an error occurs.
 */
export async function processNotice(notice: RawNotice): Promise<string | null> {
  logger.info('Processing notice', {
    title: notice.title,
    sourceId: notice.sourceId,
    documentNumber: notice.documentNumber,
  });

  let classification;
  try {
    classification = await classifyTariffNotice(notice.title, notice.rawContent);
  } catch (err) {
    logger.error('Classification failed, skipping notice', {
      error: String(err),
      title: notice.title,
    });
    return null;
  }

  let changeId: string;
  try {
    const change = await prisma.tariffChange.create({
      data: {
        sourceId: notice.sourceId,
        documentNumber: notice.documentNumber ?? null,
        title: notice.title,
        summary: classification.summary,
        impactScore: classification.impactScore,
        impactRationale: classification.impactRationale,
        htsCodes: classification.htsCodes,
        dutyBefore: classification.dutyBefore ?? undefined,
        dutyAfter: classification.dutyAfter ?? undefined,
        effectiveDate: notice.effectiveDate ?? null,
        publicationDate: notice.publicationDate,
        sourceUrl: notice.sourceUrl,
        rawPayloadHash: notice.rawPayloadHash,
        status: 'pending',
      },
    });
    changeId = change.id;
    logger.info('TariffChange persisted', { changeId, title: notice.title });
  } catch (err) {
    logger.error('Failed to persist TariffChange', { error: String(err), title: notice.title });
    return null;
  }

  // Update audit log with the real changeId
  try {
    await prisma.aiAuditLog.updateMany({
      where: { changeId: null, model: 'claude-sonnet-4-20250514' },
      data: { changeId },
    });
  } catch (_) {
    // Non-critical — audit log linkage failure should not fail the pipeline
  }

  try {
    await matchClientsToChange(changeId);
  } catch (err) {
    logger.error('Client matching failed', { error: String(err), changeId });
    // Non-fatal: change was already saved
  }

  return changeId;
}

/**
 * Check whether a hash already exists in the changes table for a given source.
 * Avoids re-processing a document that was already ingested.
 */
export async function isDuplicateHash(rawPayloadHash: string, sourceId: string): Promise<boolean> {
  const existing = await prisma.tariffChange.findFirst({
    where: { rawPayloadHash, sourceId },
    select: { id: true },
  });
  return existing !== null;
}
