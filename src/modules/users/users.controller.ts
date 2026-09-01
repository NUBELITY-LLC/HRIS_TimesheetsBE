import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, created, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as usersService from './users.service.js';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateOwnProfileInput,
  UpdateUserInput,
} from './users.schema.js';

function requireActor(req: Request): usersService.Actor {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return { id: req.user.id, roleCode: req.user.roleCode };
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = await usersService.createUser(req.body as CreateUserInput, requireActor(req));
  created(res, { user });
}

export async function list(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListUsersQuery>(res);
  const { users, total } = await usersService.listUsers(query);

  paginated(res, users, buildPagination(query.page, query.pageSize, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const user = await usersService.getUserById(Number(req.params.id));
  ok(res, { user });
}

export async function update(req: Request, res: Response): Promise<void> {
  const user = await usersService.updateUser(
    Number(req.params.id),
    req.body as UpdateUserInput,
    requireActor(req),
  );

  ok(res, { user });
}

export async function deactivate(req: Request, res: Response): Promise<void> {
  const user = await usersService.deactivateUser(Number(req.params.id), requireActor(req));
  ok(res, { user });
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const user = await usersService.updateOwnProfile(actor.id, req.body as UpdateOwnProfileInput);

  ok(res, { user });
}
