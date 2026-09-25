import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import type { TimesheetStatus } from '../../types/database.types.js';

export type PersonRecord = {
  id: number;
  full_name: string;
  user_name: string;
  email: string;
  job_title: string | null;
  is_active: boolean;
  role: { id: number; code: string; name: string } | null;
};

export type ReportDayRecord = {
  work_date: string;
  total_hours: number;
  timesheet: {
    id: number;
    submission_code: string | null;
    status: TimesheetStatus;
    week_start_date: string;
    week_end_date: string;
    assignment: {
      consultant_id: number;
      pay_rate: number;
      currency: string;
      assignment_code: string | null;
      project: {
        id: number;
        project_name: string;
        code: string | null;
        client: {
          id: number;
          client_name: string;
          company: { id: number; trade_name: string } | null;
        } | null;
      } | null;
    } | null;
  } | null;
};

export type ListPeopleFilters = {
  roleIds: number[];
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
};

export type ReportDaysFilters = {
  consultantId: number;
  from: string;
  to: string;
  statuses: TimesheetStatus[];
};

const PERSON_COLUMNS =
  'id, full_name, user_name, email, job_title, is_active, role:ROLES!inner(id, code, name)';

const REPORT_DAY_COLUMNS =
  'work_date, total_hours, ' +
  'timesheet:TIMESHEETS!inner(id, submission_code, status, week_start_date, week_end_date, ' +
  'assignment:PROJECT_ASSIGNMENTS!inner(consultant_id, pay_rate, currency, ' +
  'assignment_code, ' +
  'project:PROJECTS!inner(id, project_name, code, ' +
  'client:CLIENTS!inner(id, client_name, company:COMPANIES!inner(id, trade_name)))))';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo reports');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

export async function findRoleIdsByCodes(codes: string[]): Promise<number[]> {
  const { data, error } = await supabase.from('ROLES').select('id, code').in('code', codes);

  if (error) fail('findRoleIdsByCodes', error);

  return (data ?? []).map((row) => row.id);
}

export async function findPeople(
  filters: ListPeopleFilters,
): Promise<{ rows: PersonRecord[]; total: number }> {
  let query = supabase
    .from('USERS')
    .select(PERSON_COLUMNS, { count: 'exact' })
    .in('role_id', filters.roleIds);

  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  if (filters.search) {
    const pattern = quoteFilterValue(`%${escapeLikePattern(filters.search)}%`);
    query = query.or(`full_name.ilike.${pattern},user_name.ilike.${pattern},email.ilike.${pattern}`);
  }

  const from = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await query
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + filters.pageSize - 1);

  if (error) fail('findPeople', error);

  return { rows: (data ?? []) as unknown as PersonRecord[], total: count ?? 0 };
}

export async function findPersonById(id: number): Promise<PersonRecord | null> {
  const { data, error } = await supabase
    .from('USERS')
    .select(PERSON_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findPersonById', error);

  return (data as unknown as PersonRecord | null) ?? null;
}

export async function findReportDays(filters: ReportDaysFilters): Promise<ReportDayRecord[]> {
  const { data, error } = await supabase
    .from('TIMESHEET_DAYS')
    .select(REPORT_DAY_COLUMNS)
    .eq('timesheet.assignment.consultant_id', filters.consultantId)
    .in('timesheet.status', filters.statuses)
    .gte('work_date', filters.from)
    .lte('work_date', filters.to)
    .order('work_date', { ascending: true })
    .order('id', { ascending: true });

  if (error) fail('findReportDays', error);

  return (data ?? []) as unknown as ReportDayRecord[];
}
