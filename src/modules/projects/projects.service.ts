import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { APPROVER_ROLES, ASSIGNABLE_ROLES } from '../../utils/roles.js';
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

export type ApprovalStepView = {
  id: number;
  seq: number;
  approverType: string;
  approver: PersonView | null;
  roleCode: string | null;
  roleName: string | null;
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
  };
}

async function loadProject(id: number): Promise<ProjectRecord> {
  const record = await repository.findProjectById(id);

  if (!record) {
    throw ApiError.notFound('El proyecto no existe');
  }

  return record;
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

  if (!APPROVER_ROLES.includes(manager.role?.code ?? '')) {
    throw ApiError.unprocessable(
      `El manager de un proyecto debe tener rol ${APPROVER_ROLES.join(' o ')}`,
      { field: 'managerId', allowedRoles: APPROVER_ROLES },
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
    input.managerId === undefined && APPROVER_ROLES.includes(actor.roleCode)
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
  if (input.endDate !== undefined) patch.end_date = input.endDate;

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

export async function getApprovalSteps(projectId: number): Promise<ApprovalStepView[]> {
  await loadProject(projectId);

  const steps = await repository.findApprovalSteps(projectId);

  return steps.map(toApprovalStepView);
}

export async function replaceApprovalSteps(
  projectId: number,
  input: ReplaceApprovalStepsInput,
  actor: Actor,
): Promise<ApprovalStepView[]> {
  const project = await loadProject(projectId);

  if (input.steps.some((step) => step.approverType === 'CLIENT_EMAIL')) {
    const client = await clientsRepository.findClientById(project.client_id);

    if (!client?.contact_email) {
      throw ApiError.unprocessable(
        'El cliente no tiene correo de contacto; registralo antes de usar un paso CLIENT_EMAIL',
        { field: 'steps' },
      );
    }
  }

  for (const [index, step] of input.steps.entries()) {
    if (step.approverType !== 'USER' || step.userId == null) continue;

    const approver = await repository.findUserById(step.userId);

    if (!approver) {
      throw ApiError.badRequest('El aprobador indicado no existe', { path: `steps.${index}.userId` });
    }

    if (!approver.is_active) {
      throw ApiError.unprocessable('El aprobador indicado esta inactivo', {
        path: `steps.${index}.userId`,
      });
    }

    if (!APPROVER_ROLES.includes(approver.role?.code ?? '')) {
      throw ApiError.unprocessable(
        `Un aprobador nominado debe tener rol ${APPROVER_ROLES.join(' o ')}`,
        { path: `steps.${index}.userId`, allowedRoles: APPROVER_ROLES },
      );
    }
  }

  await repository.replaceApprovalSteps(
    projectId,
    input.steps.map((step, index) => ({
      seq: index + 1,
      approverType: step.approverType,
      userId: step.userId ?? null,
      roleCode: step.roleCode ?? null,
    })),
  );

  logger.info(
    { projectId, steps: input.steps.length, updatedBy: actor.id },
    'Flujo de aprobacion del proyecto actualizado',
  );

  return getApprovalSteps(projectId);
}
