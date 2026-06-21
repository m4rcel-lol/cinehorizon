import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const transportKind = env.EMAIL_TRANSPORT ?? (env.SMTP_HOST ? 'smtp' : 'console');

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });
  }
  return transporter;
}

export function emailStatus() {
  return {
    transport: transportKind,
    configured: transportKind === 'console' || Boolean(env.SMTP_HOST),
    from: env.EMAIL_FROM,
    smtpHost: env.SMTP_HOST || null
  };
}

export async function sendEmail(message: OutboundEmail): Promise<void> {
  if (transportKind === 'console') {
    // Dev/self-host fallback: don't require an SMTP server to exercise the flows.
    console.log('\n──────── email (console transport) ────────');
    console.log(`to:      ${message.to}`);
    console.log(`from:    ${env.EMAIL_FROM}`);
    console.log(`subject: ${message.subject}`);
    console.log(message.text);
    console.log('───────────────────────────────────────────\n');
    return;
  }
  await getTransporter().sendMail({ from: env.EMAIL_FROM, ...message });
}

function shell(title: string, intro: string, buttonLabel: string, buttonUrl: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;color:#e9e9ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#141414;border:1px solid #262626;border-radius:14px;overflow:hidden">
        <tr><td style="padding:28px 32px 8px">
          <div style="font-size:13px;letter-spacing:.32em;text-transform:uppercase;color:#e50914;font-weight:700">${env.APP_NAME}</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0">
          <h1 style="margin:0 0 12px;font-size:22px;color:#fff">${title}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#b3b3b3">${intro}</p>
          <a href="${buttonUrl}" style="display:inline-block;background:#e50914;color:#fff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:600;font-size:15px">${buttonLabel}</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b6b6b">If the button doesn't work, paste this link into your browser:<br><a href="${buttonUrl}" style="color:#8a8a8a;word-break:break-all">${buttonUrl}</a></p>
        </td></tr>
        <tr><td style="padding:24px 32px 28px">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#5a5a5a;border-top:1px solid #262626;padding-top:18px">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${env.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: `Verify your ${env.APP_NAME} email`,
    text: `Welcome to ${env.APP_NAME}. Verify your email to finish setting up your account:\n\n${url}\n\nThis link expires in 24 hours.`,
    html: shell(
      'Confirm your email',
      `Welcome to ${env.APP_NAME}. Confirm this address to finish setting up your account and start downloading.`,
      'Verify email',
      url,
      `This link expires in 24 hours. If you didn't create a ${env.APP_NAME} account, you can ignore this message.`
    )
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: `Reset your ${env.APP_NAME} password`,
    text: `Reset your ${env.APP_NAME} password using this link:\n\n${url}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`,
    html: shell(
      'Reset your password',
      `We got a request to reset the password for your ${env.APP_NAME} account. Choose a new one below.`,
      'Reset password',
      url,
      `This link expires in 1 hour. If you didn't request a reset, your password is unchanged and you can ignore this email.`
    )
  });
}
