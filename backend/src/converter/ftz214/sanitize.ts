import { LINE_FIELDS } from './fields';
import type { BillOfLadingData } from './types';

const PRODUCT_MAX_LENGTH = LINE_FIELDS.find((f) => f.name === 'Product')!.maxLength!;

// CBP's FTZ 214 record layout caps Part Number at 15 characters. Extracted
// part numbers sometimes exceed that (e.g. a PO/lot suffix folded into the
// same invoice cell) — rather than block generation on it, truncate to fit
// so the filing stays spec-compliant. Only the value written into the
// generated XML is cut; the conversion/operation's own stored data (and
// whatever the user sees and can still hand-edit) is untouched.
export function truncateOverLongProductNumbers(billsOfLading: BillOfLadingData[]): BillOfLadingData[] {
  return billsOfLading.map((bol) => ({
    ...bol,
    lines: bol.lines.map((line) => {
      const product = line.Product;
      return typeof product === 'string' && product.length > PRODUCT_MAX_LENGTH
        ? { ...line, Product: product.slice(0, PRODUCT_MAX_LENGTH) }
        : line;
    }),
  }));
}
