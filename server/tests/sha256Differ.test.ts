import { describe, it, expect } from 'vitest';
import { sha256, hasChanged } from '../src/diffing/sha256Differ';

describe('sha256', () => {
  it('returns a 64-character hex string', () => {
    const result = sha256('hello world');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('produces the same hash for identical input', () => {
    const content = 'tariff document content';
    expect(sha256(content)).toBe(sha256(content));
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = sha256('Section 301 tariffs on steel');
    const hash2 = sha256('Section 301 tariffs on aluminum');
    expect(hash1).not.toBe(hash2);
  });

  it('is case-sensitive', () => {
    expect(sha256('Hello')).not.toBe(sha256('hello'));
  });

  it('handles empty string', () => {
    const result = sha256('');
    expect(result).toHaveLength(64);
  });

  it('handles unicode content', () => {
    const result = sha256('Arancel: 25% sobre importaciones de México');
    expect(result).toHaveLength(64);
    expect(sha256('Arancel: 25% sobre importaciones de México')).toBe(result);
  });

  it('produces the known SHA-256 of "abc"', () => {
    // Known SHA-256 hash of the ASCII string "abc"
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('hasChanged', () => {
  it('returns true when lastHash is null (first poll)', () => {
    expect(hasChanged('abcdef', null)).toBe(true);
  });

  it('returns true when lastHash is undefined (never polled)', () => {
    expect(hasChanged('abcdef', undefined)).toBe(true);
  });

  it('returns false when hashes match', () => {
    const hash = sha256('same content');
    expect(hasChanged(hash, hash)).toBe(false);
  });

  it('returns true when hashes differ', () => {
    const oldHash = sha256('old tariff document');
    const newHash = sha256('updated tariff document');
    expect(hasChanged(newHash, oldHash)).toBe(true);
  });

  it('returns false with identical literal strings', () => {
    expect(hasChanged('aaa111', 'aaa111')).toBe(false);
  });

  it('treats empty string as a valid hash for comparison', () => {
    expect(hasChanged('', '')).toBe(false);
    expect(hasChanged('abc', '')).toBe(true);
  });
});
