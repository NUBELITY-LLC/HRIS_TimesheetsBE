import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, created, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as clientsService from './clients.service.js';
import type { CreateClientInput, ListClientsQuery, UpdateClientInput } from './clients.schema.js';

function requireActor(req: Request): clientsService.Actor {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return { id: req.user.id, roleCode: req.user.roleCode };
}

export async function create(req: Request, res: Response): Promise<void> {
  const client = await clientsService.createClient(req.body as CreateClientInput, requireActor(req));
  created(res, { client });
}

export async function list(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListClientsQuery>(res);
  const { clients, total } = await clientsService.listClients(query);

  paginated(res, clients, buildPagination(query.page, query.pageSize, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const client = await clientsService.getClientById(Number(req.params.id));
  ok(res, { client });
}

export async function update(req: Request, res: Response): Promise<void> {
  const client = await clientsService.updateClient(
    Number(req.params.id),
    req.body as UpdateClientInput,
    requireActor(req),
  );

  ok(res, { client });
}

export async function deactivate(req: Request, res: Response): Promise<void> {
  const client = await clientsService.deactivateClient(Number(req.params.id), requireActor(req));
  ok(res, { client });
}
