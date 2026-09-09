import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { MAX_APPROVAL_STEPS, MIN_APPROVAL_STEPS } from '../../utils/approvals.js';
import { APPROVER_ROLES, ASSIGNABLE_ROLES, PROJECT_MANAGER_ROLES } from '../../utils/roles.js';
import { PROJECT_STATUS_CLOSED, type ProjectStatus } from '../../utils/projects.js';
import * as clientsRepository from '../clients/clients.repository.js';
import * as repository from './projects.repository.js';
import type {
  AssignmentPatch,
  AssignmentRecord,
  ApprovalStepRecord,
  ProjectPatch,
  ProjectRecord,
  SortColumn,
  UserRef,
} from './projects.repository.js';
import type {
  CloseProjectInput,
  CreateAssignmentInput,
  CreateProjectInput,
  ListProjectsQuery,
  ReplaceApprovalStepsInput,
  UpdateAssignmentInput,
  UpdateProjectInput,
} from './projects.schema.js';

export type Actor = { id: number; roleCode: string };

export type PersonView = {
  id: number;
  fullName: string;
  email: string;
  roleCode: string | null;
  isActive: boolean;
};

export type ProjectView = {
  id: number;
  projectName: string;
  code: string | null;
  startDate: string | null;
  endDate: string | null;
  status: ProjectStatus;
  closedAt: string | null;
  client: { id: number; name: string; isActive: boolean } | null;
  manager: PersonView | null;
};

export type AssignmentView = {
  id: number;
  projectId: number;
  payRate: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  consultant: PersonView | null;
};

export type ApprovalClientView = {
  id: number;
  name: string;
  contactEmail: string | null;
};

export type ApprovalStepView = {
  id: number;
  seq: number;
  approverType: string;
  approver: PersonView | null;
  roleCode: string | null;
  roleName: string | null;
  client: ApprovalClientView | null;
  approverEmail: string | null;
  approverName: string | null;
};

export type ApprovalWorkflowView = {
  approvalSteps: ApprovalStepView[];
  minApprovers: number;
  maxApprovers: number;
  isComplete: boolean;
};

const SORT_COLUMNS: Record<ListProjectsQuery['sortBy'], SortColumn> = {
  id: 'id',
  projectName: 'project_name',
  startDate: 'start_date',
};

function toPersonView(record: UserRef | null): PersonView | null {
  if (!record) return null;

  return {
    id: record.id,
    fullName: record.full_name,
    email: record.email,
    roleCode: record.role?.code ?? null,
    isActive: record.is_active,
  };
}

function toProjectView(record: ProjectRecord): ProjectView {
  return {
    id: record.id,
    projectName: record.project_name,
    code: record.code,
    startDate: record.start_date,
    endDate: record.end_date,
    status: record.status,
    closedAt: record.closed_at,
    client: record.client
      ? { id: record.client.id, name: record.client.client_name, isActive: record.client.is_active }
      : null,
    manager: toPersonView(record.manager),
  };
}

function toAssignmentView(record: AssignmentRecord): AssignmentView {
  return {
    id: record.id,
    projectId: record.project_id,
    payRate: Number(record.pay_rate),
    currency: record.currency,
    startDate: record.start_date,
    endDate: record.end_date,
    isActive: record.is_active,
    consultant: toPersonView(record.consultant),
  };
}

function toApprovalStepView(record: ApprovalStepRecord): ApprovalStepView {
  return {
    id: record.id,
    seq: record.seq,
    approverType: record.approver_type,
    approver: record.user
      ? {
          id: record.user.id,
          fullName: record.user.full_name,
          email: record.user.email,
          roleCode: null,
          isActive: true,
        }
      : null,
    roleCode: record.role?.code ?? null,
    roleName: record.role?.name ?? null,
    client: record.client
      ? {
          id: record.client.id,
          name: record.client.client_name,
          contactEmail: record.client.contact_email,
        }
      : null,
    approverEmail: record.approver_email ?? record.user?.email ?? null,
    approverName: record.approver_name ?? record.user?.full_name ?? null,
  };
}

function toWorkflowView(steps: ApprovalStepRecord[]): ApprovalWorkflowView {
  return {
    approvalSteps: steps.map(toApprovalStepView),
    minApprovers: MIN_APPROVAL_STEPS,
    maxApprovers: MAX_APPROVAL_STEPS,
    isComplete: steps.length >= MIN_APPROVAL_STEPS,
  };
}

async function loadProject(id: number): Promise<ProjectRecord> {
  const record = await repository.findProjectById(id);

  if (!record) {
    throw ApiError.notFound('El proyecto no existe');
  }

  return record;
}

function assertProjectOpen(project: ProjectRecord, action: string): void {
  if (project.status === PROJECT_STATUS_CLOSED) {
    throw ApiError.unprocessable(`El proyecto esta cerrado: ${action}`, {
      code: 'PROJECT_CLOSED',
      projectStatus: project.status,
      endDate: project.end_date,
    });
  }
}

async function resolveClient(clientId: number): Promise<clientsRepository.ClientRecord> {
  const client = await clientsRepository.findClientById(clientId);

  if (!client) {
    throw ApiError.badRequest('El cliente indicado no existe', { field: 'clientId' });
  }

  if (!client.is_active) {
    throw ApiError.unprocessable('El cliente esta inactivo', { field: 'clientId' });
  }

  return client;
}

async function resolveManager(managerId: number): Promise<UserRef> {
  const manager = await repository.findUserById(managerId);

  if (!manager) {
    throw ApiError.badRequest('El manager indicado no existe', { field: 'managerId' });
  }

  if (!manager.is_active) {
    throw ApiError.unprocessable('El manager esta inactivo', { field: 'managerId' });
  }

  if (!PROJECT_MANAGER_ROLES.includes(manager.role?.code ?? '')) {
    throw ApiError.unprocessable(
      `El manager de un proyecto debe tener rol ${PROJECT_MANAGER_ROLES.join(' o ')}`,
      { field: 'managerId', allowedRoles: PROJECT_MANAGER_ROLES },
    );
  }

  return manager;
}

export async function createProject(
  input: CreateProjectInput,
  actor: Actor,
): Promise<ProjectView> {
  await resolveClient(input.clientId);

  const managerId =
    input.managerId === undefined && PROJECT_MANAGER_ROLES.includes(actor.roleCode)
      ? actor.id
      : (input.managerId ?? null);

  if (managerId !== null) {
    await resolveManager(managerId);
  }

  const created = await repository.insertProject({
    client_id: input.clientId,
    manager_id: managerId,
    project_name: input.projectName,
    code: input.code ?? null,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
  });

  logger.info({ projectId: created.id, createdBy: actor.id }, 'Proyecto creado');

  return toProjectView(created);
}

export async function listProjects(
  query: ListProjectsQuery,
): Promise<{ projects: ProjectView[]; total: number }> {
  const { rows, total } = await repository.findProjects({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    clientId: query.clientId,
    managerId: query.managerId,
    status: query.status,
    sortColumn: SORT_COLUMNS[query.sortBy],
    ascending: query.sortDir === 'asc',
  });

  return { projects: rows.map(toProjectView), total };
}

export async function getProjectById(id: number): Promise<
  ProjectView & { assignments: AssignmentView[]; approvalSteps: ApprovalStepView[] }
> {
  const record = await loadProject(id);

  const [assignments, steps] = await Promise.all([
    repository.findAssignmentsByProject(id),
    repository.findApprovalSteps(id),
  ]);

  return {
    ...toProjectView(record),
    assignments: assignments.map(toAssignmentView),
    approvalSteps: steps.map(toApprovalStepView),
  };
}

export async function updateProject(
  id: number,
  input: UpdateProjectInput,
  actor: Actor,
): Promise<ProjectView> {
  const target = await loadProject(id);
  const patch: ProjectPatch = {};

  if (input.clientId !== undefined) {
    await resolveClient(input.clientId);
    patch.client_id = input.clientId;
  }

  if (input.managerId !== undefined) {
    if (input.managerId !== null) {
      await resolveManager(input.managerId);
    }
    patch.manager_id = input.managerId;
  }

  if (input.projectName !== undefined) patch.project_name = input.projectName;
  if (input.code !== undefined) patch.code = input.code;
  if (input.startDate !== undefined) patch.start_date = input.startDate;

  if (input.endDate !== undefined) {
    assertProjectOpen(target, 'su fecha de fin se cambia reabriendolo o volviendolo a cerrar');
    patch.end_date = input.endDate;
  }

  const startDate = patch.start_date !== undefined ? patch.start_date : target.start_date;
  const endDate = patch.end_date !== undefined ? patch.end_date : target.end_date;

  if (startDate && endDate && endDate < startDate) {
    throw ApiError.unprocessable('La fecha de fin no puede ser anterior a la de inicio', {
      startDate,
      endDate,
    });
  }

  const updated = await repository.updateProject(id, patch);

  if (!updated) {
    throw ApiError.notFound('El proyecto no existe');
  }

  logger.info(
    { projectId: id, updatedBy: actor.id, fields: Object.keys(patch) },
    'Proyecto actualizado',
  );

  return toProjectView(updated);
}

export async function listAssignments(projectId: number): Promise<AssignmentView[]> {
  await loadProject(projectId);

  const records = await repository.findAssignmentsByProject(projectId);

  return records.map(toAssignmentView);
}

async function resolveConsultant(consultantId: number): Promise<UserRef> {
  const consultant = await repository.findUserById(consultantId);

  if (!consultant) {
    throw ApiError.badRequest('La persona indicada no existe', { field: 'consultantId' });
  }

  if (!consultant.is_active) {
    throw ApiError.unprocessable('La persona esta inactiva', { field: 'consultantId' });
  }

  if (!ASSIGNABLE_ROLES.includes(consultant.role?.code ?? '')) {
    throw ApiError.unprocessable(
      `Solo se asignan personas con rol ${ASSIGNABLE_ROLES.join(' o ')}`,
      { field: 'consultantId', allowedRoles: ASSIGNABLE_ROLES },
    );
  }

  return consultant;
}

export function assertWithinProject(
  project: ProjectRecord,
  startDate: string,
  endDate: string | null,
): void {
  if (project.start_date && startDate < project.start_date) {
    throw ApiError.unprocessable('La asignacion inicia antes que el proyecto', {
      projectStartDate: project.start_date,
    });
  }

  if (project.end_date && endDate && endDate > project.end_date) {
    throw ApiError.unprocessable('La asignacion termina despues que el proyecto', {
      projectEndDate: project.end_date,
    });
  }
}

export async function assignConsultant(
  projectId: number,
  input: CreateAssignmentInput,
  actor: Actor,
): Promise<AssignmentView> {
  const project = await loadProject(projectId);
  assertProjectOpen(project, 'no admite asignaciones nuevas');
  await resolveConsultant(input.consultantId);

  assertWithinProject(project, input.startDate, input.endDate ?? null);

  const existing = await repository.findAssignmentsByProject(projectId);
  const overlapping = existing.find(
    (assignment) =>
      assignment.consultant_id === input.consultantId &&
      assignment.is_active &&
      (assignment.end_date === null || assignment.end_date >= input.startDate) &&
      (input.endDate == null || input.endDate >= assignment.start_date),
  );

  if (overlapping) {
    throw ApiError.conflict('Esa persona ya tiene una asignacion activa que traslapa esas fechas');
  }

  const created = await repository.insertAssignment({
    project_id: projectId,
    consultant_id: input.consultantId,
    pay_rate: input.payRate,
    currency: input.currency ?? 'USD',
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    is_active: true,
  });

  logger.info(
    { assignmentId: created.id, projectId, consultantId: input.consultantId, createdBy: actor.id },
    'Persona asignada al proyecto',
  );

  return toAssignmentView(created);
}

async function loadProjectAssignment(
  projectId: number,
  assignmentId: number,
): Promise<AssignmentRecord> {
  const assignment = await repository.findAssignmentById(assignmentId);

  if (!assignment || assignment.project_id !== projectId) {
    throw ApiError.notFound('La asignacion no existe en este proyecto');
  }

  return assignment;
}

export async function updateAssignment(
  projectId: number,
  assignmentId: number,
  input: UpdateAssignmentInput,
  actor: Actor,
): Promise<AssignmentView> {
  const project = await loadProject(projectId);
  assertProjectOpen(project, 'sus asignaciones ya no se editan');
  const target = await loadProjectAssignment(projectId, assignmentId);

  const patch: AssignmentPatch = {};

  if (input.payRate !== undefined) patch.pay_rate = input.payRate;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const startDate = patch.start_date ?? target.start_date;
  const endDate = patch.end_date !== undefined ? patch.end_date : target.end_date;

  if (endDate && endDate < startDate) {
    throw ApiError.unprocessable('La fecha de fin no puede ser anterior a la de inicio', {
      startDate,
      endDate,
    });
  }

  assertWithinProject(project, startDate, endDate);

  const updated = await repository.updateAssignment(assignmentId, patch);

  if (!updated) {
    throw ApiError.notFound('La asignacion no existe en este proyecto');
  }

  logger.info(
    { assignmentId, projectId, updatedBy: actor.id, fields: Object.keys(patch) },
    'Asignacion actualizada',
  );

  return toAssignmentView(updated);
}

export async function deactivateAssignment(
  projectId: number,
  assignmentId: number,
  actor: Actor,
): Promise<AssignmentView> {
  const target = await loadProjectAssignment(projectId, assignmentId);

  if (!target.is_active) {
    return toAssignmentView(target);
  }

  const updated = await repository.updateAssignment(assignmentId, { is_active: false });

  if (!updated) {
    throw ApiError.notFound('La asignacion no existe en este proyecto');
  }

  logger.info({ assignmentId, projectId, deactivatedBy: actor.id }, 'Asignacion desactivada');

  return toAssignmentView(updated);
}

export async function getApprovalSteps(projectId: number): Promise<ApprovalWorkflowView> {
  await loadProject(projectId);

  return toWorkflowView(await repository.findApprovalSteps(projectId));
}

type ApprovalStepInput = ReplaceApprovalStepsInput['steps'][number];

function approverKey(step: repository.ApprovalStepPayload): string {
  switch (step.approverType) {
    case 'USER':
      return `USER:${step.userId}`;
    case 'ROLE':
      return `ROLE:${step.roleCode}`;
    default:
      return `CLIENT:${step.clientId}`;
  }
}

async function resolveNominatedApprover(userId: number, path: string): Promise<UserRef> {
  const approver = await repository.findUserById(userId);

  if (!approver) {
    throw ApiError.badRequest('El aprobador indicado no existe', { path });
  }

  if (!approver.is_active) {
    throw ApiError.unprocessable('El aprobador indicado esta inactivo', { path });
  }

  if (!APPROVER_ROLES.includes(approver.role?.code ?? '')) {
    throw ApiError.unprocessable(
      `Un aprobador nominado debe tener rol ${APPROVER_ROLES.join(' o ')}`,
      { path, allowedRoles: APPROVER_ROLES },
    );
  }

  return approver;
}

async function resolveClientApprover(
  clientId: number,
  companyId: number,
  path: string,
): Promise<clientsRepository.ClientRecord> {
  const client = await clientsRepository.findClientById(clientId);

  if (!client) {
    throw ApiError.badRequest('El cliente indicado no existe', { path });
  }

  if (!client.is_active) {
    throw ApiError.unprocessable('El cliente indicado esta inactivo', {
      path,
      code: 'CLIENT_INACTIVE',
    });
  }

  if (client.company_id !== companyId) {
    throw ApiError.unprocessable(
      'Un aprobador externo debe ser un cliente de la misma empresa',
      { path, code: 'CLIENT_COMPANY_MISMATCH' },
    );
  }

  if (!client.contact_email) {
    throw ApiError.unprocessable(
      'Ese cliente no tiene correo de contacto: registralo en su ficha',
      { path, code: 'CLIENT_WITHOUT_EMAIL', clientId },
    );
  }

  return client;
}

async function buildApprovalStepPayload(
  step: ApprovalStepInput,
  index: number,
  companyId: number,
): Promise<repository.ApprovalStepPayload> {
  const seq = index + 1;

  if (step.approverType === 'USER') {
    const approver = await resolveNominatedApprover(step.userId, `steps.${index}.userId`);

    return {
      seq,
      approverType: 'USER',
      userId: approver.id,
      roleCode: null,
      clientId: null,
      approverEmail: null,
      approverName: step.approverName ?? approver.full_name,
    };
  }

  if (step.approverType === 'ROLE') {
    return {
      seq,
      approverType: 'ROLE',
      userId: null,
      roleCode: step.roleCode,
      clientId: null,
      approverEmail: null,
      approverName: step.approverName ?? null,
    };
  }

  const client = await resolveClientApprover(
    step.clientId,
    companyId,
    `steps.${index}.clientId`,
  );

  return {
    seq,
    approverType: 'CLIENT_EMAIL',
    userId: null,
    roleCode: null,
    clientId: client.id,
    approverEmail: (client.contact_email as string).toLowerCase(),
    approverName: client.client_name,
  };
}

export async function replaceApprovalSteps(
  projectId: number,
  input: ReplaceApprovalStepsInput,
  actor: Actor,
): Promise<ApprovalWorkflowView> {
  const project = await loadProject(projectId);
  assertProjectOpen(project, 'su flujo de aprobacion ya no se modifica');

  const projectClient = await clientsRepository.findClientById(project.client_id);

  if (!projectClient) {
    throw ApiError.unprocessable('El proyecto no tiene un cliente valido', {
      field: 'clientId',
    });
  }

  const payload: repository.ApprovalStepPayload[] = [];
  const seen = new Map<string, number>();

  for (const [index, step] of input.steps.entries()) {
    const row = await buildApprovalStepPayload(step, index, projectClient.company_id);
    const key = approverKey(row);
    const duplicateOf = seen.get(key);

    if (duplicateOf !== undefined) {
      throw ApiError.unprocessable('Un mismo aprobador no puede ocupar dos carriles', {
        path: `steps.${index}`,
        duplicateOfStep: duplicateOf + 1,
      });
    }

    seen.set(key, index);
    payload.push(row);
  }

  if (!seen.has(`CLIENT:${projectClient.id}`)) {
    throw ApiError.unprocessable(
      `El cliente del proyecto (${projectClient.client_name}) debe ser uno de los aprobadores`,
      { code: 'PROJECT_CLIENT_LANE_REQUIRED', clientId: projectClient.id },
    );
  }

  await repository.replaceApprovalSteps(projectId, payload);

  logger.info(
    { projectId, steps: payload.length, updatedBy: actor.id },
    'Flujo de aprobacion del proyecto actualizado',
  );

  return getApprovalSteps(projectId);
}

export type CloseProjectResult = {
  project: ProjectView;
  closedAssignments: number;
  strandedTimesheets: number;
};

export async function closeProject(
  projectId: number,
  input: CloseProjectInput,
  actor: Actor,
): Promise<CloseProjectResult> {
  const project = await loadProject(projectId);
  assertProjectOpen(project, 'ya fue cerrado');

  const result = await repository.closeProject(projectId, input.effectiveDate, actor.id);
  const updated = await loadProject(projectId);

  logger.info(
    {
      projectId,
      closedBy: actor.id,
      effectiveDate: input.effectiveDate,
      closedAssignments: result.closedAssignments,
      strandedTimesheets: result.strandedTimesheets,
    },
    'Proyecto cerrado',
  );

  return {
    project: toProjectView(updated),
    closedAssignments: result.closedAssignments,
    strandedTimesheets: result.strandedTimesheets,
  };
}

export async function reopenProject(projectId: number, actor: Actor): Promise<ProjectView> {
  await loadProject(projectId);
  await repository.reopenProject(projectId);

  logger.info({ projectId, reopenedBy: actor.id }, 'Proyecto reabierto');

  return toProjectView(await loadProject(projectId));
}
