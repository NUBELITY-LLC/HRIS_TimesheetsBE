import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { MIN_APPROVAL_STEPS } from '../../utils/approvals.js';
import type { ProjectStatus } from '../../utils/projects.js';
import * as repository from './timesheets.repository.js';
import { TimesheetRpcError } from './timesheets.repository.js';
import {
  DAY_MAX_MINUTES,
  currentWeekStartISO,
  formatMinutes,
  hoursToMinutes,
  isMonday,
  isWithinWeek,
  minutesToHours,
  weekEndOf,
} from './timesheets.rules.js';
import type {
  ListTimesheetsQuery,
  SaveDraftInput,
  SummaryQuery,
} from './timesheets.schema.js';
import type { TimesheetStatus } from '../../types/database.types.js';

export type Actor = { id: number; roleCode: string };

export type AssignmentView = {
  id: number;
  startDate: string;
  endDate: string | null;
  client: { id: number; name: string };
  company: { id: number; name: string } | null;
  project: {
    id: number;
    name: string;
    code: string | null;
    endDate: string | null;
    status: ProjectStatus;
  };
};

export type ApprovalStepView = {
  seq: number;
  approverType: string;
  approverName: string | null;
  approverEmail: string | null;
  approverRoleCode: string | null;
  status: string;
  decidedAt: string | null;
  comments: string | null;
};

export type TimesheetView = {
  id: number;
  assignmentId: number;
  submissionCode: string | null;
  weekStart: string;
  weekEnd: string;
  status: TimesheetStatus;
  totalMinutes: number;
  totalHours: number;
  cycleNo: number;
  currentSeq: number | null;
  submittedAt: string | null;
  updatedAt: string;
  editable: boolean;
  client: { id: number; name: string } | null;
  project: { id: number; name: string; code: string | null } | null;
  days?: Array<{
    date: string;
    minutes: number;
    note: string | null;
    activities: Array<{ lineNo: number; minutes: number; activity: string }>;
  }>;
  approvals?: ApprovalStepView[];
};

export type SubmissionConfirmation = {
  submissionCode: string;
  submittedAt: string | null;
  totalMinutes: number;
  totalHours: number;
  cycleNo: number;
  currentStep: ApprovalStepView | null;
  steps: ApprovalStepView[];
};

export type DashboardSummary = {
  monthMinutes: number;
  monthTargetMinutes: number | null;
  pendingCount: number;
  approvedCount: number;
};

const EDITABLE_STATUSES: TimesheetStatus[] = ['DRAFT', 'REJECTED'];

function isEditable(status: TimesheetStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

function toAssignmentView(record: repository.AssignmentRecord): AssignmentView | null {
  const project = record.project;
  const client = project?.client;

  if (!project || !client) {
    logger.warn({ assignmentId: record.id }, 'Asignacion sin proyecto o cliente asociado');
    return null;
  }

  return {
    id: record.id,
    startDate: record.start_date,
    endDate: record.end_date,
    client: { id: client.id, name: client.client_name },
    company: client.company
      ? { id: client.company.id, name: client.company.trade_name }
      : null,
    project: {
      id: project.id,
      name: project.project_name,
      code: project.code,
      endDate: project.end_date,
      status: project.status,
    },
  };
}

function toApprovalView(record: repository.ApprovalRecord): ApprovalStepView {
  return {
    seq: record.seq,
    approverType: record.approver_type,
    approverName: record.approver?.full_name ?? record.approver_name,
    approverEmail: record.approver_email,
    approverRoleCode: record.approver_role_code,
    status: record.status,
    decidedAt: record.decided_at,
    comments: record.comments,
  };
}

function toTimesheetView(record: repository.TimesheetRecord): TimesheetView {
  const project = record.assignment?.project ?? null;
  const client = project?.client ?? null;
  const totalHours = Number(record.total_hours);

  return {
    id: record.id,
    assignmentId: record.assignment_id,
    submissionCode: record.submission_code,
    weekStart: record.week_start_date,
    weekEnd: record.week_end_date,
    status: record.status,
    totalMinutes: hoursToMinutes(totalHours),
    totalHours,
    cycleNo: record.cycle_no,
    currentSeq: record.current_seq,
    submittedAt: record.submitted_at,
    updatedAt: record.updated_at,
    editable: isEditable(record.status),
    client: client ? { id: client.id, name: client.client_name } : null,
    project: project ? { id: project.id, name: project.project_name, code: project.code } : null,
  };
}

async function withDetail(record: repository.TimesheetRecord): Promise<TimesheetView> {
  const [days, approvals] = await Promise.all([
    repository.findDays(record.id),
    repository.findApprovals(record.id, record.cycle_no),
  ]);

  return {
    ...toTimesheetView(record),
    days: days.map((day) => ({
      date: day.work_date,
      minutes: hoursToMinutes(Number(day.total_hours)),
      note: day.note,
      activities: day.activities
        .slice()
        .sort((a, b) => a.line_no - b.line_no)
        .map((activity) => ({
          lineNo: activity.line_no,
          minutes: hoursToMinutes(Number(activity.hours)),
          activity: activity.activity,
        })),
    })),
    approvals: approvals.map(toApprovalView),
  };
}

function assertWeekStart(weekStart: string): void {
  if (!isMonday(weekStart)) {
    throw ApiError.badRequest('La semana debe iniciar en lunes', {
      field: 'weekStart',
      received: weekStart,
    });
  }
}

async function loadOwnAssignment(
  assignmentId: number,
  actor: Actor,
): Promise<repository.AssignmentRecord> {
  const assignment = await repository.findAssignmentById(assignmentId);

  if (!assignment || assignment.consultant_id !== actor.id) {
    throw ApiError.notFound('La asignacion no existe o no te pertenece');
  }

  if (!assignment.is_active) {
    throw ApiError.unprocessable('La asignacion al proyecto ya no esta activa');
  }

  return assignment;
}

function projectCaptureEnd(assignment: repository.AssignmentRecord): string | null {
  return assignment.project?.end_date ?? null;
}

function assertWeekInAssignment(
  assignment: repository.AssignmentRecord,
  weekStart: string,
): void {
  const weekEnd = weekEndOf(weekStart);

  if (weekEnd < assignment.start_date) {
    throw ApiError.unprocessable('La semana es anterior al inicio de tu asignacion', {
      assignmentStartDate: assignment.start_date,
    });
  }

  if (assignment.end_date && weekStart > assignment.end_date) {
    throw ApiError.unprocessable('La semana es posterior al fin de tu asignacion', {
      assignmentEndDate: assignment.end_date,
    });
  }

  const projectEnd = projectCaptureEnd(assignment);

  if (projectEnd && weekStart > projectEnd) {
    throw ApiError.unprocessable('La semana es posterior al cierre del proyecto', {
      code: 'PROJECT_CLOSED',
      projectEndDate: projectEnd,
    });
  }
}

function assertTimesheetOwnership(record: repository.TimesheetRecord, actor: Actor): void {
  if (record.assignment?.consultant_id !== actor.id) {
    throw ApiError.notFound('El timesheet no existe o no te pertenece');
  }
}

export async function listAssignments(actor: Actor): Promise<AssignmentView[]> {
  const records = await repository.findAssignmentsByConsultant(actor.id);

  return records
    .map(toAssignmentView)
    .filter((assignment): assignment is AssignmentView => assignment !== null);
}

export async function getWeek(
  assignmentId: number,
  weekStart: string,
  actor: Actor,
): Promise<TimesheetView | null> {
  assertWeekStart(weekStart);
  await loadOwnAssignment(assignmentId, actor);

  const record = await repository.findTimesheetByWeek(assignmentId, weekStart);

  return record ? withDetail(record) : null;
}

export async function getTimesheet(id: number, actor: Actor): Promise<TimesheetView> {
  const record = await repository.findTimesheetById(id);

  if (!record) {
    throw ApiError.notFound('El timesheet no existe');
  }

  assertTimesheetOwnership(record, actor);

  return withDetail(record);
}

function buildDraftPayload(
  input: SaveDraftInput,
  assignment: repository.AssignmentRecord,
): repository.DraftDayPayload[] {
  const issues: Array<{ path: string; message: string }> = [];
  const days: repository.DraftDayPayload[] = [];
  const projectEnd = projectCaptureEnd(assignment);

  input.days.forEach((day, index) => {
    if (!isWithinWeek(day.date, input.weekStart)) {
      issues.push({
        path: `days.${index}.date`,
        message: `El dia ${day.date} no pertenece a la semana del ${input.weekStart}`,
      });
      return;
    }

    if (day.date < assignment.start_date) {
      issues.push({
        path: `days.${index}.date`,
        message: `El dia ${day.date} es anterior al inicio de tu asignacion`,
      });
      return;
    }

    if (assignment.end_date && day.date > assignment.end_date) {
      issues.push({
        path: `days.${index}.date`,
        message: `El dia ${day.date} es posterior al fin de tu asignacion`,
      });
      return;
    }

    if (projectEnd && day.date > projectEnd) {
      issues.push({
        path: `days.${index}.date`,
        message: `El dia ${day.date} es posterior al cierre del proyecto`,
      });
      return;
    }

    const activities = day.activities;
    const dayMinutes = activities.reduce((total, activity) => total + activity.minutes, 0);

    if (dayMinutes > DAY_MAX_MINUTES) {
      issues.push({
        path: `days.${index}.activities`,
        message: `El ${day.date} supera el maximo de ${formatMinutes(DAY_MAX_MINUTES)} por dia`,
      });
      return;
    }

    if (!activities.length) return;

    days.push({
      workDate: day.date,
      note: day.note?.trim() || null,
      activities: activities.map((activity) => ({
        hours: minutesToHours(activity.minutes),
        activity: activity.activity,
      })),
    });
  });

  if (issues.length) {
    throw ApiError.unprocessable('El timesheet tiene dias invalidos', issues);
  }

  return days;
}

function translateRpcFailure(error: TimesheetRpcError): ApiError {
  switch (error.failure.code) {
    case 'TIMESHEET_LOCKED':
      return new ApiError(
        409,
        'El timesheet ya fue enviado y no admite cambios',
        'TIMESHEET_LOCKED',
        { status: error.failure.detail },
      );
    case 'TIMESHEET_NOT_SUBMITTABLE':
      return new ApiError(
        409,
        'Este timesheet ya esta en el flujo de aprobacion',
        'TIMESHEET_NOT_SUBMITTABLE',
        { status: error.failure.detail },
      );
    case 'TIMESHEET_EMPTY':
      return new ApiError(
        422,
        'Registra al menos una actividad antes de enviar',
        'TIMESHEET_EMPTY',
      );
    case 'NO_APPROVAL_WORKFLOW':
      return new ApiError(
        422,
        'El proyecto no tiene un flujo de aprobacion configurado; contacta a tu manager',
        'NO_APPROVAL_WORKFLOW',
      );
    case 'INCOMPLETE_APPROVAL_WORKFLOW':
      return new ApiError(
        422,
        `El proyecto necesita al menos ${MIN_APPROVAL_STEPS} aprobadores; contacta a tu manager`,
        'INCOMPLETE_APPROVAL_WORKFLOW',
        { steps: Number(error.failure.detail), minApprovers: MIN_APPROVAL_STEPS },
      );
    case 'TIMESHEET_NOT_FOUND':
      return ApiError.notFound('El timesheet no existe');
    case 'INVALID_TIMESHEET_DATA':
      return ApiError.unprocessable(
        'Alguna actividad no cumple las reglas de captura (bloques de 15 minutos, 15 min a 8 h)',
      );
    default:
      logger.error({ failure: error.failure }, 'Fallo no mapeado de la funcion de timesheets');
      return ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
  }
}

async function runRpc<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TimesheetRpcError) {
      throw translateRpcFailure(error);
    }
    throw error;
  }
}

export async function saveDraft(input: SaveDraftInput, actor: Actor): Promise<TimesheetView> {
  assertWeekStart(input.weekStart);

  const assignment = await loadOwnAssignment(input.assignmentId, actor);
  assertWeekInAssignment(assignment, input.weekStart);

  const days = buildDraftPayload(input, assignment);

  const timesheetId = await runRpc(() =>
    repository.saveDraft({
      assignmentId: input.assignmentId,
      weekStart: input.weekStart,
      actorId: actor.id,
      actorRoleCode: actor.roleCode,
      days,
    }),
  );

  logger.info(
    { timesheetId, actorId: actor.id, weekStart: input.weekStart, days: days.length },
    'Borrador de timesheet guardado',
  );

  return getTimesheet(timesheetId, actor);
}

async function assertActivitiesDescribed(timesheetId: number): Promise<void> {
  const days = await repository.findDays(timesheetId);
  const issues: Array<{ path: string; message: string }> = [];

  for (const day of days) {
    for (const activity of day.activities) {
      if (activity.activity.trim().length) continue;

      issues.push({
        path: `days.${day.work_date}.activities.${activity.line_no}.activity`,
        message: `El dia ${day.work_date} tiene una tarea sin descripcion`,
      });
    }
  }

  if (issues.length) {
    throw ApiError.unprocessable('Describe todas las tareas antes de enviar', issues);
  }
}

export async function submitTimesheet(
  id: number,
  actor: Actor,
): Promise<{ timesheet: TimesheetView; confirmation: SubmissionConfirmation }> {
  const record = await repository.findTimesheetById(id);

  if (!record) {
    throw ApiError.notFound('El timesheet no existe');
  }

  assertTimesheetOwnership(record, actor);

  if (!isEditable(record.status)) {
    throw new ApiError(
      409,
      'Este timesheet ya esta en el flujo de aprobacion',
      'TIMESHEET_NOT_SUBMITTABLE',
      { status: record.status },
    );
  }

  const assignment = record.assignment;
  if (!assignment?.project) {
    throw ApiError.internal('El timesheet no tiene un proyecto asociado');
  }

  if (!assignment.is_active) {
    throw ApiError.unprocessable('La asignacion al proyecto ya no esta activa');
  }

  if (record.week_start_date > currentWeekStartISO()) {
    throw new ApiError(422, 'Todavia no puedes enviar una semana futura', 'WEEK_NOT_STARTED', {
      weekStart: record.week_start_date,
    });
  }

  if (Number(record.total_hours) <= 0) {
    throw new ApiError(422, 'Registra al menos una actividad antes de enviar', 'TIMESHEET_EMPTY');
  }

  await assertActivitiesDescribed(record.id);

  const configuredSteps = await repository.countActiveApprovalSteps(assignment.project.id);

  if (!configuredSteps) {
    throw new ApiError(
      422,
      'El proyecto no tiene un flujo de aprobacion configurado; contacta a tu manager',
      'NO_APPROVAL_WORKFLOW',
    );
  }

  if (configuredSteps < MIN_APPROVAL_STEPS) {
    throw new ApiError(
      422,
      `El proyecto necesita al menos ${MIN_APPROVAL_STEPS} aprobadores; contacta a tu manager`,
      'INCOMPLETE_APPROVAL_WORKFLOW',
      { steps: configuredSteps, minApprovers: MIN_APPROVAL_STEPS },
    );
  }

  await runRpc(() =>
    repository.submit({ timesheetId: id, actorId: actor.id, actorRoleCode: actor.roleCode }),
  );

  const submitted = await repository.findTimesheetById(id);

  if (!submitted?.submission_code) {
    throw ApiError.internal('El envio no genero un codigo de confirmacion');
  }

  const approvals = await repository.findApprovals(id, submitted.cycle_no);
  const steps = approvals.map(toApprovalView);

  logger.info(
    {
      timesheetId: id,
      actorId: actor.id,
      submissionCode: submitted.submission_code,
      cycleNo: submitted.cycle_no,
      steps: steps.length,
    },
    'Timesheet enviado a aprobacion',
  );

  return {
    timesheet: toTimesheetView(submitted),
    confirmation: {
      submissionCode: submitted.submission_code,
      submittedAt: submitted.submitted_at,
      totalMinutes: hoursToMinutes(Number(submitted.total_hours)),
      totalHours: Number(submitted.total_hours),
      cycleNo: submitted.cycle_no,
      currentStep: steps.find((step) => step.seq === submitted.current_seq) ?? null,
      steps,
    },
  };
}

export async function discardDraft(id: number, actor: Actor): Promise<void> {
  const record = await repository.findTimesheetById(id);

  if (!record) {
    throw ApiError.notFound('El timesheet no existe');
  }

  assertTimesheetOwnership(record, actor);

  if (record.status !== 'DRAFT') {
    throw ApiError.unprocessable('Solo se descartan timesheets en borrador', {
      status: record.status,
    });
  }

  await repository.deleteTimesheet(id);

  logger.info(
    { timesheetId: id, actorId: actor.id, weekStart: record.week_start_date },
    'Borrador de timesheet descartado',
  );
}

export async function listMyTimesheets(
  query: ListTimesheetsQuery,
  actor: Actor,
): Promise<{ timesheets: TimesheetView[]; total: number }> {
  const { rows, total } = await repository.findTimesheetsByConsultant({
    consultantId: actor.id,
    page: query.page,
    pageSize: query.pageSize,
    status: query.status === 'all' ? undefined : query.status,
  });

  const approvals = await repository.findApprovalsForTimesheets(rows.map((row) => row.id));

  return {
    timesheets: rows.map((row) => ({
      ...toTimesheetView(row),
      approvals: approvals
        .filter((approval) => approval.timesheet_id === row.id && approval.cycle_no === row.cycle_no)
        .map(toApprovalView),
    })),
    total,
  };
}

function monthRange(month: string | undefined): { from: string; to: string } {
  const reference = month ? `${month}-01` : `${new Date().toISOString().slice(0, 7)}-01`;
  const start = new Date(`${reference}T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));

  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export async function getSummary(query: SummaryQuery, actor: Actor): Promise<DashboardSummary> {
  const { from, to } = monthRange(query.month);

  const [hours, pendingCount, approvedCount] = await Promise.all([
    repository.sumHoursInRange(actor.id, from, to),
    repository.countOpenTimesheets(actor.id),
    repository.countSettledTimesheets(actor.id),
  ]);

  return {
    monthMinutes: hoursToMinutes(hours),
    monthTargetMinutes: null,
    pendingCount,
    approvedCount,
  };
}
