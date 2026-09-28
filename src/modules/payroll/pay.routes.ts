import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { PERMISSION_PAYROLL_MANAGE } from '../../utils/permissions.js';
import * as payController from './pay.controller.js';
import {
  assignmentIdParamSchema,
  countryParamSchema,
  listPayAssignmentsQuerySchema,
  payrollRulesSchema,
  rateChangeParamSchema,
  updatePayTermsSchema,
} from './pay.schema.js';
import { createRateChangeSchema } from '../projects/projects.schema.js';

export const payrollRouter: Router = Router();

payrollRouter.use(
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_PAYROLL_MANAGE),
);

payrollRouter.get('/rules', asyncHandler(payController.listRules));

payrollRouter.get(
  '/rules/:countryCode',
  validate({ params: countryParamSchema }),
  asyncHandler(payController.getRules),
);

payrollRouter.put(
  '/rules/:countryCode',
  validate({ params: countryParamSchema, body: payrollRulesSchema }),
  asyncHandler(payController.saveRules),
);

payrollRouter.get(
  '/assignments',
  validate({ query: listPayAssignmentsQuerySchema }),
  asyncHandler(payController.listAssignments),
);

payrollRouter.patch(
  '/assignments/:id',
  validate({ params: assignmentIdParamSchema, body: updatePayTermsSchema }),
  asyncHandler(payController.updateAssignment),
);

payrollRouter.post(
  '/assignments/:id/rates',
  validate({ params: assignmentIdParamSchema, body: createRateChangeSchema }),
  asyncHandler(payController.addRateChange),
);

payrollRouter.delete(
  '/assignments/:id/rates/:rateId',
  validate({ params: rateChangeParamSchema }),
  asyncHandler(payController.removeRateChange),
);
