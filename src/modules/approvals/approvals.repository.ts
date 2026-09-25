import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { RAISE_EXCEPTION, RpcError, parseRpcFailure } from '../../utils/rpc.js';
import type { ApproverType, TimesheetStatus } from '../../types/database.types.js';
import type { ApprovalRequestMail } from '../notifications/notifications.mailer.js';

export type PendingApprovalRecord = {
  id: number;
  timesheet_id: number;
  seq: number;
  cycle_no: number;
  approver_type: ApproverType;
  approver_role_code: string | null;
  approver_email: string | null;
  approver_name: string | null;
  on_behalf: boolean;
  submission_code: string | null;
  timesheet_status: TimesheetStatus;
  week_start_date: string;
  week_end_date: string;
  total_hours: number;
  submitted_at: string | null;
  pay_rate: number;
  currency: string;
  assignment_code: string | null;
  consultant_id: number;
  consultant_name: string;
  project_id: number;
  project_name: string;
  project_code: string | null;
  client_id: number;
  client_name: string;
  company_id?: number | null;
  company_name?: string | null;
};

export type PendingApprovalsFilters = {
  userId: number;
  roleCode: string;
  page: number;
  pageSize: number;
};

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo approvals');

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : null;

  throw new ApiError(
    500,
    `No fue posible completar la operacion, intenta de nuevo${code ? ` (${code})` : ''}`,
    'DATA_ACCESS_ERROR',
    { operation, dbCode: code },
  );
}

export async function findPending(
  filters: PendingApprovalsFilters,
): Promise<{ rows: PendingApprovalRecord[]; total: number }> {
  const { data, error } = await supabase.rpc('fn_pending_approvals', {
    p_user_id: filters.userId,
    p_role_code: filters.roleCode,
    p_limit: filters.pageSize,
    p_offset: (filters.page - 1) * filters.pageSize,
  });

  if (error) fail('findPending', error);

  const payload = (data ?? { total: 0, rows: [] }) as unknown as {
    total: number;
    rows: PendingApprovalRecord[];
  };

  return { rows: payload.rows ?? [], total: Number(payload.total ?? 0) };
}

export type ApprovalRoute = {
  approvalId: number;
  stepId: number | null;
  seq: number;
  approverType: ApproverType;
  approverId: number | null;
  approverRoleCode: string | null;
  approverEmail: string | null;
  approverName: string | null;
};

export type ExternalApprovalResult = {
  timesheetId: number;
  timesheetStatus: TimesheetStatus;
  submissionCode: string | null;
  cycleNo: number;
  currentSeq: number | null;
  completed: boolean;
  approved: {
    approvalId: number;
    seq: number;
    approverEmail: string | null;
    approverName: string | null;
    resolvedVia: string;
  };
  route: ApprovalRoute | null;
  notifications: { inApp: number; email: number };
  emailRequests: ApprovalRequestMail[];
};

function throwRpcFailure(operation: string, error: { message: string; code?: string }): never {
  if (error.code === RAISE_EXCEPTION) {
    throw new RpcError(parseRpcFailure(error.message));
  }

  fail(operation, error);
}

export type ApprovalContextRecord = {
  id: number;
  timesheet_id: number;
  seq: number;
  cycle_no: number;
  approver_type: ApproverType;
  approver_id: number | null;
  approver_role_code: string | null;
  approver_email: string | null;
  approver_name: string | null;
  status: string;
  comments: string | null;
  decided_at: string | null;
  timesheet: {
    id: number;
    submission_code: string | null;
    current_seq: number | null;
    cycle_no: number;
    week_start_date: string;
    week_end_date: string;
    status: TimesheetStatus;
    total_hours: number;
    submitted_at: string | null;
    assignment: {
      id: number;
      consultant_id: number;
      pay_rate: number;
      currency: string;
      assignment_code: string | null;
      consultant: { id: number; full_name: string; job_title: string | null } | null;
      project: {
        id: number;
        project_name: string;
        code: string | null;
        manager_id: number | null;
        client: {
          id: number;
          client_name: string;
          company: { id: number; trade_name: string } | null;
        } | null;
      } | null;
    } | null;
  } | null;
};

const APPROVAL_CONTEXT_COLUMNS =
  'id, timesheet_id, seq, cycle_no, approver_type, approver_id, approver_role_code, ' +
  'approver_email, approver_name, status, comments, decided_at, ' +
  'timesheet:TIMESHEETS!inner(' +
  'id, submission_code, current_seq, cycle_no, week_start_date, week_end_date, status, ' +
  'total_hours, submitted_at, ' +
  'assignment:PROJECT_ASSIGNMENTS!inner(' +
  'id, consultant_id, pay_rate, currency, assignment_code, ' +
  'consultant:USERS!inner(id, full_name, job_title), ' +
  'project:PROJECTS!inner(id, project_name, code, manager_id, ' +
  'client:CLIENTS!inner(id, client_name, company:COMPANIES!inner(id, trade_name)))))';

export async function findApprovalContext(
  approvalId: number,
): Promise<ApprovalContextRecord | null> {
  const { data, error } = await supabase
    .from('TIMESHEET_APPROVALS')
    .select(APPROVAL_CONTEXT_COLUMNS)
    .eq('id', approvalId)
    .maybeSingle();

  if (error) fail('findApprovalContext', error);

  return (data as unknown as ApprovalContextRecord | null) ?? null;
}

export type AttachmentRecord = {
  id: number;
  approval_id: number;
  timesheet_id: number;
  uploaded_by: number;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploader: { id: number; full_name: string } | null;
};

const ATTACHMENT_COLUMNS =
  'id, approval_id, timesheet_id, uploaded_by, storage_path, file_name, mime_type, ' +
  'size_bytes, created_at, uploader:USERS!inner(id, full_name)';

export async function insertAttachment(params: {
  approvalId: number;
  timesheetId: number;
  uploadedBy: number;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<AttachmentRecord> {
  const { data, error } = await supabase
    .from('APPROVAL_ATTACHMENTS')
    .insert({
      approval_id: params.approvalId,
      timesheet_id: params.timesheetId,
      uploaded_by: params.uploadedBy,
      storage_path: params.storagePath,
      file_name: params.fileName,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();

  if (error) fail('insertAttachment', error);

  return data as unknown as AttachmentRecord;
}

export async function findAttachmentsByTimesheet(
  timesheetId: number,
): Promise<AttachmentRecord[]> {
  const { data, error } = await supabase
    .from('APPROVAL_ATTACHMENTS')
    .select(ATTACHMENT_COLUMNS)
    .eq('timesheet_id', timesheetId)
    .order('id', { ascending: true });

  if (error) fail('findAttachmentsByTimesheet', error);

  return (data ?? []) as unknown as AttachmentRecord[];
}

export async function findAttachmentById(id: number): Promise<AttachmentRecord | null> {
  const { data, error } = await supabase
    .from('APPROVAL_ATTACHMENTS')
    .select(ATTACHMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findAttachmentById', error);

  return (data as unknown as AttachmentRecord | null) ?? null;
}

export type DecisionOutcome =
  | 'ADVANCED'
  | 'COMPLETED'
  | 'RETURNED_TO_PREVIOUS'
  | 'RETURNED_TO_CONSULTANT';

export type InternalDecision = 'APPROVE' | 'REJECT_TO_PREVIOUS' | 'REJECT_TO_CONSULTANT';

export type InternalDecisionResult = {
  timesheetId: number;
  timesheetStatus: TimesheetStatus;
  submissionCode: string | null;
  cycleNo: number;
  currentSeq: number | null;
  outcome: DecisionOutcome;
  decided: {
    approvalId: number;
    seq: number;
    status: string;
    approverType: ApproverType;
    resolvedVia: string;
  };
  route: ApprovalRoute | null;
  notifications: { inApp: number; email: number };
  emailRequests: ApprovalRequestMail[];
};

export async function decideInternalStep(params: {
  approvalId: number;
  actorId: number;
  actorRoleCode: string;
  decision: InternalDecision;
  comments: string | null;
}): Promise<InternalDecisionResult> {
  const { data, error } = await supabase.rpc('fn_decide_internal_step', {
    p_approval_id: params.approvalId,
    p_actor_id: params.actorId,
    p_actor_role_code: params.actorRoleCode,
    p_decision: params.decision,
    p_comments: params.comments,
  });

  if (error) throwRpcFailure('decideInternalStep', error);

  if (!data) fail('decideInternalStep', new Error('fn_decide_internal_step no devolvio datos'));

  return data as unknown as InternalDecisionResult;
}

export async function approveExternalStep(params: {
  approvalId: number;
  actorId: number;
  actorRoleCode: string;
  comments: string | null;
}): Promise<ExternalApprovalResult> {
  const { data, error } = await supabase.rpc('fn_approve_external_step', {
    p_approval_id: params.approvalId,
    p_actor_id: params.actorId,
    p_actor_role_code: params.actorRoleCode,
    p_comments: params.comments,
  });

  if (error) throwRpcFailure('approveExternalStep', error);

  if (!data) fail('approveExternalStep', new Error('fn_approve_external_step no devolvio datos'));

  return data as unknown as ExternalApprovalResult;
}

export type DecisionEventRecord = {
  id: number;
  timesheet_id: number;
  event_type: string;
  occurred_at: string;
  comments: string | null;
  from_seq: number | null;
  cycle_no: number;
  metadata: { approvalId?: number } | null;
  timesheet: {
    id: number;
    submission_code: string | null;
    week_start_date: string;
    week_end_date: string;
    status: TimesheetStatus;
    total_hours: number;
    assignment: {
      id: number;
      pay_rate: number;
      currency: string;
      assignment_code: string | null;
      consultant: { id: number; full_name: string } | null;
      project: {
        id: number;
        project_name: string;
        client: {
          id: number;
          client_name: string;
          company: { id: number; trade_name: string } | null;
        } | null;
      } | null;
    } | null;
  } | null;
};

const DECISION_COLUMNS =
  'id, timesheet_id, event_type, occurred_at, comments, from_seq, cycle_no, metadata, ' +
  'timesheet:TIMESHEETS!inner(' +
  'id, submission_code, week_start_date, week_end_date, status, total_hours, ' +
  'assignment:PROJECT_ASSIGNMENTS!inner(' +
  'id, pay_rate, currency, assignment_code, consultant:USERS!inner(id, full_name), ' +
  'project:PROJECTS!inner(id, project_name, ' +
  'client:CLIENTS!inner(id, client_name, company:COMPANIES!inner(id, trade_name)))))';

const DECISION_EVENT_TYPES = ['APPROVED', 'REJECTED_PREV', 'REJECTED_CONSULTANT'];

export async function findDecisionsByActor(params: {
  actorId: number;
  page: number;
  pageSize: number;
}): Promise<{ rows: DecisionEventRecord[]; total: number }> {
  const from = (params.page - 1) * params.pageSize;

  const { data, error, count } = await supabase
    .from('TIMESHEET_EVENTS')
    .select(DECISION_COLUMNS, { count: 'exact' })
    .eq('actor_id', params.actorId)
    .in('event_type', DECISION_EVENT_TYPES)
    .not('metadata->approvalId', 'is', null)
    .order('occurred_at', { ascending: false })
    .range(from, from + params.pageSize - 1);

  if (error) fail('findDecisionsByActor', error);

  return {
    rows: (data ?? []) as unknown as DecisionEventRecord[],
    total: count ?? 0,
  };
}
