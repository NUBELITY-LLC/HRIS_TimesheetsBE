import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { MAX_APPROVAL_STEPS, MIN_APPROVAL_STEPS } from '../../utils/approvals.js';
import type { ApproverType } from '../../types/database.types.js';
import type { ProjectStatus } from '../../utils/projects.js';

export type ClientRef = { id: number; client_name: string; is_active: boolean };
export type UserRef = {
  id: number;
  full_name: string;
  email: string;
  is_active: boolean;
  role: { id: number; code: string; name: string } | null;
};

export type ProjectRecord = {
  id: number;
  client_id: number;
  manager_id: number | null;
  project_name: string;
  code: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  closed_at: string | null;
  client: ClientRef | null;
  manager: UserRef | null;
};

export type AssignmentRecord = {
  id: number;
  project_id: number;
  consultant_id: number;
  pay_rate: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  consultant: UserRef | null;
};

export type ConsultantAssignmentRecord = {
  id: number;
  project_id: number;
  consultant_id: number;
  pay_rate: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  project: {
    id: number;
    project_name: string;
    code: string | null;
    start_date: string | null;
    end_date: string | null;
    status: ProjectStatus;
    client: ClientRef | null;
  } | null;
};

export type ApprovalStepRecord = {
  id: number;
  seq: number;
  approver_type: ApproverType;
  user_id: number | null;
  role_id: number | null;
  client_id: number | null;
  approver_email: string | null;
  approver_name: string | null;
  is_active: boolean;
  user: { id: number; full_name: string; email: string } | null;
  role: { id: number; code: string; name: string } | null;
  client: { id: number; client_name: string; contact_email: string | null } | null;
};

export type NewProjectRow = {
  client_id: number;
  manager_id: number | null;
  project_name: string;
  code: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type ProjectPatch = Partial<NewProjectRow>;

export type NewAssignmentRow = {
  project_id: number;
  consultant_id: number;
  pay_rate: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
};

export type AssignmentPatch = Partial<Omit<NewAssignmentRow, 'project_id' | 'consultant_id'>>;

export type SortColumn = 'id' | 'project_name' | 'start_date';

export type ListProjectsFilters = {
  page: number;
  pageSize: number;
  search?: string;
  clientId?: number;
  managerId?: number;
  status?: ProjectStatus;
  sortColumn: SortColumn;
  ascending: boolean;
};

const USER_REF_COLUMNS = 'id, full_name, email, is_active, role:ROLES!inner(id, code, name)';

const PROJECT_COLUMNS =
  'id, client_id, manager_id, project_name, code, start_date, end_date, status, closed_at, ' +
  'client:CLIENTS!inner(id, client_name, is_active), ' +
  `manager:USERS!PROJECTS_manager_id_fkey(${USER_REF_COLUMNS})`;

const ASSIGNMENT_COLUMNS =
  'id, project_id, consultant_id, pay_rate, currency, start_date, end_date, is_active, ' +
  `consultant:USERS!inner(${USER_REF_COLUMNS})`;

const CONSULTANT_ASSIGNMENT_COLUMNS =
  'id, project_id, consultant_id, pay_rate, currency, start_date, end_date, is_active, ' +
  'project:PROJECTS!inner(id, project_name, code, start_date, end_date, status, ' +
  'client:CLIENTS!inner(id, client_name, is_active))';

const APPROVAL_STEP_COLUMNS =
  'id, seq, approver_type, user_id, role_id, client_id, approver_email, approver_name, ' +
  'is_active, user:USERS(id, full_name, email), role:ROLES(id, code, name), ' +
  'client:CLIENTS(id, client_name, contact_email)';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo projects');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

function throwIfProjectDuplicate(error: { code?: string }): void {
  if (error.code === UNIQUE_VIOLATION) {
    throw ApiError.conflict('Ese cliente ya tiene un proyecto con ese nombre');
  }
}

function throwIfAssignmentDuplicate(error: { code?: string }): void {
  if (error.code === UNIQUE_VIOLATION) {
    throw ApiError.conflict('Esa persona ya tiene una asignacion en el proyecto con esa fecha de inicio');
  }
}

export async function insertProject(row: NewProjectRow): Promise<ProjectRecord> {
  const { data, error } = await supabase
    .from('PROJECTS')
    .insert(row)
    .select(PROJECT_COLUMNS)
    .single();

  if (error) {
    throwIfProjectDuplicate(error);
    fail('insertProject', error);
  }

  return data as unknown as ProjectRecord;
}

export async function findProjectById(id: number): Promise<ProjectRecord | null> {
  const { data, error } = await supabase
    .from('PROJECTS')
    .select(PROJECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findProjectById', error);

  return (data as unknown as ProjectRecord | null) ?? null;
}

export async function findProjects(
  filters: ListProjectsFilters,
): Promise<{ rows: ProjectRecord[]; total: number }> {
  let query = supabase.from('PROJECTS').select(PROJECT_COLUMNS, { count: 'exact' });

  if (filters.clientId !== undefined) {
    query = query.eq('client_id', filters.clientId);
  }
  if (filters.managerId !== undefined) {
    query = query.eq('manager_id', filters.managerId);
  }
  if (filters.status !== undefined) {
    query = query.eq('status', filters.status);
  }
  if (filters.search) {
    const pattern = quoteFilterValue(`%${escapeLikePattern(filters.search)}%`);
    query = query.or(`project_name.ilike.${pattern},code.ilike.${pattern}`);
  }

  const from = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await query
    .order(filters.sortColumn, { ascending: filters.ascending, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + filters.pageSize - 1);

  if (error) fail('findProjects', error);

  return { rows: (data ?? []) as unknown as ProjectRecord[], total: count ?? 0 };
}

export async function updateProject(id: number, patch: ProjectPatch): Promise<ProjectRecord | null> {
  const { data, error } = await supabase
    .from('PROJECTS')
    .update(patch)
    .eq('id', id)
    .select(PROJECT_COLUMNS)
    .maybeSingle();

  if (error) {
    throwIfProjectDuplicate(error);
    fail('updateProject', error);
  }

  return (data as unknown as ProjectRecord | null) ?? null;
}

export type CloseProjectResult = {
  projectId: number;
  effectiveDate: string;
  closedAssignments: number;
  strandedTimesheets: number;
};

export async function closeProject(
  projectId: number,
  effectiveDate: string,
  actorId: number,
): Promise<CloseProjectResult> {
  const { data, error } = await supabase.rpc('fn_close_project', {
    p_project_id: projectId,
    p_effective_date: effectiveDate,
    p_actor_id: actorId,
  });

  if (error) {
    if (error.message.startsWith('PROJECT_NOT_FOUND')) {
      throw ApiError.notFound('El proyecto no existe');
    }
    if (error.message.startsWith('PROJECT_ALREADY_CLOSED')) {
      throw ApiError.conflict(
        `El proyecto ya esta cerrado desde el ${error.message.split(':')[1] ?? 'n/d'}`,
      );
    }
    if (error.message.startsWith('CLOSE_DATE_BEFORE_START')) {
      throw ApiError.unprocessable('La fecha de cierre es anterior al inicio del proyecto', {
        field: 'effectiveDate',
        projectStartDate: error.message.split(':')[1] ?? null,
      });
    }
    if (error.message.startsWith('PROJECT_HAS_OPEN_TIMESHEETS')) {
      throw ApiError.unprocessable(
        'Hay timesheets en aprobacion de semanas posteriores a la fecha de cierre; resuelvelos primero',
        {
          code: 'PROJECT_HAS_OPEN_TIMESHEETS',
          openTimesheets: Number(error.message.split(':')[1] ?? 0),
        },
      );
    }
    fail('closeProject', error);
  }

  return data as unknown as CloseProjectResult;
}

export async function reopenProject(projectId: number): Promise<void> {
  const { error } = await supabase.rpc('fn_reopen_project', { p_project_id: projectId });

  if (error) {
    if (error.message.startsWith('PROJECT_NOT_FOUND')) {
      throw ApiError.notFound('El proyecto no existe');
    }
    if (error.message.startsWith('PROJECT_NOT_CLOSED')) {
      throw ApiError.conflict('El proyecto no esta cerrado');
    }
    fail('reopenProject', error);
  }
}

export async function findUserById(id: number): Promise<UserRef | null> {
  const { data, error } = await supabase
    .from('USERS')
    .select(USER_REF_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findUserById', error);

  return (data as unknown as UserRef | null) ?? null;
}

export async function insertAssignment(row: NewAssignmentRow): Promise<AssignmentRecord> {
  const { data, error } = await supabase
    .from('PROJECT_ASSIGNMENTS')
    .insert(row)
    .select(ASSIGNMENT_COLUMNS)
    .single();

  if (error) {
    throwIfAssignmentDuplicate(error);
    fail('insertAssignment', error);
  }

  return data as unknown as AssignmentRecord;
}

export async function findAssignmentsByProject(projectId: number): Promise<AssignmentRecord[]> {
  const { data, error } = await supabase
    .from('PROJECT_ASSIGNMENTS')
    .select(ASSIGNMENT_COLUMNS)
    .eq('project_id', projectId)
    .order('is_active', { ascending: false })
    .order('start_date', { ascending: false });

  if (error) fail('findAssignmentsByProject', error);

  return (data ?? []) as unknown as AssignmentRecord[];
}

export async function findAssignmentsByConsultant(
  consultantId: number,
): Promise<ConsultantAssignmentRecord[]> {
  const { data, error } = await supabase
    .from('PROJECT_ASSIGNMENTS')
    .select(CONSULTANT_ASSIGNMENT_COLUMNS)
    .eq('consultant_id', consultantId)
    .order('is_active', { ascending: false })
    .order('start_date', { ascending: false });

  if (error) fail('findAssignmentsByConsultant', error);

  return (data ?? []) as unknown as ConsultantAssignmentRecord[];
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

export async function updateAssignment(
  id: number,
  patch: AssignmentPatch,
): Promise<AssignmentRecord | null> {
  const { data, error } = await supabase
    .from('PROJECT_ASSIGNMENTS')
    .update(patch)
    .eq('id', id)
    .select(ASSIGNMENT_COLUMNS)
    .maybeSingle();

  if (error) {
    throwIfAssignmentDuplicate(error);
    fail('updateAssignment', error);
  }

  return (data as unknown as AssignmentRecord | null) ?? null;
}

export async function findApprovalSteps(projectId: number): Promise<ApprovalStepRecord[]> {
  const { data, error } = await supabase
    .from('PROJECT_APPROVAL_STEPS')
    .select(APPROVAL_STEP_COLUMNS)
    .eq('project_id', projectId)
    .order('seq', { ascending: true });

  if (error) fail('findApprovalSteps', error);

  return (data ?? []) as unknown as ApprovalStepRecord[];
}

export type ApprovalStepPayload = {
  seq: number;
  approverType: ApproverType;
  userId: number | null;
  roleCode: string | null;
  clientId: number | null;
  approverEmail: string | null;
  approverName: string | null;
};

export async function replaceApprovalSteps(
  projectId: number,
  steps: ApprovalStepPayload[],
): Promise<number> {
  const { data, error } = await supabase.rpc('fn_replace_project_approval_steps', {
    p_project_id: projectId,
    p_steps: steps,
  });

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throw ApiError.badRequest('Alguno de los aprobadores indicados no existe');
    }
    if (error.message.startsWith('PROJECT_NOT_FOUND')) {
      throw ApiError.notFound('El proyecto no existe');
    }
    if (error.message.startsWith('ROLE_NOT_FOUND')) {
      throw ApiError.badRequest('Alguno de los roles indicados no existe');
    }
    if (error.message.startsWith('APPROVAL_STEPS_MIN')) {
      throw ApiError.unprocessable(
        `El flujo requiere al menos ${MIN_APPROVAL_STEPS} aprobadores`,
        { field: 'steps', min: MIN_APPROVAL_STEPS, max: MAX_APPROVAL_STEPS },
      );
    }
    if (error.message.startsWith('APPROVAL_STEPS_MAX')) {
      throw ApiError.unprocessable(
        `El flujo admite como maximo ${MAX_APPROVAL_STEPS} aprobadores`,
        { field: 'steps', min: MIN_APPROVAL_STEPS, max: MAX_APPROVAL_STEPS },
      );
    }
    if (error.code === UNIQUE_VIOLATION) {
      throw ApiError.conflict('Un mismo aprobador no puede ocupar dos carriles del proyecto');
    }
    fail('replaceApprovalSteps', error);
  }

  return Number(data);
}
