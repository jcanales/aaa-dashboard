import { describe, it, expect } from 'vitest';
import { parseDate, defaultRange, priorPeriod } from '../src/api/entryScope';

describe('parseDate', () => {
  const fb = new Date('2026-01-01');
  it('returns fallback for undefined', () => expect(parseDate(undefined, fb)).toBe(fb));
  it('returns fallback for garbage', () => expect(parseDate('not-a-date', fb)).toBe(fb));
  it('parses a valid ISO date', () =>
    expect(parseDate('2026-03-15', fb).toISOString().slice(0, 10)).toBe('2026-03-15'));
});

describe('defaultRange', () => {
  it('starts on the 1st at midnight, two months back', () => {
    const { from, to } = defaultRange();
    expect(from.getDate()).toBe(1);
    expect(from.getHours()).toBe(0);
    expect(from.getTime()).toBeLessThan(to.getTime());
  });
});

describe('priorPeriod', () => {
  it('returns an equal-length window ending 1ms before from', () => {
    const from = new Date('2026-06-01T00:00:00Z');
    const to   = new Date('2026-07-01T00:00:00Z');
    const { priorFrom, priorTo } = priorPeriod(from, to);
    expect(priorTo.getTime()).toBe(from.getTime() - 1);
    expect(priorTo.getTime() - priorFrom.getTime()).toBe(to.getTime() - from.getTime());
  });
});
