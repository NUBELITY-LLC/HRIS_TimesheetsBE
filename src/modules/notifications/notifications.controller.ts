import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as notificationsService from './notifications.service.js';
import type { ListNotificationsQuery } from './notifications.schema.js';

function requireActor(req: Request): notificationsService.Actor {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return { id: req.user.id, roleCode: req.user.roleCode };
}

export async function listMine(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListNotificationsQuery>(res);
  const { notifications, total } = await notificationsService.listMine(query, requireActor(req));

  paginated(res, notifications, buildPagination(query.page, query.pageSize, total));
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  const unread = await notificationsService.countUnread(requireActor(req));
  ok(res, { unread });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const notification = await notificationsService.markRead(
    Number(req.params.id),
    requireActor(req),
  );

  ok(res, { notification });
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const updated = await notificationsService.markAllRead(requireActor(req));
  ok(res, { updated });
}
