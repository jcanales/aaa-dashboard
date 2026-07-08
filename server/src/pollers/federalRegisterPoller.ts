import { prisma } from '../db';
import { sha256, hasChanged } from '../diffing/sha256Differ';
import { processNotice, isDuplicateHash } from '../diffing/changeDetector';
import { logger } from '../utils/logger';

const SOURCE_NAME = 'federal_register';
// Use term-only search — the agency[] filter param is rejected by the API
const POLL_URL =
  'https://www.federalregister.gov/api/v1/documents.json' +
  '?conditions%5Bterm%5D=tariff+duty+IEEPA+%22Section+301%22+%22Section+232%22+USMCA' +
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
  agencies?: Array<{ name: string }>;
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

export async function pollFederalRegister(): Promise<void> {
  logger.info('Polling Federal Register', { url: POLL_URL });

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
    logger.error('Federal Register fetch failed', { error: String(err) });
    return;
  }

  const sourceId = await getOrCreateSource();
  const newHash = sha256(responseBody);

  const source = await prisma.tariffSource.findUnique({ where: { id: sourceId } });
  if (!hasChanged(newHash, source?.lastHash)) {
    logger.info('Federal Register: no changes detected', { hash: newHash });
    await prisma.tariffSource.update({
      where: { id: sourceId },
      data: { lastPolled: new Date() },
    });
    return;
  }

  logger.info('Federal Register: changes detected, processing documents');

  let parsed: FederalRegisterResponse;
  try {
    parsed = JSON.parse(responseBody) as FederalRegisterResponse;
  } catch (err) {
    logger.error('Failed to parse Federal Register JSON', { error: String(err) });
    return;
  }

  const documents = parsed.results ?? [];
  let newCount = 0;

  for (const doc of documents) {
    const docContent = doc.abstract ?? doc.title;
    const docHash = sha256(`${doc.document_number}:${docContent}`);

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

  logger.info('Federal Register poll complete', { newDocuments: newCount });
}
