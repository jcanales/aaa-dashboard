/** Client-side expiry check only — not a security validation. */
export function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { exp?: number }
    if (typeof payload.exp !== 'number') return true
    return Date.now() >= payload.exp * 1000
  } catch {
    return true
  }
}
