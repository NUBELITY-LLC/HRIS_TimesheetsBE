import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import type { Json } from '../../types/database.types.js';
import type { AuditAction, AuditCategory, AuditSource } from './audit.schema.js';

export type AuditRecord = {
  id: number;
  occurred_at: string;
  category: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  entity_label: string | null;
  timesheet_id: number | null;
  timesheet_code: string | null;
  project_id: number | null;
  project_name: string | null;
  subject_user_id: number | null;
  subject_name: string | null;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role_code: string | null;
  source: string;
  from_status: string | null;
  to_status: string | null;
  comments: string | null;
  changes: Json;
  metadata: Json;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

export type AuditQueryFilters = {
  since?: string;
  until?: string;
  categories: AuditCategory[];
  actions: AuditAction[];
  sources: AuditSource[];
  actorId?: number;
  subjectUserId?: number;
  projectId?: number;
  timesheet?: string;
  search?: string;
  ascending: boolean;
};

export type AuditActorRecord = { id: number; full_name: string; email: string; is_active: boolean };
export type AuditProjectRecord = { id: number; project_name: string; code: string | null };

const COLUMNS =
  'id, occurred_at, category, action, entity_type, entity_id, entity_label, timesheet_id, ' +
  'timesheet_code, project_id, project_name, subject_user_id, subject_name, actor_id, actor_name, ' +
  'actor_email, actor_role_code, source, from_status, to_status, comments, changes, metadata, ' +
  'request_id, ip_address, user_agent';

const PAGE_ROWS = 1000;

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo audit');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

function filteredQuery(filters: AuditQueryFilters, count: boolean) {
  let query = supabase.from('OPT_LOG').select(COLUMNS, count ? { count: 'exact' } : undefined);

  if (filters.since) query = query.gte('occurred_at', filters.since);
  if (filters.until) query = query.lt('occurred_at', filters.until);
  if (filters.categories.length) query = query.in('category', filters.categories);
  if (filters.actions.length) query = query.in('action', filters.actions);
  if (filters.sources.length) query = query.in('source', filters.sources);
  if (filters.actorId) query = query.eq('actor_id', filters.actorId);
  if (filters.subjectUserId) query = query.eq('subject_user_id', filters.subjectUserId);
  if (filters.projectId) query = query.eq('project_id', filters.projectId);

  if (filters.timesheet) {
    const pattern = quoteFilterValue(`%${escapeLikePattern(filters.timesheet)}%`);
    query = /^\d{1,18}$/.test(filters.timesheet)
      ? query.or(`timesheet_id.eq.${filters.timesheet},timesheet_code.ilike.${pattern}`)
      : query.ilike('timesheet_code', `%${escapeLikePattern(filters.timesheet)}%`);
  }

  if (filters.search) {
    const pattern = quoteFilterValue(`%${escapeLikePattern(filters.search)}%`);
    query = query.or(
      [
        'entity_label',
        'timesheet_code',
        'actor_name',
        'actor_email',
        'subject_name',
        'project_name',
        'comments',
      ]
        .map((column) => `${column}.ilike.${pattern}`)
        .join(','),
    );
  }

  return query
    .order('occurred_at', { ascending: filters.ascending })
    .order('id', { ascending: filters.ascending });
}

export async function findAuditPage(
  filters: AuditQueryFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: AuditRecord[]; total: number }> {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await filteredQuery(filters, true).range(from, from + pageSize - 1);

  if (error) fail('findAuditPage', error);

  return { rows: (data ?? []) as unknown as AuditRecord[], total: count ?? 0 };
}

export async function findAuditRows(
  filters: AuditQueryFilters,
  limit: number,
): Promise<{ rows: AuditRecord[]; truncated: boolean }> {
  const rows: AuditRecord[] = [];

  for (let from = 0; from <= limit; from += PAGE_ROWS) {
    const to = Math.min(from + PAGE_ROWS, limit + 1) - 1;
    const { data, error } = await filteredQuery(filters, false).range(from, to);

    if (error) fail('findAuditRows', error);

    const batch = (data ?? []) as unknown as AuditRecord[];
    rows.push(...batch);
    if (batch.length < to - from + 1) break;
  }

  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

export async function findAuditActors(): Promise<AuditActorRecord[]> {
  const { data, error } = await supabase
    .from('USERS')
    .select('id, full_name, email, is_active')
    .order('full_name', { ascending: true })
    .order('id', { ascending: true });

  if (error) fail('findAuditActors', error);

  return data ?? [];
}

export async function findAuditProjects(): Promise<AuditProjectRecord[]> {
  const { data, error } = await supabase
    .from('PROJECTS')
    .select('id, project_name, code')
    .order('project_name', { ascending: true })
    .order('id', { ascending: true });

  if (error) fail('findAuditProjects', error);

  return data ?? [];
}
