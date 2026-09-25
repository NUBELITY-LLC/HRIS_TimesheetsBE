import { waitUntil } from '@vercel/functions';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { mailChannel, type MailMessage } from './notifications.mailer.js';
import * as repository from './notifications.repository.js';
import type { ClaimedNotificationEmail, EmailOutcome } from './notifications.repository.js';
import { renderEmail } from './notifications.templates.js';

export type OutboxFilter = { timesheetId?: number; userId?: number };

export type OutboxResult = { sent: number; failed: number; skipped: number };

const BATCH_SIZE = 10;
const SEND_CONCURRENCY = 3;
const INLINE_BUDGET_MS = 8_000;

function displayDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function actionFor(email: ClaimedNotificationEmail): { label: string; url: string } {
  const base = env.appBaseUrl;

  switch (email.kind) {
    case 'REVIEW_REQUESTED':
      return { label: 'Revisar timesheet', url: `${base}/reviews` };
    case 'APPROVED':
    case 'REJECTED':
    case 'CLOSED':
      return email.timesheetId
        ? { label: 'Ver timesheet', url: `${base}/history/${email.timesheetId}` }
        : { label: 'Ver mis timesheets', url: `${base}/history` };
    case 'REMINDER':
    case 'TASK_ASSIGNED':
      return { label: 'Capturar horas', url: `${base}/timesheets` };
    default:
      return { label: 'Ver notificaciones', url: `${base}/notifications` };
  }
}

function notificationMessage(email: ClaimedNotificationEmail): MailMessage {
  const week =
    email.weekStart && email.weekEnd
      ? `${displayDate(email.weekStart)} al ${displayDate(email.weekEnd)}`
      : null;

  const rendered = renderEmail({
    recipientName: email.recipientName,
    heading: email.title,
    paragraphs: email.body ? [email.body] : [],
    details: [
      ['Folio', email.submissionCode],
      ['Consultor', email.kind === 'REVIEW_REQUESTED' ? email.consultantName : null],
      ['Proyecto', email.projectName],
      ['Cliente', email.clientName],
      ['Semana', week],
      ['Horas', email.totalHours === null ? null : String(Number(email.totalHours))],
    ],
    action: actionFor(email),
  });

  return {
    to: email.recipientEmail,
    toName: email.recipientName,
    subject: email.title,
    ...rendered,
  };
}

async function deliver(email: ClaimedNotificationEmail): Promise<EmailOutcome['status']> {
  let outcome: EmailOutcome;

  if (!email.recipientActive) {
    outcome = { status: 'SKIPPED' };
  } else {
    try {
      await mailChannel.send(notificationMessage(email));
      outcome = { status: 'SENT' };
    } catch (error) {
      logger.error(
        { err: error, channel: mailChannel.name, notificationId: email.id, kind: email.kind },
        'No fue posible enviar el correo de la notificacion',
      );
      outcome = {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  try {
    await repository.recordEmailOutcome(email.id, outcome);
  } catch (error) {
    logger.error(
      { err: error, notificationId: email.id, outcome: outcome.status },
      'No fue posible registrar el resultado del correo',
    );
  }

  return outcome.status;
}

async function deliverBatch(
  emails: ClaimedNotificationEmail[],
  result: OutboxResult,
): Promise<void> {
  const queue = [...emails];

  const worker = async (): Promise<void> => {
    for (let email = queue.shift(); email; email = queue.shift()) {
      const status = await deliver(email);
      if (status === 'SENT') result.sent += 1;
      else if (status === 'FAILED') result.failed += 1;
      else result.skipped += 1;
    }
  };

  await Promise.all(Array.from({ length: SEND_CONCURRENCY }, worker));
}

export async function dispatchNotificationEmails(
  filter: OutboxFilter,
  budgetMs: number,
): Promise<OutboxResult> {
  const result: OutboxResult = { sent: 0, failed: 0, skipped: 0 };

  if (env.MAIL_DRIVER === 'none') {
    result.skipped = await repository.skipPendingEmails(filter);
    return result;
  }

  const deadline = Date.now() + budgetMs;

  while (Date.now() < deadline) {
    const batch = await repository.claimEmails({ ...filter, limit: BATCH_SIZE });
    if (!batch.length) break;
    await deliverBatch(batch, result);
  }

  if (result.sent || result.failed || result.skipped) {
    logger.info({ ...filter, ...result, channel: mailChannel.name }, 'Correos de notificacion procesados');
  }

  return result;
}

export function queueNotificationEmails(filter: OutboxFilter): void {
  const task = dispatchNotificationEmails(filter, INLINE_BUDGET_MS).then(
    () => undefined,
    (error: unknown) => {
      logger.error({ err: error, ...filter }, 'Fallo el envio de correos de notificacion');
    },
  );

  waitUntil(task);
}
