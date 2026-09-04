import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { converterApiRateLimiter } from '../../converter/middleware/rateLimit';
import {
  createOperation, getOperation, listOperations, updateOperationData,
  addOperationMembers, removeOperationMembers, generateOperationXml, deleteOperation, getOperationMemberPdf,
  OperationInputError, OperationNotFoundError, OperationNotDraftError, ValidationFailedError,
} from '../../converter/services/operationsService';

const router = Router();
router.use(converterApiRateLimiter);

// Structural validation only (field-level completeness is validateFtz214Data's job at
// generate time). An explicit `null` for a data field would otherwise reach Prisma's
// non-nullable Json columns; a detailData with zero lines would let generateOperationXml
// emit a "successfully generated" FTZ 214 with no line items.
const FieldValuesBody = z.record(z.unknown());
const CreateBody = z.object({ conversionIds: z.array(z.string().min(1)).min(2) });
const UpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  applicationData: FieldValuesBody.optional(),
  headerData: FieldValuesBody.optional(),
  billOfLadingData: FieldValuesBody.optional(),
  detailData: z.object({ lines: z.array(FieldValuesBody).min(1) }).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(await createOperation(parsed.data.conversionIds, req.user!.userId, req.user!.role === 'admin'));
  } catch (err) {
    if (err instanceof OperationInputError) {
      res.status(400).json({ error: err.message, conversionIds: err.conversionIds });
      return;
    }
    console.error('[converter:operations:create]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await listOperations(req.user!.userId, req.user!.role === 'admin'));
  } catch (err) {
    console.error('[converter:operations:list]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const op = await getOperation(String(req.params.id), req.user!.userId, req.user!.role === 'admin');
    if (!op) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }
    res.json(op);
  } catch (err) {
    console.error('[converter:operations:get]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await updateOperationData(String(req.params.id), req.user!.userId, req.user!.role === 'admin', parsed.data));
  } catch (err) {
    if (err instanceof OperationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof OperationNotDraftError) {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error('[converter:operations:update]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/:id/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    await generateOperationXml(String(req.params.id), req.user!.userId, req.user!.role === 'admin');
    res.json(await getOperation(String(req.params.id), req.user!.userId, req.user!.role === 'admin'));
  } catch (err) {
    if (err instanceof OperationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof OperationNotDraftError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof ValidationFailedError) {
      res.status(422).json({ error: err.message, missingFields: err.missingFields });
      return;
    }
    console.error('[converter:operations:generate]', err);
    res.status(500).json({ error: 'Failed to generate XML' });
  }
});

router.get('/:id/xml', async (req: Request, res: Response): Promise<void> => {
  try {
    const op = await getOperation(String(req.params.id), req.user!.userId, req.user!.role === 'admin');
    if (!op) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }
    if (op.status !== 'generated' || !op.xml) {
      res.status(409).json({ error: 'XML has not been generated for this operation yet' });
      return;
    }
    // op.name is user-supplied — strip anything but a safe charset before it goes into
    // a header value rather than trusting it not to contain quotes/control characters.
    const safeBase = (op.name ?? `operation-${op.id}`).replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${safeBase}.xml"`);
    res.send(op.xml);
  } catch (err) {
    console.error('[converter:operations:xml]', err);
    res.status(500).json({ error: 'Failed to retrieve XML' });
  }
});

router.get('/:id/pdf/:conversionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const pdf = await getOperationMemberPdf(
      String(req.params.id), String(req.params.conversionId), req.user!.userId, req.user!.role === 'admin',
    );
    if (!pdf) {
      res.status(404).json({ error: 'PDF not available for this operation member' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(pdf);
  } catch (err) {
    console.error('[converter:operations:pdf]', err);
    res.status(500).json({ error: 'Failed to retrieve the PDF' });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteOperation(String(req.params.id), req.user!.userId, req.user!.role === 'admin');
    res.status(204).end();
  } catch (err) {
    if (err instanceof OperationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[converter:operations:delete]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

const RemoveMembersBody = z.object({ conversionIds: z.array(z.string().min(1)).min(1) });

router.post('/:id/members/remove', async (req: Request, res: Response): Promise<void> => {
  const parsed = RemoveMembersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    const detail = await removeOperationMembers(
      String(req.params.id),
      parsed.data.conversionIds,
      req.user!.userId,
      req.user!.role === 'admin'
    );
    res.json(detail);
  } catch (err) {
    if (err instanceof OperationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof OperationNotDraftError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof OperationInputError) {
      res.status(400).json({ error: err.message, conversionIds: err.conversionIds });
      return;
    }
    console.error('[converter:operations:remove-members]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/:id/members/add', async (req: Request, res: Response): Promise<void> => {
  const parsed = RemoveMembersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    const detail = await addOperationMembers(
      String(req.params.id),
      parsed.data.conversionIds,
      req.user!.userId,
      req.user!.role === 'admin'
    );
    res.json(detail);
  } catch (err) {
    if (err instanceof OperationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof OperationNotDraftError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof OperationInputError) {
      res.status(400).json({ error: err.message, conversionIds: err.conversionIds });
      return;
    }
    console.error('[converter:operations:add-members]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
