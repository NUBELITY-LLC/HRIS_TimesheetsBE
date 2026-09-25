import { Router } from 'express';
import { requireCronSecret } from '../../middlewares/cronAuth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as jobsController from './jobs.controller.js';
import { timesheetRemindersQuerySchema } from './jobs.schema.js';

export const jobsRouter: Router = Router();

jobsRouter.use(requireCronSecret);

jobsRouter.get('/notification-emails', asyncHandler(jobsController.sendNotificationEmails));

jobsRouter.get(
  '/timesheet-reminders',
  validate({ query: timesheetRemindersQuerySchema }),
  asyncHandler(jobsController.sendTimesheetReminders),
);
