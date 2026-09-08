import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import type { ApproverType, ApprovalStatus, TimesheetStatus } from '../../types/database.types.js';

export type ClientRef = { id: number; client_name: string };
export type ProjectRef = {
  id: number;
  project_name: string;
  code: string | null;
  client: ClientRef | null;
};

export type AssignmentRecord = {
  id: number;
  consultant_id: number;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  project: ProjectRef | null;
};

export type TimesheetRecord = {
  id: number;
  assignment_id: number;
  submission_code: string | null;
  current_seq: number | null;
  week_start_date: string;
  week_end_date: string;
  status: TimesheetStatus;
  total_hours: number;
  cycle_no: number;
  submitted_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  assignment: AssignmentRecord | null;
};

export type ActivityRecord = {
  id: number;
  line_no: number;
  hours: number;
  activity: string;
};

export type DayRecord = {
  id: number;
  work_date: string;
  total_hours: number;
  note: string | null;
  activities: ActivityRecord[];
};

export type ApprovalRecord = {
  id: number;
  seq: number;
  cycle_no: number;
  approver_type: ApproverType;
  approver_id: number | null;
  approver_role_code: string | null;
  status: ApprovalStatus;
  comments: string | null;
  decided_at: string | null;
  approver: { id: number; full_name: string } | null;
};

export type ListTimesheetsFilters = {
  consultantId: number;
  page: number;
  pageSize: number;
  status?: TimesheetStatus;
};

const ASSIGNMENT_COLUMNS =
  'id, consultant_id, is_active, start_date, end_date, ' +
  'project:PROJECTS!inner(id, project_name, code, client:CLIENTS!inner(id, client_name))';

const TIMESHEET_COLUMNS =
  'id, assignment_id, submission_code, current_seq, week_start_date, week_end_date, status, ' +
  'total_hours, cycle_no, submitted_at, closed_at, created_at, updated_at, ' +
  `assignment:PROJECT_ASSIGNMENTS!inner(${ASSIGNMENT_COLUMNS})`;

const APPROVAL_COLUMNS =
  'id, seq, cycle_no, approver_type, approver_id, approver_role_code, status, comments, ' +
  'decided_at, approver:USERS(id, full_name)';

const OPEN_STATUSES: TimesheetStatus[] = ['SUBMITTED', 'IN_REVIEW'];
const SETTLED_STATUSES: TimesheetStatus[] = ['APPROVED', 'CLOSED', 'PAID'];

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo timesheets');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

export async function findAssignmentsByConsultant(
  consultantId: number,
): Promise<AssignmentRecord[]> {
  const { data, error } = await supabase
    .from('PROJECT_ASSIGNMENTS')
    .select(ASSIGNMENT_COLUMNS)
    .eq('consultant_id', consultantId)
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error) fail('findAssignmentsByConsultant', error);

  return (data ?? []) as unknown as AssignmentRecord[];
}

export async function findAssignmentById(id: number): Promise<AssignmentRecord | null> {
  const { data, error } = await supabase
    .from('PROJECT_ASSIGNMENTS')
    .select(ASSIGNMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findAssignmentById', error);

  return (data as unknown as AssignmentRecord | null) ?? null;
}

export async function findTimesheetById(id: number): Promise<TimesheetRecord | null> {
  const { data, error } = await supabase
    .from('TIMESHEETS')
    .select(TIMESHEET_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findTimesheetById', error);

  return (data as unknown as TimesheetRecord | null) ?? null;
}

export async function findTimesheetByWeek(
  assignmentId: number,
  weekStart: string,
): Promise<TimesheetRecord | null> {
  const { data, error } = await supabase
    .from('TIMESHEETS')
    .select(TIMESHEET_COLUMNS)
    .eq('assignment_id', assignmentId)
    .eq('week_start_date', weekStart)
    .maybeSingle();

  if (error) fail('findTimesheetByWeek', error);

  return (data as unknown as TimesheetRecord | null) ?? null;
}

export async function findDays(timesheetId: number): Promise<DayRecord[]> {
  const { data, error } = await supabase
    .from('TIMESHEET_DAYS')
    .select('id, work_date, total_hours, note, activities:TIMESHEET_ACTIVITIES(id, line_no, hours, activity)')
    .eq('timesheet_id', timesheetId)
    .order('work_date', { ascending: true })
    .order('line_no', { referencedTable: 'TIMESHEET_ACTIVITIES', ascending: true });

  if (error) fail('findDays', error);

  return (data ?? []) as unknown as DayRecord[];
}

export async function findApprovals(
  timesheetId: number,
  cycleNo: number,
): Promise<ApprovalRecord[]> {
  const { data, error } = await supabase
    .from('TIMESHEET_APPROVALS')
    .select(APPROVAL_COLUMNS)
    .eq('timesheet_id', timesheetId)
    .eq('cycle_no', cycleNo)
    .order('seq', { ascending: true });

  if (error) fail('findApprovals', error);

  return (data ?? []) as unknown as ApprovalRecord[];
}

export async function findApprovalsForTimesheets(
  timesheetIds: number[],
): Promise<Array<ApprovalRecord & { timesheet_id: number }>> {
  if (!timesheetIds.length) return [];

  const { data, error } = await supabase
    .from('TIMESHEET_APPROVALS')
    .select(`timesheet_id, ${APPROVAL_COLUMNS}`)
    .in('timesheet_id', timesheetIds)
    .order('seq', { ascending: true });

  if (error) fail('findApprovalsForTimesheets', error);

  return (data ?? []) as unknown as Array<ApprovalRecord & { timesheet_id: number }>;
}

export async function countActiveApprovalSteps(projectId: number): Promise<number> {
  const { count, error } = await supabase
    .from('PROJECT_APPROVAL_STEPS')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_active', true);

  if (error) fail('countActiveApprovalSteps', error);

  return count ?? 0;
}

export async function findTimesheetsByConsultant(
  filters: ListTimesheetsFilters,
): Promise<{ rows: TimesheetRecord[]; total: number }> {
  let query = supabase
    .from('TIMESHEETS')
    .select(TIMESHEET_COLUMNS, { count: 'exact' })
    .eq('assignment.consultant_id', filters.consultantId);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const from = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await query
    .order('week_start_date', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + filters.pageSize - 1);

  if (error) fail('findTimesheetsByConsultant', error);

  return { rows: (data ?? []) as unknown as TimesheetRecord[], total: count ?? 0 };
}

export async function sumHoursInRange(
  consultantId: number,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('TIMESHEET_DAYS')
    .select('total_hours, timesheet:TIMESHEETS!inner(assignment:PROJECT_ASSIGNMENTS!inner(consultant_id))')
    .eq('timesheet.assignment.consultant_id', consultantId)
    .gte('work_date', fromDate)
    .lte('work_date', toDate);

  if (error) fail('sumHoursInRange', error);

  return (data ?? []).reduce((total, row) => total + Number(row.total_hours ?? 0), 0);
}

async function countByStatuses(consultantId: number, statuses: TimesheetStatus[]): Promise<number> {
  const { count, error } = await supabase
    .from('TIMESHEETS')
    .select('id, assignment:PROJECT_ASSIGNMENTS!inner(consultant_id)', {
      count: 'exact',
      head: true,
    })
    .eq('assignment.consultant_id', consultantId)
    .in('status', statuses);

  if (error) fail('countByStatuses', error);

  return count ?? 0;
}

export function countOpenTimesheets(consultantId: number): Promise<number> {
  return countByStatuses(consultantId, OPEN_STATUSES);
}

export function countSettledTimesheets(consultantId: number): Promise<number> {
  return countByStatuses(consultantId, SETTLED_STATUSES);
}

export type DraftDayPayload = {
  workDate: string;
  note: string | null;
  activities: Array<{ hours: number; activity: string }>;
};

export type RpcFailure = { code: string; detail?: string };

function parseRpcFailure(message: string): RpcFailure {
  const trimmed = message.trim();
  const separator = trimmed.indexOf(':');

  if (separator === -1) return { code: trimmed };

  return { code: trimmed.slice(0, separator), detail: trimmed.slice(separator + 1).trim() };
}

export class TimesheetRpcError extends Error {
  readonly failure: RpcFailure;

  constructor(failure: RpcFailure) {
    super(failure.code);
    this.name = 'TimesheetRpcError';
    this.failure = failure;
  }
}

const RAISE_EXCEPTION = 'P0001';
const CHECK_VIOLATION = '23514';

function throwRpcFailure(operation: string, error: { message: string; code?: string }): never {
  if (error.code === RAISE_EXCEPTION) {
    throw new TimesheetRpcError(parseRpcFailure(error.message));
  }

  if (error.code === CHECK_VIOLATION) {
    logger.warn({ err: error, operation }, 'Un check de la base rechazo el timesheet');
    throw new TimesheetRpcError({ code: 'INVALID_TIMESHEET_DATA', detail: error.message });
  }

  fail(operation, error);
}

export async function saveDraft(params: {
  assignmentId: number;
  weekStart: string;
  actorId: number;
  actorRoleCode: string;
  days: DraftDayPayload[];
}): Promise<number> {
  const { data, error } = await supabase.rpc('fn_save_timesheet_draft', {
    p_assignment_id: params.assignmentId,
    p_week_start: params.weekStart,
    p_actor_id: params.actorId,
    p_actor_role_code: params.actorRoleCode,
    p_days: params.days,
  });

  if (error) throwRpcFailure('saveDraft', error);

  return Number(data);
}

export async function submit(params: {
  timesheetId: number;
  actorId: number;
  actorRoleCode: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc('fn_submit_timesheet', {
    p_timesheet_id: params.timesheetId,
    p_actor_id: params.actorId,
    p_actor_role_code: params.actorRoleCode,
  });

  if (error) throwRpcFailure('submit', error);

  return Number(data);
}
