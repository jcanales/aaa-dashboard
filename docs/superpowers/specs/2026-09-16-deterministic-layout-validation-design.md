# Auto-Validating Invoice Layouts into Deterministic Parsers — Design

**Date:** 2026-09-16
**Status:** Approved approach A + confidence gate + adjacent detected-layout reuse fix

## Goal

Today, "validating" a detected invoice layout (`InvoiceLayout.status: 'detected' → 'validated'`) only changes which AI model extracts future invoices of that layout (Opus "new layout" analysis → Sonnet "known layout" extraction with prose hints). It never stops calling the API. The goal: when a newly-detected layout's fields can be located reliably, extraction of all future invoices matching that layout's fingerprint should run with **zero AI calls**, using a generic rule interpreter driven by structured rules captured once at detection time — while never silently returning a wrong (not just missing) value on a layout whose structure is too ambiguous for that to be safe.

## Current state (two unrelated mechanisms)

1. **Deterministic template** (`backend/src/converter/parsing/templates/claveA1.ts`) — 503 lines of hand-written parsing logic: groups raw PDF text fragments into rows by y-proximity (`toRows`), finds line-item boundaries via a numbered anchor regex (`"3 • PART-NUMBER"`), disambiguates stacked Spanish/English description blocks, regex-extracts quantities/units/weights, cross-checks origin-country codes. Zero AI calls, ever. `extractCells()` (`parsing/pdfText.ts`) is the only shared primitive — it returns flat `{page, x, y, s: text, ord}` fragments, no table/column structure.
2. **AI layout** (`InvoiceLayout.fieldMap`) — a `Record<fieldName, string | null>` of Claude-authored prose hints ("aparece bajo la columna 'HTS'"), injected into the system prompt on every future invoice of that fingerprint. Always calls the API (`extractInvoiceData`, Sonnet 5, once `status: 'validated'`; `analyzeNewLayout`, Opus 5, while `status: 'detected'` and unmatched).

There is no path from (2) to (1) today.

## Data model

Add to `InvoiceLayout` (`backend/prisma/schema.prisma`):

```prisma
model InvoiceLayout {
  // ...existing fields...
  extractionRules Json?   // LayoutRuleSet | null — null for pre-existing rows and any
                          // layout Claude couldn't produce high-confidence rules for
}
```

`fieldMap` (existing column) stays, but becomes a **derived, human-readable rendering of `extractionRules`** — Claude only ever emits structured rules; a `describeRule()` formatter renders them for the Detected Layouts admin UI. This removes the current duplicate-source-of-truth risk (prose hint and actual behavior silently drifting apart).

## Rule DSL

```ts
// backend/src/converter/layouts/ruleTypes.ts
type Confidence = 'high' | 'low';

type ExtractionRule =
  | { type: 'column'; scope: 'line'; columnHeader: string; confidence: Confidence }
  | { type: 'regex'; scope: 'line' | 'bol'; pattern: string; group: number; confidence: Confidence }
  | { type: 'literal'; value: string | number }
  | { type: 'unresolved' };

interface LayoutRuleSet {
  // How to split the line-items table into one chunk of rows per invoice line.
  // Without this, no `scope: 'line'` rule can be trusted regardless of its own
  // confidence — it's the load-bearing structural rule every layout needs.
  lineAnchor:
    | { type: 'regex'; pattern: string; confidence: Confidence }
    | { type: 'oneRowPerLine'; confidence: Confidence }
    | { type: 'unresolved' };
  fields: Record<string, ExtractionRule>; // keyed by FieldDef.name, same key space as today's fieldMap
}
```

Design notes:
- `regex` (matched against a row's joined text via `toRows()`, reused from `claveA1.ts`) is the primary primitive — it's what most of `claveA1.ts`'s own extraction already reduces to. Most real invoices are label/value text, not true gridded tables.
- `column` exists for genuinely tabular layouts. Claude can only describe a *visible column label* (it has no access to our `extractCells()` x/y coordinates) — the interpreter resolves that label to an x-position by finding the header row's cell, then for each line-item chunk picks the cell(s) within an x-tolerance band of it. The rule itself never carries raw coordinates.
- `bol` scope regex rules match against the whole document's joined text (mirrors `claveA1.ts`'s `parseHeader`/`findCapture`) — BOL fields are once-per-document ("Factura (Invoice): ..."), not per-line.
- Confidence is set by Claude during the one-time analysis, based on whether the field's location looked structurally unambiguous (single clean row/column match) vs. ambiguous (wrapped text, multiple candidate rows, a language-disambiguation call, an anchor pattern that only fired on some lines).
- Universal cleanup (`withCleanedDescriptions`, the Packages/Charges-default-to-0 convention) stays as shared post-processing applied identically after AI extraction, rule-based extraction, or `claveA1.ts` — it does not belong in the per-layout rule set.

## Capture — `analyzeNewLayout` changes

`extractionService.ts`'s `buildLayoutAnalysisSystemPrompt` changes its second output field from free-text `fieldMap` to structured `extractionRules` (`LayoutRuleSet`, zod-validated same as the rest of the response). The extraction itself (`billOfLading` data) is unchanged — this only changes what gets captured *about the layout*, not what gets extracted for *this* invoice.

## Validation flow (auto + manual)

After a new layout is analyzed:

1. Check `lineAnchor.confidence === 'high'` (or `type: 'oneRowPerLine'`) **and** every **mandatory** field (`FieldDef.designation === 'M'`, from `ftz214/fields.ts`) has a rule with `confidence: 'high'` (not `unresolved`, not `low`).
2. If all pass → `createLayout` sets `status: 'validated'` immediately. No human step. This is the "fully automatic" path.
3. If any fail → `status: 'detected'`, exactly as today. The existing manual checkmark on the Detected Layouts tab still works — an admin can force-validate a layout despite low confidence, knowingly, per-layout. This is not a global setting; it's a per-layout override of the safety gate.

Non-mandatory fields (`O`/`C`) never block auto-validation, and stay `null` at runtime if `unresolved` — same as a genuinely blank field on the source invoice today.

## Execution — the generic interpreter

New `backend/src/converter/parsing/ruleBasedParser.ts`, analogous in shape to `claveA1.ts`'s `TemplateParser` interface but data-driven:

```ts
function parseWithRules(cells: Cell[], rules: LayoutRuleSet): ParseResult
```

Algorithm:
1. `toRows(cells)` (hoisted out of `claveA1.ts` into a shared module, e.g. `parsing/rows.ts`, both files import it).
2. Resolve `bol`-scope rules against the full joined document text.
3. Split rows into line-item chunks via `lineAnchor`.
4. For each chunk, resolve every `line`-scope field rule (`regex` against the chunk's joined text; `column` against the x-band of the matched header).
5. Apply the shared post-processing (description cleanup, Packages/Charges defaults) — identical call sites `claveA1.ts` already uses.

**Integration point** (`conversionsService.ts`'s `runExtraction`): insert a new step between the existing `tryDeterministicParse` (hardcoded templates) and the AI fallback — fingerprint-match against `validated` layouts (`findMatchingLayout`, unchanged), and if found, run `parseWithRules` instead of calling `extractInvoiceData`. Only fall through to AI if a validated layout's `extractionRules` is missing (pre-existing rows validated before this change — handled as: treat as AI-mode, exactly like today) or the interpreter throws.

## Adjacent fix — reuse `detected` (unvalidated) layout hints

`findMatchingLayout` currently only searches `status: 'validated'`. Extend it (or add a sibling lookup) to also match `status: 'detected'` layouts by fingerprint, and reuse that `fieldMap` (derived hints) for the cheaper `extractInvoiceData` (Sonnet) path — the same behavior `validated` layouts already get today, one tier down. This stops a layout that never clears the auto-validate confidence gate from re-running full `analyzeNewLayout` (Opus, the expensive path) on every single future invoice and piling up duplicate `detected` rows for the same fingerprint. `createLayout` also gets a fingerprint-dedupe check as part of this (update the existing `detected` row's rules/confidence on a re-analysis rather than inserting a new one).

## Frontend — Detected Layouts tab

- Field map display renders from `extractionRules` via `describeRule()` (human-readable, same visual shape as today's prose list) — no behavior change to what the admin sees, just where it's sourced from.
- Each field's row gets a confidence indicator (e.g. a dot/badge) so an admin skimming a `detected` (not auto-validated) layout can see at a glance which mandatory fields blocked auto-validation, before deciding whether to force-validate.
- A layout that was auto-validated (no human ever clicked the checkmark) should be visually distinguishable from a manually-forced one in the status column — useful for later auditing which validated layouts are running on system confidence alone vs. a human override.

## Error handling

- `parseWithRules` never throws on an unresolved/low-confidence field mid-run — those fields are `null`, exactly like `claveA1.ts`'s existing null-on-miss behavior. It only throws on a structural failure (e.g. `lineAnchor` finds zero line-item chunks on an invoice that should have at least one) — that exception is caught by `runExtraction`'s existing try/catch, which already falls through to the AI path on any thrown error from the deterministic stage (`tryDeterministicParse`'s existing contract — same pattern reused, not new).
- A validated layout whose rule-based parse produces zero blocking warnings is used as-is (matching `tryDeterministicParse`'s existing `splitWarnings`/blocking-warning gate) — a rule-based parse with a blocking warning also falls through to AI, same contract as the template path today.

## Non-goals (this change)

- Auto-generating arbitrary executable code (Approach B, rejected) — the interpreter is one fixed, reviewed piece of code; only *data* (the rule set) varies per layout.
- Re-evaluating confidence across multiple sample invoices before validating — confidence is assessed once, from the single invoice `analyzeNewLayout` saw. A layout that stays `detected` can still be manually forced later once an admin has seen it work correctly across a few invoices via the AI path.
- Migrating existing `validated` layouts (pre-dating this change, `extractionRules: null`) onto rules — they keep running the Sonnet+hints path unchanged until re-detected or manually addressed.

## Testing

No existing test coverage in `backend/src/converter/` (noted at design time — this is a green field for this area). This change should add unit tests for:
- `parseWithRules` against a synthetic `Cell[]` fixture per rule type (`column`, `regex` line/bol scope, `literal`, `unresolved`, both `lineAnchor` variants).
- The confidence-gate decision function in isolation (mandatory-field + lineAnchor logic), independent of the Anthropic call.
- `findMatchingLayout`'s extended `detected`-tier lookup and `createLayout`'s new dedupe-on-fingerprint behavior.
