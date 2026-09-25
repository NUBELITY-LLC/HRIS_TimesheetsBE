import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { PERMISSION_PAYROLL_MANAGE } from '../../utils/permissions.js';
import * as holidaysController from './holidays.controller.js';
import {
  createHolidaySchema,
  holidayIdParamSchema,
  listHolidaysQuerySchema,
} from './holidays.schema.js';

export const holidaysRouter: Router = Router();

holidaysRouter.use(
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_PAYROLL_MANAGE),
);

holidaysRouter.get(
  '/',
  validate({ query: listHolidaysQuerySchema }),
  asyncHandler(holidaysController.list),
);

holidaysRouter.post(
  '/',
  validate({ body: createHolidaySchema }),
  asyncHandler(holidaysController.create),
);

holidaysRouter.delete(
  '/:id',
  validate({ params: holidayIdParamSchema }),
  asyncHandler(holidaysController.remove),
);
