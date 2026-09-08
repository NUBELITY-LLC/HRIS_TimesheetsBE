import { Router } from 'express';
import { requireAuth, requirePasswordChanged, requireRoles } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { CATALOG_MANAGER_ROLES } from '../../utils/roles.js';
import { listClientsQuerySchema } from '../clients/clients.schema.js';
import * as companiesController from './companies.controller.js';
import {
  companyIdParamSchema,
  createCompanySchema,
  listCompaniesQuerySchema,
  updateCompanySchema,
} from './companies.schema.js';

export const companiesRouter: Router = Router();

companiesRouter.use(requireAuth, requirePasswordChanged, requireRoles(...CATALOG_MANAGER_ROLES));

companiesRouter.get(
  '/',
  validate({ query: listCompaniesQuerySchema }),
  asyncHandler(companiesController.list),
);

companiesRouter.post(
  '/',
  validate({ body: createCompanySchema }),
  asyncHandler(companiesController.create),
);

companiesRouter.get(
  '/:id',
  validate({ params: companyIdParamSchema }),
  asyncHandler(companiesController.getOne),
);

companiesRouter.patch(
  '/:id',
  validate({ params: companyIdParamSchema, body: updateCompanySchema }),
  asyncHandler(companiesController.update),
);

companiesRouter.get(
  '/:id/clients',
  validate({ params: companyIdParamSchema, query: listClientsQuerySchema }),
  asyncHandler(companiesController.listClients),
);

companiesRouter.delete(
  '/:id',
  validate({ params: companyIdParamSchema }),
  asyncHandler(companiesController.deactivate),
);
