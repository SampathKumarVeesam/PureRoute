import crypto from 'crypto';
import type { EmailDispatchLog } from '../src/types/domain.ts';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoSendParams {
  toEmail: string;
  toName: string;
  subject: string;
  htmlContent: string;
  meta?: Record<string, string>;
}

export async function sendBrevoTransactionalEmail(
  params: BrevoSendParams,
  recordLog: (log: EmailDispatchLog) => void
): Promise<EmailDispatchLog> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'dispatch@pureroute.in';
  const senderName = process.env.BREVO_SENDER_NAME || 'PureRoute LocalMilkforYou Hyderabad';

  let provider: EmailDispatchLog['provider'] = 'BREVO_SANDBOX_OUTBOX';
  let statusCode = 201;

  if (apiKey) {
    try {
      const response = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: params.toEmail, name: params.toName }],
          subject: params.subject,
          htmlContent: params.htmlContent,
        }),
      });
      statusCode = response.status;
      if (response.ok) {
        provider = 'BREVO_LIVE';
      } else {
        const errBody = await response.text().catch(() => '');
        console.warn(`[Brevo] Non-2xx response (${response.status}):`, errBody);
      }
    } catch (err) {
      console.warn('[Brevo] HTTPS request failed, falling back to outbox log:', err);
    }
  }

  const entry: EmailDispatchLog = {
    id: `mail_${crypto.randomBytes(6).toString('hex')}`,
    toEmail: params.toEmail,
    toName: params.toName,
    subject: params.subject,
    htmlContent: params.htmlContent,
    provider,
    statusCode,
    sentAt: new Date().toISOString(),
    meta: params.meta,
  };

  recordLog(entry);
  return entry;
}
