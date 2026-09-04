// The Mexican bilingual export invoice ("Factura Exportación Bilingüe",
// FastReport FactExpBiCompl). The same template is emitted for several customs
// regimes (Clave A1 = definitive export, RT = return/re-export, …) — the clave
// is a data field, NOT a template discriminator, so detect() ignores it.
// Named after the canonical sample (WHN453 = Clave A1); the parser handles all.
import type { Cell, ParseResult, TemplateParser, Warning } from '../types';
import { cleanLineDescription } from '../../services/extractionService';

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function joinedText(cells: Cell[]): string {
  return normalize(cells.map((c) => c.s).join(' ')).replace(/\s+/g, ' ');
}

function detect(cells: Cell[]): boolean {
  const t = joinedText(cells);
  return t.includes('FACTURA EXPORTACION BILINGUE') && t.includes('FACTEXPBICOMPL');
}

export interface Row {
  page: number;
  ord: number;
  y: number;
  cells: Cell[];
  text: string;
}

export function toRows(cells: Cell[]): Row[] {
  const rows: Row[] = [];
  let bucket: Cell[] = [];
  const flush = () => {
    if (!bucket.length) return;
    bucket.sort((a, b) => a.x - b.x);
    rows.push({
      page: bucket[0].page,
      ord: bucket[0].ord,
      y: bucket[0].y,
      cells: [...bucket],
      text: bucket.map((c) => c.s).join(' ').replace(/\s+/g, ' ').trim(),
    });
    bucket = [];
  };
  for (const c of cells) {
    if (bucket.length && (c.page !== bucket[0].page || Math.abs(c.y - bucket[0].y) > 2)) flush();
    bucket.push(c);
  }
  flush();
  return rows;
}

function findCapture(texts: string[], re: RegExp): string | null {
  for (const t of texts) {
    const m = t.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function parseHeader(texts: string[]): Record<string, unknown> {
  const dateM = texts.map((t) => t.match(/Fecha\s*\(Date\).*?:\s*(\d{2})\/(\d{2})\/(\d{4})/i)).find(Boolean);
  const bundles = findCapture(texts, /Bultos\s*\(Bundles\)\s*:\s*(\d+)/i);
  return {
    BillNumber: findCapture(texts, /Factura\s*\(Invoice\)\s*:\s*([A-Z0-9-]+)/i),
    HouseBill: null,
    Qty: { value: bundles ? Number(bundles) : null, units: 'PCS' },
    ExportCountry:
      texts.some((t) => /Exportado por|Exported By/i.test(t)) && texts.some((t) => /\bMEX\b/.test(t)) ? 'MX' : null,
    FPortLading: null,
    InbondCarrier: findCapture(texts, /C\.\s*Transp\.\s*\(R\.F\.C\.\)\s*\(Carrier\)\s*:\s*([A-Z0-9 .&-]+?)(?:\s*\(\)|\s*$)/i),
    InbondNo: findCapture(texts, /InBond\s*:\s*(\d[A-Z0-9-]*)/i),
    InbondType: null,
    InbondDate: dateM ? `${dateM[3]}${dateM[1]}${dateM[2]}` : null,
    InbondPort: findCapture(texts, /Puerto de entrada\s*\(Entry Port\)\s*:\s*(\d+)/i),
    Container: findCapture(texts, /No\.\s*Econ[oó]mico\s*:\s*([A-Z0-9-]+)/i),
  };
}

// ---- line-item helpers (ported from AAA-Converter's backend/scripts/parse-invoice-poc.ts) ----

const ISO3to2: Record<string, string> = {
  USA: 'US', MEX: 'MX', CHN: 'CN', DEU: 'DE', IRL: 'IE', JPN: 'JP', KOR: 'KR', TWN: 'TW', CAN: 'CA',
};

// The origin marker prints both codes, e.g. `*AT(AUT)`. Capture 1 (the ISO-2 the
// invoice itself prints) is the source of truth; `ISO3to2` is only a cross-check
// for the handful of ISO-3 codes we know — never a substitute for the printed
// ISO-2 (mapping AUT→AU, ISR→IS, etc. is wrong).
export function resolveOrigin(iso2Printed: string, iso3: string): { iso2: string; mismatch: boolean } {
  const crossCheck = ISO3to2[iso3];
  return { iso2: iso2Printed, mismatch: Boolean(crossCheck && crossCheck !== iso2Printed) };
}

const HEADER_ROW_RE =
  /Descripci[oó]n|Cantidad\(Qty\)|Fracci[oó]n \(HTS\)|Cliente IRS|Orden de compra|No\. Parte|Valor (Unit|Total)|Peso Neto|\(Net Wt|TOTALES|T O T A L E S|Para usos aduanales|Pages:|Fecha Impresi|FactExpBiCompl|Rep\. Legal|Empaque \(Add|Marca\s*:|Clave\s*:|BILINGUAL EXPORT|EXPORTACION BILING|Subtotal/i;
const SUBTOTAL_RE = /^Subtotal\b/i;
// The "N • part" anchor often shares its row with the wrapped weight/qty of the
// previous cell, so match anywhere, then trim trailing value columns off the part.
const ANCHOR_RE = /(?:^|\s)(\d{1,3})\s*[•·]\s*(.+)/;
const ANCHOR_TEST_RE = /\d{1,3}\s*[•·]\s*\S/;
const ORIGIN_RE = /\*([A-Z]{2})\(([A-Z]{3})\)/;
const WEIGHT_LB_RE = /(\d[\d,]*\.?\d*)\s*Lb\b/i;
const QTY_RE = /(\d[\d,]*\.?\d*)\s*(PCS|PAQ|CJS|PZA|KG|KGS|MTS|LTS|JGO|PAR)\b/gi;
const MONEY_RE = /^\d[\d,]*\.\d{2}$/;
// An explicit zero unit price: "0", "0.00", "0.00000" — never a real price, so
// its presence in the unit-price column marks a deliberate no-charge line.
const ZERO_UNIT_RE = /^0(\.0+)?$/;

// ---- description helpers ----------------------------------------------------
// Each description cell stacks the Spanish customs classification, then the
// exporter's English description, then metadata (origin marker, ECCN, a bare PO
// ref, a `Marca:` line). The unit-value column (x≈315-330) bleeds a trailing
// "0.00000" onto most rows — strip it.
//
// ES/EN split (splitLangs):
//  - Rule 2a (primary): the exporter appends " - <partNumber>" (McMaster /
//    Digikey / MISUMI) to the English description. Locate the row that carries
//    that marker (or ends with a dangling " -" because the number wrapped to a
//    row the collector dropped); the English block is the run ending there, and
//    everything above the first non-Spanish row of that run is Spanish.
//  - Rule 2b (fallback, no PO ref): English is the run after the last ALL-CAPS
//    Spanish sentence — Spanish rows come first, English second.
const DESC_TRAIL_VALUE_RE = /\s+\d[\d,]*\.\d{3,}\s*$/;
const BARE_PO_REF_RE = /^-\s*[\w./-]+,?\s*$/;
// A lone token carrying a digit on its own row is the wrapped tail of the
// " - <partNumber>" PO ref (e.g. "VFJW12-190-M6-N6," under "…LINEAR SHAFT") —
// drop it; the row above keeps its dangling " -" as the rule-2a marker.
const LONE_PARTNO_RE = /^[A-Za-z0-9][\w./-]*,?$/;
const ONLY_NUMBER_RE = /^[\d.,]+$/;
const DIMENSION_ONLY_RE = /^[\d][\d.,]*\s*MM\.?,?$/i;
const LONE_CAPS_WORD_RE = /^[A-ZÁÉÍÓÚÑ]+,?$/;
// Rule-2a markers: " - <token>" appended to the English description, or a row
// that ends with a dangling " -" (the part number wrapped to a dropped row).
const PO_REF_MARK_RE = /\s-\s+[A-Za-z0-9][\w./-]*/;
const TRAILING_DASH_RE = /\s-\s*$/;
// Distinctive vocabulary of the Spanish customs-classification sentence. Bare
// articles alone never qualify a row — a content word must be present.
const SPANISH_DESC_RE =
  /\b(DE|PARA|CON|LOS|LAS|UNA|UNOS|POR|SIN|Y\/O|ACERO|PLASTICO|ALUMINIO|LATON|COBRE|NYLON|NAILON|TENSION|INFERIOR|INFERIORES|SUPERIOR|SUPERIORES|MANUFACTURAD\w*|TORNILLO|TUERCA|PASADOR|ARANDELAS?|CIRCUITOS?|RODAMIENTO|VALVULA|CILINDRO|BLOQUE|APARATO|ESPACIADOR|SEPARADOR|FUENTE|TARJETA|LONGITUD|DIAMETRO|BRIDA|RESORTE|AGUJA|AISLADO|MONITOREO|DISPOSITIVOS?|PRUEBAS|FUNCIONALIDAD|MODULAR(?:ES)?|MAQUINA|BRILLO|LUCES|RELEVADORES|CONTROLADORA|PROGRAMACION|NEUMATIC\w*|RECTILINEO|ROSCAD\w*|INOXIDABLE|IMPRESO|METALIZADOS|BOQUILLAS?|CHORRO|LAVADO|BANDA|MERCANCIAS|CONEXIONES|CONECTOR\w*|INSULADA|DEPORTIVO|TRANSPORTADOR|TUBERIA|\bTUBO\b|ELECTRIC[AO]S?|LINEAL|PODER|PISTAS|PLATA|\bORO\b|CAMARA|EXTRACTOR|FILTRANTE|\bAIRE\b|\bAGUA\b|INCLUYE|ACCESORIOS?|COMPONENTES|ALIMENTADOR|CALIBRACION|POSICION|MANIPULACION|CARGADOR|INVERTIDORA|MARCADO|ACUMULADOR|ENSAMBLE|BOBINA|MEDIR|COLOR|\bTAPA\b|FLECHAS?|BUJE|RANURAD\w*|EMISO\w*|RECEPTOR|BLUETOOTH|ETIQUETA|TERMOCOPLE|AMORTIGUADOR|ROTULA|SERVOMOTOR|POTENCIA|CORRIENTE|CONTINUA|JUEGO|COMUNICACION|CONVERTIDOR|ADAPTADOR|PUERTOS|OPTICOS?)\b/;

const isSpanishRow = (t: string): boolean => !/[a-z]/.test(t) && SPANISH_DESC_RE.test(t);

// A row that continues the Spanish sentence without repeating its vocabulary: a
// bare dimension ("15.9 MM") or a lone ALL-CAPS word ("DISPOSITIVOS") sitting
// directly under a Spanish row.
const isSpanishContinuation = (rows: string[], i: number): boolean =>
  i > 0 &&
  !/[a-z]/.test(rows[i]) &&
  (DIMENSION_ONLY_RE.test(rows[i]) || LONE_CAPS_WORD_RE.test(rows[i])) &&
  (isSpanishRow(rows[i - 1]) || DIMENSION_ONLY_RE.test(rows[i - 1]));

const joinSplit = (rows: string[], boundary: number) => ({
  es: rows.slice(0, boundary).join(' ').replace(/\s+/g, ' ').trim(),
  en: rows.slice(boundary).join(' ').replace(/\s+/g, ' ').trim(),
});

// Split the stacked description rows into the leading Spanish block and the
// trailing English block (see the ES/EN split notes above).
export function splitLangs(rows: string[]): { es: string; en: string } {
  // Rule 2a — the reliable signal: find the row carrying the " - <partNumber>"
  // PO ref, then walk back over the rows that are not the Spanish sentence.
  let poRow = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (PO_REF_MARK_RE.test(rows[i]) || TRAILING_DASH_RE.test(rows[i])) {
      poRow = i;
      break;
    }
  }
  if (poRow >= 0) {
    let boundary = poRow;
    while (
      boundary > 0 &&
      !isSpanishRow(rows[boundary - 1]) &&
      !isSpanishContinuation(rows, boundary - 1)
    ) {
      boundary--;
    }
    return joinSplit(rows, boundary);
  }

  // Rule 2b — no PO ref: English is the run after the last ALL-CAPS Spanish row.
  let boundary = rows.length;
  for (let i = 0; i < rows.length; i++) {
    if (!isSpanishRow(rows[i]) && !isSpanishContinuation(rows, i)) {
      boundary = i;
      break;
    }
  }
  return joinSplit(rows, boundary);
}

// Compose the final Description: prefer the English text, but fall back to the
// Spanish sentence when the cleaned English is a bare part nickname (< 16 chars
// like "NEST" or "BASE PLATE"). cleanLineDescription strips the trailing PO ref
// and ", PUFFIN BFT" tag and truncates to 45.
export function composeDescription(es: string, en: string): string | null {
  // Drop a dangling trailing " -" (part number wrapped to a dropped row), cut at
  // an embedded PO ref that still has English after it ("… - 60645K31 - right
  // hand thread"), and drop a stray trailing Digikey "-ND" part number.
  let enClean = en.replace(/\s*-\s*$/, '').trim();
  enClean = enClean.replace(/\s-\s+[A-Za-z0-9][\w./]*\s+-\s+.*$/, '').trim();
  enClean = enClean.replace(/\s+[A-Za-z0-9]*\d[\w-]*-ND\b[,.]?$/i, '').trim();
  const cleanedEn = cleanLineDescription(enClean);
  const enLen = typeof cleanedEn === 'string' ? cleanedEn.length : 0;
  const candidate = enLen < 16 && es ? es : enClean;
  const out = cleanLineDescription(candidate);
  const s = typeof out === 'string' ? out.trim() : '';
  return s.length ? s : null;
}

interface Line {
  Product: string | null;
  HTS: string | null;
  OriginCountry: string | null;
  Description: string | null;
  Packages: { value: number | null; units: string | null };
  HtsQty1: { value: number | null; units: string | null };
  HtsQty2: { value: number | null; units: string | null };
  Value: number | null;
  Weight: number | null;
  Charges: number | null;
  MID: string | null;
  Nafta: string | null;
}

export interface LineAnchor {
  page: number;
  y: number;
}

function parseLines(
  rows: Row[],
  mid: string | null,
  warnings: Warning[],
): { lines: Line[]; anchorsForPdf: LineAnchor[] } {
  // line-item region: rows after the first column header, minus the doc's TOTALES
  const startIdx = rows.findIndex((r) => /\(English Description\)/i.test(r.text));
  if (startIdx < 0) {
    warnings.push({ field: 'region', message: 'line-item table header not found', blocking: true });
    return { lines: [], anchorsForPdf: [] };
  }
  const region = rows.slice(startIdx + 1).filter((r) => !/T O T A L E S|^TOTALES/i.test(r.text));

  // ordered per-column streams (one entry per line item)
  const anchors: { ord: number; seq: number; product: string; value: number | null; page: number; y: number }[] = [];
  const origins: { ord: number; iso2: string }[] = [];
  const lbWeights: { ord: number; v: number }[] = [];
  const htsHeaders: { ord: number; hts: string }[] = [];
  const qtyRows: { ord: number; qtys: { v: number; u: string }[] }[] = [];
  const descRows: { ord: number; text: string }[] = [];

  for (const r of region) {
    if (SUBTOTAL_RE.test(r.text)) continue;

    // HTS group header: 10-digit fraction far left, with a "rate% / mxfraction"
    const htsCell = r.cells.find((c) => c.x < 140 && /^\d{10}$/.test(c.s));
    if (htsCell && /\d+(\.\d+)?%\s*\/|FREE\s*\//.test(r.text)) {
      htsHeaders.push({ ord: r.ord, hts: htsCell.s });
      continue;
    }

    if (HEADER_ROW_RE.test(r.text)) continue;

    const a = r.text.match(ANCHOR_RE);
    if (a) {
      const product = a[2]
        .replace(/\s+\d[\d,]*\.\d{3,}.*$/, '') // trailing unit value + totals
        .replace(/\s+[\d,]+\.\d{2}\s*$/, '')
        .replace(/\s{2,}.*$/, '')
        .trim();
      if (product.length > 1) {
        // The USD T. Value is printed on the anchor row itself, in a column that
        // sits at x≈355-405 across all sample layouts. The unit-value column just
        // left of it (x≈310-330) prints 5 decimals so MONEY_RE rejects it; the
        // MN-tax column just right (x≈415) prints "0.00". Invoice money always
        // has exactly 2 decimals — a bare integer is never a value.
        const valueCell = r.cells.find((c) => c.x >= 355 && c.x <= 405 && MONEY_RE.test(c.s));
        // A no-charge line (sample, warranty replacement) prints a 0.00000 unit
        // price and FastReport suppresses the $0.00 in the value column entirely —
        // so `valueCell` is absent but the value is a *known* zero, not a parse
        // miss. Distinguish it (value 0 → non-blocking "set a customs value")
        // from a genuine missing column (value null → blocking → AI fallback).
        const zeroUnitPrice = r.cells.some((c) => c.x >= 300 && c.x <= 352 && ZERO_UNIT_RE.test(c.s));
        anchors.push({
          ord: r.ord,
          seq: Number(a[1]),
          product,
          value: valueCell ? parseFloat(valueCell.s.replace(/,/g, '')) : zeroUnitPrice ? 0 : null,
          page: r.page,
          y: r.y,
        });
      }
    }

    // *AT(AUT): capture 1 is the ISO-2 code the invoice itself prints — use it
    // directly. ISO3to2 is only a cross-check: truncating the ISO-3 (capture 2)
    // is wrong for anything outside the small map (AUT->AU, ISR->IS, ...).
    const o = r.text.match(ORIGIN_RE);
    if (o) {
      const { iso2, mismatch } = resolveOrigin(o[1], o[2]);
      if (mismatch)
        warnings.push({
          field: 'OriginCountry',
          message: `origin marker mismatch: printed ${o[1]} vs ${o[2]}`,
          blocking: true,
        });
      origins.push({ ord: r.ord, iso2 });
    }

    // weight column (x < 45)
    const wtText = r.cells.filter((c) => c.x < 45).map((c) => c.s).join(' ');
    const lb = wtText.match(WEIGHT_LB_RE);
    if (lb) lbWeights.push({ ord: r.ord, v: parseFloat(lb[1].replace(/,/g, '')) });

    // qty column (x 45-118)
    const qtyText = r.cells.filter((c) => c.x >= 45 && c.x < 118).map((c) => c.s).join(' ');
    const qs = [...qtyText.matchAll(QTY_RE)].map((m) => ({
      v: parseFloat(m[1].replace(/,/g, '')),
      u: m[2].toUpperCase(),
    }));
    if (qs.length) qtyRows.push({ ord: r.ord, qtys: qs });

    // description column (x 118-335): the stacked ES/EN cell. Strip the unit-value
    // "0.00000" the column to its right bleeds in, then drop origin / ECCN /
    // Marca: / bare-PO-ref / number-only / anchor rows.
    const dCells = r.cells.filter((c) => c.x >= 118 && c.x < 335);
    if (dCells.length) {
      const dText = dCells
        .map((c) => c.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(DESC_TRAIL_VALUE_RE, '')
        .trim();
      if (
        dText &&
        !ORIGIN_RE.test(r.text) &&
        !/ECCN:/i.test(dText) &&
        !/^Marca\s*:/i.test(dText) &&
        !BARE_PO_REF_RE.test(dText) &&
        !(LONE_PARTNO_RE.test(dText) && /\d/.test(dText)) &&
        !ONLY_NUMBER_RE.test(dText) &&
        !ANCHOR_TEST_RE.test(dText)
      ) {
        descRows.push({ ord: r.ord, text: dText });
      }
    }
  }

  const n = anchors.length;
  // The printed line number on each anchor must run 1..n with no gaps. A
  // compensating drop (one anchor missed, another double-counted) leaves n
  // unchanged so the count checks below pass — this catches it.
  if (anchors.some((anchor, i) => anchor.seq !== i + 1))
    warnings.push({
      field: 'Line',
      message: 'line-item numbering gap — parse may be misaligned',
      blocking: true,
    });
  if (origins.length !== n)
    warnings.push({
      field: 'Line',
      message: `origin markers: ${origins.length} found for ${n} line items — block boundaries unreliable`,
      blocking: true,
    });
  if (lbWeights.length !== n)
    warnings.push({
      field: 'Line',
      message: `Lb weights: ${lbWeights.length} found for ${n} line items`,
      blocking: true,
    });

  const htsAt = (ord: number): string | null => {
    let h: string | null = null;
    for (const x of htsHeaders) if (x.ord < ord) h = x.hts;
    return h;
  };

  // Each line item's content is delimited by origin markers: line i owns
  // everything between origins[i-1] and origins[i]. Weight/qty sit at the top of
  // the block (sometimes one row above the "N • part" anchor).
  const lines: Line[] = anchors.map((anchor, i) => {
    const blockStart = i === 0 ? -1 : origins[i - 1]?.ord ?? anchors[i - 1].ord;
    const blockEnd = origins[i]?.ord ?? anchors[i + 1]?.ord ?? Infinity;
    const inBlock = <T extends { ord: number }>(arr: T[]) =>
      arr.filter((x) => x.ord > blockStart && x.ord <= blockEnd);

    const qtys = inBlock(qtyRows).flatMap((q) => q.qtys);
    const oHere = inBlock(origins)[0]?.iso2 ?? origins[i]?.iso2 ?? null;

    // description rows: between this anchor and this line's origin marker
    const dRows = descRows.filter((d) => d.ord > anchor.ord && d.ord < blockEnd).map((d) => d.text);
    let Description: string | null = null;
    if (dRows.length) {
      const { es, en } = splitLangs(dRows);
      Description = composeDescription(es, en);
    } else {
      warnings.push({
        line: i + 1,
        field: 'Description',
        message: `line ${i + 1} (${anchor.product}): no description rows`,
        blocking: false,
      });
    }

    return {
      Product: anchor.product,
      HTS: htsAt(anchor.ord),
      OriginCountry: oHere,
      Description,
      // This template never prints a per-line package count. Packages is a
      // mandatory FTZ 214 field, so default it to 0 rather than leaving the
      // reviewer to fill every line — the doc-level warning below flags it.
      Packages: { value: 0, units: null },
      HtsQty1: { value: qtys[0]?.v ?? null, units: qtys[0]?.u ?? null },
      HtsQty2: { value: qtys[1]?.v ?? qtys[0]?.v ?? null, units: qtys[1]?.u ?? qtys[0]?.u ?? null },
      Value: anchor.value,
      Weight: inBlock(lbWeights)[0]?.v ?? null,
      Charges: 0,
      MID: oHere === 'MX' ? mid : null,
      Nafta: oHere === 'MX' ? 'MX' : null,
    };
  });

  lines.forEach((l, i) => {
    if (l.Weight === null)
      warnings.push({ line: i + 1, field: 'Weight', message: `line ${i + 1} (${l.Product ?? '?'}): no weight`, blocking: false });
    if (l.HtsQty1.value === null)
      warnings.push({ line: i + 1, field: 'HtsQty1', message: `line ${i + 1} (${l.Product ?? '?'}): no quantity`, blocking: false });
    if (l.Value === null || (typeof l.Value === 'number' && l.Value < 0))
      warnings.push({ line: i + 1, field: 'Value', message: `line ${i + 1} (${l.Product ?? '?'}): no USD total found in value column`, blocking: true });
    else if (l.Value === 0)
      warnings.push({
        line: i + 1,
        field: 'Value',
        message: `line ${i + 1} (${l.Product ?? '?'}): unit price is $0.00 — set a customs value before submitting`,
        blocking: false,
      });
    // FTZ 214 caps the part number at 15 chars; surfaced here so the reviewer
    // sees it on the parse banner rather than hitting a 422 at generation.
    if (l.Product && l.Product.length > 15)
      warnings.push({ line: i + 1, field: 'Product', message: `line ${i + 1} (${l.Product}): part number exceeds 15 chars`, blocking: false });
  });

  // Packages was defaulted to 0 above (this template prints no per-line count) —
  // flag it once so the reviewer sets a real count if the shipment is packed.
  if (lines.length > 0 && lines.every((l) => l.Packages.value === 0))
    warnings.push({
      field: 'Packages',
      message: `package count not printed on this template — defaulted to 0 on ${lines.length} line${lines.length === 1 ? '' : 's'}; set a real count if the shipment is packed`,
      blocking: false,
    });

  return { lines, anchorsForPdf: anchors.map((a) => ({ page: a.page, y: a.y })) };
}

// The "Importado por (Imported by)" block names the US importer of record and,
// on the next row(s), its IRS/EIN — the keys used to resolve the RB Systems
// Company/Customer id. The "Ship to" / "Sold to" parties carry their own IRS,
// so we only scan the rows between "Imported by" and the next party label.
const IMPORTED_BY_RE = /Imported by\)\s*:\s*(.+?)(?:\s{2,}|\s+(?:Enviado a|Ship to)\b|$)/i;
const NEXT_PARTY_RE = /Vendido a|Sold to|Producido por|Manufactured by/i;
const IRS_LINE_RE = /IRS\s*:\s*([0-9][0-9-]{5,})/i;

export function parseImporter(rows: Row[]): { name: string | null; irs: string | null } {
  const startIdx = rows.findIndex((r) => /Imported by\)\s*:/i.test(r.text));
  if (startIdx < 0) return { name: null, irs: null };

  const nameMatch = rows[startIdx].text.match(IMPORTED_BY_RE);
  const name = nameMatch ? nameMatch[1].replace(/[.,\s]+$/, '').trim() || null : null;

  let irs: string | null = null;
  for (let i = startIdx; i < rows.length && i < startIdx + 6; i++) {
    if (i > startIdx && NEXT_PARTY_RE.test(rows[i].text)) break;
    const m = rows[i].text.match(IRS_LINE_RE);
    if (m) {
      irs = m[1];
      break;
    }
  }
  return { name, irs };
}

function parse(cells: Cell[]): ParseResult {
  const rows = toRows(cells);
  const texts = rows.map((r) => r.text);
  const mid = findCapture(texts, /\bMID\s*:\s*([A-Z0-9]+)/i);
  const header = parseHeader(texts);
  const warnings: Warning[] = [];
  if (!header.BillNumber)
    warnings.push({ field: 'BillNumber', message: 'invoice number not found', blocking: true });
  const { lines: Line, anchorsForPdf } = parseLines(rows, mid, warnings);
  const billOfLading = { ...header, Line };
  return { billOfLading, warnings, importer: parseImporter(rows), lineAnchors: anchorsForPdf };
}

export const claveA1: TemplateParser = {
  id: 'mx-bilingual-export',
  name: 'Mexican bilingual export invoice',
  description: 'FastReport "Factura Exportación Bilingüe" (FactExpBiCompl) — any customs regime (A1, RT, …).',
  detect,
  parse,
};
