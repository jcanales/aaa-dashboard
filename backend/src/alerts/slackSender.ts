import { IncomingWebhook } from '@slack/webhook';
import { logger } from '../utils/logger';

interface SlackPayload {
  webhookUrl: string;
  changeId: string;
  title: string;
  summary: string;
  impactScore: number;
  impactRationale: string;
  htsCodes: string[];
  dutyBefore: string | null;
  dutyAfter: string | null;
  effectiveDate: Date | null;
  publicationDate: Date;
  sourceUrl: string;
  estimatedDutyImpact?: number | null;
}

function scoreEmoji(score: number): string {
  if (score >= 8) return ':red_circle:';
  if (score >= 5) return ':large_yellow_circle:';
  return ':large_green_circle:';
}

function formatImpact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'N/A';
  const sign = amount > 0 ? '+' : '';
  return `${sign}$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/yr`;
}

export async function sendTariffAlertSlack(payload: SlackPayload): Promise<void> {
  const webhook = new IncomingWebhook(payload.webhookUrl);
  const portalUrl = process.env.PORTAL_URL ?? 'https://tradeportal.jdgroup.net';
  const reviewLink = `${portalUrl}/review/${payload.changeId}`;
  const emoji = scoreEmoji(payload.impactScore);

  const dutyChangeText =
    payload.dutyBefore || payload.dutyAfter
      ? `${payload.dutyBefore ?? 'N/A'} → ${payload.dutyAfter ?? 'N/A'}`
      : 'See notice';

  await webhook.send({
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Tariff Alert — Impact ${payload.impactScore}/10`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${payload.title}*\n${payload.summary}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Publication Date*\n${payload.publicationDate.toDateString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Effective Date*\n${payload.effectiveDate ? payload.effectiveDate.toDateString() : 'TBD'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Duty Change*\n${dutyChangeText}`,
          },
          {
            type: 'mrkdwn',
            text: `*Est. Annual Impact*\n${formatImpact(payload.estimatedDutyImpact)}`,
          },
          {
            type: 'mrkdwn',
            text: `*Affected HTS Codes*\n${payload.htsCodes.length > 0 ? payload.htsCodes.slice(0, 5).join(', ') + (payload.htsCodes.length > 5 ? ` +${payload.htsCodes.length - 5} more` : '') : 'See notice'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Impact Rationale*\n${payload.impactRationale}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Review in Portal',
              emoji: true,
            },
            url: reviewLink,
            style: 'primary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Official Notice',
              emoji: true,
            },
            url: payload.sourceUrl,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_This alert was reviewed and approved by a licensed customs broker at Grupo JD._',
          },
        ],
      },
    ],
  });

  logger.info('Slack alert sent', { changeId: payload.changeId, webhookUrl: payload.webhookUrl.slice(0, 40) + '...' });
}
