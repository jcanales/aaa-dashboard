import { XMLParser } from 'fast-xml-parser';
import { prisma } from '../db';
import { sha256, hasChanged } from '../diffing/sha256Differ';
import { processNotice, isDuplicateHash } from '../diffing/changeDetector';
import { logger } from '../utils/logger';

const SOURCE_NAME = 'ustr';
const FEED_URL = 'https://www.whitehouse.gov/presidential-actions/feed/';

const KEYWORDS = [
  'tariff',
  'trade',
  'IEEPA',
  'executive order',
  'duty',
  'import',
  'Section 301',
  'Section 232',
  'USMCA',
];

interface FeedItem {
  title?: string | { '#text'?: string };
  link?: string;
  description?: string | { '#text'?: string };
  pubDate?: string;
  guid?: string | { '#text'?: string };
  'content:encoded'?: string | { '#text'?: string };
}

interface AtomFeed {
  rss?: { channel?: { item?: FeedItem | FeedItem[] } };
  feed?: { entry?: FeedItem | FeedItem[] };
}

function extractText(field: unknown): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field !== null && '#text' in field) {
    return String((field as Record<string, unknown>)['#text'] ?? '');
  }
  return String(field);
}

function isRelevant(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  return KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()));
}

async function getOrCreateSource(): Promise<string> {
  const source = await prisma.tariffSource.upsert({
    where: { name: SOURCE_NAME },
    create: { name: SOURCE_NAME },
    update: {},
  });
  return source.id;
}

export async function pollUstr(): Promise<void> {
  logger.info('Polling WhiteHouse feed', { url: FEED_URL });

  let responseBody: string;
  try {
    const response = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'JD-Tariff-Monitor/1.0 (jdgroup customs brokerage)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    responseBody = await response.text();
  } catch (err) {
    logger.error('WhiteHouse feed fetch failed', { error: String(err) });
    return;
  }

  const sourceId = await getOrCreateSource();
  const newHash = sha256(responseBody);

  const source = await prisma.tariffSource.findUnique({ where: { id: sourceId } });
  if (!hasChanged(newHash, source?.lastHash)) {
    logger.info('WhiteHouse feed: no changes detected');
    await prisma.tariffSource.update({
      where: { id: sourceId },
      data: { lastPolled: new Date() },
    });
    return;
  }

  logger.info('WhiteHouse feed: changes detected, parsing');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseTagValue: true,
    cdataPropName: '#text',
  });

  let parsed: AtomFeed;
  try {
    parsed = parser.parse(responseBody) as AtomFeed;
  } catch (err) {
    logger.error('WhiteHouse feed parse error', { error: String(err) });
    return;
  }

  // Support both RSS and Atom feed structures
  const rawItems: FeedItem | FeedItem[] | undefined =
    parsed?.rss?.channel?.item ?? parsed?.feed?.entry;

  const items: FeedItem[] = rawItems
    ? Array.isArray(rawItems)
      ? rawItems
      : [rawItems]
    : [];

  let newCount = 0;

  for (const item of items) {
    const title = extractText(item.title);
    const description =
      extractText(item['content:encoded']) || extractText(item.description);
    const link = extractText(item.link);
    const pubDateStr = item.pubDate ?? '';
    const guid = extractText(item.guid);

    if (!isRelevant(title, description)) continue;

    const content = `${title}\n\n${description}`;
    const docHash = sha256(`whitehouse:${guid || link || title}:${description.slice(0, 500)}`);

    const isDup = await isDuplicateHash(docHash, sourceId);
    if (isDup) continue;

    const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

    const changeId = await processNotice({
      sourceId,
      title: title || 'WhiteHouse Trade Notice',
      rawContent: content,
      publicationDate: isNaN(pubDate.getTime()) ? new Date() : pubDate,
      sourceUrl: link || FEED_URL,
      rawPayloadHash: docHash,
    });

    if (changeId) newCount++;
  }

  await prisma.tariffSource.update({
    where: { id: sourceId },
    data: { lastHash: newHash, lastPolled: new Date() },
  });

  logger.info('WhiteHouse feed poll complete', { itemsChecked: items.length, newChanges: newCount });
}
