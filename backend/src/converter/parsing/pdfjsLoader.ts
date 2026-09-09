// pdfjs-dist v5+ ships ESM-only. This backend compiles to CommonJS, and with
// `module: "commonjs"` TypeScript silently lowers `await import(...)` into a
// require()-wrapped promise — which still throws ERR_REQUIRE_ESM against a
// pure-ESM package. `new Function` hides the import() call from that
// transform entirely, so Node's real native dynamic import runs instead.
type PdfjsLegacyModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<PdfjsLegacyModule>;

// pdfjs-dist v6 also calls Promise.withResolvers() internally (in
// PDFDocumentLoadingTask), which only landed as a built-in in Node 22 — on
// this app's Node 20 runtime it's undefined, so every getDocument() call
// threw "Promise.withResolvers is not a function". That exception was being
// silently swallowed by tryDeterministicParse()'s catch-and-fall-back-to-AI,
// so every conversion was hitting the slow AI path instead of the fast
// deterministic one. Polyfilling here (exact shape of the TC39 proposal)
// fixes it without requiring a Node upgrade.
// Cast to a loosely-typed handle — `withResolvers` isn't in this project's
// target lib (es2020) at all, on either side of the check.
const PromiseCtor = Promise as unknown as { withResolvers?: () => unknown };
if (typeof PromiseCtor.withResolvers !== 'function') {
  PromiseCtor.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

let cached: Promise<PdfjsLegacyModule> | null = null;

export function loadPdfjs(): Promise<PdfjsLegacyModule> {
  cached ??= dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  return cached;
}
