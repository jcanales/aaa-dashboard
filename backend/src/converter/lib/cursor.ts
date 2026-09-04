export class InvalidCursorError extends Error {}

// Keyset pagination cursor: base64 of "<createdAt ISO>|<id>". Ordering is
// (createdAt desc, id desc), so a page fetches rows strictly "before" this point.
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64');
}

export function decodeCursor(s: string): { createdAt: Date; id: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(s, 'base64').toString('utf8');
  } catch {
    throw new InvalidCursorError('bad cursor');
  }
  const pipe = decoded.indexOf('|');
  if (pipe < 0) throw new InvalidCursorError('bad cursor');
  const createdAt = new Date(decoded.slice(0, pipe));
  const id = decoded.slice(pipe + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) throw new InvalidCursorError('bad cursor');
  return { createdAt, id };
}
