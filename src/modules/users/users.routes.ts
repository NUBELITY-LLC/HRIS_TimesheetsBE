import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requireRoles } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as usersController from './users.controller.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateOwnProfileSchema,
  updateUserSchema,
  updateUserProjectSchema,
  userAssignmentParamsSchema,
  userIdParamSchema,
  userProjectSchema,
} from './users.schema.js';
import { USER_MANAGER_ROLES } from './users.permissions.js';

export const usersRouter: Router = Router();

usersRouter.patch(
  '/me',
  requireAuth,
  requirePasswordChanged,
  validate({ body: updateOwnProfileSchema }),
  asyncHandler(usersController.updateMe),
);

usersRouter.get(
  '/',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(usersController.list),
);

usersRouter.post(
  '/',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ body: createUserSchema }),
  asyncHandler(usersController.create),
);

usersRouter.get(
  '/:id',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ params: userIdParamSchema }),
  asyncHandler(usersController.getOne),
);

usersRouter.patch(
  '/:id',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  asyncHandler(usersController.update),
);

usersRouter.get(
  '/:id/projects',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ params: userIdParamSchema }),
  asyncHandler(usersController.listProjects),
);

usersRouter.post(
  '/:id/projects',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ params: userIdParamSchema, body: userProjectSchema }),
  asyncHandler(usersController.assignProject),
);

usersRouter.patch(
  '/:id/projects/:assignmentId',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ params: userAssignmentParamsSchema, body: updateUserProjectSchema }),
  asyncHandler(usersController.updateProject),
);

usersRouter.delete(
  '/:id/projects/:assignmentId',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ params: userAssignmentParamsSchema }),
  asyncHandler(usersController.removeProject),
);

usersRouter.delete(
  '/:id',
  requireAuth,
  requirePasswordChanged,
  requireRoles(...USER_MANAGER_ROLES),
  validate({ params: userIdParamSchema }),
  asyncHandler(usersController.deactivate),
);
