import { Router } from 'express';
import {
  requireAuth,
  requirePasswordChanged,
  requirePermission,
  requireRoles,
} from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { acceptEvidence } from '../../middlewares/upload.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { PERMISSION_TIMESHEETS_APPROVE } from '../../utils/permissions.js';
import { PROJECT_MANAGER_ROLES } from '../../utils/roles.js';
import * as approvalsController from './approvals.controller.js';
import {
  approvalIdParamSchema,
  attachmentParamsSchema,
  approveOnBehalfSchema,
  approveStepSchema,
  listPendingQuerySchema,
  rejectStepSchema,
} from './approvals.schema.js';

export const approvalsRouter: Router = Router();

approvalsRouter.use(requireAuth, requirePasswordChanged, requirePermission(PERMISSION_TIMESHEETS_APPROVE));

approvalsRouter.get(
  '/pending',
  validate({ query: listPendingQuerySchema }),
  asyncHandler(approvalsController.listPending),
);

approvalsRouter.get(
  '/history',
  validate({ query: listPendingQuerySchema }),
  asyncHandler(approvalsController.listDecisions),
);

approvalsRouter.get(
  '/:id',
  validate({ params: approvalIdParamSchema }),
  asyncHandler(approvalsController.getDetail),
);

approvalsRouter.get(
  '/:id/attachments/:attachmentId',
  validate({ params: attachmentParamsSchema }),
  asyncHandler(approvalsController.getAttachment),
);

approvalsRouter.post(
  '/:id/approve',
  acceptEvidence,
  validate({ params: approvalIdParamSchema, body: approveStepSchema }),
  asyncHandler(approvalsController.approveStep),
);

approvalsRouter.post(
  '/:id/reject',
  acceptEvidence,
  validate({ params: approvalIdParamSchema, body: rejectStepSchema }),
  asyncHandler(approvalsController.rejectStep),
);

approvalsRouter.post(
  '/:id/approve-on-behalf',
  requireRoles(...PROJECT_MANAGER_ROLES),
  acceptEvidence,
  validate({ params: approvalIdParamSchema, body: approveOnBehalfSchema }),
  asyncHandler(approvalsController.approveOnBehalf),
);
