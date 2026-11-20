import nodemailer from 'nodemailer';
import crypto from 'crypto';
import type { EmailDispatchLog, OrderRecord } from '../src/types/domain.ts';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export interface SendEmailParams {
  toEmail: string;
  toName: string;
  subject: string;
  htmlContent: string;
  meta?: Record<string, string>;
}

export async function sendTransactionalEmail(
  params: SendEmailParams,
  recordLog: (log: EmailDispatchLog) => void
): Promise<EmailDispatchLog> {
  const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.zoho.in';
  const smtpPort = Number(process.env.SMTP_PORT) || 465;
  const smtpUser = process.env.SMTP_USER?.trim() || 'sampathkumarveesam@zohomail.in';
  const smtpPass = process.env.SMTP_PASS?.trim() || 'kw3T7Xz2zvSC';
  const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser;
  const senderName = process.env.SMTP_FROM_NAME?.trim() || 'PureRoute LocalMilkforYou Hyderabad';

  let provider: EmailDispatchLog['provider'] = 'BREVO_SANDBOX_OUTBOX';
  let statusCode = 200;

  // 1. Try Zoho Mail / SMTP first
  if (smtpUser && smtpPass) {
    try {
      const isSecure = smtpPort === 465;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: isSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      await transporter.sendMail({
        from: `"${senderName}" <${smtpFrom}>`,
        to: `"${params.toName}" <${params.toEmail}>`,
        subject: params.subject,
        html: params.htmlContent,
      });

      provider = smtpHost.includes('zoho') ? 'ZOHO_SMTP' : 'SMTP_LIVE';
      statusCode = 200;
      console.log(`✉️ [Email Sent] Successfully delivered to ${params.toEmail} via ${provider}`);
    } catch (smtpErr: any) {
      console.warn(`[SMTP Warning] Failed sending via ${smtpHost}:`, smtpErr.message);

      // 2. Fallback to Brevo HTTPS API if configured
      const apiKey = process.env.BREVO_API_KEY?.trim();
      if (apiKey) {
        try {
          const res = await fetch(BREVO_ENDPOINT, {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              'api-key': apiKey,
            },
            body: JSON.stringify({
              sender: { name: senderName, email: smtpFrom },
              to: [{ email: params.toEmail, name: params.toName }],
              subject: params.subject,
              htmlContent: params.htmlContent,
            }),
          });
          if (res.ok) {
            provider = 'BREVO_LIVE';
            statusCode = res.status;
            console.log(`✉️ [Brevo Fallback Success] Sent to ${params.toEmail}`);
          } else {
            console.warn(`[Brevo Fallback Warning] Response status: ${res.status}`);
          }
        } catch (brevoErr: any) {
          console.warn('[Brevo Fallback Error]:', brevoErr.message);
        }
      }
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

// Re-export as sendBrevoTransactionalEmail for backward compatibility
export const sendBrevoTransactionalEmail = sendTransactionalEmail;

/* -------------------------------------------------------------------------- */
/*                               HTML TEMPLATES                               */
/* -------------------------------------------------------------------------- */

const BRAND_HEADER = `
  <div style="background-color: #0b1a26; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: #f8f5ef; margin: 0; font-family: 'Times New Roman', serif; font-size: 26px; letter-spacing: 0.05em;">
      PureRoute <span style="color: #d8b06c;">LocalMilk</span>
    </h1>
    <p style="color: #d8b06c; margin: 6px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em;">
      Hyderabad Single-Origin Dairy Logistics · 500081
    </p>
  </div>
`;

const BRAND_FOOTER = `
  <div style="background-color: #f1ede4; padding: 16px 24px; border-top: 1px solid #e4cca2; border-radius: 0 0 8px 8px; font-size: 11px; color: #5a646e; text-align: center;">
    <p style="margin: 0 0 4px 0;"><strong>Madhapur Central Hub Depot:</strong> Plot 42, Hitech City Phase II, Hyderabad, Telangana 500081</p>
    <p style="margin: 0;">Certified 4°C Farm-to-Door Cold Chain · Universal 6-Digit Doorstep OTP</p>
  </div>
`;

export function templateWelcomeUser(name: string, role: string, email: string): string {
  const roleTitle =
    role === 'merchant'
      ? 'Farm Partner & Dairy Producer'
      : role === 'agent'
        ? 'Delivery Fleet Associate'
        : 'Registered Customer';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #d8b06c; border-radius: 8px; overflow: hidden; background: #ffffff;">
      ${BRAND_HEADER}
      <div style="padding: 28px 24px; color: #212b36; line-height: 1.6;">
        <h2 style="color: #0b1a26; margin-top: 0;">Welcome to PureRoute Hyderabad, ${name}!</h2>
        <p>Your account has been successfully registered and provisioned in the PureRoute Dairy Network.</p>
        <div style="background: #fdfaf3; border-left: 4px solid #d8b06c; padding: 14px 18px; margin: 20px 0; border-radius: 0 4px 4px 0;">
          <p style="margin: 0 0 6px 0;"><strong>Account Email:</strong> ${email}</p>
          <p style="margin: 0;"><strong>Designated Role:</strong> ${roleTitle}</p>
        </div>
        ${
          role === 'merchant'
            ? `<p>You can now log in to the <strong>Farm Partner Portal</strong> to configure morning/evening harvests, publish certified Fat/SNF assays, and monitor cold-chain glass-bottle crates scheduled for dispatch.</p>`
            : role === 'agent'
              ? `<p>Your delivery fleet profile is active. Join the live FIFO queue at the Madhapur Hub to receive dispatch offers with OTP authentication.</p>`
              : `<p>You can now browse fresh farm-gate harvests, schedule daily/alternate glass-bottle subscriptions, and track orders live to your Hyderabad doorstep.</p>`
        }
        <div style="margin: 28px 0; text-align: center;">
          <a href="https://purelocalmilk.netlify.app" style="background-color: #d8b06c; color: #081119; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block; text-transform: uppercase; letter-spacing: 0.1em; font-size: 13px;">
            Access PureRoute Portal
          </a>
        </div>
      </div>
      ${BRAND_FOOTER}
    </div>
  `;
}

export function templateOrderPlacedCustomer(order: OrderRecord): string {
  const itemsHtml = order.items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #f0e6d6;">
        <td style="padding: 10px 0; color: #1c2731;"><strong>Product #${item.productId}</strong></td>
        <td style="padding: 10px 0; text-align: center; color: #495460;">${item.quantity}</td>
        <td style="padding: 10px 0; text-align: right; color: #1c2731;">₹${item.priceInr * item.quantity}</td>
      </tr>
    `
    )
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #d8b06c; border-radius: 8px; overflow: hidden; background: #ffffff;">
      ${BRAND_HEADER}
      <div style="padding: 28px 24px; color: #212b36; line-height: 1.6;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h2 style="color: #0b1a26; margin: 0;">Order Confirmed!</h2>
        </div>
        <p style="margin: 6px 0 18px 0; color: #5a646e; font-size: 14px;">
          Order Number: <strong style="color: #0b1a26;">${order.orderNumber}</strong>
        </p>

        <div style="background: #0b1a26; color: #ffffff; padding: 18px 24px; border-radius: 6px; text-align: center; margin: 20px 0;">
          <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: #d8b06c;">
            Your Universal Delivery Doorstep OTP
          </p>
          <span style="font-size: 34px; font-weight: bold; letter-spacing: 0.25em; color: #ffffff; font-family: monospace;">
            ${order.deliveryOtp}
          </span>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #b0c0cf;">
            Share this 6-digit OTP with your PureRoute agent upon doorstep arrival.
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 2px solid #e4cca2; text-align: left; font-size: 11px; text-transform: uppercase; color: #7a6e5d; letter-spacing: 0.08em;">
              <th style="padding: 6px 0;">Item</th>
              <th style="padding: 6px 0; text-align: center;">Qty</th>
              <th style="padding: 6px 0; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr style="border-top: 1px solid #e4cca2;">
              <td colspan="2" style="padding: 8px 0; color: #5a646e;">Delivery Fee (Madhapur Cold-Chain)</td>
              <td style="padding: 8px 0; text-align: right; color: #5a646e;">₹${order.deliveryFeeInr}</td>
            </tr>
            <tr style="font-size: 16px; font-weight: bold; color: #0b1a26;">
              <td colspan="2" style="padding: 10px 0;">Total Payable (${order.paymentMethod})</td>
              <td style="padding: 10px 0; text-align: right; color: #0b1a26;">₹${order.totalInr}</td>
            </tr>
          </tfoot>
        </table>

        <div style="background: #fdfaf3; border: 1px solid #ebd9b8; padding: 14px 18px; border-radius: 6px; margin-top: 18px; font-size: 13px;">
          <p style="margin: 0 0 4px 0;"><strong>Delivery Slot:</strong> ${order.deliverySlot}</p>
          <p style="margin: 0 0 4px 0;"><strong>Address:</strong> ${order.deliveryAddress} (PIN: ${order.pinCode})</p>
          <p style="margin: 0;"><strong>Payment Status:</strong> ${order.paymentStatus}</p>
        </div>
      </div>
      ${BRAND_FOOTER}
    </div>
  `;
}

export function templateMerchantOrderAlert(order: OrderRecord, merchantName: string): string {
  const itemsCount = order.items.reduce((acc, i) => acc + i.quantity, 0);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #d8b06c; border-radius: 8px; overflow: hidden; background: #ffffff;">
      ${BRAND_HEADER}
      <div style="padding: 28px 24px; color: #212b36; line-height: 1.6;">
        <h2 style="color: #0b1a26; margin-top: 0;">New Milk Order Alert · ${merchantName}</h2>
        <p>A new order has been confirmed for immediate reservation and Hub cold-crate preparation.</p>
        <div style="background: #fdfaf3; border-left: 4px solid #d8b06c; padding: 14px 18px; margin: 20px 0;">
          <p style="margin: 0 0 4px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p style="margin: 0 0 4px 0;"><strong>Delivery Slot:</strong> ${order.deliverySlot}</p>
          <p style="margin: 0 0 4px 0;"><strong>Total Bottles / Items:</strong> ${itemsCount} units</p>
          <p style="margin: 0;"><strong>Destination Hub Area:</strong> ${order.pinCode} (${order.deliveryAddress})</p>
        </div>
        <p>Please ensure all glass-bottled harvests are chilled at ≤ 4°C with certified lab assay documentation prior to Madhapur Depot transit.</p>
      </div>
      ${BRAND_FOOTER}
    </div>
  `;
}

export function templateOrderDispatched(order: OrderRecord, agentName: string, agentPhone: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #d8b06c; border-radius: 8px; overflow: hidden; background: #ffffff;">
      ${BRAND_HEADER}
      <div style="padding: 28px 24px; color: #212b36; line-height: 1.6;">
        <h2 style="color: #0b1a26; margin-top: 0;">Your Milk is Out for Delivery! 🚚</h2>
        <p>PureRoute order <strong>${order.orderNumber}</strong> has been assigned to an active delivery agent and is currently in transit in a refrigerated insulated crate.</p>
        <div style="background: #fdfaf3; border: 1px solid #ebd9b8; padding: 16px 20px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 6px 0;"><strong>Delivery Agent:</strong> ${agentName}</p>
          <p style="margin: 0 0 6px 0;"><strong>Agent Contact:</strong> ${agentPhone}</p>
          <p style="margin: 0 0 6px 0;"><strong>Destination:</strong> ${order.deliveryAddress}</p>
          <p style="margin: 0;"><strong>Your Delivery OTP:</strong> <strong style="font-size: 16px; color: #0b1a26; font-family: monospace;">${order.deliveryOtp}</strong></p>
        </div>
        <p style="font-size: 13px; color: #5a646e;">Please keep your phone handy. For COD orders, you can pay via dynamic UPI QR directly from the delivery agent’s phone upon arrival.</p>
      </div>
      ${BRAND_FOOTER}
    </div>
  `;
}

export function templateOrderDelivered(order: OrderRecord): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #d8b06c; border-radius: 8px; overflow: hidden; background: #ffffff;">
      ${BRAND_HEADER}
      <div style="padding: 28px 24px; color: #212b36; line-height: 1.6;">
        <h2 style="color: #10633b; margin-top: 0;">Order Delivered Successfully! ✅</h2>
        <p>Order <strong>${order.orderNumber}</strong> has been handed over at your doorstep with 6-digit OTP verification.</p>
        <div style="background: #f5fbf7; border: 1px solid #a3e0be; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 4px 0;"><strong>Delivered At:</strong> ${new Date(order.otpVerifiedAt || Date.now()).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST</p>
          <p style="margin: 0 0 4px 0;"><strong>Total Paid:</strong> ₹${order.totalInr} (${order.paymentMethod})</p>
          <p style="margin: 0;"><strong>Delivery Verification:</strong> OTP Authenticated</p>
        </div>
        <p>Thank you for choosing PureRoute fresh single-origin Hyderabad dairy! Please refrigerate your glass bottles immediately.</p>
      </div>
      ${BRAND_FOOTER}
    </div>
  `;
}
