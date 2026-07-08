import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const MODEL = 'claude-sonnet-4-20250514';

export interface ClassificationResult {
  summary: string;
  impactScore: number;
  impactRationale: string;
  htsCodes: string[];
  dutyBefore: string | null;
  dutyAfter: string | null;
}

function buildPrompt(title: string, rawContent: string): string {
  return `You are a US customs compliance expert at a US-Mexico border customs brokerage firm (Grupo JD). Analyze the following tariff regulatory notice and extract structured intelligence.

NOTICE TITLE: ${title}
NOTICE CONTENT: ${rawContent}

Respond ONLY with a valid JSON object (no markdown, no preamble) with exactly these fields:
{
  "summary": "Plain-language 2-sentence summary of what changed and who is affected",
  "impactScore": <integer 1-10 where 10 = maximum duty impact on importers>,
  "impactRationale": "One sentence explaining the score",
  "htsCodes": ["array", "of", "affected", "10-digit", "HTS", "codes"],
  "dutyBefore": "Previous duty rate if determinable, else null",
  "dutyAfter": "New duty rate if determinable, else null"
}`;
}

function parseClassificationResponse(responseText: string): ClassificationResult {
  // Strip any accidental markdown code fences
  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Claude returned non-JSON response: ${cleaned.slice(0, 200)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Claude response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.summary !== 'string') {
    throw new Error('Missing or invalid "summary" field in Claude response');
  }
  if (typeof obj.impactScore !== 'number' || !Number.isInteger(obj.impactScore)) {
    throw new Error('Missing or invalid "impactScore" field in Claude response');
  }
  if (typeof obj.impactRationale !== 'string') {
    throw new Error('Missing or invalid "impactRationale" field in Claude response');
  }
  if (!Array.isArray(obj.htsCodes)) {
    throw new Error('Missing or invalid "htsCodes" field in Claude response');
  }

  const score = obj.impactScore as number;
  if (score < 1 || score > 10) {
    throw new Error(`impactScore ${score} is outside the valid range 1-10`);
  }

  return {
    summary: obj.summary as string,
    impactScore: score,
    impactRationale: obj.impactRationale as string,
    htsCodes: (obj.htsCodes as unknown[]).map((c) => String(c)),
    dutyBefore: obj.dutyBefore !== undefined && obj.dutyBefore !== null ? String(obj.dutyBefore) : null,
    dutyAfter: obj.dutyAfter !== undefined && obj.dutyAfter !== null ? String(obj.dutyAfter) : null,
  };
}

export async function classifyTariffNotice(
  title: string,
  rawContent: string,
  changeId?: string,
): Promise<ClassificationResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildPrompt(title, rawContent);

  logger.info('Sending notice to Claude for classification', { title, changeId });

  let responseText = '';

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const firstContent = message.content[0];
    if (firstContent.type !== 'text') {
      throw new Error('Unexpected non-text response from Claude');
    }
    responseText = firstContent.text;
  } catch (err) {
    logger.error('Claude API call failed', { error: String(err), title });
    throw err;
  }

  // Always persist to audit log regardless of parse outcome
  try {
    await prisma.aiAuditLog.create({
      data: {
        model: MODEL,
        prompt,
        response: responseText,
        ...(changeId ? { changeId } : {}),
      },
    });
  } catch (dbErr) {
    logger.warn('Failed to write AI audit log', { error: String(dbErr) });
  }

  const result = parseClassificationResponse(responseText);

  logger.info('Classification complete', {
    title,
    impactScore: result.impactScore,
    htsCodesCount: result.htsCodes.length,
  });

  return result;
}

// Export the parser separately so tests can exercise it without hitting the API
export { parseClassificationResponse };
