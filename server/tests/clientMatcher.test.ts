import { describe, it, expect } from 'vitest';
import { htsCodesMatch } from '../src/matching/clientMatcher';

/**
 * HTS code matching follows a three-tier prefix strategy (most-specific first):
 *   1. Exact match (all digits equal)
 *   2. 8-digit prefix match (statistical subheading level)
 *   3. 6-digit prefix match (HS heading level — broadest match)
 *
 * Matching at the 6-digit level intentionally catches related product families,
 * which is appropriate for customs brokerage impact screening.
 */

describe('htsCodesMatch', () => {
  // ── Exact matches ────────────────────────────────────────────────────────────
  describe('exact 10-digit match', () => {
    it('matches identical 10-digit codes', () => {
      expect(htsCodesMatch('7208101500', '7208101500')).toBe(true);
    });

    it('matches dot-notation portfolio code against plain-digit change code', () => {
      // "7208.10.1500" and "7208101500" represent the same HTS entry
      expect(htsCodesMatch('7208.10.1500', '7208101500')).toBe(true);
    });

    it('matches both codes in dot notation', () => {
      expect(htsCodesMatch('7208.10.1500', '7208.10.1500')).toBe(true);
    });
  });

  // ── 8-digit prefix matches ───────────────────────────────────────────────────
  describe('8-digit prefix match', () => {
    it('matches codes sharing the same 8-digit statistical suffix (differ only in last 2)', () => {
      // 72081015|00 vs 72081015|30 — same 8-digit prefix → match
      expect(htsCodesMatch('7208101500', '7208101530')).toBe(true);
    });

    it('matches codes with the same 8-digit prefix even when last 2 digits differ significantly', () => {
      // 72081015|00 vs 72081015|99 — same 8-digit prefix
      expect(htsCodesMatch('7208101500', '7208101599')).toBe(true);
    });
  });

  // ── 6-digit heading matches ──────────────────────────────────────────────────
  describe('6-digit chapter/heading match', () => {
    it('matches codes sharing the same 6-digit HS heading (differ in 7th+ digit)', () => {
      // 720810|1500 vs 720810|9900 — same 6-digit heading 720810
      expect(htsCodesMatch('7208101500', '7208109900')).toBe(true);
    });

    it('does NOT match codes that share only 4 digits (different subheading group)', () => {
      // 720810... vs 720890... — 6-digit prefix: 720810 ≠ 720890
      expect(htsCodesMatch('7208101500', '7208901500')).toBe(false);
    });

    it('does NOT match when 6-digit headings differ', () => {
      // 720819... vs 720810... — 720819 ≠ 720810
      expect(htsCodesMatch('7208199999', '7208101500')).toBe(false);
    });
  });

  // ── Non-matches ───────────────────────────────────────────────────────────────
  describe('no match', () => {
    it('returns false for completely unrelated HTS codes (different chapters)', () => {
      // Chapter 84 (machinery) vs Chapter 72 (steel)
      expect(htsCodesMatch('8471300000', '7208101500')).toBe(false);
    });

    it('returns false for codes in different chapters', () => {
      // Chapter 61 (knitted apparel) vs Chapter 72 (steel)
      expect(htsCodesMatch('6104610000', '7208101500')).toBe(false);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns false when either argument is an empty string', () => {
      expect(htsCodesMatch('', '7208101500')).toBe(false);
      expect(htsCodesMatch('7208101500', '')).toBe(false);
      expect(htsCodesMatch('', '')).toBe(false);
    });

    it('strips hyphens and dots before comparing', () => {
      expect(htsCodesMatch('7208-10-1500', '7208101500')).toBe(true);
    });

    it('does NOT match a 4-digit code against a 10-digit code (too short for 6-digit check)', () => {
      // "7208" has only 4 digits — less than the 6-digit minimum for heading match
      expect(htsCodesMatch('7208', '7208101500')).toBe(false);
    });

    it('matches identical short codes exactly', () => {
      // Two 6-digit codes that are identical
      expect(htsCodesMatch('720810', '720810')).toBe(true);
    });

    it('correctly handles codes that share exactly the first 6 digits', () => {
      // 720810|0000 vs 720810|9999 — heading match
      expect(htsCodesMatch('7208100000', '7208109999')).toBe(true);
    });
  });
});
