import type { Request, Response } from 'express';
import { logger } from '../../config/logger.js';
import { validatedQuery } from '../../middlewares/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/httpResponse.js';
import { dispatchNotificationEmails } from '../notifications/notifications.emails.js';
import { createTimesheetReminders } from '../notifications/notifications.repository.js';
import { addDays, currentWeekStartISO, isMonday } from '../timesheets/timesheets.rules.js';
import type { TimesheetRemindersQuery } from './jobs.schema.js';

const JOB_BUDGET_MS = 10_000;

export async function sendNotificationEmails(_req: Request, res: Response): Promise<void> {
  const emails = await dispatchNotificationEmails({}, JOB_BUDGET_MS);
  ok(res, { emails });
}

export async function sendTimesheetReminders(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<TimesheetRemindersQuery>(res);
  const weekStart = query.weekStart ?? addDays(currentWeekStartISO(), -7);

  if (!isMonday(weekStart)) {
    throw ApiError.badRequest('weekStart debe ser un lunes');
  }

  const reminders = await createTimesheetReminders(weekStart);
  logger.info({ weekStart, reminders }, 'Recordatorios de captura generados');

  const emails = await dispatchNotificationEmails({}, JOB_BUDGET_MS);
  ok(res, { weekStart, reminders, emails });
}
