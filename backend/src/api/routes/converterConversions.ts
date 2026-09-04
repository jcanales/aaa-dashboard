import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { converterApiRateLimiter } from '../../converter/middleware/rateLimit';
import {
  createPendingConversion, listConversions, getConversion, getConversionPdf, updateConversionData, generateConversionXml,
  ConversionNotFoundError, ConversionNotDraftError, ValidationFailedError,
} from '../../converter/services/conversionsService';
import { scheduleExtraction } from '../../converter/services/extractionQueue';
import { InvalidCursorError } from '../../converter/lib/cursor';

// Structural validation only (not full FieldDef-level checks — that's validateFtz214Data's
// job at generate time). This exists to close two gaps: (1) an explicit `null` body
// field would otherwise reach Prisma's non-nullable Json columns and throw a raw Prisma
// error instead of a clean 400; (2) a detailData missing the {billsOfLading:[{fields,lines}]}
// shape would make generateConversionXml's structural indexing throw a raw TypeError instead
// of a clean ValidationFailedError. Rejecting both here means updateConversionData only ever
// receives well-shaped (if not yet field-complete) data.
const FieldValuesBodySchema = z.record(z.unknown());
// .min(1) on both arrays: an empty billsOfLading (or a BOL with zero lines) would let
// generateConversionXml produce a "successfully generated" FTZ 214 filing with no bill
// of lading / no line items — validateFtz214Data only checks Header-level completeness
// and has no rule against an empty Detail, so this route is the only place that can stop it.
const BillOfLadingBodySchema = z.object({ fields: FieldValuesBodySchema, lines: z.array(FieldValuesBodySchema).min(1) });
const UpdateConversionBodySchema = z.object({
  applicationData: FieldValuesBodySchema.optional(),
  headerData: FieldValuesBodySchema.optional(),
  detailData: z.object({ billsOfLading: z.array(BillOfLadingBodySchema).min(1) }).optional(),
});

// Thrown from fileFilter (not `cb(null, false)`) so a rejected non-PDF gets a distinct,
// honest error instead of silently becoming "no file was attached" — server.ts's error
// handling middleware turns this into a 400 with this message.
export class InvalidFileTypeError extends Error {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new InvalidFileTypeError('Only PDF files are accepted'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();
router.use(converterApiRateLimiter);

// multer's fileFilter (InvalidFileTypeError, above) only ever sees the
// client-supplied Content-Type header — trivially spoofed by naming any file
// "x.pdf" and sending it with contentType: 'application/pdf'. This checks
// the actual bytes once they're in hand: every PDF starts with this
// signature (the spec allows leading garbage before it, but no legitimate
// PDF producer emits any, and requiring it at byte 0 costs nothing here).
const PDF_MAGIC_BYTES = Buffer.from('%PDF-');
function isPdfContent(buf: Buffer): boolean {
  return buf.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES);
}

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'A PDF file is required (field name "file")' });
    return;
  }
  if (!isPdfContent(req.file.buffer)) {
    res.status(400).json({ error: 'File is not a valid PDF' });
    return;
  }
  try {
    const pdfBase64 = req.file.buffer.toString('base64');
    const conversion = await createPendingConversion(req.file.originalname, pdfBase64, req.user!.userId);
    // Extraction runs in the background; the row is already persisted as
    // 'processing' and the client polls GET /conversions until it flips.
    scheduleExtraction(conversion.id, pdfBase64);
    res.status(202).json(conversion);
  } catch (err) {
    console.error('[converter:conversions:create]', err);
    res.status(500).json({ error: 'Failed to process the uploaded PDF' });
  }
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const limitRaw = req.query.limit;
  const opts = {
    limit: typeof limitRaw === 'string' && limitRaw ? Number(limitRaw) : undefined,
    before: typeof req.query.before === 'string' ? req.query.before : undefined,
    file: typeof req.query.file === 'string' ? req.query.file : undefined,
  };
  try {
    res.json(await listConversions(req.user!.userId, req.user!.role === 'admin', opts));
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      res.status(400).json({ error: 'Invalid cursor' });
      return;
    }
    console.error('[converter:conversions:list]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/:id/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const pdf = await getConversionPdf(String(req.params.id), req.user!.userId, req.user!.role === 'admin');
    if (!pdf) {
      res.status(404).json({ error: 'PDF not available for this conversion' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(pdf);
  } catch (err) {
    console.error('[converter:conversions:pdf]', err);
    res.status(500).json({ error: 'Failed to retrieve the PDF' });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const conversion = await getConversion(String(req.params.id), req.user!.userId, req.user!.role === 'admin');
    if (!conversion) {
      res.status(404).json({ error: 'Conversion not found' });
      return;
    }
    res.json(conversion);
  } catch (err) {
    console.error('[converter:conversions:get]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateConversionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await updateConversionData(String(req.params.id), req.user!.userId, req.user!.role === 'admin', parsed.data));
  } catch (err) {
    if (err instanceof ConversionNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ConversionNotDraftError) {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error('[converter:conversions:update]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/:id/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await generateConversionXml(String(req.params.id), req.user!.userId, req.user!.role === 'admin'));
  } catch (err) {
    if (err instanceof ConversionNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ValidationFailedError) {
      res.status(422).json({ error: err.message, missingFields: err.missingFields });
      return;
    }
    console.error('[converter:conversions:generate]', err);
    res.status(500).json({ error: 'Failed to generate XML' });
  }
});

router.get('/:id/xml', async (req: Request, res: Response): Promise<void> => {
  try {
    const conversion = await getConversion(String(req.params.id), req.user!.userId, req.user!.role === 'admin');
    if (!conversion || !conversion.xml) {
      res.status(404).json({ error: 'XML not available for this conversion' });
      return;
    }
    // pdfFilename originates from the uploaded file's name (attacker-controlled at
    // upload time) — strip anything but a safe charset before it goes into a header
    // value, rather than trusting it to not contain quotes/control characters.
    const safeBase = conversion.pdfFilename.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${safeBase}.xml"`);
    res.send(conversion.xml);
  } catch (err) {
    console.error('[converter:conversions:xml]', err);
    res.status(500).json({ error: 'Failed to retrieve XML' });
  }
});

export default router;
