import { Router } from 'express';
import { requireAuth, requirePasswordChanged } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as notificationsController from './notifications.controller.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from './notifications.schema.js';

export const notificationsRouter: Router = Router();

notificationsRouter.use(requireAuth, requirePasswordChanged);

notificationsRouter.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(notificationsController.listMine),
);

notificationsRouter.get('/unread-count', asyncHandler(notificationsController.unreadCount));

notificationsRouter.post('/read-all', asyncHandler(notificationsController.markAllRead));

notificationsRouter.patch(
  '/:id/read',
  validate({ params: notificationIdParamSchema }),
  asyncHandler(notificationsController.markRead),
);
