import { getDocument } from 'pdfjs-dist/legacy/build/pdf.js';

// pdfjs-dist logs harmless "Cannot polyfill DOMMatrix/Path2D" warnings in Node
// when the optional `canvas` package isn't installed — safe to ignore, this
// module only reads text content, it never rasterizes/renders a page.
export async function extractPdfText(pdfBase64: string): Promise<string> {
  const data = new Uint8Array(Buffer.from(pdfBase64, 'base64'));
  // isEvalSupported:false — CVE-2024-4367; we only read text, never render
  const doc = await getDocument({ data, isEvalSupported: false }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  return text;
}

const ACCENT_MARKS_RE = /[̀-ͯ]/g;
const NON_ALNUM_RE = /[^a-z0-9]+/;
const PURELY_NUMERIC_RE = /^[0-9]+$/;

// Tokens are the fingerprint's unit of comparison: normalize away case/accents/
// punctuation, drop short tokens (≤2 chars — mostly stray punctuation) and
// purely-numeric tokens (invoice numbers, dates, weights vary per invoice and
// would hurt cross-invoice matching for the same template).
export function tokenize(text: string): Set<string> {
  const normalized = text.toLowerCase().normalize('NFD').replace(ACCENT_MARKS_RE, '');
  const tokens = normalized.split(NON_ALNUM_RE).filter(Boolean);
  return new Set(tokens.filter((t) => t.length > 2 && !PURELY_NUMERIC_RE.test(t)));
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Returns null (not an empty array) when the PDF has no extractable text layer
// (e.g. a scanned image) — callers treat null as "always take the new-layout
// path, don't attempt to fingerprint this document" rather than comparing
// against an empty set, which would spuriously score 1.0 against any other
// text-less fingerprint.
export async function computeFingerprint(pdfBase64: string): Promise<string[] | null> {
  let text: string;
  try {
    text = await extractPdfText(pdfBase64);
  } catch {
    return null;
  }
  const tokens = tokenize(text);
  return tokens.size > 0 ? Array.from(tokens) : null;
}
