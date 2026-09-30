import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { MAX_APPROVAL_STEPS, MIN_APPROVAL_STEPS } from '../../utils/approvals.js';
import { PERMISSION_TIMESHEETS_APPROVE } from '../../utils/permissions.js';
import { ASSIGNABLE_ROLES, PROJECT_MANAGER_ROLES } from '../../utils/roles.js';
import { PROJECT_STATUS_CLOSED, type ProjectStatus } from '../../utils/projects.js';
import * as clientsRepository from '../clients/clients.repository.js';
import { ratePeriodOf, toPayTermsView, type PayTermsView } from '../payroll/pay.service.js';
import * as payRepository from '../payroll/pay.repository.js';
import {
  DEFAULT_CURRENCY,
  DEFAULT_RATE_PERIOD,
  type RatePeriod,
} from '../../utils/assignments.js';
import { queueNotificationEmails } from '../notifications/notifications.emails.js';
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
  CreateRateChangeInput,
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
  ratePeriod: RatePeriod;
  currency: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  assignmentCode: string | null;
  payTerms: PayTermsView;
  rateChanges: RateChangeView[];
  consultant: PersonView | null;
};

export type RateChangeView = {
  id: number;
  effectiveFrom: string;
  payRate: number;
  ratePeriod: RatePeriod;
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
    ratePeriod: ratePeriodOf(record.rate_period),
    currency: record.currency,
    startDate: record.start_date,
    endDate: record.end_date,
    isActive: record.is_active,
    assignmentCode: record.assignment_code,
    payTerms: toPayTermsView(record),
    rateChanges: (record.rate_changes ?? [])
      .map(toRateChangeView)
      .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom)),
    consultant: toPersonView(record.consultant),
  };
}

export function toRateChangeView(record: payRepository.RateChangeRecord): RateChangeView {
  return {
    id: record.id,
    effectiveFrom: record.effective_from,
    payRate: Number(record.pay_rate),
    ratePeriod: ratePeriodOf(record.rate_period),
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
    throw ApiError.badRequest('El colaborador indicado no existe', { field: 'consultantId' });
  }

  if (!consultant.is_active) {
    throw ApiError.unprocessable('El colaborador esta inactivo', { field: 'consultantId' });
  }

  if (!ASSIGNABLE_ROLES.includes(consultant.role?.code ?? '')) {
    throw ApiError.unprocessable(
      `Solo se asignan colaboradores con rol ${ASSIGNABLE_ROLES.join(' o ')}`,
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
    throw new ApiError(422, 'La asignacion inicia antes que el proyecto', 'ASSIGNMENT_BEFORE_PROJECT', {
      field: 'startDate',
      projectStartDate: project.start_date,
    });
  }

  if (project.end_date && endDate && endDate > project.end_date) {
    throw new ApiError(422, 'La asignacion termina despues que el proyecto', 'ASSIGNMENT_AFTER_PROJECT', {
      field: 'endDate',
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

  const steps = await repository.findApprovalSteps(projectId);
  const activeSteps = steps.filter((step) => step.is_active).length;

  if (activeSteps < MIN_APPROVAL_STEPS) {
    throw new ApiError(
      422,
      `Configura el flujo de aprobacion del proyecto (minimo ${MIN_APPROVAL_STEPS} aprobadores) antes de asignar colaboradores`,
      'INCOMPLETE_APPROVAL_WORKFLOW',
      { steps: activeSteps, minApprovers: MIN_APPROVAL_STEPS },
    );
  }

  await resolveConsultant(input.consultantId);

  const endDate = input.endDate ?? project.end_date ?? null;
  assertWithinProject(project, input.startDate, endDate);

  const existing = await repository.findAssignmentsByProject(projectId);
  const overlapping = existing.find(
    (assignment) =>
      assignment.consultant_id === input.consultantId &&
      assignment.is_active &&
      (assignment.end_date === null || assignment.end_date >= input.startDate) &&
      (endDate === null || endDate >= assignment.start_date),
  );

  if (overlapping) {
    throw ApiError.conflict('Ese colaborador ya tiene una asignacion activa que traslapa esas fechas');
  }

  const created = await repository.insertAssignment({
    project_id: projectId,
    consultant_id: input.consultantId,
    pay_rate: input.payRate,
    currency: input.currency ?? DEFAULT_CURRENCY,
    rate_period: input.ratePeriod ?? DEFAULT_RATE_PERIOD,
    ...(input.contractType ? { contract_type: input.contractType } : {}),
    start_date: input.startDate,
    end_date: endDate,
    is_active: true,
    assignment_code: input.assignmentCode ?? null,
  });

  queueNotificationEmails({ userId: input.consultantId });

  logger.info(
    { assignmentId: created.id, projectId, consultantId: input.consultantId, createdBy: actor.id },
    'Colaborador asignado al proyecto',
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
  if (input.ratePeriod !== undefined) patch.rate_period = input.ratePeriod;
  if (input.contractType !== undefined) patch.contract_type = input.contractType;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.assignmentCode !== undefined) patch.assignment_code = input.assignmentCode ?? null;

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

  if (!(await repository.userHasPermission(approver.id, PERMISSION_TIMESHEETS_APPROVE))) {
    throw ApiError.unprocessable('El aprobador indicado no tiene permiso para aprobar horas', {
      path,
      code: 'APPROVER_WITHOUT_PERMISSION',
    });
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
): Promise<{ row: repository.ApprovalStepPayload; approverUserId: number | null }> {
  const seq = index + 1;

  if (step.approverType === 'USER') {
    const approver = await resolveNominatedApprover(step.userId, `steps.${index}.userId`);

    return {
      row: {
        seq,
        approverType: 'USER',
        userId: approver.id,
        roleCode: null,
        clientId: null,
        approverEmail: null,
        approverName: step.approverName ?? approver.full_name,
      },
      approverUserId: approver.id,
    };
  }

  if (step.approverType === 'ROLE') {
    return {
      row: {
        seq,
        approverType: 'ROLE',
        userId: null,
        roleCode: step.roleCode,
        clientId: null,
        approverEmail: null,
        approverName: step.approverName ?? null,
      },
      approverUserId: null,
    };
  }

  const client = await resolveClientApprover(
    step.clientId,
    companyId,
    `steps.${index}.clientId`,
  );

  return {
    row: {
      seq,
      approverType: 'CLIENT_EMAIL',
      userId: null,
      roleCode: null,
      clientId: client.id,
      approverEmail: (client.contact_email as string).toLowerCase(),
      approverName: client.client_name,
    },
    approverUserId: client.user_id,
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
  const approverUserIds = new Set<number>();

  for (const [index, step] of input.steps.entries()) {
    const { row, approverUserId } = await buildApprovalStepPayload(
      step,
      index,
      projectClient.company_id,
    );
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
    if (approverUserId !== null) approverUserIds.add(approverUserId);
  }

  if (!seen.has(`CLIENT:${projectClient.id}`)) {
    throw ApiError.unprocessable(
      `El cliente del proyecto (${projectClient.client_name}) debe ser uno de los aprobadores`,
      { code: 'PROJECT_CLIENT_LANE_REQUIRED', clientId: projectClient.id },
    );
  }

  if (project.manager_id !== null && !approverUserIds.has(project.manager_id)) {
    throw ApiError.unprocessable(
      `El manager del proyecto (${project.manager?.full_name ?? project.manager_id}) debe ser uno de los aprobadores`,
      { code: 'PROJECT_MANAGER_LANE_REQUIRED', managerId: project.manager_id },
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

export async function addRateChange(
  projectId: number,
  assignmentId: number,
  input: CreateRateChangeInput,
  actor: Actor,
): Promise<AssignmentView> {
  const project = await loadProject(projectId);
  assertProjectOpen(project, 'sus asignaciones ya no se editan');
  const assignment = await loadProjectAssignment(projectId, assignmentId);

  if (input.effectiveFrom <= assignment.start_date) {
    throw new ApiError(
      422,
      'El cambio de tarifa debe iniciar despues del inicio de la asignacion',
      'RATE_CHANGE_BEFORE_ASSIGNMENT',
      { field: 'effectiveFrom', assignmentStartDate: assignment.start_date },
    );
  }

  if (assignment.end_date && input.effectiveFrom > assignment.end_date) {
    throw new ApiError(
      422,
      'El cambio de tarifa no puede iniciar despues del fin de la asignacion',
      'RATE_CHANGE_AFTER_ASSIGNMENT',
      { field: 'effectiveFrom', assignmentEndDate: assignment.end_date },
    );
  }

  await payRepository.insertRateChange({
    assignment_id: assignmentId,
    effective_from: input.effectiveFrom,
    pay_rate: input.payRate,
    rate_period: input.ratePeriod ?? assignment.rate_period,
    created_by: actor.id,
  });

  logger.info(
    { projectId, assignmentId, effectiveFrom: input.effectiveFrom, createdBy: actor.id },
    'Cambio de tarifa registrado en la asignacion',
  );

  return toAssignmentView(await loadProjectAssignment(projectId, assignmentId));
}

export async function removeRateChange(
  projectId: number,
  assignmentId: number,
  rateId: number,
  actor: Actor,
): Promise<AssignmentView> {
  const project = await loadProject(projectId);
  assertProjectOpen(project, 'sus asignaciones ya no se editan');
  await loadProjectAssignment(projectId, assignmentId);

  const removed = await payRepository.deleteRateChange(rateId, assignmentId);

  if (!removed) {
    throw ApiError.notFound('El cambio de tarifa no existe en esta asignacion');
  }

  logger.info({ projectId, assignmentId, rateId, removedBy: actor.id }, 'Cambio de tarifa eliminado');

  return toAssignmentView(await loadProjectAssignment(projectId, assignmentId));
}
