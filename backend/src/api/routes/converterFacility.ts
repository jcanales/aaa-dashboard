import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/requireRole';
import { getFacility, saveFacility } from '../../converter/services/facilityService';

const router = Router();
router.use(requireRole(['coordinator', 'manager', 'admin']));

const FieldMap = z.record(z.union([z.string(), z.number(), z.null()]));
const SaveFacilitySchema = z.object({
  applicationInfo: FieldMap.optional(),
  header: FieldMap.optional(),
});

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getFacility());
  } catch (err) {
    console.error('[converter:facility]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = SaveFacilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await saveFacility(parsed.data));
  } catch (err) {
    console.error('[converter:facility:save]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
