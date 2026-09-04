export interface Cell {
  page: number;
  ord: number;
  x: number;
  y: number;
  s: string;
}

export interface Warning {
  line?: number;
  field: string;
  message: string;
  blocking: boolean;
}

export interface ParseResult {
  billOfLading: unknown;
  warnings: Warning[];
  /** The US importer identified on the invoice ("Imported by" + its IRS/EIN),
   *  used downstream to resolve the RB Systems Company/Customer key. */
  importer?: { name: string | null; irs: string | null };
  /** Per-line {page, y} (PDF points, y from page top) so the review page can
   *  scroll the side-by-side PDF to a clicked line. Index i ↔ Line[i]. */
  lineAnchors?: { page: number; y: number }[];
}

export interface TemplateParser {
  id: string;
  /** Human-readable name for the Configuration page. */
  name: string;
  /** One-line description of the invoice format this parser handles. */
  description: string;
  detect(cells: Cell[]): boolean;
  parse(cells: Cell[]): ParseResult;
}
