import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

export type NotificationRecord = {
  id: number;
  user_id: number;
  timesheet_id: number | null;
  kind: string | null;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

export type ListNotificationsFilters = {
  userId: number;
  page: number;
  pageSize: number;
  read?: boolean;
};

const NOTIFICATION_COLUMNS = 'id, user_id, timesheet_id, kind, title, body, is_read, created_at';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo notifications');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

export async function findByUser(
  filters: ListNotificationsFilters,
): Promise<{ rows: NotificationRecord[]; total: number }> {
  let query = supabase
    .from('NOTIFICATIONS')
    .select(NOTIFICATION_COLUMNS, { count: 'exact' })
    .eq('user_id', filters.userId);

  if (filters.read !== undefined) {
    query = query.eq('is_read', filters.read);
  }

  const from = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + filters.pageSize - 1);

  if (error) fail('findByUser', error);

  return { rows: (data ?? []) as NotificationRecord[], total: count ?? 0 };
}

export async function countUnread(userId: number): Promise<number> {
  const { count, error } = await supabase
    .from('NOTIFICATIONS')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) fail('countUnread', error);

  return count ?? 0;
}

export async function markRead(id: number, userId: number): Promise<NotificationRecord | null> {
  const { data, error } = await supabase
    .from('NOTIFICATIONS')
    .update({ is_read: true })
    .eq('id', id)
    .eq('user_id', userId)
    .select(NOTIFICATION_COLUMNS)
    .maybeSingle();

  if (error) fail('markRead', error);

  return (data as NotificationRecord | null) ?? null;
}

export async function markAllRead(userId: number): Promise<number> {
  const { data, error } = await supabase
    .from('NOTIFICATIONS')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select('id');

  if (error) fail('markAllRead', error);

  return (data ?? []).length;
}

export type ClaimedNotificationEmail = {
  id: number;
  kind: string | null;
  title: string;
  body: string | null;
  timesheetId: number | null;
  recipientEmail: string;
  recipientName: string | null;
  recipientActive: boolean;
  submissionCode: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  totalHours: number | null;
  consultantName: string | null;
  projectName: string | null;
  clientName: string | null;
};

export type EmailOutboxFilter = {
  timesheetId?: number;
  userId?: number;
  limit: number;
};

export async function claimEmails(
  filter: EmailOutboxFilter,
): Promise<ClaimedNotificationEmail[]> {
  const { data, error } = await supabase.rpc('fn_claim_notification_emails', {
    p_timesheet_id: filter.timesheetId ?? null,
    p_user_id: filter.userId ?? null,
    p_limit: filter.limit,
  });

  if (error) fail('claimEmails', error);

  return (data ?? []) as unknown as ClaimedNotificationEmail[];
}

export async function skipPendingEmails(
  filter: Omit<EmailOutboxFilter, 'limit'>,
): Promise<number> {
  let query = supabase
    .from('NOTIFICATIONS')
    .update({ email_status: 'SKIPPED' })
    .eq('email_status', 'PENDING');

  if (filter.timesheetId !== undefined) query = query.eq('timesheet_id', filter.timesheetId);
  if (filter.userId !== undefined) query = query.eq('user_id', filter.userId);

  const { data, error } = await query.select('id');

  if (error) fail('skipPendingEmails', error);

  return (data ?? []).length;
}

export type EmailOutcome =
  | { status: 'SENT' }
  | { status: 'SKIPPED' }
  | { status: 'FAILED'; error: string };

export async function recordEmailOutcome(id: number, outcome: EmailOutcome): Promise<void> {
  const { error } = await supabase
    .from('NOTIFICATIONS')
    .update({
      email_status: outcome.status,
      email_sent_at: outcome.status === 'SENT' ? new Date().toISOString() : null,
      email_error: outcome.status === 'FAILED' ? outcome.error.slice(0, 1000) : null,
    })
    .eq('id', id);

  if (error) fail('recordEmailOutcome', error);
}

export async function createTimesheetReminders(weekStart: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_create_timesheet_reminders', {
    p_week_start: weekStart,
  });

  if (error) fail('createTimesheetReminders', error);

  return Number(data ?? 0);
}
