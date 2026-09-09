import { Router } from 'express';
import { requireAuth, requirePasswordChanged } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as timesheetsController from './timesheets.controller.js';
import {
  currentTimesheetQuerySchema,
  listTimesheetsQuerySchema,
  saveDraftSchema,
  summaryQuerySchema,
  timesheetIdParamSchema,
} from './timesheets.schema.js';

export const timesheetsRouter: Router = Router();

timesheetsRouter.use(requireAuth, requirePasswordChanged);

timesheetsRouter.get('/assignments', asyncHandler(timesheetsController.listAssignments));

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
  validate({ params: timesheetIdParamSchema }),
  asyncHandler(timesheetsController.discard),
);

timesheetsRouter.post(
  '/:id/submit',
  validate({ params: timesheetIdParamSchema }),
  asyncHandler(timesheetsController.submit),
);
