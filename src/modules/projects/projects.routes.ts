import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requireRoles } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { CATALOG_MANAGER_ROLES } from '../../utils/roles.js';
import * as projectsController from './projects.controller.js';
import {
  assignmentParamsSchema,
  closeProjectSchema,
  createAssignmentSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  projectIdParamSchema,
  replaceApprovalStepsSchema,
  updateAssignmentSchema,
  updateProjectSchema,
} from './projects.schema.js';

export const projectsRouter: Router = Router();

projectsRouter.use(requireAuth, requirePasswordChanged, requireRoles(...CATALOG_MANAGER_ROLES));

projectsRouter.get(
  '/',
  validate({ query: listProjectsQuerySchema }),
  asyncHandler(projectsController.list),
);

projectsRouter.post(
  '/',
  validate({ body: createProjectSchema }),
  asyncHandler(projectsController.create),
);

projectsRouter.get(
  '/:id',
  validate({ params: projectIdParamSchema }),
  asyncHandler(projectsController.getOne),
);

projectsRouter.patch(
  '/:id',
  validate({ params: projectIdParamSchema, body: updateProjectSchema }),
  asyncHandler(projectsController.update),
);

projectsRouter.post(
  '/:id/close',
  validate({ params: projectIdParamSchema, body: closeProjectSchema }),
  asyncHandler(projectsController.close),
);

projectsRouter.post(
  '/:id/reopen',
  validate({ params: projectIdParamSchema }),
  asyncHandler(projectsController.reopen),
);

projectsRouter.get(
  '/:id/assignments',
  validate({ params: projectIdParamSchema }),
  asyncHandler(projectsController.listAssignments),
);

projectsRouter.post(
  '/:id/assignments',
  validate({ params: projectIdParamSchema, body: createAssignmentSchema }),
  asyncHandler(projectsController.assign),
);

projectsRouter.patch(
  '/:id/assignments/:assignmentId',
  validate({ params: assignmentParamsSchema, body: updateAssignmentSchema }),
  asyncHandler(projectsController.updateAssignment),
);

projectsRouter.delete(
  '/:id/assignments/:assignmentId',
  validate({ params: assignmentParamsSchema }),
  asyncHandler(projectsController.unassign),
);

projectsRouter.get(
  '/:id/approval-steps',
  validate({ params: projectIdParamSchema }),
  asyncHandler(projectsController.getApprovalSteps),
);

projectsRouter.put(
  '/:id/approval-steps',
  validate({ params: projectIdParamSchema, body: replaceApprovalStepsSchema }),
  asyncHandler(projectsController.replaceApprovalSteps),
);
