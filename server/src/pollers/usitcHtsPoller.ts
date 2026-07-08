import { prisma } from '../db';
import { sha256, hasChanged } from '../diffing/sha256Differ';
import { processNotice, isDuplicateHash } from '../diffing/changeDetector';
import { logger } from '../utils/logger';

// The USITC direct HTS REST API (reststop/exportJSON) is no longer available.
// We fall back to polling Federal Register for USITC investigation and HTS notices.
const SOURCE_NAME = 'usitc_hts';
const POLL_URL =
  'https://www.federalregister.gov/api/v1/documents.json' +
  '?conditions%5Bterm%5D=USITC+%22Section+337%22+%22HTS%22+antidumping+countervailing' +
  '&fields%5B%5D=document_number' +
  '&fields%5B%5D=title' +
  '&fields%5B%5D=publication_date' +
  '&fields%5B%5D=effective_on' +
  '&fields%5B%5D=abstract' +
  '&fields%5B%5D=html_url' +
  '&per_page=20' +
  '&order=newest';

interface FederalRegisterDocument {
  document_number: string;
  title: string;
  publication_date: string;
  effective_on?: string | null;
  abstract?: string | null;
  html_url: string;
}

interface FederalRegisterResponse {
  results: FederalRegisterDocument[];
}

async function getOrCreateSource(): Promise<string> {
  const source = await prisma.tariffSource.upsert({
    where: { name: SOURCE_NAME },
    create: { name: SOURCE_NAME },
    update: {},
  });
  return source.id;
}

export async function pollUsitcHts(): Promise<void> {
  logger.info('Polling USITC/Federal Register for trade investigation notices', { url: POLL_URL });

  let responseBody: string;
  try {
    const response = await fetch(POLL_URL, {
      headers: { 'User-Agent': 'JD-Tariff-Monitor/1.0 (jdgroup customs brokerage)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    responseBody = await response.text();
  } catch (err) {
    logger.error('USITC Federal Register fetch failed', { error: String(err) });
    return;
  }

  const sourceId = await getOrCreateSource();
  const newHash = sha256(responseBody);

  const source = await prisma.tariffSource.findUnique({ where: { id: sourceId } });
  if (!hasChanged(newHash, source?.lastHash)) {
    logger.info('USITC: no changes detected');
    await prisma.tariffSource.update({ where: { id: sourceId }, data: { lastPolled: new Date() } });
    return;
  }

  let parsed: FederalRegisterResponse;
  try {
    parsed = JSON.parse(responseBody) as FederalRegisterResponse;
  } catch (err) {
    logger.error('USITC: Failed to parse Federal Register JSON', { error: String(err) });
    return;
  }

  const documents = parsed.results ?? [];
  let newCount = 0;

  for (const doc of documents) {
    const docContent = doc.abstract ?? doc.title;
    const docHash = sha256(`usitc-fr:${doc.document_number}:${docContent}`);

    const duplicate = await isDuplicateHash(docHash, sourceId);
    if (duplicate) continue;

    const changeId = await processNotice({
      sourceId,
      documentNumber: doc.document_number,
      title: doc.title,
      rawContent: docContent,
      publicationDate: new Date(doc.publication_date),
      effectiveDate: doc.effective_on ? new Date(doc.effective_on) : undefined,
      sourceUrl: doc.html_url,
      rawPayloadHash: docHash,
    });

    if (changeId) newCount++;
  }

  await prisma.tariffSource.update({
    where: { id: sourceId },
    data: { lastHash: newHash, lastPolled: new Date() },
  });

  logger.info('USITC poll complete', { newChanges: newCount });
}
