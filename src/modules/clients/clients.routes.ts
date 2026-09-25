import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { PERMISSION_CATALOG_MANAGE } from '../../utils/permissions.js';
import * as clientsController from './clients.controller.js';
import {
  clientIdParamSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
} from './clients.schema.js';

export const clientsRouter: Router = Router();

clientsRouter.use(requireAuth, requirePasswordChanged, requirePermission(PERMISSION_CATALOG_MANAGE));

clientsRouter.get(
  '/',
  validate({ query: listClientsQuerySchema }),
  asyncHandler(clientsController.list),
);

clientsRouter.post(
  '/',
  validate({ body: createClientSchema }),
  asyncHandler(clientsController.create),
);

clientsRouter.get(
  '/:id',
  validate({ params: clientIdParamSchema }),
  asyncHandler(clientsController.getOne),
);

clientsRouter.patch(
  '/:id',
  validate({ params: clientIdParamSchema, body: updateClientSchema }),
  asyncHandler(clientsController.update),
);

clientsRouter.delete(
  '/:id',
  validate({ params: clientIdParamSchema }),
  asyncHandler(clientsController.deactivate),
);
