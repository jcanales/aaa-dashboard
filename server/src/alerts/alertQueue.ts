import { prisma } from '../db';
import { sendTariffAlertEmail } from './emailSender';
import { sendTariffAlertSlack } from './slackSender';
import { logger } from '../utils/logger';

/**
 * Queue alert records (status = 'queued') for all clients matched to a change.
 * This is called immediately after client matching, before broker review.
 * No emails or Slack messages are sent at this stage.
 */
export async function queueAlerts(changeId: string): Promise<void> {
  const matches = await prisma.clientHtsMatch.findMany({
    where: { changeId },
    include: { change: true },
  });

  if (matches.length === 0) {
    logger.info('No client matches found — no alerts to queue', { changeId });
    return;
  }

  for (const match of matches) {
    const client = await prisma.client.findUnique({
      where: { id: match.clientId },
    });

    if (!client || !client.isActive) continue;

    // Queue email alert
    const existingEmail = await prisma.alert.findFirst({
      where: { changeId, clientId: client.id, channel: 'email' },
    });
    if (!existingEmail) {
      await prisma.alert.create({
        data: {
          changeId,
          clientId: client.id,
          channel: 'email',
          status: 'queued',
        },
      });
    }

    // Queue Slack alert if client has a channel configured
    if (client.slackChannel) {
      const existingSlack = await prisma.alert.findFirst({
        where: { changeId, clientId: client.id, channel: 'slack' },
      });
      if (!existingSlack) {
        await prisma.alert.create({
          data: {
            changeId,
            clientId: client.id,
            channel: 'slack',
            status: 'queued',
          },
        });
      }
    }
  }

  logger.info('Alerts queued', { changeId, matchCount: matches.length });
}

/**
 * Process an approved change: send all queued alerts for this change.
 *
 * SECURITY INVARIANT: This function MUST only be called after the change
 * status has been set to 'approved' by an authenticated broker/admin.
 * The broker review gate is NON-BYPASSABLE.
 */
export async function processApprovedChange(changeId: string): Promise<void> {
  const change = await prisma.tariffChange.findUnique({
    where: { id: changeId },
  });

  if (!change) {
    logger.error('processApprovedChange: change not found', { changeId });
    return;
  }

  // Double-check status — prevent bypass attempts
  if (change.status !== 'approved') {
    logger.error('processApprovedChange: change is not approved — refusing to send alerts', {
      changeId,
      status: change.status,
    });
    throw new Error(`Cannot dispatch alerts for change ${changeId}: status is '${change.status}', expected 'approved'`);
  }

  const queuedAlerts = await prisma.alert.findMany({
    where: { changeId, status: 'queued' },
    include: { client: true },
  });

  if (queuedAlerts.length === 0) {
    logger.info('No queued alerts for approved change', { changeId });
    return;
  }

  // Load match data for impact estimates
  const matchMap = new Map<string, number | null>();
  const matches = await prisma.clientHtsMatch.findMany({ where: { changeId } });
  for (const m of matches) {
    matchMap.set(m.clientId, m.estimatedDutyImpact ?? null);
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const alert of queuedAlerts) {
    const client = alert.client;
    const estimatedDutyImpact = matchMap.get(client.id) ?? null;

    try {
      if (alert.channel === 'email') {
        await sendTariffAlertEmail({
          to: client.email,
          title: change.title,
          summary: change.summary,
          impactScore: change.impactScore,
          impactRationale: change.impactRationale,
          htsCodes: change.htsCodes,
          dutyBefore: change.dutyBefore as string | null,
          dutyAfter: change.dutyAfter as string | null,
          effectiveDate: change.effectiveDate,
          publicationDate: change.publicationDate,
          sourceUrl: change.sourceUrl,
          changeId: change.id,
          estimatedDutyImpact,
        });
      } else if (alert.channel === 'slack' && client.slackChannel) {
        await sendTariffAlertSlack({
          webhookUrl: client.slackChannel,
          changeId: change.id,
          title: change.title,
          summary: change.summary,
          impactScore: change.impactScore,
          impactRationale: change.impactRationale,
          htsCodes: change.htsCodes,
          dutyBefore: change.dutyBefore as string | null,
          dutyAfter: change.dutyAfter as string | null,
          effectiveDate: change.effectiveDate,
          publicationDate: change.publicationDate,
          sourceUrl: change.sourceUrl,
          estimatedDutyImpact,
        });
      }

      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: 'sent', sentAt: new Date() },
      });
      sentCount++;
    } catch (err) {
      logger.error('Failed to send alert', {
        alertId: alert.id,
        channel: alert.channel,
        clientCode: client.code,
        error: String(err),
      });
      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: 'failed' },
      });
      failedCount++;
    }
  }

  // Mark change as having dispatched alerts (even if some failed)
  await prisma.tariffChange.update({
    where: { id: changeId },
    data: { alertsSent: true },
  });

  logger.info('Alert dispatch complete', { changeId, sentCount, failedCount });
}
