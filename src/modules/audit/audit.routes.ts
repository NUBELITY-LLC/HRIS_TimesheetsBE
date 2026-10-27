import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requireRoles } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ROLE_ADMIN } from '../../utils/roles.js';
import * as auditController from './audit.controller.js';
import { exportAuditQuerySchema, listAuditQuerySchema } from './audit.schema.js';

export const auditRouter: Router = Router();

auditRouter.use(requireAuth, requirePasswordChanged, requireRoles(ROLE_ADMIN));

auditRouter.get(
  '/entries',
  validate({ query: listAuditQuerySchema }),
  asyncHandler(auditController.listEntries),
);

auditRouter.get('/options', asyncHandler(auditController.listOptions));

auditRouter.get(
  '/entries/export',
  validate({ query: exportAuditQuerySchema }),
  asyncHandler(auditController.exportEntries),
);
