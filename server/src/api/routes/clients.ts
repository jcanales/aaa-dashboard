import { Router, Request, Response } from 'express';
import { prisma } from '../../db';
import { requireRole } from '../middleware/requireRole';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/clients
 * List all clients. Admin or broker.
 */
router.get('/', requireRole(['admin', 'broker']), async (_req: Request, res: Response): Promise<void> => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { htsPortfolio: true, alerts: true } },
      },
    });
    res.json(clients);
  } catch (err) {
    logger.error('GET /clients failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id
 */
router.get('/:id', requireRole(['admin', 'broker']), async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        htsPortfolio: { orderBy: { htsCode: 'asc' } },
        alerts: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { change: { select: { id: true, title: true, impactScore: true, createdAt: true } } },
        },
      },
    });

    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(client);
  } catch (err) {
    logger.error('GET /clients/:id failed', { error: String(err), id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients
 * Create a new client. Admin only.
 */
router.post('/', requireRole(['admin']), async (req: Request, res: Response): Promise<void> => {
  const { code, name, email, slackChannel } = req.body as {
    code?: string;
    name?: string;
    email?: string;
    slackChannel?: string;
  };

  if (!code || !name || !email) {
    res.status(400).json({ error: 'code, name, and email are required' });
    return;
  }

  try {
    const client = await prisma.client.create({
      data: { code, name, email, slackChannel: slackChannel ?? null },
    });
    logger.info('Client created', { clientId: client.id, code: client.code });
    res.status(201).json(client);
  } catch (err) {
    const message = String(err);
    if (message.includes('Unique constraint')) {
      res.status(409).json({ error: `Client code '${code}' already exists` });
      return;
    }
    logger.error('POST /clients failed', { error: message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/clients/:id
 * Update client details. Admin only.
 */
router.put('/:id', requireRole(['admin']), async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { name, email, slackChannel, isActive } = req.body as {
    name?: string;
    email?: string;
    slackChannel?: string;
    isActive?: boolean;
  };

  try {
    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(slackChannel !== undefined ? { slackChannel } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    res.json(client);
  } catch (err) {
    const message = String(err);
    if (message.includes('Record to update not found')) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    logger.error('PUT /clients/:id failed', { error: message, id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/hts
 * Add an HTS code to a client portfolio. Admin or broker.
 */
router.post('/:id/hts', requireRole(['admin', 'broker']), async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { htsCode, description, annualValue } = req.body as {
    htsCode?: string;
    description?: string;
    annualValue?: number;
  };

  if (!htsCode) {
    res.status(400).json({ error: 'htsCode is required' });
    return;
  }

  // Basic HTS format validation: 4-10 digits optionally separated by dots
  const normalized = htsCode.replace(/\./g, '');
  if (!/^\d{4,10}$/.test(normalized)) {
    res.status(400).json({ error: 'htsCode must be a numeric code of 4-10 digits' });
    return;
  }

  try {
    const entry = await prisma.clientHtsPortfolio.create({
      data: {
        clientId: id,
        htsCode,
        description: description ?? null,
        annualValue: annualValue ?? null,
      },
    });
    res.status(201).json(entry);
  } catch (err) {
    const message = String(err);
    if (message.includes('Unique constraint')) {
      res.status(409).json({ error: `HTS code '${htsCode}' already in portfolio for this client` });
      return;
    }
    if (message.includes('Foreign key constraint')) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    logger.error('POST /clients/:id/hts failed', { error: message, id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/clients/:id/hts/:htsId
 * Remove an HTS code from a client portfolio. Admin only.
 */
router.delete('/:id/hts/:htsId', requireRole(['admin']), async (req: Request, res: Response): Promise<void> => {
  const htsId = String(req.params.htsId);

  try {
    await prisma.clientHtsPortfolio.delete({ where: { id: htsId } });
    res.status(204).send();
  } catch (err) {
    const message = String(err);
    if (message.includes('Record to delete does not exist')) {
      res.status(404).json({ error: 'Portfolio entry not found' });
      return;
    }
    logger.error('DELETE /clients/:id/hts/:htsId failed', { error: message, htsId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
