import { getDocument } from 'pdfjs-dist/legacy/build/pdf.js';
import type { Cell } from './types';

// pdfjs-dist logs harmless "Cannot polyfill DOMMatrix/Path2D" warnings in Node
// when the optional `canvas` package isn't installed — safe to ignore, this
// module only reads text content, it never rasterizes a page.
export async function extractCells(pdfBase64: string): Promise<Cell[]> {
  const data = new Uint8Array(Buffer.from(pdfBase64, 'base64'));
  // isEvalSupported:false — CVE-2024-4367; we only read text, never render
  const doc = await getDocument({ data, isEvalSupported: false }).promise;
  const cells: Cell[] = [];
  let ord = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewportHeight = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    const pageCells = content.items
      .map((item) => ('str' in item ? item : null))
      .filter((item): item is NonNullable<typeof item> => item !== null && item.str.trim() !== '')
      .map((item) => ({
        page: p,
        x: Math.round(item.transform[4] * 10) / 10,
        y: Math.round((viewportHeight - item.transform[5]) * 10) / 10,
        s: item.str.trim(),
      }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const c of pageCells) cells.push({ ...c, ord: ord++ });
  }
  return cells;
}
