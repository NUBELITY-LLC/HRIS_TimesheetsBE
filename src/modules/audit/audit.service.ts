import { parseDbTimestamp } from '../../utils/timestamps.js';
import type { ExportedFile } from '../timesheets/timesheets.export.js';
import * as repository from './audit.repository.js';
import { renderAuditWorkbook } from './audit.export.js';
import { AUDIT_TIME_ZONE, dbTimestamp, nextDay, zonedDayStart } from './audit.time.js';
import type {
  AuditFilters,
  ExportAuditQuery,
  ListAuditQuery,
} from './audit.schema.js';

export const AUDIT_EXPORT_LIMIT = 20_000;

export type AuditChange = { from: unknown; to: unknown };

export type AuditEntryView = {
  id: number;
  occurredAt: string;
  category: string;
  action: string;
  entityType: string;
  entityId: number | null;
  entityLabel: string | null;
  timesheet: { id: number; code: string | null } | null;
  project: { id: number | null; name: string } | null;
  subject: { id: number | null; name: string } | null;
  actor: { id: number | null; name: string; email: string | null; roleCode: string | null } | null;
  source: string;
  fromStatus: string | null;
  toStatus: string | null;
  comments: string | null;
  changes: Record<string, AuditChange>;
  metadata: Record<string, unknown>;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuditOptionsView = {
  actors: { id: number; fullName: string; email: string; isActive: boolean }[];
  projects: { id: number; name: string; code: string | null }[];
};

function queryFilters(filters: AuditFilters): repository.AuditQueryFilters {
  return {
    since: filters.from ? dbTimestamp(zonedDayStart(filters.from, AUDIT_TIME_ZONE)) : undefined,
    until: filters.to ? dbTimestamp(zonedDayStart(nextDay(filters.to), AUDIT_TIME_ZONE)) : undefined,
    categories: filters.categories,
    actions: filters.actions,
    sources: filters.sources,
    actorId: filters.actorId,
    subjectUserId: filters.subjectUserId,
    projectId: filters.projectId,
    timesheet: filters.timesheet,
    search: filters.search,
    ascending: filters.sortDir === 'asc',
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toChanges(value: unknown): Record<string, AuditChange> {
  const changes: Record<string, AuditChange> = {};

  for (const [field, change] of Object.entries(asObject(value))) {
    const pair = asObject(change);
    changes[field] = { from: pair.from ?? null, to: pair.to ?? null };
  }

  return changes;
}

export function toEntryView(row: repository.AuditRecord): AuditEntryView {
  return {
    id: row.id,
    occurredAt: parseDbTimestamp(row.occurred_at).toISOString(),
    category: row.category,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    timesheet: row.timesheet_id ? { id: row.timesheet_id, code: row.timesheet_code } : null,
    project: row.project_name ? { id: row.project_id, name: row.project_name } : null,
    subject: row.subject_name ? { id: row.subject_user_id, name: row.subject_name } : null,
    actor:
      row.actor_id || row.actor_name
        ? {
            id: row.actor_id,
            name: row.actor_name ?? '',
            email: row.actor_email,
            roleCode: row.actor_role_code,
          }
        : null,
    source: row.source,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    comments: row.comments,
    changes: toChanges(row.changes),
    metadata: asObject(row.metadata),
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
  };
}

export async function listAuditEntries(
  query: ListAuditQuery,
): Promise<{ entries: AuditEntryView[]; total: number }> {
  const { rows, total } = await repository.findAuditPage(queryFilters(query), query.page, query.pageSize);

  return { entries: rows.map(toEntryView), total };
}

export async function getAuditOptions(): Promise<AuditOptionsView> {
  const [actors, projects] = await Promise.all([
    repository.findAuditActors(),
    repository.findAuditProjects(),
  ]);

  return {
    actors: actors.map((actor) => ({
      id: actor.id,
      fullName: actor.full_name,
      email: actor.email,
      isActive: actor.is_active,
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.project_name,
      code: project.code,
    })),
  };
}

export async function exportAuditEntries(
  query: ExportAuditQuery,
  requester: { id: number; userName: string },
): Promise<ExportedFile> {
  const [{ rows, truncated }, options] = await Promise.all([
    repository.findAuditRows(queryFilters(query), AUDIT_EXPORT_LIMIT),
    getAuditOptions(),
  ]);

  const actorName = (id?: number) => options.actors.find((actor) => actor.id === id)?.fullName;
  const projectName = (id?: number) => options.projects.find((project) => project.id === id)?.name;

  return renderAuditWorkbook({
    entries: rows.map(toEntryView),
    query,
    truncated,
    limit: AUDIT_EXPORT_LIMIT,
    generatedBy: actorName(requester.id) ?? requester.userName,
    filterNames: {
      actor: actorName(query.actorId),
      subject: actorName(query.subjectUserId),
      project: projectName(query.projectId),
    },
  });
}
