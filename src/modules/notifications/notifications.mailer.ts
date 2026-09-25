import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { renderEmail } from './notifications.templates.js';

export type MailMessage = {
  to: string;
  toName: string | null;
  subject: string;
  text: string;
  html: string;
};

export type MailChannel = {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
};

export type ApprovalRequestMail = {
  requestId: number;
  approvalId: number;
  timesheetId: number;
  recipientEmail: string;
  recipientName: string | null;
  token: string;
  expiresAt: string | null;
  submissionCode: string;
  consultantName: string | null;
  clientName: string | null;
  projectName: string | null;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
};

export type DeliveryResult = { delivered: number; failed: number };

export function approvalLink(token: string): string {
  return `${env.approvalLinkBaseUrl}/${token}`;
}

export function approvalRequestSubject(mail: ApprovalRequestMail): string {
  return `Timesheet ${mail.submissionCode} pendiente de tu aprobacion`;
}

export function approvalRequestMessage(mail: ApprovalRequestMail): MailMessage {
  const subject = approvalRequestSubject(mail);
  const rendered = renderEmail({
    recipientName: mail.recipientName,
    heading: subject,
    paragraphs: [
      `${mail.consultantName ?? 'Un consultor'} envio el timesheet ${mail.submissionCode} ` +
        `de la semana del ${mail.weekStart} al ${mail.weekEnd} con ${mail.totalHours} horas.`,
    ],
    details: [
      ['Proyecto', mail.projectName],
      ['Cliente', mail.clientName],
    ],
    action: { label: 'Revisar timesheet', url: approvalLink(mail.token) },
    footnote: mail.expiresAt ? `El enlace vence el ${mail.expiresAt}.` : null,
  });

  return {
    to: mail.recipientEmail,
    toName: mail.recipientName,
    subject,
    ...rendered,
  };
}

function sender(): { name: string; address: string } {
  return { name: env.MAIL_FROM_NAME, address: env.MAIL_FROM_ADDRESS ?? '' };
}

const logChannel: MailChannel = {
  name: 'log',
  async send(message: MailMessage): Promise<void> {
    logger.info(
      {
        to: message.to,
        subject: message.subject,
        body: env.isProduction ? undefined : message.text,
      },
      'Correo entregado por el canal de logs',
    );
  },
};

const noopChannel: MailChannel = {
  name: 'none',
  async send(): Promise<void> {},
};

let smtpTransporter: Transporter | null = null;

function smtpTransport(): Transporter {
  smtpTransporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: env.MAIL_TIMEOUT_MS,
    greetingTimeout: env.MAIL_TIMEOUT_MS,
    socketTimeout: env.MAIL_TIMEOUT_MS,
  });

  return smtpTransporter;
}

const smtpChannel: MailChannel = {
  name: 'smtp',
  async send(message: MailMessage): Promise<void> {
    await smtpTransport().sendMail({
      from: sender(),
      to: message.toName ? { name: message.toName, address: message.to } : message.to,
      replyTo: env.MAIL_REPLY_TO,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  },
};

let graphToken: { value: string; expiresAt: number } | null = null;

async function graphAccessToken(): Promise<string> {
  if (graphToken && graphToken.expiresAt > Date.now() + 60_000) {
    return graphToken.value;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: env.GRAPH_CLIENT_ID ?? '',
        client_secret: env.GRAPH_CLIENT_SECRET ?? '',
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(env.MAIL_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`Microsoft Graph rechazo las credenciales (${response.status})`);
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number };
  graphToken = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return graphToken.value;
}

const graphChannel: MailChannel = {
  name: 'graph',
  async send(message: MailMessage): Promise<void> {
    const from = sender();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from.address)}/sendMail`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await graphAccessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: { contentType: 'HTML', content: message.html },
            from: { emailAddress: from },
            toRecipients: [
              { emailAddress: { address: message.to, name: message.toName ?? undefined } },
            ],
            replyTo: env.MAIL_REPLY_TO ? [{ emailAddress: { address: env.MAIL_REPLY_TO } }] : [],
          },
          saveToSentItems: false,
        }),
        signal: AbortSignal.timeout(env.MAIL_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Microsoft Graph no acepto el correo (${response.status}): ${detail}`);
    }
  },
};

const channels: Record<typeof env.MAIL_DRIVER, MailChannel> = {
  log: logChannel,
  none: noopChannel,
  smtp: smtpChannel,
  graph: graphChannel,
};

export const mailChannel: MailChannel = channels[env.MAIL_DRIVER];

export async function deliverApprovalRequests(
  mails: ApprovalRequestMail[],
): Promise<DeliveryResult> {
  if (!mails.length || env.MAIL_DRIVER === 'none') return { delivered: 0, failed: 0 };

  const results = await Promise.allSettled(
    mails.map((mail) => mailChannel.send(approvalRequestMessage(mail))),
  );

  let delivered = 0;
  let failed = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      delivered += 1;
      return;
    }

    failed += 1;
    logger.error(
      {
        err: result.reason,
        channel: mailChannel.name,
        requestId: mails[index]?.requestId,
        timesheetId: mails[index]?.timesheetId,
      },
      'No fue posible entregar la solicitud de aprobacion',
    );
  });

  return { delivered, failed };
}
