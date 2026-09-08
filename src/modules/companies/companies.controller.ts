import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, created, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as clientsService from '../clients/clients.service.js';
import type { ListClientsQuery } from '../clients/clients.schema.js';
import * as companiesService from './companies.service.js';
import type {
  CreateCompanyInput,
  ListCompaniesQuery,
  UpdateCompanyInput,
} from './companies.schema.js';

function requireActor(req: Request): companiesService.Actor {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return { id: req.user.id, roleCode: req.user.roleCode };
}

export async function create(req: Request, res: Response): Promise<void> {
  const company = await companiesService.createCompany(
    req.body as CreateCompanyInput,
    requireActor(req),
  );

  created(res, { company });
}

export async function list(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListCompaniesQuery>(res);
  const { companies, total } = await companiesService.listCompanies(query);

  paginated(res, companies, buildPagination(query.page, query.pageSize, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const company = await companiesService.getCompanyById(Number(req.params.id));
  ok(res, { company });
}

export async function update(req: Request, res: Response): Promise<void> {
  const company = await companiesService.updateCompany(
    Number(req.params.id),
    req.body as UpdateCompanyInput,
    requireActor(req),
  );

  ok(res, { company });
}

export async function deactivate(req: Request, res: Response): Promise<void> {
  const company = await companiesService.deactivateCompany(
    Number(req.params.id),
    requireActor(req),
  );

  ok(res, { company });
}

export async function listClients(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListClientsQuery>(res);
  const companyId = Number(req.params.id);

  await companiesService.getCompanyById(companyId);

  const { clients, total } = await clientsService.listClients({ ...query, companyId });

  paginated(res, clients, buildPagination(query.page, query.pageSize, total));
}
