// Uses the stable Messages API (client.messages.create). AAA-Converter's original
// implementation targeted @anthropic-ai/sdk@0.32.1, whose stable MessageParam
// content union had no `document`/PDF member, so it went through
// client.beta.messages.create with the `pdfs-2024-09-25` beta flag. duties-dashboard
// depends on 0.39.0, where PDF document blocks are GA on the stable API
// (ContentBlockParam includes DocumentBlockParam) — so the beta namespace and
// `betas` flag are dropped here.
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { DetailExtractionSchema, LayoutAnalysisSchema, type DetailExtractionResult, type ExtractedFieldValue } from '../ftz214/schemaBuilder';
import { BILL_OF_LADING_FIELDS, LINE_FIELDS, type FieldDef } from '../ftz214/fields';

function describeField(field: FieldDef): string {
  const unit = field.hasUnitsAttr ? ' (return as { "value": ..., "units": ... })' : '';
  // The wire format for every date field is 8-char YYYYMMDD, no separators (see
  // fields.ts's maxLength: 8) — without this hint Claude has no signal not to emit
  // ISO-dashed dates, which the frontend then correctly refuses to display (fails
  // closed) but isFieldEmpty can't distinguish from a genuinely missing value, so the
  // user gets no "this needs fixing" signal. Constraining the input is cheaper than
  // detecting the malformed output after the fact.
  const dateFormat = field.type === 'D' ? ' (format YYYYMMDD, digits only, no dashes or slashes)' : '';
  return `- ${field.name}: ${field.description} [type ${field.type}${field.maxLength ? `, max ${field.maxLength} chars` : ''}]${unit}${dateFormat}`;
}

// Non-null hints only — a layout's fieldMap legitimately stores null for fields that
// don't appear on that template at all, and those carry no useful prompt guidance.
function buildLayoutHintsBlock(hints?: Record<string, string | null>): string {
  if (!hints) return '';
  const entries = Object.entries(hints).filter((entry): entry is [string, string] => entry[1] !== null);
  if (entries.length === 0) return '';
  return `\n\nNotas específicas de este layout de factura (de un análisis previo de una factura con esta misma plantilla):\n${entries.map(([name, hint]) => `- ${name}: ${hint}`).join('\n')}`;
}

function buildSystemPrompt(hints?: Record<string, string | null>): string {
  return `Eres un asistente que extrae datos estructurados de facturas de exportación mexicanas bilingües (Factura Exportación Bilingüe, Clave RT) para generar admisiones FTZ 214.

Se te da el PDF de una factura. Debes devolver ÚNICAMENTE un objeto JSON válido (sin markdown, sin texto adicional) con esta forma:

{ "billOfLading": { ...campos de Bill of Lading..., "Line": [ { ...campos de Line... } ] } }

Campos a nivel de Bill of Lading:
${BILL_OF_LADING_FIELDS.map(describeField).join('\n')}

Campos a nivel de Line (uno por cada producto/renglón de la factura):
${LINE_FIELDS.map(describeField).join('\n')}

Reglas estrictas:
- Si un dato no aparece en la factura o no puedes leerlo con certeza, devuelve null — NUNCA inventes un valor.
- Excepción a la regla anterior: Packages es un campo obligatorio (Mandatory) — si la factura no incluye un conteo de bultos/paquetes para un renglón, devuelve { "value": 0, "units": null } en lugar de null.
- Excepción a la regla anterior: Charges (Freight Charges) es un campo obligatorio (Mandatory) — si la factura no muestra un cargo de flete para un renglón, devuelve 0 en lugar de null.
- "Line" debe tener un elemento por cada producto listado en la factura.
- No hagas cálculos ni conversiones de unidades; transcribe los valores tal como aparecen.
- MID (Manufacturer ID) debe identificar al fabricante del país de origen (OriginCountry) de ESE renglón específico. Si la factura solo imprime un MID mexicano (p. ej. del exportador/consolidador) y el OriginCountry del renglón es un país distinto de México, devuelve null en MID para ese renglón en lugar de copiar el MID mexicano.
- Description (descripción del renglón): la celda de descripción de estas facturas apila varias filas — primero la "Descripción Español", debajo la "Descripción Inglés", y luego filas de metadatos que NO son la descripción ("*Origen"/país como "*US(USA)", "ECCN:", el número de parte/orden de compra al final, y "Marca/Modelo/Serie"). Para armar Description:
  1. Parte de la "Descripción Inglés" del renglón.
  2. Quita cualquier número de parte/orden de compra al final (p. ej. " - 92124A510") y cualquier etiqueta de ensamble o programa al final (p. ej. ", PUFFIN BFT").
  3. Si lo que queda es solo un apodo corto de la pieza (menos de 16 caracteres, p. ej. "NEST", "BASE PLATE", "PIN BLOCK"), usa en su lugar la "Descripción Español" del renglón.
  4. Nunca incluyas en Description el marcador de origen ("*US(USA)" etc.), el texto "ECCN:", ni "Marca/Modelo/Serie".
  Devuelve el texto completo aunque supere 45 caracteres; se recorta automáticamente después.${buildLayoutHintsBlock(hints)}`;
}

// Used only for a brand-new (unrecognized) layout: asks Claude to do the regular
// extraction AND describe, for each field, where/how it found it on this specific
// document — that description becomes the InvoiceLayout.fieldMap reused as
// buildLayoutHintsBlock guidance for every future invoice matching this layout.
function buildLayoutAnalysisSystemPrompt(): string {
  return `${buildSystemPrompt()}

Además, incluye un campo adicional "fieldMap" junto a "billOfLading": un objeto con una clave por cada nombre de campo listado arriba (a nivel Bill of Lading y a nivel Line), cuyo valor sea:
- Una nota breve en español describiendo dónde/cómo aparece ese campo en ESTE documento específico (p. ej. "aparece bajo la columna 'Fracción Arancelaria' en la tabla de líneas"), o
- null si ese campo no aparece en absoluto en este layout de factura.

Formato de respuesta:
{ "billOfLading": { ... }, "fieldMap": { "<NombreDeCampo>": "nota o null", ... } }`;
}

// Despite the system prompt's explicit "sin markdown" instruction, Claude routinely wraps
// the JSON payload in a ```json fence anyway — this strips it before JSON.parse ever sees it.
function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : trimmed;
}

const DESCRIPTION_MAX_LENGTH = 45;
// Trailing " - <part/PO number>" the exporter appends to the English description
// (e.g. "NONROTATING PISTON - 5144K115"). The left ` - ` must be space-delimited so
// hyphenated words ("PUSH-TO-CONNECT") are never touched.
const TRAILING_PO_REF_RE = /\s+-\s*[A-Za-z0-9][\w./-]*$/;
// Trailing assembly/program tag ("BASE PLATE, PUFFIN BFT") — only stripped when it's
// a comma-separated suffix, so a genuine description like "Puffin BFT Fixture PCB"
// (tag at the front, no comma) is left intact.
const TRAILING_PROGRAM_TAG_RE = /,\s*PUFFIN\s+BFT$/i;
const TRAILING_PUNCT_RE = /[,\s]+$/;

// Deterministic safety net over the Description composition rule in buildSystemPrompt:
// strips the trailing PO-number and ", PUFFIN BFT" suffixes Claude sometimes leaves on,
// then enforces the 45-char field limit. The "short nickname -> use Spanish" fallback
// stays in the prompt — only Claude sees the Spanish row to fall back to.
export function cleanLineDescription(raw: ExtractedFieldValue): ExtractedFieldValue {
  if (typeof raw !== 'string') return raw;
  let text = raw.trim();
  for (let i = 0; i < 3; i++) {
    const before = text;
    text = text.replace(TRAILING_PUNCT_RE, '').replace(TRAILING_PROGRAM_TAG_RE, '').replace(TRAILING_PO_REF_RE, '');
    if (text === before) break;
  }
  text = text.replace(TRAILING_PUNCT_RE, '');
  if (text.length > DESCRIPTION_MAX_LENGTH) text = text.slice(0, DESCRIPTION_MAX_LENGTH).trim();
  return text;
}

export function withCleanedDescriptions(
  billOfLading: DetailExtractionResult['billOfLading']
): DetailExtractionResult['billOfLading'] {
  const Line = billOfLading.Line.map((line) => ({ ...line, Description: cleanLineDescription(line.Description) }));
  return { ...billOfLading, Line } as DetailExtractionResult['billOfLading'];
}

export interface ExtractionSuccess {
  ok: true;
  data: DetailExtractionResult;
}
export interface ExtractionFailure {
  ok: false;
  error: string;
}

type RunResult<T> = { ok: true; data: T } | ExtractionFailure;

// Shared by extractInvoiceData (known-layout / no-layout path, regular model) and
// analyzeNewLayout (new-layout path, more capable model + a richer response schema) —
// both only differ in model, system prompt, and response schema, everything else
// (the PDF message shape, truncation/JSON-fence/validation handling) is identical.
async function runExtraction<T>(
  pdfBase64: string,
  client: Pick<Anthropic, 'messages'>,
  model: string,
  systemPrompt: string,
  schema: z.ZodType<T>
): Promise<RunResult<T>> {
  try {
    // Streamed rather than a plain create() — at max_tokens:32000 the API
    // requires streaming (a non-streamed request this large can be rejected
    // with "Streaming is strongly recommended for operations that may take
    // longer than 10 minutes"). .stream().finalMessage() still resolves to
    // the same Message object once complete, just fed incrementally.
    const message = await client.messages
      .stream({
        model,
        // Measured on a real 7-line invoice: 2,151 of 3,972 output tokens were thinking
        // tokens on this model. At ~260 tokens/line that left room for only ~23-25 line
        // items before stop_reason:'max_tokens' truncation; real invoices routinely
        // exceed that.
        max_tokens: 32000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
              { type: 'text', text: 'Extrae los datos de esta factura según el esquema indicado.' },
            ],
          },
        ],
      })
      .finalMessage();

    if (message.stop_reason === 'max_tokens') {
      return { ok: false, error: 'Claude response was truncated (max_tokens reached) before completing the extraction' };
    }

    const block = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!block?.text) return { ok: false, error: 'Claude response contained no text block' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(block.text));
    } catch {
      return { ok: false, error: 'Claude response was not valid JSON' };
    }

    const result = schema.safeParse(parsed);
    if (!result.success) return { ok: false, error: result.error.message };
    return { ok: true, data: result.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown extraction error' };
  }
}

export async function extractInvoiceData(
  pdfBase64: string,
  client: Pick<Anthropic, 'messages'> = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  hints?: Record<string, string | null>
): Promise<ExtractionSuccess | ExtractionFailure> {
  const result = await runExtraction(pdfBase64, client, 'claude-sonnet-5', buildSystemPrompt(hints), DetailExtractionSchema);
  if (!result.ok) return result;
  // DetailExtractionResult is hand-declared, not z.infer'd (see schemaBuilder.ts) — the
  // runtime shape matches (zod already validated it), so this cast is sound.
  const data = result.data as DetailExtractionResult;
  return { ok: true, data: { billOfLading: withCleanedDescriptions(data.billOfLading) } };
}

export interface LayoutAnalysisSuccess {
  ok: true;
  data: DetailExtractionResult;
  fieldMap: Record<string, string | null>;
}
export type LayoutAnalysisResult = LayoutAnalysisSuccess | ExtractionFailure;

// Only called for a brand-new (unrecognized) layout — see layoutRegistryService.
// Uses a more capable model since this single call has to both extract correctly
// AND produce a fieldMap that every future invoice on this layout will rely on.
export async function analyzeNewLayout(
  pdfBase64: string,
  client: Pick<Anthropic, 'messages'> = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
): Promise<LayoutAnalysisResult> {
  const result = await runExtraction(pdfBase64, client, 'claude-opus-5', buildLayoutAnalysisSystemPrompt(), LayoutAnalysisSchema);
  if (!result.ok) return result;
  return {
    ok: true,
    data: { billOfLading: withCleanedDescriptions(result.data.billOfLading as DetailExtractionResult['billOfLading']) },
    fieldMap: result.data.fieldMap,
  };
}
