import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { PERMISSION_REPORTS_VIEW } from '../../utils/permissions.js';
import * as reportsController from './reports.controller.js';
import {
  companyExportQuerySchema,
  companyReportQuerySchema,
  hoursExportQuerySchema,
  hoursReportQuerySchema,
  listPeopleQuerySchema,
} from './reports.schema.js';

export const reportsRouter: Router = Router();

reportsRouter.use(requireAuth, requirePasswordChanged, requirePermission(PERMISSION_REPORTS_VIEW));

reportsRouter.get(
  '/people',
  validate({ query: listPeopleQuerySchema }),
  asyncHandler(reportsController.listPeople),
);

reportsRouter.get('/scopes', asyncHandler(reportsController.listScopes));

reportsRouter.get(
  '/hours',
  validate({ query: hoursReportQuerySchema }),
  asyncHandler(reportsController.hoursReport),
);

reportsRouter.get(
  '/company',
  validate({ query: companyReportQuerySchema }),
  asyncHandler(reportsController.companyReport),
);

reportsRouter.get(
  '/hours/export',
  validate({ query: hoursExportQuerySchema }),
  asyncHandler(reportsController.exportHoursReport),
);

reportsRouter.get(
  '/company/export',
  validate({ query: companyExportQuerySchema }),
  asyncHandler(reportsController.exportCompanyReport),
);
