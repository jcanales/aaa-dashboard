import { prisma } from '../../db';
import { Prisma, type Operation } from '@prisma/client';
import {
  APPLICATION_INFO_FIELDS,
  HEADER_FIELDS,
  BILL_OF_LADING_FIELDS,
  type FieldDef,
} from '../ftz214/fields';
import { allocateFtzNumber } from './ftzAllocationService';
import { validateFtz214Data } from '../ftz214/validation';
import { buildFtz214Xml } from '../ftz214/xmlBuilder';
import { truncateOverLongProductNumbers } from '../ftz214/sanitize';
import type { Ftz214Data, BillOfLadingData } from '../ftz214/types';
import { ValidationFailedError } from './conversionsService';

export { ValidationFailedError };

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class OperationInputError extends Error {
  conversionIds: string[];
  constructor(message: string, conversionIds: string[] = []) {
    super(message);
    this.conversionIds = conversionIds;
  }
}
export class OperationNotFoundError extends Error {}
export class OperationNotDraftError extends Error {}

export interface OperationLine {
  [key: string]: unknown;
  _source: string | null;
}

type LinesShape = { billsOfLading?: { fields?: unknown; lines?: unknown[] }[] };

function memberLines(detailData: unknown, filename: string): OperationLine[] {
  const bols = (detailData as LinesShape | null)?.billsOfLading;
  if (!Array.isArray(bols)) return [];
  return bols.flatMap((bol) =>
    (Array.isArray(bol.lines) ? bol.lines : []).map((line) => ({
      ...(line as Record<string, unknown>),
      _source: filename,
    }))
  );
}

function firstBillOfLadingFields(detailData: unknown): Record<string, unknown> {
  const bol = (detailData as LinesShape | null)?.billsOfLading?.[0];
  return (bol?.fields as Record<string, unknown>) ?? {};
}

function asUnitValue(raw: unknown): { value: unknown; units: unknown } {
  if (raw && typeof raw === 'object' && 'value' in (raw as object)) {
    return raw as { value: unknown; units: unknown };
  }
  return { value: null, units: null };
}

function hasNumericValue(uv: { value: unknown }): boolean {
  return uv.value !== null && uv.value !== undefined && !Number.isNaN(Number(uv.value));
}

// Bill of Lading Qty describes one shipment split across the group's
// invoices, so it's summed rather than picked-and-flagged like an ordinary
// shared field. Summing only makes sense when every contributing value uses
// the same unit (PCS + PCS, not PCS + CTN) — when units disagree, that's a
// genuine data problem, so fall back to the first invoice's raw value and
// let qtyConflict (below) surface it for the user to reconcile by hand.
function sumQty(fieldsList: Record<string, unknown>[]): unknown {
  if (!fieldsList.some((fields) => 'Qty' in fields)) return undefined;
  const withValue = fieldsList.map((fields) => asUnitValue(fields.Qty)).filter(hasNumericValue);
  if (withValue.length === 0) return fieldsList.find((f) => 'Qty' in f)?.Qty ?? null;
  const distinctUnits = new Set(withValue.map((uv) => uv.units ?? ''));
  if (distinctUnits.size > 1) return fieldsList.find((f) => 'Qty' in f)?.Qty ?? null;
  return { value: withValue.reduce((sum, uv) => sum + Number(uv.value), 0), units: withValue[0].units ?? null };
}

// Adds/subtracts a member set's Qty from an already-stored total when the
// group's membership changes (addOperationMembers/removeOperationMembers),
// rather than re-summing from scratch — that would silently discard a manual
// correction the user made to Qty after grouping.
function combineQty(current: unknown, deltaFieldsList: Record<string, unknown>[], sign: 1 | -1): unknown {
  const currentUv = asUnitValue(current);
  const delta = sumQty(deltaFieldsList);
  if (delta === undefined) return current;
  const deltaUv = asUnitValue(delta);
  if (!hasNumericValue(deltaUv)) return current;
  if (!hasNumericValue(currentUv)) return sign === 1 ? delta : current;
  return { value: Number(currentUv.value) + sign * Number(deltaUv.value), units: currentUv.units ?? deltaUv.units };
}

// BillNumber and Qty are excluded from the generic per-field comparison
// below: BillNumber is one Bill of Lading number shared by the whole group,
// never an independent per-invoice value to reconcile, and Qty gets its own
// unit-aware check (qtyConflict) instead of a strict-equality one.
const CONFLICT_CHECKED_BOL_FIELDS = BILL_OF_LADING_FIELDS.filter(
  (f) => f.name !== 'BillNumber' && f.name !== 'Qty'
);

function qtyConflict(perMember: { pdfFilename: string; data: Record<string, unknown> }[]): FieldConflict[] {
  const withValue = perMember
    .map((m) => ({ pdfFilename: m.pdfFilename, uv: asUnitValue(m.data.Qty) }))
    .filter((m) => hasNumericValue(m.uv));
  const distinctUnits = new Set(withValue.map((m) => m.uv.units ?? ''));
  if (distinctUnits.size <= 1) return [];
  return [
    {
      section: 'billOfLading',
      field: 'Qty',
      values: perMember.map((m) => ({ pdfFilename: m.pdfFilename, value: stringifyValue(m.data.Qty) })),
    },
  ];
}

// Combine several draft invoice conversions into one Operation. Shared fields
// are snapshotted from conversionIds[0]; every member's lines are concatenated
// in selection order and tagged with their source filename.
export async function createOperation(
  conversionIds: string[],
  userId: string,
  isAdmin: boolean
): Promise<Operation> {
  if (conversionIds.length < 2) {
    throw new OperationInputError('Select at least two invoices to group', conversionIds);
  }
  const unique = [...new Set(conversionIds)];
  if (unique.length !== conversionIds.length) {
    throw new OperationInputError('An invoice was selected twice', conversionIds);
  }

  const rows = await prisma.conversion.findMany({
    where: { id: { in: conversionIds } },
    include: { operationMember: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const bad: string[] = [];
  for (const id of conversionIds) {
    const row = byId.get(id);
    if (!row) { bad.push(id); continue; }
    if (!isAdmin && row.createdById !== userId) bad.push(id);
    else if (row.status !== 'draft') bad.push(id);
    else if (row.operationMember) bad.push(id);
  }
  if (bad.length > 0) {
    throw new OperationInputError(
      'Some invoices cannot be grouped (missing, not a draft, already grouped, or not yours)',
      bad
    );
  }

  // Selection order — findMany does not preserve the `in` order.
  const ordered = conversionIds.map((id) => byId.get(id)!);
  const base = ordered[0];
  const lines = ordered.flatMap((c) => memberLines(c.detailData, c.pdfFilename));
  const bolFieldsList = ordered.map((c) => firstBillOfLadingFields(c.detailData));
  const qty = sumQty(bolFieldsList);

  return prisma.$transaction(async (tx) =>
    tx.operation.create({
      data: {
        status: 'draft',
        createdById: userId,
        name: base.pdfFilename.replace(/\.pdf$/i, ''),
        applicationData: toJson(base.applicationData),
        headerData: toJson(base.headerData),
        billOfLadingData: toJson({
          ...firstBillOfLadingFields(base.detailData),
          ...(qty !== undefined ? { Qty: qty } : {}),
        }),
        detailData: toJson({ lines }),
        members: {
          create: ordered.map((c, position) => ({ conversionId: c.id, position })),
        },
      },
    })
  );
}

export interface OperationMemberSummary {
  conversionId: string;
  pdfFilename: string;
  customerName: string | null;
  lineCount: number;
  extractionDurationMs: number | null;
  position: number;
  lineAnchors: { page: number; y: number }[];
  createdAt: string;
  updatedAt: string;
}
export interface FieldConflict {
  section: 'applicationInformation' | 'header' | 'billOfLading';
  field: string;
  values: { pdfFilename: string; value: string | null }[];
}
export interface OperationDetail {
  id: string;
  name: string | null;
  status: string;
  applicationData: Record<string, unknown>;
  headerData: Record<string, unknown>;
  billOfLadingData: Record<string, unknown>;
  detailData: { lines: OperationLine[] };
  xml: string | null;
  members: OperationMemberSummary[];
  conflicts: FieldConflict[];
  createdAt: string;
  updatedAt: string;
}

function countBolLines(detailData: unknown): number {
  const bols = (detailData as LinesShape | null)?.billsOfLading;
  if (!Array.isArray(bols)) return 0;
  return bols.reduce((n, b) => n + (Array.isArray(b.lines) ? b.lines.length : 0), 0);
}

function stringifyValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && 'value' in (v as object)) {
    const o = v as { value: unknown; units?: unknown };
    const parts = [o.value, o.units].filter((x) => x != null && String(x).trim() !== '').map((x) => String(x).trim());
    return parts.length ? parts.join(' ') : null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

function conflictsForSection(
  section: FieldConflict['section'],
  fields: FieldDef[],
  perMember: { pdfFilename: string; data: Record<string, unknown> }[]
): FieldConflict[] {
  const out: FieldConflict[] = [];
  for (const f of fields) {
    const values = perMember.map((m) => ({
      pdfFilename: m.pdfFilename,
      value: stringifyValue(m.data[f.name]),
    }));
    const distinct = new Set(values.map((v) => v.value ?? ''));
    if (distinct.size > 1) out.push({ section, field: f.name, values });
  }
  return out;
}

export async function getOperation(
  id: string,
  userId: string,
  isAdmin: boolean
): Promise<OperationDetail | null> {
  const op = await prisma.operation.findUnique({
    where: { id },
    include: {
      members: {
        orderBy: { position: 'asc' },
        include: {
          conversion: {
            select: {
              pdfFilename: true,
              detailData: true,
              headerData: true,
              applicationData: true,
              lineAnchors: true,
              extractionDurationMs: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
  if (!op) return null;
  if (!isAdmin && op.createdById !== userId) return null;

  const members: OperationMemberSummary[] = op.members.map((m) => ({
    conversionId: m.conversionId,
    pdfFilename: m.conversion.pdfFilename,
    customerName:
      (m.conversion.applicationData as { CustomerName?: unknown } | null)?.CustomerName?.toString() || null,
    lineCount: countBolLines(m.conversion.detailData),
    extractionDurationMs: m.conversion.extractionDurationMs,
    position: m.position,
    lineAnchors: Array.isArray(m.conversion.lineAnchors)
      ? (m.conversion.lineAnchors as { page: number; y: number }[])
      : [],
    createdAt: m.conversion.createdAt.toISOString(),
    updatedAt: m.conversion.updatedAt.toISOString(),
  }));

  const appMembers = op.members.map((m) => ({
    pdfFilename: m.conversion.pdfFilename,
    data: (m.conversion.applicationData as Record<string, unknown>) ?? {},
  }));
  const hdrMembers = op.members.map((m) => ({
    pdfFilename: m.conversion.pdfFilename,
    data: (m.conversion.headerData as Record<string, unknown>) ?? {},
  }));
  const bolMembers = op.members.map((m) => ({
    pdfFilename: m.conversion.pdfFilename,
    data: firstBillOfLadingFields(m.conversion.detailData),
  }));

  const conflicts = [
    ...conflictsForSection('applicationInformation', APPLICATION_INFO_FIELDS, appMembers),
    ...conflictsForSection('header', HEADER_FIELDS, hdrMembers),
    ...conflictsForSection('billOfLading', CONFLICT_CHECKED_BOL_FIELDS, bolMembers),
    ...qtyConflict(bolMembers),
  ];

  return {
    id: op.id,
    name: op.name,
    status: op.status,
    applicationData: (op.applicationData as Record<string, unknown>) ?? {},
    headerData: (op.headerData as Record<string, unknown>) ?? {},
    billOfLadingData: (op.billOfLadingData as Record<string, unknown>) ?? {},
    detailData: (op.detailData as { lines: OperationLine[] }) ?? { lines: [] },
    xml: op.xml,
    members,
    conflicts,
    createdAt: op.createdAt.toISOString(),
    updatedAt: op.updatedAt.toISOString(),
  };
}

export interface OperationSummary {
  id: string;
  name: string | null;
  status: string;
  customerName: string | null;
  memberCount: number;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listOperations(userId: string, isAdmin: boolean): Promise<OperationSummary[]> {
  const rows = await prisma.operation.findMany({
    where: isAdmin ? undefined : { createdById: userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, name: true, status: true, applicationData: true, detailData: true,
      createdAt: true, updatedAt: true,
      _count: { select: { members: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    customerName:
      (r.applicationData as { CustomerName?: unknown } | null)?.CustomerName?.toString() || null,
    memberCount: r._count.members,
    lineCount: Array.isArray((r.detailData as { lines?: unknown[] } | null)?.lines)
      ? (r.detailData as { lines: unknown[] }).lines.length
      : 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function updateOperationData(
  id: string,
  userId: string,
  isAdmin: boolean,
  input: {
    name?: string;
    applicationData?: unknown;
    headerData?: unknown;
    billOfLadingData?: unknown;
    detailData?: unknown;
  }
): Promise<Operation> {
  const existing = await prisma.operation.findUnique({ where: { id } });
  if (!existing || (!isAdmin && existing.createdById !== userId)) {
    throw new OperationNotFoundError('Operation not found');
  }
  // The name is cosmetic (grid label + XML download filename, read fresh at
  // download time) and never enters the FTZ 214 payload, so it stays
  // renameable after generation. The FTZ data fields remain draft-only since
  // they're exactly what generation freezes into the produced XML.
  const editsFtzData =
    input.applicationData !== undefined ||
    input.headerData !== undefined ||
    input.billOfLadingData !== undefined ||
    input.detailData !== undefined;
  if (editsFtzData && existing.status !== 'draft') {
    throw new OperationNotDraftError('Only draft operations can be edited');
  }

  return prisma.operation.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.applicationData !== undefined ? { applicationData: toJson(input.applicationData) } : {}),
      ...(input.headerData !== undefined ? { headerData: toJson(input.headerData) } : {}),
      ...(input.billOfLadingData !== undefined ? { billOfLadingData: toJson(input.billOfLadingData) } : {}),
      ...(input.detailData !== undefined ? { detailData: toJson(input.detailData) } : {}),
    },
  });
}

export async function deleteOperation(id: string, userId: string, isAdmin: boolean): Promise<void> {
  const existing = await prisma.operation.findUnique({
    where: { id },
    select: { id: true, createdById: true },
  });
  if (!existing || (!isAdmin && existing.createdById !== userId)) {
    throw new OperationNotFoundError('Operation not found');
  }
  await prisma.operation.delete({ where: { id } });
}

// Pull one or several invoices back out of an operation without dissolving the
// group. The operation keeps its snapshotted shared fields (snapshot model);
// only the removed members' lines are stripped from detailData. The freed
// Conversions are left untouched (still status: 'draft') — deleting their
// OperationMember rows is what makes them available for grouping again.
// Conflicts are recomputed by getOperation over the now-smaller member set.
export async function removeOperationMembers(
  operationId: string,
  conversionIds: string[],
  userId: string,
  isAdmin: boolean
): Promise<OperationDetail> {
  const ids = [...new Set(conversionIds)];
  if (ids.length === 0) {
    throw new OperationInputError('Select at least one invoice to remove', []);
  }

  const op = await prisma.operation.findUnique({
    where: { id: operationId },
    include: { members: { include: { conversion: { select: { pdfFilename: true, detailData: true } } } } },
  });
  if (!op || (!isAdmin && op.createdById !== userId)) {
    throw new OperationNotFoundError('Operation not found');
  }
  if (op.status !== 'draft') {
    throw new OperationNotDraftError('Only draft operations can be edited');
  }

  const memberIds = new Set(op.members.map((m) => m.conversionId));
  const notMembers = ids.filter((cid) => !memberIds.has(cid));
  if (notMembers.length > 0) {
    throw new OperationInputError('Some invoices are not part of this operation', notMembers);
  }

  if (op.members.length - ids.length < 2) {
    throw new OperationInputError(
      'An operation needs at least two invoices. Remove fewer, or use Ungroup to dissolve the whole operation.',
      ids
    );
  }

  const removedMembers = op.members.filter((m) => ids.includes(m.conversionId));
  const removedFiles = new Set(removedMembers.map((m) => m.conversion.pdfFilename));
  const lines = ((op.detailData as { lines?: OperationLine[] } | null)?.lines ?? []).filter(
    (l) => l._source == null || !removedFiles.has(l._source)
  );
  const removedBolFields = removedMembers.map((m) => firstBillOfLadingFields(m.conversion.detailData));
  const billOfLadingData = op.billOfLadingData as Record<string, unknown> | null;

  await prisma.$transaction([
    prisma.operationMember.deleteMany({
      where: { operationId, conversionId: { in: ids } },
    }),
    prisma.operation.update({
      where: { id: operationId },
      data: {
        detailData: toJson({ lines }),
        billOfLadingData: toJson({
          ...billOfLadingData,
          Qty: combineQty(billOfLadingData?.Qty, removedBolFields, -1),
        }),
      },
    }),
  ]);

  const detail = await getOperation(operationId, userId, isAdmin);
  if (!detail) throw new OperationNotFoundError('Operation not found');
  return detail;
}

// Mirror of removeOperationMembers: fold one or several existing draft invoice
// conversions into an operation without re-snapshotting its shared App/Header/BOL
// fields (snapshot model). Each new member's lines are appended to detailData in
// selection order, tagged with their source filename; new OperationMember rows
// continue the position sequence from the current max. Conflicts are recomputed
// by getOperation over the now-larger member set.
export async function addOperationMembers(
  operationId: string,
  conversionIds: string[],
  userId: string,
  isAdmin: boolean
): Promise<OperationDetail> {
  const ids = [...new Set(conversionIds)];
  if (ids.length === 0) {
    throw new OperationInputError('Select at least one invoice to add', []);
  }

  const op = await prisma.operation.findUnique({
    where: { id: operationId },
    include: { members: { select: { conversionId: true, position: true } } },
  });
  if (!op || (!isAdmin && op.createdById !== userId)) {
    throw new OperationNotFoundError('Operation not found');
  }
  if (op.status !== 'draft') {
    throw new OperationNotDraftError('Only draft operations can be edited');
  }

  const candidates = await prisma.conversion.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      pdfFilename: true,
      status: true,
      createdById: true,
      detailData: true,
      operationMember: { select: { operationId: true } },
    },
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const alreadyMembers = new Set(op.members.map((m) => m.conversionId));
  const bad: string[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) { bad.push(id); continue; }
    if (!isAdmin && c.createdById !== userId) bad.push(id);
    else if (c.status !== 'draft') bad.push(id);
    else if (alreadyMembers.has(id)) bad.push(id);
    else if (c.operationMember && c.operationMember.operationId !== operationId) bad.push(id);
  }
  if (bad.length > 0) {
    throw new OperationInputError(
      'Some invoices cannot be added (missing, not a draft, or already in a group)',
      bad
    );
  }

  // Selection order — findMany does not preserve the `in` order.
  const ordered = ids.map((id) => byId.get(id)!);
  const existingLines = (op.detailData as { lines?: OperationLine[] } | null)?.lines ?? [];
  const newLines = ordered.flatMap((c) => memberLines(c.detailData, c.pdfFilename));
  const nextPos = op.members.reduce((max, m) => Math.max(max, m.position), -1) + 1;
  const newBolFields = ordered.map((c) => firstBillOfLadingFields(c.detailData));
  const billOfLadingData = op.billOfLadingData as Record<string, unknown> | null;

  await prisma.$transaction([
    prisma.operationMember.createMany({
      data: ordered.map((c, i) => ({ operationId, conversionId: c.id, position: nextPos + i })),
    }),
    prisma.operation.update({
      where: { id: operationId },
      data: {
        detailData: toJson({ lines: [...existingLines, ...newLines] }),
        billOfLadingData: toJson({
          ...billOfLadingData,
          Qty: combineQty(billOfLadingData?.Qty, newBolFields, 1),
        }),
      },
    }),
  ]);

  const detail = await getOperation(operationId, userId, isAdmin);
  if (!detail) throw new OperationNotFoundError('Operation not found');
  return detail;
}

function stripSource(line: OperationLine): Record<string, unknown> {
  const { _source, ...rest } = line;
  void _source;
  return rest;
}

// Allocate the definitive FTZ number (if RB Systems is configured), validate the
// assembled FTZ 214 payload, then build and persist the XML.
export async function generateOperationXml(
  id: string,
  userId: string,
  isAdmin: boolean
): Promise<Operation> {
  const existing = await prisma.operation.findUnique({ where: { id } });
  if (!existing || (!isAdmin && existing.createdById !== userId)) {
    throw new OperationNotFoundError('Operation not found');
  }
  if (existing.status !== 'draft') {
    throw new OperationNotDraftError('Only draft operations can be generated');
  }

  const allocation = await allocateFtzNumber({ operationId: id });
  const headerData = { ...((existing.headerData as Record<string, unknown>) ?? {}) };
  if (allocation) headerData.FtzNumber = allocation.number;

  const lines = (existing.detailData as { lines?: OperationLine[] } | null)?.lines ?? [];
  const billsOfLading = truncateOverLongProductNumbers([
    { fields: existing.billOfLadingData, lines: lines.map(stripSource) },
  ] as unknown as BillOfLadingData[]);
  const data = {
    applicationInformation: existing.applicationData,
    header: headerData,
    detail: { billsOfLading },
  } as unknown as Ftz214Data;

  const missing = validateFtz214Data(data);
  if (missing.length > 0) throw new ValidationFailedError(missing);

  const xml = buildFtz214Xml(data);

  return prisma.operation.update({
    where: { id },
    data: { xml, status: 'generated', headerData: toJson(headerData) },
  });
}

export async function getOperationMemberPdf(
  operationId: string,
  conversionId: string,
  userId: string,
  isAdmin: boolean
): Promise<Buffer | null> {
  const member = await prisma.operationMember.findUnique({
    where: { operationId_conversionId: { operationId, conversionId } },
    select: {
      operation: { select: { createdById: true } },
      conversion: { select: { pdfData: true } },
    },
  });
  if (!member) return null;
  if (!isAdmin && member.operation.createdById !== userId) return null;
  if (!member.conversion.pdfData) return null;
  return Buffer.from(member.conversion.pdfData);
}
