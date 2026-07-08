import crypto from 'crypto';

/**
 * Compute SHA-256 hex digest of a string.
 */
export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Returns true when the newHash differs from the stored lastHash,
 * indicating that the source content has changed since the last poll.
 */
export function hasChanged(newHash: string, lastHash: string | null | undefined): boolean {
  return lastHash !== newHash;
}
