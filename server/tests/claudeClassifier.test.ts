import { describe, it, expect } from 'vitest';
import { parseClassificationResponse } from '../src/ai/claudeClassifier';

// Tests exercise the JSON parsing logic in isolation — no Anthropic API calls made.

describe('parseClassificationResponse', () => {
  const validResponse = JSON.stringify({
    summary: 'The USTR is increasing Section 301 tariffs on steel from China from 7.5% to 25%, effective May 1. All importers of covered steel products will face higher duty costs.',
    impactScore: 9,
    impactRationale: 'Significant rate increase affecting a broad category of steel imports from the largest source country.',
    htsCodes: ['7208.10.1500', '7208.25.3000', '7209.16.0030'],
    dutyBefore: '7.5%',
    dutyAfter: '25%',
  });

  it('parses a valid JSON response correctly', () => {
    const result = parseClassificationResponse(validResponse);
    expect(result.summary).toContain('Section 301');
    expect(result.impactScore).toBe(9);
    expect(result.impactRationale).toBeTruthy();
    expect(result.htsCodes).toHaveLength(3);
    expect(result.htsCodes[0]).toBe('7208.10.1500');
    expect(result.dutyBefore).toBe('7.5%');
    expect(result.dutyAfter).toBe('25%');
  });

  it('strips markdown code fences before parsing', () => {
    const withFences = '```json\n' + validResponse + '\n```';
    const result = parseClassificationResponse(withFences);
    expect(result.impactScore).toBe(9);
  });

  it('accepts a response with null duty rates', () => {
    const withNullDuties = JSON.stringify({
      summary: 'Administrative modification to USMCA rules of origin for textiles.',
      impactScore: 3,
      impactRationale: 'Minor change affecting only a subset of textile importers.',
      htsCodes: ['5208.11.2090'],
      dutyBefore: null,
      dutyAfter: null,
    });
    const result = parseClassificationResponse(withNullDuties);
    expect(result.dutyBefore).toBeNull();
    expect(result.dutyAfter).toBeNull();
  });

  it('accepts an empty htsCodes array when no specific codes are identified', () => {
    const noHts = JSON.stringify({
      summary: 'General notice about upcoming tariff schedule review.',
      impactScore: 2,
      impactRationale: 'Informational notice with no immediate rate changes.',
      htsCodes: [],
      dutyBefore: null,
      dutyAfter: null,
    });
    const result = parseClassificationResponse(noHts);
    expect(result.htsCodes).toHaveLength(0);
  });

  it('throws on completely non-JSON input', () => {
    expect(() => parseClassificationResponse('This is plain text, not JSON.')).toThrow();
  });

  it('throws on JSON that is not an object (array at top level)', () => {
    expect(() => parseClassificationResponse('["a", "b"]')).toThrow();
  });

  it('throws when summary field is missing', () => {
    const noSummary = JSON.stringify({
      impactScore: 5,
      impactRationale: 'Some rationale.',
      htsCodes: [],
      dutyBefore: null,
      dutyAfter: null,
    });
    expect(() => parseClassificationResponse(noSummary)).toThrow(/summary/);
  });

  it('throws when impactScore is not an integer', () => {
    const floatScore = JSON.stringify({
      summary: 'Some summary.',
      impactScore: 7.5,
      impactRationale: 'Some rationale.',
      htsCodes: [],
      dutyBefore: null,
      dutyAfter: null,
    });
    expect(() => parseClassificationResponse(floatScore)).toThrow(/impactScore/);
  });

  it('throws when impactScore is out of the 1-10 range', () => {
    const scoreZero = JSON.stringify({
      summary: 'Some summary.',
      impactScore: 0,
      impactRationale: 'Some rationale.',
      htsCodes: [],
      dutyBefore: null,
      dutyAfter: null,
    });
    expect(() => parseClassificationResponse(scoreZero)).toThrow(/outside the valid range/);

    const scoreEleven = JSON.stringify({
      summary: 'Some summary.',
      impactScore: 11,
      impactRationale: 'Some rationale.',
      htsCodes: [],
      dutyBefore: null,
      dutyAfter: null,
    });
    expect(() => parseClassificationResponse(scoreEleven)).toThrow(/outside the valid range/);
  });

  it('throws when htsCodes is not an array', () => {
    const stringHts = JSON.stringify({
      summary: 'Some summary.',
      impactScore: 5,
      impactRationale: 'Some rationale.',
      htsCodes: '7208.10.1500',
      dutyBefore: null,
      dutyAfter: null,
    });
    expect(() => parseClassificationResponse(stringHts)).toThrow(/htsCodes/);
  });

  it('coerces non-string HTS code array elements to strings', () => {
    const numericCodes = JSON.stringify({
      summary: 'Summary.',
      impactScore: 5,
      impactRationale: 'Rationale.',
      htsCodes: [7208101500, 7209160030],
      dutyBefore: null,
      dutyAfter: null,
    });
    const result = parseClassificationResponse(numericCodes);
    expect(result.htsCodes[0]).toBe('7208101500');
    expect(result.htsCodes[1]).toBe('7209160030');
  });

  it('coerces non-null dutyBefore/dutyAfter to strings', () => {
    const numericDuty = JSON.stringify({
      summary: 'Summary.',
      impactScore: 5,
      impactRationale: 'Rationale.',
      htsCodes: [],
      dutyBefore: 7.5,
      dutyAfter: 25,
    });
    const result = parseClassificationResponse(numericDuty);
    expect(result.dutyBefore).toBe('7.5');
    expect(result.dutyAfter).toBe('25');
  });
});
