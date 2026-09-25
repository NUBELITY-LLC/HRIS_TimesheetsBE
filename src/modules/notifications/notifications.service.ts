import { ApiError } from '../../utils/ApiError.js';
import * as repository from './notifications.repository.js';
import type { ListNotificationsQuery } from './notifications.schema.js';

export type Actor = { id: number; roleCode: string };

export type NotificationView = {
  id: number;
  kind: string | null;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  timesheetId: number | null;
};

function toNotificationView(record: repository.NotificationRecord): NotificationView {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    body: record.body,
    isRead: record.is_read,
    createdAt: record.created_at,
    timesheetId: record.timesheet_id,
  };
}

function readFilter(status: ListNotificationsQuery['status']): boolean | undefined {
  if (status === 'unread') return false;
  if (status === 'read') return true;
  return undefined;
}

export async function listMine(
  query: ListNotificationsQuery,
  actor: Actor,
): Promise<{ notifications: NotificationView[]; total: number }> {
  const { rows, total } = await repository.findByUser({
    userId: actor.id,
    page: query.page,
    pageSize: query.pageSize,
    read: readFilter(query.status),
  });

  return { notifications: rows.map(toNotificationView), total };
}

export function countUnread(actor: Actor): Promise<number> {
  return repository.countUnread(actor.id);
}

export async function markRead(id: number, actor: Actor): Promise<NotificationView> {
  const record = await repository.markRead(id, actor.id);

  if (!record) {
    throw ApiError.notFound('La notificacion no existe o no te pertenece');
  }

  return toNotificationView(record);
}

export function markAllRead(actor: Actor): Promise<number> {
  return repository.markAllRead(actor.id);
}
