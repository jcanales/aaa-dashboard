import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { AGENT_SKILLS, AGENT_CATEGORIES, getSkill } from '../../agents/skillRegistry';
import { logger } from '../../utils/logger';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── GET /api/agents/skills ─────────────────────────────────────────────────────
// Returns the full skill manifest (no prompts in the list response — only metadata).
router.get('/skills', (_req: Request, res: Response) => {
  res.json({
    categories: AGENT_CATEGORIES,
    skills: AGENT_SKILLS.map(({ slug, category, title, role, objective }) => ({
      slug, category, title, role, objective,
    })),
  });
});

// ── POST /api/agents/chat ──────────────────────────────────────────────────────
// Body: { slug, messages, clientContext? }
// messages = [{ role: 'user'|'assistant', content: string }, ...]
// Streams the response as Server-Sent Events.
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const {
    slug,
    messages,
    clientContext,
  } = req.body as {
    slug: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    clientContext?: string;
  };

  if (!slug || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'slug and messages[] are required' });
    return;
  }

  const skill = getSkill(slug);
  if (!skill) {
    res.status(404).json({ error: `Unknown agent skill: ${slug}` });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  // Build system prompt: agent skill prompt + optional client context
  let systemPrompt = skill.prompt;
  if (clientContext) {
    systemPrompt +=
      `\n\n---\n## Current Client Context\n\n${clientContext}\n\n` +
      `Use this data to ground your advice in the client's actual trade profile when relevant.`;
  }
  systemPrompt +=
    `\n\n---\nYou are operating within the Grupo JD Trade Compliance Portal. ` +
    `Keep responses concise and actionable. Use bullet points and headers for clarity. ` +
    `When referencing specific regulations, cite the CFR section or statute number.`;

  // Stream via SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

    logger.info('Agent chat completed', { slug, userId: req.user?.userId });
  } catch (err) {
    logger.error('Agent chat error', { slug, message: (err as Error).message });
    res.write(`data: ${JSON.stringify({ error: 'Chat failed: ' + (err as Error).message })}\n\n`);
    res.end();
  }
});

export default router;
