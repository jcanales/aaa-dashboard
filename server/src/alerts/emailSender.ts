import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

interface EmailPayload {
  to: string;
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
  changeId: string;
  estimatedDutyImpact?: number | null;
}

function buildHtmlBody(payload: EmailPayload): string {
  const portalUrl = process.env.PORTAL_URL ?? 'https://tradeportal.jdgroup.net';
  const reviewLink = `${portalUrl}/review/${payload.changeId}`;

  const dutyRow =
    payload.dutyBefore || payload.dutyAfter
      ? `
      <tr>
        <td style="padding:8px 16px;font-weight:600;color:#374151;">Duty Change</td>
        <td style="padding:8px 16px;color:#374151;">
          ${payload.dutyBefore ?? 'N/A'} → ${payload.dutyAfter ?? 'N/A'}
        </td>
      </tr>`
      : '';

  const impactRow =
    payload.estimatedDutyImpact !== null && payload.estimatedDutyImpact !== undefined
      ? `
      <tr>
        <td style="padding:8px 16px;font-weight:600;color:#374151;">Est. Annual Impact</td>
        <td style="padding:8px 16px;color:${payload.estimatedDutyImpact > 0 ? '#dc2626' : '#16a34a'};">
          ${payload.estimatedDutyImpact > 0 ? '+' : ''}$${payload.estimatedDutyImpact.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
        </td>
      </tr>`
      : '';

  const scoreColor =
    payload.impactScore >= 8 ? '#dc2626' : payload.impactScore >= 5 ? '#d97706' : '#16a34a';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Tariff Alert</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;padding:24px 32px;">
              <p style="margin:0;color:#93c5fd;font-size:12px;text-transform:uppercase;letter-spacing:1px;">
                Grupo JD — Agencia Aduanal Jorge Díaz, S.C.
              </p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;">Tariff Alert</h1>
            </td>
          </tr>

          <!-- Impact Score Banner -->
          <tr>
            <td style="background:${scoreColor};padding:12px 32px;">
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;">
                Impact Score: ${payload.impactScore}/10 — ${payload.impactRationale}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:16px;">${payload.title}</h2>
              <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">${payload.summary}</p>

              <!-- Details Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-size:14px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:8px 16px;font-weight:600;color:#374151;">Publication Date</td>
                  <td style="padding:8px 16px;color:#374151;">${payload.publicationDate.toDateString()}</td>
                </tr>
                ${
                  payload.effectiveDate
                    ? `<tr>
                  <td style="padding:8px 16px;font-weight:600;color:#374151;">Effective Date</td>
                  <td style="padding:8px 16px;color:#374151;">${payload.effectiveDate.toDateString()}</td>
                </tr>`
                    : ''
                }
                ${dutyRow}
                ${impactRow}
                <tr style="background:#f9fafb;">
                  <td style="padding:8px 16px;font-weight:600;color:#374151;">Affected HTS Codes</td>
                  <td style="padding:8px 16px;color:#374151;">${payload.htsCodes.join(', ') || 'See notice'}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;">
              <a href="${reviewLink}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">
                Review in Portal →
              </a>
              <a href="${payload.sourceUrl}" style="display:inline-block;margin-left:12px;color:#1e3a5f;text-decoration:none;padding:12px 0;font-size:14px;">
                View Official Notice ↗
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                This alert was generated automatically by the JD Tariff Monitor.
                All tariff changes are reviewed by a licensed customs broker before client alerts are dispatched.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTariffAlertEmail(payload: EmailPayload): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const subject = `[Tariff Alert] ${payload.title} — Impact Score ${payload.impactScore}/10`;

  await transporter.sendMail({
    from: `"Grupo JD Tariff Monitor" <${process.env.SMTP_USER}>`,
    to: payload.to,
    subject,
    html: buildHtmlBody(payload),
  });

  logger.info('Email alert sent', { to: payload.to, changeId: payload.changeId });
}
