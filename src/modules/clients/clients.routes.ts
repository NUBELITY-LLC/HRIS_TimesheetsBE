import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requireRoles } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { CATALOG_MANAGER_ROLES } from '../../utils/roles.js';
import * as clientsController from './clients.controller.js';
import {
  clientIdParamSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
} from './clients.schema.js';

export const clientsRouter: Router = Router();

clientsRouter.use(requireAuth, requirePasswordChanged, requireRoles(...CATALOG_MANAGER_ROLES));

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
