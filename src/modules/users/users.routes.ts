import { Router } from 'express';
import {
  requireAuth,
  requirePasswordChanged,
  requirePermission,
  requireRoles,
} from '../../middlewares/auth.js';
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
import { PERMISSION_CATALOG_MANAGE, PERMISSION_USERS_MANAGE } from '../../utils/permissions.js';
import { ROLE_ADMIN } from '../../utils/roles.js';

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
  requirePermission(PERMISSION_USERS_MANAGE, PERMISSION_CATALOG_MANAGE),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(usersController.list),
);

usersRouter.post(
  '/',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_USERS_MANAGE),
  validate({ body: createUserSchema }),
  asyncHandler(usersController.create),
);

usersRouter.get(
  '/:id',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_USERS_MANAGE, PERMISSION_CATALOG_MANAGE),
  validate({ params: userIdParamSchema }),
  asyncHandler(usersController.getOne),
);

usersRouter.patch(
  '/:id',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_USERS_MANAGE),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  asyncHandler(usersController.update),
);

usersRouter.get(
  '/:id/projects',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_USERS_MANAGE),
  validate({ params: userIdParamSchema }),
  asyncHandler(usersController.listProjects),
);

usersRouter.post(
  '/:id/projects',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_USERS_MANAGE),
  validate({ params: userIdParamSchema, body: userProjectSchema }),
  asyncHandler(usersController.assignProject),
);

usersRouter.patch(
  '/:id/projects/:assignmentId',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_USERS_MANAGE),
  validate({ params: userAssignmentParamsSchema, body: updateUserProjectSchema }),
  asyncHandler(usersController.updateProject),
);

usersRouter.delete(
  '/:id/projects/:assignmentId',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_USERS_MANAGE),
  validate({ params: userAssignmentParamsSchema }),
  asyncHandler(usersController.removeProject),
);

usersRouter.delete(
  '/:id/permanent',
  requireAuth,
  requirePasswordChanged,
  requireRoles(ROLE_ADMIN),
  validate({ params: userIdParamSchema }),
  asyncHandler(usersController.deletePermanently),
);

usersRouter.delete(
  '/:id',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_USERS_MANAGE),
  validate({ params: userIdParamSchema }),
  asyncHandler(usersController.deactivate),
);
