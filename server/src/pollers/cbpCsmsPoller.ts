import { XMLParser } from 'fast-xml-parser';
import { prisma } from '../db';
import { sha256, hasChanged } from '../diffing/sha256Differ';
import { processNotice, isDuplicateHash } from '../diffing/changeDetector';
import { logger } from '../utils/logger';

const SOURCE_NAME = 'cbp_csms';
const RSS_URL = 'https://www.cbp.gov/rss.xml';

// Keywords that must appear in the TITLE to be considered tariff-related.
// Intentionally specific — "duty" alone or "ACE" alone appear in enforcement
// and general news items and must NOT be used as standalone triggers.
const TITLE_KEYWORDS = [
  'tariff',
  'duty rate',
  'import duty',
  'hts',
  'ieepa',
  'section 301',
  'section 232',
  'rate advance',
  'liquidation',
  'trade remedy',
  'antidumping',
  'countervailing',
  'usmca',
  'fta',
  'bonded',
  'drawback',
  'binding ruling',
  'informed compliance',
  'duty refund',
];

// Keywords checked in the description — must be multi-word and very specific.
const DESC_KEYWORDS = [
  'ieepa',
  'section 301',
  'section 232',
  'hts code',
  'tariff rate',
  'duty rate',
  'trade remedy',
  'antidumping duty',
  'countervailing duty',
];

// Titles containing any of these indicate enforcement/law-enforcement actions
// (drug seizures, arrests, fugitives, etc.) that are NOT tariff regulatory changes.
const EXCLUDE_TITLE_KEYWORDS = [
  'seize',
  'seizure',
  'arrest',
  'fugitive',
  'cocaine',
  'narcotics',
  'marijuana',
  'fentanyl',
  'heroin',
  'drug',
  'weapon',
  'contraband',
  'human trafficking',
  'sex offense',
  'human growth',
  'stops',
  'stopped',
  'apprehend',
];

interface RssItem {
  title?: string | { '#text'?: string };
  link?: string;
  description?: string | { '#text'?: string };
  pubDate?: string;
  guid?: string | { '#text'?: string };
}

interface RssFeed {
  rss?: {
    channel?: {
      item?: RssItem | RssItem[];
    };
  };
}

function extractText(field: string | { '#text'?: string } | undefined): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field['#text'] ?? '';
}

function isRelevant(title: string, description: string): boolean {
  const titleLower = title.toLowerCase();

  // Immediately exclude enforcement/law-enforcement actions
  if (EXCLUDE_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) return false;

  // Pass if the title contains a tariff-specific term
  if (TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) return true;

  // Fall back to description — but only for very specific multi-word phrases
  const descLower = description.toLowerCase();
  return DESC_KEYWORDS.some((kw) => descLower.includes(kw));
}

async function getOrCreateSource(): Promise<string> {
  const source = await prisma.tariffSource.upsert({
    where: { name: SOURCE_NAME },
    create: { name: SOURCE_NAME },
    update: {},
  });
  return source.id;
}

export async function pollCbpCsms(): Promise<void> {
  logger.info('Polling CBP CSMS RSS', { url: RSS_URL });

  let responseBody: string;
  try {
    const response = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'JD-Tariff-Monitor/1.0 (jdgroup customs brokerage)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    responseBody = await response.text();
  } catch (err) {
    logger.error('CBP CSMS RSS fetch failed', { error: String(err) });
    return;
  }

  const sourceId = await getOrCreateSource();
  const newHash = sha256(responseBody);

  const source = await prisma.tariffSource.findUnique({ where: { id: sourceId } });
  if (!hasChanged(newHash, source?.lastHash)) {
    logger.info('CBP CSMS: no changes detected');
    await prisma.tariffSource.update({
      where: { id: sourceId },
      data: { lastPolled: new Date() },
    });
    return;
  }

  logger.info('CBP CSMS: changes detected, parsing RSS');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseTagValue: true,
    cdataPropName: '#text',
    processEntities: false,
  });

  let feed: RssFeed;
  try {
    feed = parser.parse(responseBody) as RssFeed;
  } catch (err) {
    logger.error('CBP CSMS: RSS parse error', { error: String(err) });
    return;
  }

  const channel = feed?.rss?.channel;
  if (!channel) {
    logger.warn('CBP CSMS: unexpected RSS structure');
    return;
  }

  const rawItems = channel.item;
  const items: RssItem[] = rawItems
    ? Array.isArray(rawItems)
      ? rawItems
      : [rawItems]
    : [];

  let newCount = 0;

  for (const item of items) {
    const title = extractText(item.title);
    const description = extractText(item.description);
    const link = extractText(item.link as unknown as string) || '';
    const pubDateStr = item.pubDate ?? '';
    const guid = extractText(item.guid);

    if (!isRelevant(title, description)) continue;

    const content = `${title}\n\n${description}`;
    const docHash = sha256(`cbp-csms:${guid || link || title}:${description}`);

    const isDup = await isDuplicateHash(docHash, sourceId);
    if (isDup) continue;

    const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();
    if (isNaN(pubDate.getTime())) {
      logger.warn('CBP CSMS: invalid pubDate', { pubDateStr, title });
    }

    const changeId = await processNotice({
      sourceId,
      title: title || 'CBP CSMS Bulletin',
      rawContent: content,
      publicationDate: isNaN(pubDate.getTime()) ? new Date() : pubDate,
      sourceUrl: link || RSS_URL,
      rawPayloadHash: docHash,
    });

    if (changeId) newCount++;
  }

  await prisma.tariffSource.update({
    where: { id: sourceId },
    data: { lastHash: newHash, lastPolled: new Date() },
  });

  logger.info('CBP CSMS poll complete', { itemsChecked: items.length, newChanges: newCount });
}
