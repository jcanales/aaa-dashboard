import type { SecurityAlert } from '@prisma/client';

// Delivery (email / Slack / webhook) is wired once the deployment story is
// settled. For now a single marked stderr line — grep '[security]' in logs.
export function notifySecurityAlert(alert: SecurityAlert): void {
  console.error('[security] alert raised', {
    kind: alert.kind,
    userId: alert.userId,
    username: alert.username,
    readCount: alert.readCount,
    from: alert.windowFrom,
    to: alert.windowTo,
  });
}
