import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { sendMail } from '../notifications/notifications.mailer.js';
import { toEmailLocale } from '../notifications/notifications.copy.js';
import { renderEmail, type EmailLocale } from '../notifications/notifications.templates.js';

export type AccountRecipient = {
  id: number;
  fullName: string;
  userName: string;
  email: string;
  locale: string | null;
};

const INTL_LOCALES: Record<EmailLocale, string> = { es: 'es-MX', en: 'en-US' };

function formatExpiry(expiresAt: string, locale: EmailLocale): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(expiresAt));
}

const INVITE_COPY = {
  es: {
    subject: 'Te invitaron a Nubelity HRIS',
    paragraph: 'Recibiste una invitación para unirte a la plataforma Nubelity HRIS. ¡Te damos la bienvenida!',
    userLabel: 'Usuario',
    emailLabel: 'Correo',
    action: 'Activar mi cuenta',
    footnote: (date: string) => `El enlace vence el ${date} (hora de la Ciudad de México).`,
  },
  en: {
    subject: "You've been invited to Nubelity HRIS",
    paragraph: "You've been invited to join the Nubelity HRIS platform. Welcome aboard!",
    userLabel: 'Username',
    emailLabel: 'Email',
    action: 'Activate my account',
    footnote: (date: string) => `The link expires on ${date} (Mexico City time).`,
  },
} as const;

const RESET_COPY = {
  es: {
    subject: 'Restablece tu contraseña de Nubelity HRIS',
    paragraph: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
    ignore: 'Si no la solicitaste, ignora este correo.',
    action: 'Restablecer contraseña',
    footnote: (date: string) => `El enlace vence el ${date} (hora de la Ciudad de México).`,
  },
  en: {
    subject: 'Reset your Nubelity HRIS password',
    paragraph: 'We received a request to reset your account password.',
    ignore: "If you didn't request it, ignore this email.",
    action: 'Reset password',
    footnote: (date: string) => `The link expires on ${date} (Mexico City time).`,
  },
} as const;

const CHANGED_COPY = {
  es: {
    subject: 'Tu contraseña de Nubelity HRIS cambió',
    paragraph: 'La contraseña de tu cuenta se cambió.',
    warning: 'Si no fuiste tú, restablece tu contraseña de inmediato y avisa a un administrador.',
    action: 'Iniciar sesión',
  },
  en: {
    subject: 'Your Nubelity HRIS password was changed',
    paragraph: 'Your account password was changed.',
    warning: "If this wasn't you, reset your password right away and let an administrator know.",
    action: 'Sign in',
  },
} as const;

async function deliver(
  recipient: AccountRecipient,
  subject: string,
  content: Omit<Parameters<typeof renderEmail>[0], 'locale' | 'recipientName' | 'heading'>,
  locale: EmailLocale,
  kind: string,
): Promise<boolean> {
  try {
    const rendered = renderEmail({
      ...content,
      locale,
      recipientName: recipient.fullName,
      heading: subject,
    });
    await sendMail({ to: recipient.email, toName: recipient.fullName, subject, ...rendered });
    return true;
  } catch (error) {
    logger.error({ err: error, userId: recipient.id, kind }, 'No fue posible enviar el correo de cuenta');
    return false;
  }
}

export function sendInvitationEmail(
  recipient: AccountRecipient,
  link: string,
  expiresAt: string,
): Promise<boolean> {
  const locale = toEmailLocale(recipient.locale);
  const copy = INVITE_COPY[locale];

  return deliver(
    recipient,
    copy.subject,
    {
      paragraphs: [copy.paragraph],
      details: [
        [copy.userLabel, recipient.userName],
        [copy.emailLabel, recipient.email],
      ],
      action: { label: copy.action, url: link },
      footnote: copy.footnote(formatExpiry(expiresAt, locale)),
    },
    locale,
    'INVITE',
  );
}

export function sendPasswordResetEmail(
  recipient: AccountRecipient,
  link: string,
  expiresAt: string,
): Promise<boolean> {
  const locale = toEmailLocale(recipient.locale);
  const copy = RESET_COPY[locale];

  return deliver(
    recipient,
    copy.subject,
    {
      paragraphs: [copy.paragraph, copy.ignore],
      action: { label: copy.action, url: link },
      footnote: copy.footnote(formatExpiry(expiresAt, locale)),
    },
    locale,
    'RESET',
  );
}

export function sendPasswordChangedEmail(recipient: AccountRecipient): Promise<boolean> {
  const locale = toEmailLocale(recipient.locale);
  const copy = CHANGED_COPY[locale];

  return deliver(
    recipient,
    copy.subject,
    {
      paragraphs: [copy.paragraph, copy.warning],
      action: { label: copy.action, url: `${env.appBaseUrl}/login` },
    },
    locale,
    'PASSWORD_CHANGED',
  );
}
