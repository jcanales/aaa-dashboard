// Confidence gate. Given a `ParseResult`, split its warnings into blocking and
// non-blocking sets. In addition to partitioning the warnings the parser already
// emitted, we re-derive the structural checks by walking `billOfLading` here so
// the parser and the gate cannot silently drift apart: if a parser stops
// emitting a warning it should, the gate still catches it.
import type { ParseResult, Warning } from './types';

// Local narrowing of the `unknown` `billOfLading`. Every field is optional /
// `unknown` — the parser's output shape is asserted structurally, not by type.
interface QtyShape {
  value?: unknown;
  units?: unknown;
}
interface LineShape {
  Product?: unknown;
  HTS?: unknown;
  OriginCountry?: unknown;
  Description?: unknown;
  Weight?: unknown;
  Value?: unknown;
  HtsQty1?: QtyShape;
  HtsQty2?: QtyShape;
}
interface BolShape {
  BillNumber?: unknown;
  FPortLading?: unknown;
  Line?: unknown;
}

const HTS_RE = /^\d{10}$/;
const ISO2_RE = /^[A-Z]{2}$/;
const QTY_UNITS = new Set(['PCS', 'PAQ', 'CJS', 'PZA', 'JGO', 'PAR', 'KG', 'KGS', 'MTS', 'LTS']);

const dedupKey = (w: Warning) => `${w.line ?? ''}:${w.field}`;

const asLine = (v: unknown): LineShape => (v && typeof v === 'object' ? (v as LineShape) : {});
const asQty = (v: unknown): QtyShape => (v && typeof v === 'object' ? (v as QtyShape) : {});

function deriveWarnings(bol: BolShape): Warning[] {
  const out: Warning[] = [];
  const lines: unknown[] = Array.isArray(bol.Line) ? bol.Line : [];

  if (lines.length === 0) {
    out.push({ field: 'Line', message: 'no line items parsed', blocking: true });
  }

  if (!bol.BillNumber) {
    out.push({ field: 'BillNumber', message: 'missing bill / invoice number', blocking: true });
  }
  if (bol.FPortLading == null) {
    out.push({ field: 'FPortLading', message: 'foreign port of lading not found', blocking: false });
  }

  lines.forEach((raw, idx) => {
    const l = asLine(raw);
    const n = idx + 1;
    const b = (field: string, message: string) => out.push({ line: n, field, message, blocking: true });
    const nb = (field: string, message: string) => out.push({ line: n, field, message, blocking: false });

    if (!l.Product) b('Product', `line ${n}: missing product`);
    if (typeof l.HTS !== 'string' || !HTS_RE.test(l.HTS)) b('HTS', `line ${n}: HTS is not 10 digits`);
    if (typeof l.OriginCountry !== 'string' || !ISO2_RE.test(l.OriginCountry))
      b('OriginCountry', `line ${n}: origin country is not a 2-letter code`);
    // A parsed value of exactly 0 is a known no-charge line (the parser only
    // emits it when the unit price is an explicit 0.00000) — the reviewer sets a
    // customs value on the review page. Missing / negative / non-numeric is a
    // real parse miss and stays blocking.
    if (l.Value === 0) nb('Value', `line ${n}: value is $0.00 — set a customs value before submitting`);
    else if (l.Value == null || typeof l.Value !== 'number' || l.Value < 0)
      b('Value', `line ${n}: value is missing or not positive`);

    const q1 = asQty(l.HtsQty1);
    const q2 = asQty(l.HtsQty2);

    // A missing per-line weight or quantity is a source-data gap, not a sign the
    // parser mis-read the document — the review page blocks XML generation on
    // empty mandatory fields, so a human fills these in. Keep non-blocking so a
    // single sparse line on an 80+ line invoice doesn't force the AI fallback.
    if (l.Weight == null) nb('Weight', `line ${n}: missing weight`);
    if (q1.value == null) nb('HtsQty1', `line ${n}: missing HTS quantity`);

    if (l.Description == null) nb('Description', `line ${n}: missing description`);
    if (q1.units != null && !QTY_UNITS.has(String(q1.units)))
      nb('HtsQty1', `line ${n}: unrecognized quantity unit "${String(q1.units)}"`);
    if (q2.units != null && !QTY_UNITS.has(String(q2.units)))
      nb('HtsQty2', `line ${n}: unrecognized quantity unit "${String(q2.units)}"`);
  });

  return out;
}

export function splitWarnings(result: ParseResult): { blocking: Warning[]; nonBlocking: Warning[] } {
  const bol: BolShape =
    result.billOfLading && typeof result.billOfLading === 'object'
      ? (result.billOfLading as BolShape)
      : {};

  // Start from the parser's own warnings, then merge in derived ones (keyed on
  // line + field). On a collision, OR the blocking flags together so a
  // non-blocking parser warning can never mask a blocking gate check — and vice
  // versa. Copies, never the caller's warning objects, so the merge can't mutate
  // the parser's result.
  const merged: Warning[] = [];
  const byKey = new Map<string, Warning>();
  for (const w of [...result.warnings, ...deriveWarnings(bol)]) {
    const existing = byKey.get(dedupKey(w));
    if (existing) {
      existing.blocking = existing.blocking || w.blocking;
      continue;
    }
    const copy = { ...w };
    byKey.set(dedupKey(copy), copy);
    merged.push(copy);
  }

  return {
    blocking: merged.filter((w) => w.blocking),
    nonBlocking: merged.filter((w) => !w.blocking),
  };
}
