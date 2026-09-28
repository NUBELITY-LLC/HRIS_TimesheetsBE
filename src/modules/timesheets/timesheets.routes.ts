import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { acceptEvidence } from '../../middlewares/upload.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  PERMISSION_TIMESHEETS_APPROVE,
  PERMISSION_TIMESHEETS_SUBMIT,
} from '../../utils/permissions.js';
import * as timesheetsController from './timesheets.controller.js';
import {
  currentTimesheetQuerySchema,
  exportQuerySchema,
  listTimesheetsQuerySchema,
  saveDraftSchema,
  summaryQuerySchema,
  timesheetAttachmentParamsSchema,
  timesheetIdParamSchema,
} from './timesheets.schema.js';

export const timesheetsRouter: Router = Router();

timesheetsRouter.use(requireAuth, requirePasswordChanged);

timesheetsRouter.get('/assignments', asyncHandler(timesheetsController.listAssignments));

timesheetsRouter.get(
  '/team',
  requirePermission(PERMISSION_TIMESHEETS_APPROVE),
  validate({ query: listTimesheetsQuerySchema }),
  asyncHandler(timesheetsController.listTeam),
);

timesheetsRouter.get(
  '/team/summary',
  requirePermission(PERMISSION_TIMESHEETS_APPROVE),
  validate({ query: summaryQuerySchema }),
  asyncHandler(timesheetsController.teamSummary),
);

timesheetsRouter.get(
  '/summary',
  validate({ query: summaryQuerySchema }),
  asyncHandler(timesheetsController.summary),
);

timesheetsRouter.get(
  '/mine',
  validate({ query: listTimesheetsQuerySchema }),
  asyncHandler(timesheetsController.listMine),
);

timesheetsRouter.get(
  '/week',
  validate({ query: currentTimesheetQuerySchema }),
  asyncHandler(timesheetsController.getWeek),
);

timesheetsRouter.put(
  '/',
  requirePermission(PERMISSION_TIMESHEETS_SUBMIT),
  validate({ body: saveDraftSchema }),
  asyncHandler(timesheetsController.saveDraft),
);

timesheetsRouter.get(
  '/:id',
  validate({ params: timesheetIdParamSchema }),
  asyncHandler(timesheetsController.getOne),
);

timesheetsRouter.delete(
  '/:id',
  requirePermission(PERMISSION_TIMESHEETS_SUBMIT),
  validate({ params: timesheetIdParamSchema }),
  asyncHandler(timesheetsController.discard),
);

timesheetsRouter.post(
  '/:id/submit',
  requirePermission(PERMISSION_TIMESHEETS_SUBMIT),
  validate({ params: timesheetIdParamSchema }),
  asyncHandler(timesheetsController.submit),
);

timesheetsRouter.post(
  '/:id/attachments',
  requirePermission(PERMISSION_TIMESHEETS_SUBMIT),
  acceptEvidence,
  validate({ params: timesheetIdParamSchema }),
  asyncHandler(timesheetsController.attachEvidence),
);

timesheetsRouter.get(
  '/:id/attachments/:attachmentId',
  validate({ params: timesheetAttachmentParamsSchema }),
  asyncHandler(timesheetsController.getEvidence),
);

timesheetsRouter.delete(
  '/:id/attachments/:attachmentId',
  requirePermission(PERMISSION_TIMESHEETS_SUBMIT),
  validate({ params: timesheetAttachmentParamsSchema }),
  asyncHandler(timesheetsController.removeEvidence),
);

timesheetsRouter.get(
  '/:id/export',
  validate({ params: timesheetIdParamSchema, query: exportQuerySchema }),
  asyncHandler(timesheetsController.exportTimesheet),
);
