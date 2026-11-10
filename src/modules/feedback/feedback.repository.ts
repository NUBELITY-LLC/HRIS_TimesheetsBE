import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { PERMISSION_FEEDBACK_REVIEW } from '../../utils/permissions.js';
import type { FeedbackCategory, FeedbackNoteKind, FeedbackStatus } from './feedback.schema.js';

export type FeedbackReportRecord = {
  id: number;
  category: FeedbackCategory;
  body: string;
  submitted_on: string;
  status: FeedbackStatus;
  resolution: string | null;
  status_changed_at: string | null;
  status_changed_by: number | null;
};

export type FeedbackListRecord = FeedbackReportRecord & {
  attachments: { count: number }[];
  notes: { count: number }[];
};

export type FeedbackAttachmentRecord = {
  id: number;
  report_id: number;
  position: number;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
};

export type FeedbackNoteRecord = {
  id: number;
  kind: FeedbackNoteKind;
  body: string;
  created_at: string;
  author_id: number | null;
  author: { full_name: string } | null;
};

export type FeedbackFilters = {
  from?: string;
  to?: string;
  categories: FeedbackCategory[];
  statuses?: FeedbackStatus[];
};

const REPORT_COLUMNS =
  'id, category, body, submitted_on, status, resolution, status_changed_at, status_changed_by';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo feedback');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

export async function insertReport(row: {
  trackingHash: string;
  category: FeedbackCategory;
  body: string;
}): Promise<number> {
  const { data, error } = await supabase
    .from('FEEDBACK_REPORTS')
    .insert({ tracking_hash: row.trackingHash, category: row.category, body: row.body })
    .select('id')
    .single();

  if (error || !data) fail('insertReport', error);

  return data.id;
}

export async function deleteReport(id: number): Promise<void> {
  const { error } = await supabase.from('FEEDBACK_REPORTS').delete().eq('id', id);
  if (error) logger.error({ err: error, operation: 'deleteReport' }, 'No fue posible descartar el caso');
}

export async function insertAttachments(
  rows: Omit<FeedbackAttachmentRecord, 'id'>[],
): Promise<void> {
  if (!rows.length) return;

  const { error } = await supabase.from('FEEDBACK_ATTACHMENTS').insert(rows);
  if (error) fail('insertAttachments', error);
}

export async function findByTrackingHash(hash: string): Promise<FeedbackReportRecord | null> {
  const { data, error } = await supabase
    .from('FEEDBACK_REPORTS')
    .select(REPORT_COLUMNS)
    .eq('tracking_hash', hash)
    .maybeSingle();

  if (error) fail('findByTrackingHash', error);

  return (data as FeedbackReportRecord | null) ?? null;
}

function applyFilters<
  Q extends {
    gte: (column: string, value: string) => Q;
    lte: (column: string, value: string) => Q;
    in: (column: string, values: string[]) => Q;
  },
>(query: Q, filters: FeedbackFilters): Q {
  let filtered = query;
  if (filters.from) filtered = filtered.gte('submitted_on', filters.from);
  if (filters.to) filtered = filtered.lte('submitted_on', filters.to);
  if (filters.categories.length) filtered = filtered.in('category', filters.categories);
  if (filters.statuses?.length) filtered = filtered.in('status', filters.statuses);
  return filtered;
}

export async function findReportPage(
  filters: FeedbackFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: FeedbackListRecord[]; total: number }> {
  const from = (page - 1) * pageSize;
  const query = supabase
    .from('FEEDBACK_REPORTS')
    .select(
      `${REPORT_COLUMNS}, attachments:FEEDBACK_ATTACHMENTS(count), notes:FEEDBACK_NOTES(count)`,
      { count: 'exact' },
    );

  const { data, error, count } = await applyFilters(query, filters)
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) fail('findReportPage', error);

  return { rows: (data ?? []) as unknown as FeedbackListRecord[], total: count ?? 0 };
}

export const FEEDBACK_EXPORT_LIMIT = 5000;

export async function findReportsForExport(filters: FeedbackFilters): Promise<FeedbackListRecord[]> {
  const rows: FeedbackListRecord[] = [];
  const batch = 1000;

  for (let from = 0; from < FEEDBACK_EXPORT_LIMIT; from += batch) {
    const query = supabase
      .from('FEEDBACK_REPORTS')
      .select(`${REPORT_COLUMNS}, attachments:FEEDBACK_ATTACHMENTS(count), notes:FEEDBACK_NOTES(count)`);
    const { data, error } = await applyFilters(query, filters)
      .order('id', { ascending: false })
      .range(from, Math.min(from + batch, FEEDBACK_EXPORT_LIMIT) - 1);

    if (error) fail('findReportsForExport', error);

    const page = (data ?? []) as unknown as FeedbackListRecord[];
    rows.push(...page);
    if (page.length < batch) break;
  }

  return rows;
}

export async function findReportStats(
  filters: FeedbackFilters,
): Promise<Pick<FeedbackReportRecord, 'category' | 'status' | 'submitted_on'>[]> {
  const rows: Pick<FeedbackReportRecord, 'category' | 'status' | 'submitted_on'>[] = [];
  const batch = 1000;

  for (let from = 0; ; from += batch) {
    const query = supabase.from('FEEDBACK_REPORTS').select('category, status, submitted_on');
    const { data, error } = await applyFilters(query, filters)
      .order('id', { ascending: true })
      .range(from, from + batch - 1);

    if (error) fail('findReportStats', error);

    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < batch) break;
  }

  return rows;
}

export async function countNewReports(): Promise<number> {
  const { count, error } = await supabase
    .from('FEEDBACK_REPORTS')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'NEW');

  if (error) fail('countNewReports', error);

  return count ?? 0;
}

export async function findReport(id: number): Promise<FeedbackReportRecord | null> {
  const { data, error } = await supabase
    .from('FEEDBACK_REPORTS')
    .select(REPORT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findReport', error);

  return (data as FeedbackReportRecord | null) ?? null;
}

export async function findAttachments(reportId: number): Promise<FeedbackAttachmentRecord[]> {
  const { data, error } = await supabase
    .from('FEEDBACK_ATTACHMENTS')
    .select('id, report_id, position, storage_path, mime_type, size_bytes')
    .eq('report_id', reportId)
    .order('position', { ascending: true });

  if (error) fail('findAttachments', error);

  return data ?? [];
}

export async function findAttachment(
  reportId: number,
  attachmentId: number,
): Promise<FeedbackAttachmentRecord | null> {
  const { data, error } = await supabase
    .from('FEEDBACK_ATTACHMENTS')
    .select('id, report_id, position, storage_path, mime_type, size_bytes')
    .eq('report_id', reportId)
    .eq('id', attachmentId)
    .maybeSingle();

  if (error) fail('findAttachment', error);

  return data ?? null;
}

export async function findNotes(
  reportId: number,
  kinds?: FeedbackNoteKind[],
): Promise<FeedbackNoteRecord[]> {
  let query = supabase
    .from('FEEDBACK_NOTES')
    .select('id, kind, body, created_at, author_id, author:USERS(full_name)')
    .eq('report_id', reportId);

  if (kinds?.length) query = query.in('kind', kinds);

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) fail('findNotes', error);

  return (data ?? []) as unknown as FeedbackNoteRecord[];
}

export async function updateStatus(
  id: number,
  patch: { status: FeedbackStatus; resolution: string | null; changedBy: number },
): Promise<FeedbackReportRecord | null> {
  const { data, error } = await supabase
    .from('FEEDBACK_REPORTS')
    .update({
      status: patch.status,
      resolution: patch.resolution,
      status_changed_by: patch.changedBy,
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(REPORT_COLUMNS)
    .maybeSingle();

  if (error) fail('updateStatus', error);

  return (data as FeedbackReportRecord | null) ?? null;
}

export async function insertNote(row: {
  reportId: number;
  authorId: number;
  kind: FeedbackNoteKind;
  body: string;
}): Promise<void> {
  const { error } = await supabase.from('FEEDBACK_NOTES').insert({
    report_id: row.reportId,
    author_id: row.authorId,
    kind: row.kind,
    body: row.body,
  });

  if (error) fail('insertNote', error);
}

export async function logAccess(
  reportId: number,
  action: 'FEEDBACK_VIEWED' | 'FEEDBACK_EVIDENCE_DOWNLOADED',
  attachmentId?: number,
): Promise<void> {
  const { error } = await supabase.rpc('fn_opt_log_feedback_access', {
    p_report_id: reportId,
    p_action: action,
    p_attachment_id: attachmentId ?? null,
  });

  if (error) fail('logAccess', error);
}

export async function findReviewerIds(): Promise<number[]> {
  const { data, error } = await supabase
    .from('USER_PERMISSIONS')
    .select('user_id, user:USERS!inner(is_active, has_password)')
    .eq('permission_code', PERMISSION_FEEDBACK_REVIEW)
    .eq('user.is_active', true)
    .eq('user.has_password', true);

  if (error) fail('findReviewerIds', error);

  return (data ?? []).map((row) => row.user_id);
}

export async function notifyReviewers(
  userIds: number[],
  reportId: number,
  copy: { title: string; body: string },
): Promise<void> {
  if (!userIds.length) return;

  const { error } = await supabase.from('NOTIFICATIONS').insert(
    userIds.map((userId) => ({
      user_id: userId,
      kind: 'FEEDBACK_RECEIVED',
      title: copy.title,
      body: copy.body,
      dedupe_key: `feedback:${reportId}`,
    })),
  );

  if (error) fail('notifyReviewers', error);
}
