import { prisma } from '../../db';
import { Prisma, type Conversion } from '@prisma/client';
import { extractInvoiceData, analyzeNewLayout, withCleanedDescriptions, type ExtractionSuccess, type ExtractionFailure } from './extractionService';
import type { DetailExtractionResult } from '../ftz214/schemaBuilder';
import { extractCells } from '../parsing/pdfText';
import { detectTemplate } from '../parsing/templates';
import { isTemplateEnabled } from '../parsing/templateSettings';
import { splitWarnings } from '../parsing/confidence';
import { validateFtz214Data } from '../ftz214/validation';
import { buildFtz214Xml } from '../ftz214/xmlBuilder';
import { truncateOverLongProductNumbers } from '../ftz214/sanitize';
import { encodeCursor, decodeCursor } from '../lib/cursor';
import type { Ftz214Data, BillOfLadingData, FieldValues, LineData } from '../ftz214/types';
import { computeFingerprint } from '../layouts/fingerprint';
import { findMatchingLayout, createLayout } from '../layouts/layoutRegistryService';
import { getFacility } from './facilityService';
import { lookupRbClient, getNextFtzNumber, isRbConfigured } from './rbSystemsService';
import { allocateFtzNumber } from './ftzAllocationService';
import type { Warning } from '../parsing/types';

// CustomerName ("Name of Importer Submitting the File") and CompanyKey are the
// importer's — filled from the invoice / RB Systems lookup, not defaulted here.
const DEFAULT_APPLICATION_INFO = {
  SoftwareProvider: 'JD Group FTZ Converter',
  Module: 'FTZ_214',
  Version: '1.0',
  Action: 'A',
};

function emptyBillOfLading(): BillOfLadingData {
  return { fields: {}, lines: [] };
}

// Prisma's InputJsonValue only accepts types carrying a string index signature, which
// our named domain interfaces (BillOfLadingData, Ftz214Data) don't declare even though
// their runtime values are plain JSON. Confined to the Json column write boundary.
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// Claude's extraction output is a flat wire shape (bill-level fields alongside a
// `Line` array, per the schema in schemaBuilder.ts) — deliberately decoupled from
// BillOfLadingData's internal {fields, lines} shape so the LLM's JSON contract
// and our domain type can evolve independently. ExtractedFieldValue (allows
// `undefined`, optional inner units props) isn't structurally identical to
// FieldValue (used by the reviewed/edited domain data) — the cast is safe because
// both are just JSON-shaped data going into a Prisma Json column, and
// validation.ts/xmlBuilder.ts already treat field values as `unknown` at their
// boundaries rather than relying on this distinction.
function extractionToBillOfLading(extracted: DetailExtractionResult['billOfLading']): BillOfLadingData {
  const { Line, ...fields } = extracted;
  return { fields: fields as FieldValues, lines: Line as LineData[] };
}

interface DeterministicParse {
  detailData: { billsOfLading: BillOfLadingData[] };
  parseSource: string;
  parseWarnings: ReturnType<typeof splitWarnings>['nonBlocking'];
  importer: { name: string | null; irs: string | null };
  lineAnchors: { page: number; y: number }[];
}

// Resolve the importer identified on the invoice: fill its name into
// CustomerName ("Name of Importer Submitting the File"), and — via the RB
// Systems MST lookup — its key into CompanyKey + Customer (MST.CO_KEY is both).
async function resolveClientKeys(importer: {
  name: string | null;
  irs: string | null;
}): Promise<{ CustomerName?: string; CompanyKey?: string; Customer?: string; warning?: Warning }> {
  if (!importer.name && !importer.irs) return {};

  // The parsed importer name is a useful CustomerName even without RB.
  const base: { CustomerName?: string } = importer.name ? { CustomerName: importer.name } : {};

  if (!isRbConfigured()) return base;

  const match = await lookupRbClient(importer);
  if (match) {
    return {
      CustomerName: match.name || importer.name || undefined,
      CompanyKey: match.companyKey,
      Customer: match.customerKey,
      warning: {
        field: 'CompanyKey',
        message: `Importer "${match.name}" — Company Key / Customer set to ${match.companyKey} (matched in RB Systems by ${importer.irs ? `IRS ${importer.irs}` : 'name'}). Confirm it is right.`,
        blocking: false,
      },
    };
  }
  return {
    ...base,
    warning: {
      field: 'CompanyKey',
      message: `importer ${importer.name ?? ''}${importer.irs ? ` (IRS ${importer.irs})` : ''} not found in RB Systems — set Company Key / Customer manually`,
      blocking: false,
    },
  };
}

// Deterministic parse first: if a template matches and produces a clean parse
// (no blocking warnings), return its data with no Anthropic call. Anything else —
// no template, a blocking warning, an unreadable PDF, or *any* exception in the
// parse/cleanup chain — returns null so runExtraction falls through to the AI path.
async function tryDeterministicParse(pdfBase64: string): Promise<DeterministicParse | null> {
  try {
    const cells = await extractCells(pdfBase64);
    const parser = detectTemplate(cells);
    if (!parser) return null;
    // An admin can disable a parser from the Configuration page (e.g. it started
    // mis-reading a variant) — a disabled hit falls through to the AI path.
    if (!(await isTemplateEnabled(parser.id))) return null;
    const result = parser.parse(cells);
    const { blocking, nonBlocking } = splitWarnings(result);
    if (blocking.length > 0) return null;
    const bol = withCleanedDescriptions(result.billOfLading as DetailExtractionResult['billOfLading']);
    return {
      detailData: { billsOfLading: [extractionToBillOfLading(bol)] },
      parseSource: parser.id,
      parseWarnings: nonBlocking,
      importer: result.importer ?? { name: null, irs: null },
      lineAnchors: result.lineAnchors ?? [],
    };
  } catch (err) {
    console.warn('[conversions] deterministic parse failed, falling back to AI:', err);
    return null;
  }
}

// Step 1 of the upload lifecycle: persist a row the client can see immediately.
// Extraction runs afterwards in the background (runExtraction) and flips this row
// to 'draft' or 'failed'. Kept a bare create so the upload response is instant.
// Application Information and Header start pre-filled from the FTZ facility
// defaults (Configuration → FTZ Facility) so the operator only fills the
// shipment-specific fields.
export async function createPendingConversion(
  pdfFilename: string,
  pdfBase64: string,
  createdById: string,
) {
  const facility = await getFacility();
  // pdfData never goes over the wire in a list/detail payload — the review page
  // fetches it from GET /conversions/:id/pdf.
  const { pdfData: _pdf, ...created } = await prisma.conversion.create({
    data: {
      pdfFilename,
      pdfData: Buffer.from(pdfBase64, 'base64'),
      status: 'processing',
      extractionError: null,
      applicationData: toJson({ ...DEFAULT_APPLICATION_INFO, ...facility.applicationInfo }),
      headerData: toJson(facility.header),
      detailData: toJson({ billsOfLading: [emptyBillOfLading()] }),
      createdById,
      layoutId: null,
      parseSource: null,
    },
  });
  void _pdf;
  return created;
}

// The raw PDF bytes for one conversion, or null if not found / not the caller's.
export async function getConversionPdf(id: string, userId: string, isAdmin: boolean): Promise<Buffer | null> {
  const row = await prisma.conversion.findUnique({ where: { id }, select: { createdById: true, pdfData: true } });
  if (!row || (!isAdmin && row.createdById !== userId) || !row.pdfData) return null;
  return Buffer.from(row.pdfData);
}

// Step 2: the background worker. Runs the deterministic→AI chain and updates the
// row in place. A returned extraction *failure* (Claude errored/truncated) still
// lands as a 'draft' with an extractionError so the operator can hand-fill; only a
// thrown exception (unreadable PDF, dead network, DB error) marks the row 'failed'.
export async function runExtraction(conversionId: string, pdfBase64: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const deterministic = await tryDeterministicParse(pdfBase64);
    if (deterministic) {
      const client = await resolveClientKeys(deterministic.importer);
      const nextFtz = isRbConfigured() ? await getNextFtzNumber() : null;

      const parseWarnings = [...deterministic.parseWarnings];
      if (client.warning) parseWarnings.push(client.warning);
      if (nextFtz)
        parseWarnings.push({
          field: 'FtzNumber',
          message: `FTZ Number provisionally ${nextFtz} (next free in RB Systems). The final number is claimed when you generate the XML.`,
          blocking: false,
        });

      const data: Record<string, unknown> = {
        status: 'draft',
        extractionError: null,
        detailData: toJson(deterministic.detailData),
        parseSource: deterministic.parseSource,
        parseWarnings: toJson(parseWarnings),
        lineAnchors: toJson(deterministic.lineAnchors),
        layoutId: null,
        extractionDurationMs: Date.now() - startedAt,
      };
      if (client.CustomerName || client.CompanyKey || client.Customer || nextFtz) {
        const row = await prisma.conversion.findUnique({
          where: { id: conversionId },
          select: { applicationData: true, headerData: true },
        });
        const appData = { ...((row?.applicationData as Record<string, unknown>) ?? {}) };
        const hdrData = { ...((row?.headerData as Record<string, unknown>) ?? {}) };
        if (client.CustomerName) appData.CustomerName = client.CustomerName;
        if (client.CompanyKey) appData.CompanyKey = client.CompanyKey;
        if (client.Customer) hdrData.Customer = client.Customer;
        if (nextFtz) hdrData.FtzNumber = nextFtz;
        data.applicationData = toJson(appData);
        data.headerData = toJson(hdrData);
      }

      await prisma.conversion.update({ where: { id: conversionId }, data });
      return;
    }

    const fingerprint = await computeFingerprint(pdfBase64);
    const match = fingerprint ? await findMatchingLayout(fingerprint) : null;

    let extraction: ExtractionSuccess | ExtractionFailure;
    let layoutId: string | null = null;

    if (match) {
      extraction = await extractInvoiceData(pdfBase64, undefined, match.fieldMap);
      layoutId = match.id;
    } else {
      const analysis = await analyzeNewLayout(pdfBase64);
      if (analysis.ok) {
        extraction = { ok: true, data: analysis.data };
        if (fingerprint) layoutId = (await createLayout(fingerprint, analysis.fieldMap)).id;
      } else {
        extraction = analysis;
      }
    }

    const detailData = extraction.ok
      ? { billsOfLading: [extractionToBillOfLading(extraction.data.billOfLading)] }
      : { billsOfLading: [emptyBillOfLading()] };

    await prisma.conversion.update({
      where: { id: conversionId },
      data: {
        status: 'draft',
        extractionError: extraction.ok ? null : extraction.error,
        detailData: toJson(detailData),
        layoutId,
        // AI path carries no non-blocking parse warnings — only the deterministic path does.
        parseSource: 'ai',
        extractionDurationMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    console.error('[conversions] extraction failed for', conversionId, err);
    await prisma.conversion
      .update({
        where: { id: conversionId },
        data: {
          status: 'failed',
          extractionError: err instanceof Error ? err.message : 'Extraction failed',
          extractionDurationMs: Date.now() - startedAt,
        },
      })
      .catch((updateErr) => console.error('[conversions] could not mark conversion failed', conversionId, updateErr));
  }
}

export interface ListConversionsOptions {
  limit?: number;
  before?: string;
  file?: string;
}

export async function listConversions(userId: string, isAdmin: boolean, opts: ListConversionsOptions = {}) {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 200), 1), 200);
  const cursor = opts.before ? decodeCursor(opts.before) : null;

  const rows = await prisma.conversion.findMany({
    where: {
      ...(isAdmin ? {} : { createdById: userId }),
      ...(opts.file ? { pdfFilename: opts.file } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      pdfFilename: true,
      status: true,
      extractionError: true,
      extractionDurationMs: true,
      applicationData: true,
      detailData: true,
      createdAt: true,
      updatedAt: true,
      operationMember: { select: { operationId: true } },
    },
  });

  const hasMore = rows.length > limit;
  const kept = hasMore ? rows.slice(0, limit) : rows;
  const items = kept.map(({ applicationData, detailData, operationMember, ...row }) => ({
    ...row,
    customerName: (applicationData as { CustomerName?: unknown } | null)?.CustomerName?.toString() || null,
    lineCount: countLines(detailData),
    operationId: operationMember?.operationId ?? null,
  }));
  const nextCursor = hasMore ? encodeCursor(kept[kept.length - 1]) : null;
  return { items, nextCursor };
}

// Total invoice line items across every bill of lading in a conversion's detailData.
function countLines(detailData: unknown): number {
  const bols = (detailData as { billsOfLading?: unknown } | null)?.billsOfLading;
  if (!Array.isArray(bols)) return 0;
  return bols.reduce((sum, bol) => {
    const lines = (bol as { lines?: unknown } | null)?.lines;
    return sum + (Array.isArray(lines) ? lines.length : 0);
  }, 0);
}

export async function getConversion(id: string, userId: string, isAdmin: boolean) {
  const row = await prisma.conversion.findUnique({ where: { id } });
  if (!row) return null;
  const { pdfData: _pdf, ...conversion } = row;
  void _pdf;
  if (!isAdmin && conversion.createdById !== userId) return null;
  return conversion;
}

export class ConversionNotFoundError extends Error {}
export class ConversionNotDraftError extends Error {}
export class ConversionGroupedError extends Error {}

export async function updateConversionData(
  id: string,
  userId: string,
  isAdmin: boolean,
  input: { applicationData?: unknown; headerData?: unknown; detailData?: unknown }
): Promise<Conversion> {
  const existing = await prisma.conversion.findUnique({
    where: { id },
    include: { operationMember: true },
  });
  if (!existing || (!isAdmin && existing.createdById !== userId)) throw new ConversionNotFoundError('Conversion not found');
  if (existing.operationMember) throw new ConversionGroupedError('This invoice is part of an operation and cannot be edited on its own');
  if (existing.status !== 'draft') throw new ConversionNotDraftError('Only draft conversions can be edited');

  return prisma.conversion.update({
    where: { id },
    data: {
      ...(input.applicationData !== undefined ? { applicationData: toJson(input.applicationData) } : {}),
      ...(input.headerData !== undefined ? { headerData: toJson(input.headerData) } : {}),
      ...(input.detailData !== undefined ? { detailData: toJson(input.detailData) } : {}),
    },
  });
}

export class ValidationFailedError extends Error {
  missingFields: string[];
  constructor(missingFields: string[]) {
    super('Mandatory fields are missing');
    this.missingFields = missingFields;
  }
}

export async function generateConversionXml(id: string, userId: string, isAdmin: boolean): Promise<Conversion> {
  const existing = await prisma.conversion.findUnique({
    where: { id },
    include: { operationMember: true },
  });
  if (!existing || (!isAdmin && existing.createdById !== userId)) throw new ConversionNotFoundError('Conversion not found');
  if (existing.operationMember) throw new ConversionGroupedError('This invoice is part of an operation — generate the operation instead');

  // Claim the definitive FTZ admission number now — this is the point of no
  // return, so two operators generating at once can never ship the same number.
  // Null means RB isn't configured (dev): keep whatever the draft carries.
  const allocation = await allocateFtzNumber({ conversionId: id });
  const headerData = { ...((existing.headerData as Record<string, unknown>) ?? {}) };
  if (allocation) headerData.FtzNumber = allocation.number;

  // Read-side mirror of toJson: Prisma types these columns as the open JsonValue union,
  // so the shape written by runExtraction has to be reasserted here.
  // validateFtz214Data tolerates unknown field *values* but indexes into
  // detail.billsOfLading structurally, so callers must not persist a detailData that
  // has lost that shape.
  const detailData = existing.detailData as unknown as { billsOfLading: BillOfLadingData[] };
  const data = {
    applicationInformation: existing.applicationData,
    header: headerData,
    detail: { billsOfLading: truncateOverLongProductNumbers(detailData.billsOfLading) },
  } as unknown as Ftz214Data;

  const missing = validateFtz214Data(data);
  if (missing.length > 0) throw new ValidationFailedError(missing);

  const xml = buildFtz214Xml(data);

  return prisma.conversion.update({
    where: { id },
    data: { xml, status: 'generated', headerData: toJson(headerData) },
  });
}
