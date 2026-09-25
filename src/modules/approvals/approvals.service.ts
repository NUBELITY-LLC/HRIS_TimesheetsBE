import { ApiError } from '../../utils/ApiError.js';
import { RpcError } from '../../utils/rpc.js';
import { logger } from '../../config/logger.js';
import { ROLE_EXTERNAL_MANAGER, ROLE_FINANCE } from '../../utils/roles.js';
import { queueNotificationEmails } from '../notifications/notifications.emails.js';
import { deliverApprovalRequests } from '../notifications/notifications.mailer.js';
import { payForTimesheets, toPaySummary, type PaySummaryView } from '../payroll/pay.service.js';
import type { PayBreakdown } from '../payroll/pay.rules.js';
import { hoursToMinutes } from '../timesheets/timesheets.rules.js';
import { findDays, findApprovals } from '../timesheets/timesheets.repository.js';
import * as repository from './approvals.repository.js';
import {
  assertEvidenceAllowed,
  evidencePath,
  removeEvidence,
  signEvidence,
  uploadEvidence,
  type UploadedEvidence,
} from './approvals.storage.js';
import type { ListPendingQuery } from './approvals.schema.js';
import type { ApproverType, TimesheetStatus } from '../../types/database.types.js';

export type Actor = { id: number; roleCode: string };

export type PendingApprovalView = {
  approvalId: number;
  timesheetId: number;
  seq: number;
  cycleNo: number;
  approverType: ApproverType;
  approverRoleCode: string | null;
  approverEmail: string | null;
  approverName: string | null;
  onBehalf: boolean;
  submissionCode: string | null;
  status: TimesheetStatus;
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  totalHours: number;
  payRate: number | null;
  hourlyRate: number | null;
  currency: string;
  amount: number | null;
  pay: PaySummaryView | null;
  submittedAt: string | null;
  assignmentCode: string | null;
  consultant: { id: number; name: string };
  project: { id: number; name: string; code: string | null };
  client: { id: number; name: string };
  company: { id: number; name: string } | null;
};

function canSeeCosts(actor: Actor): boolean {
  return actor.roleCode !== ROLE_EXTERNAL_MANAGER;
}

async function payFor(ids: number[], actor: Actor): Promise<Map<number, PayBreakdown>> {
  return canSeeCosts(actor) ? payForTimesheets(ids) : new Map();
}

function costsOf(pay: PayBreakdown | undefined, payRate: number, actor: Actor) {
  if (!canSeeCosts(actor)) {
    return { payRate: null, hourlyRate: null, amount: null, pay: null };
  }

  return {
    payRate,
    hourlyRate: pay?.hourlyRate ?? 0,
    amount: pay?.amount ?? 0,
    pay: pay ? toPaySummary(pay) : null,
  };
}

function toPendingView(
  record: repository.PendingApprovalRecord,
  pay: PayBreakdown | undefined,
  actor: Actor,
): PendingApprovalView {
  const totalHours = Number(record.total_hours);

  return {
    approvalId: record.id,
    timesheetId: record.timesheet_id,
    seq: record.seq,
    cycleNo: record.cycle_no,
    approverType: record.approver_type,
    approverRoleCode: record.approver_role_code,
    approverEmail: record.approver_email,
    approverName: record.approver_name,
    onBehalf: record.on_behalf,
    submissionCode: record.submission_code,
    status: record.timesheet_status,
    weekStart: record.week_start_date,
    weekEnd: record.week_end_date,
    totalMinutes: hoursToMinutes(totalHours),
    totalHours,
    ...costsOf(pay, Number(record.pay_rate), actor),
    currency: record.currency,
    submittedAt: record.submitted_at,
    assignmentCode: record.assignment_code,
    consultant: { id: record.consultant_id, name: record.consultant_name },
    project: { id: record.project_id, name: record.project_name, code: record.project_code },
    client: { id: record.client_id, name: record.client_name },
    company:
      record.company_id && record.company_name
        ? { id: record.company_id, name: record.company_name }
        : null,
  };
}

export async function listPending(
  query: ListPendingQuery,
  actor: Actor,
): Promise<{ approvals: PendingApprovalView[]; total: number }> {
  const { rows, total } = await repository.findPending({
    userId: actor.id,
    roleCode: actor.roleCode,
    page: query.page,
    pageSize: query.pageSize,
  });

  const pay = await payFor(
    rows.map((row) => row.timesheet_id),
    actor,
  );

  return {
    approvals: rows.map((row) => toPendingView(row, pay.get(row.timesheet_id), actor)),
    total,
  };
}

export type ApprovalStepSummary = {
  seq: number;
  approverType: ApproverType;
  approverName: string | null;
  approverEmail: string | null;
  approverRoleCode: string | null;
};

export type ExternalApprovalView = {
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
  attachment: ApprovalAttachmentView | null;
  nextStep: ApprovalStepSummary | null;
  notifications: { inApp: number; email: number; emailDelivered: number };
};

function translateRpcFailure(error: RpcError): ApiError {
  switch (error.failure.code) {
    case 'APPROVAL_STEP_NOT_FOUND':
      return ApiError.notFound('La tarea de aprobacion no existe');
    case 'TIMESHEET_NOT_FOUND':
      return ApiError.notFound('El timesheet no existe');
    case 'NOT_PROJECT_MANAGER':
      return ApiError.forbidden(
        'Solo el manager del proyecto puede aprobar en nombre del gerente externo',
      );
    case 'NOT_STEP_APPROVER':
      return new ApiError(
        403,
        'No eres el aprobador del paso vigente de este timesheet',
        'NOT_STEP_APPROVER',
      );
    case 'APPROVAL_STEP_EXTERNAL':
      return new ApiError(
        422,
        'Este paso corresponde a un aprobador externo; usa la aprobacion en su nombre',
        'APPROVAL_STEP_EXTERNAL',
        { approverType: error.failure.detail },
      );
    case 'NO_PREVIOUS_STEP':
      return new ApiError(
        422,
        'Este es el primer paso del flujo; devuelve el timesheet al consultor',
        'NO_PREVIOUS_STEP',
        { seq: Number(error.failure.detail) },
      );
    case 'COMMENTS_REQUIRED':
      return new ApiError(422, 'Explica por que rechazas el timesheet', 'COMMENTS_REQUIRED', {
        field: 'comments',
      });
    case 'APPROVAL_STEP_NOT_EXTERNAL':
      return new ApiError(
        422,
        'Este paso no corresponde a un aprobador externo',
        'APPROVAL_STEP_NOT_EXTERNAL',
        { approverType: error.failure.detail },
      );
    case 'APPROVAL_STEP_NOT_CURRENT':
      return new ApiError(
        409,
        'Este paso ya no es el vigente del timesheet',
        'APPROVAL_STEP_NOT_CURRENT',
        { currentSeq: Number(error.failure.detail) },
      );
    case 'APPROVAL_STEP_RESOLVED':
      return new ApiError(409, 'Esta tarea ya fue resuelta', 'APPROVAL_STEP_RESOLVED', {
        status: error.failure.detail,
      });
    case 'TIMESHEET_NOT_IN_REVIEW':
      return new ApiError(409, 'El timesheet no esta en revision', 'TIMESHEET_NOT_IN_REVIEW', {
        status: error.failure.detail,
      });
    case 'NO_APPROVER_AVAILABLE':
      return new ApiError(
        422,
        'El siguiente aprobador del proyecto no tiene a quien notificar; revisa la configuracion',
        'NO_APPROVER_AVAILABLE',
        { seq: Number(error.failure.detail) },
      );
    default:
      logger.error({ failure: error.failure }, 'Fallo no mapeado de la funcion de aprobaciones');
      return new ApiError(
        500,
        `No fue posible completar la operacion (${error.failure.code})`,
        'UNMAPPED_APPROVAL_FAILURE',
        { failure: error.failure.code, detail: error.failure.detail },
      );
  }
}

export type ApprovalDecisionView = {
  timesheetId: number;
  timesheetStatus: TimesheetStatus;
  submissionCode: string | null;
  cycleNo: number;
  currentSeq: number | null;
  outcome: repository.DecisionOutcome;
  decided: {
    approvalId: number;
    seq: number;
    status: string;
    approverType: ApproverType;
    resolvedVia: string;
  };
  attachment: ApprovalAttachmentView | null;
  nextStep: ApprovalStepSummary | null;
  notifications: { inApp: number; email: number; emailDelivered: number };
};

export async function decideStep(
  approvalId: number,
  decision: repository.InternalDecision,
  comments: string | null,
  actor: Actor,
  evidence: UploadedEvidence | null = null,
): Promise<ApprovalDecisionView> {
  let result: repository.InternalDecisionResult;

  if (evidence) assertEvidenceAllowed(evidence);

  try {
    result = await repository.decideInternalStep({
      approvalId,
      actorId: actor.id,
      actorRoleCode: actor.roleCode,
      decision,
      comments,
    });
  } catch (error) {
    if (error instanceof RpcError) {
      throw translateRpcFailure(error);
    }
    throw error;
  }

  const attachment = evidence
    ? await attachEvidence({
        approvalId,
        timesheetId: result.timesheetId,
        actorId: actor.id,
        file: evidence,
      })
    : null;

  const delivery = await deliverApprovalRequests(result.emailRequests);
  queueNotificationEmails({ timesheetId: result.timesheetId });

  logger.info(
    {
      timesheetId: result.timesheetId,
      approvalId: result.decided.approvalId,
      attachmentId: attachment?.id ?? null,
      actorId: actor.id,
      decision,
      outcome: result.outcome,
      timesheetStatus: result.timesheetStatus,
      currentSeq: result.currentSeq,
      inAppNotifications: result.notifications.inApp,
      emailsDelivered: delivery.delivered,
      emailsFailed: delivery.failed,
    },
    'Paso de aprobacion resuelto por un aprobador interno',
  );

  return {
    timesheetId: result.timesheetId,
    timesheetStatus: result.timesheetStatus,
    submissionCode: result.submissionCode,
    cycleNo: result.cycleNo,
    currentSeq: result.currentSeq,
    outcome: result.outcome,
    decided: result.decided,
    attachment,
    nextStep: result.route
      ? {
          seq: result.route.seq,
          approverType: result.route.approverType,
          approverName: result.route.approverName,
          approverEmail: result.route.approverEmail,
          approverRoleCode: result.route.approverRoleCode,
        }
      : null,
    notifications: {
      inApp: result.notifications.inApp,
      email: result.notifications.email,
      emailDelivered: delivery.delivered,
    },
  };
}

export async function approveOnBehalf(
  approvalId: number,
  comments: string | null,
  actor: Actor,
  evidence: UploadedEvidence | null = null,
): Promise<ExternalApprovalView> {
  let result: repository.ExternalApprovalResult;

  if (evidence) assertEvidenceAllowed(evidence);

  try {
    result = await repository.approveExternalStep({
      approvalId,
      actorId: actor.id,
      actorRoleCode: actor.roleCode,
      comments,
    });
  } catch (error) {
    if (error instanceof RpcError) {
      throw translateRpcFailure(error);
    }
    throw error;
  }

  const attachment = evidence
    ? await attachEvidence({
        approvalId,
        timesheetId: result.timesheetId,
        actorId: actor.id,
        file: evidence,
      })
    : null;

  const delivery = await deliverApprovalRequests(result.emailRequests);
  queueNotificationEmails({ timesheetId: result.timesheetId });

  logger.info(
    {
      timesheetId: result.timesheetId,
      approvalId: result.approved.approvalId,
      attachmentId: attachment?.id ?? null,
      actorId: actor.id,
      onBehalfOf: result.approved.approverEmail,
      completed: result.completed,
      nextSeq: result.currentSeq,
      inAppNotifications: result.notifications.inApp,
      emailsDelivered: delivery.delivered,
      emailsFailed: delivery.failed,
    },
    'Paso de aprobador externo resuelto por el manager del proyecto',
  );

  return {
    timesheetId: result.timesheetId,
    timesheetStatus: result.timesheetStatus,
    submissionCode: result.submissionCode,
    cycleNo: result.cycleNo,
    currentSeq: result.currentSeq,
    completed: result.completed,
    approved: result.approved,
    attachment,
    nextStep: result.route
      ? {
          seq: result.route.seq,
          approverType: result.route.approverType,
          approverName: result.route.approverName,
          approverEmail: result.route.approverEmail,
          approverRoleCode: result.route.approverRoleCode,
        }
      : null,
    notifications: {
      inApp: result.notifications.inApp,
      email: result.notifications.email,
      emailDelivered: delivery.delivered,
    },
  };
}

export type ApprovalTimelineStep = ApprovalStepSummary & {
  status: string;
  decidedAt: string | null;
  comments: string | null;
};

export type ApprovalActivityView = {
  lineNo: number;
  minutes: number;
  hours: number;
  activity: string;
};

export type ApprovalDayView = {
  date: string;
  minutes: number;
  hours: number;
  note: string | null;
  activities: ApprovalActivityView[];
};

export type ApprovalAttachmentView = {
  id: number;
  approvalId: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: { id: number; name: string | null };
  uploadedAt: string;
};

export type ApprovalDetailView = {
  approvalId: number;
  timesheetId: number;
  seq: number;
  cycleNo: number;
  approverType: ApproverType;
  approverName: string | null;
  approverEmail: string | null;
  approverRoleCode: string | null;
  status: string;
  onBehalf: boolean;
  canDecide: boolean;
  canApproveOnBehalf: boolean;
  canSeeActivities: boolean;
  submissionCode: string | null;
  timesheetStatus: TimesheetStatus;
  currentSeq: number | null;
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  totalHours: number;
  payRate: number | null;
  hourlyRate: number | null;
  currency: string;
  amount: number | null;
  pay: PaySummaryView | null;
  submittedAt: string | null;
  assignmentCode: string | null;
  consultant: { id: number; name: string; jobTitle: string | null };
  project: { id: number; name: string; code: string | null };
  client: { id: number; name: string };
  company: { id: number; name: string } | null;
  days: ApprovalDayView[];
  steps: ApprovalTimelineStep[];
  attachments: ApprovalAttachmentView[];
};

type ApprovalAccess = {
  isStepApprover: boolean;
  onBehalf: boolean;
  isCurrentStep: boolean;
  canView: boolean;
  canDecide: boolean;
  canApproveOnBehalf: boolean;
};

function approvalAccess(context: repository.ApprovalContextRecord, actor: Actor): ApprovalAccess {
  const timesheet = context.timesheet;
  const project = timesheet?.assignment?.project ?? null;
  const isAdmin = actor.roleCode === 'ADMIN';

  const isStepApprover =
    (context.approver_type === 'USER' && context.approver_id === actor.id) ||
    (context.approver_type === 'ROLE' && context.approver_role_code === actor.roleCode);

  const onBehalf = context.approver_type === 'CLIENT_EMAIL' && project?.manager_id === actor.id;

  const isCurrentStep =
    context.status === 'PENDING' &&
    timesheet !== null &&
    context.cycle_no === timesheet.cycle_no &&
    context.seq === timesheet.current_seq &&
    (timesheet.status === 'SUBMITTED' || timesheet.status === 'IN_REVIEW');

  const external = context.approver_type === 'CLIENT_EMAIL';

  return {
    isStepApprover,
    onBehalf,
    isCurrentStep,
    canView: isStepApprover || onBehalf || isAdmin,
    canDecide: isCurrentStep && !external && (isStepApprover || isAdmin),
    canApproveOnBehalf: isCurrentStep && external && (onBehalf || isAdmin),
  };
}

async function loadApprovalContext(
  approvalId: number,
  actor: Actor,
): Promise<{ context: repository.ApprovalContextRecord; access: ApprovalAccess }> {
  const context = await repository.findApprovalContext(approvalId);

  if (!context || !context.timesheet?.assignment?.project?.client) {
    throw ApiError.notFound('La tarea de aprobacion no existe');
  }

  const access = approvalAccess(context, actor);

  if (!access.canView) {
    throw new ApiError(403, 'No eres el aprobador de este paso del timesheet', 'NOT_STEP_APPROVER');
  }

  return { context, access };
}

export async function getApprovalDetail(
  approvalId: number,
  actor: Actor,
): Promise<ApprovalDetailView> {
  const { context, access } = await loadApprovalContext(approvalId, actor);

  const timesheet = context.timesheet!;
  const assignment = timesheet.assignment!;
  const project = assignment.project!;
  const client = project.client!;

  const canSeeActivities = actor.roleCode !== ROLE_FINANCE;

  const [days, steps, attachments, payByTimesheet] = await Promise.all([
    canSeeActivities ? findDays(timesheet.id) : Promise.resolve([]),
    findApprovals(timesheet.id, timesheet.cycle_no),
    repository.findAttachmentsByTimesheet(timesheet.id),
    payFor([timesheet.id], actor),
  ]);
  const pay = payByTimesheet.get(timesheet.id);

  const totalHours = Number(timesheet.total_hours);
  const payRate = Number(assignment.pay_rate);

  return {
    approvalId: context.id,
    timesheetId: timesheet.id,
    seq: context.seq,
    cycleNo: context.cycle_no,
    approverType: context.approver_type,
    approverName: context.approver_name,
    approverEmail: context.approver_email,
    approverRoleCode: context.approver_role_code,
    status: context.status,
    onBehalf: access.onBehalf,
    canDecide: access.canDecide,
    canApproveOnBehalf: access.canApproveOnBehalf,
    canSeeActivities,
    submissionCode: timesheet.submission_code,
    timesheetStatus: timesheet.status,
    currentSeq: timesheet.current_seq,
    weekStart: timesheet.week_start_date,
    weekEnd: timesheet.week_end_date,
    totalMinutes: hoursToMinutes(totalHours),
    totalHours,
    ...costsOf(pay, payRate, actor),
    currency: assignment.currency,
    submittedAt: timesheet.submitted_at,
    assignmentCode: assignment.assignment_code,
    consultant: {
      id: assignment.consultant?.id ?? assignment.consultant_id,
      name: assignment.consultant?.full_name ?? '',
      jobTitle: assignment.consultant?.job_title ?? null,
    },
    project: { id: project.id, name: project.project_name, code: project.code },
    client: { id: client.id, name: client.client_name },
    company: client.company ? { id: client.company.id, name: client.company.trade_name } : null,
    days: days.map((day) => ({
      date: day.work_date,
      minutes: hoursToMinutes(Number(day.total_hours)),
      hours: Number(day.total_hours),
      note: day.note,
      activities: day.activities.map((activity) => ({
        lineNo: activity.line_no,
        minutes: hoursToMinutes(Number(activity.hours)),
        hours: Number(activity.hours),
        activity: activity.activity,
      })),
    })),
    steps: steps.map((step) => ({
      seq: step.seq,
      approverType: step.approver_type,
      approverName: step.approver?.full_name ?? step.approver_name,
      approverEmail: step.approver_email,
      approverRoleCode: step.approver_role_code,
      status: step.status,
      decidedAt: step.decided_at,
      comments: step.comments,
    })),
    attachments: attachments.map(toAttachmentView),
  };
}

function toAttachmentView(record: repository.AttachmentRecord): ApprovalAttachmentView {
  return {
    id: record.id,
    approvalId: record.approval_id,
    fileName: record.file_name,
    mimeType: record.mime_type,
    sizeBytes: record.size_bytes,
    uploadedBy: { id: record.uploaded_by, name: record.uploader?.full_name ?? null },
    uploadedAt: record.created_at,
  };
}

export async function getAttachmentLink(
  approvalId: number,
  attachmentId: number,
  actor: Actor,
): Promise<{ url: string; fileName: string; mimeType: string }> {
  const { context } = await loadApprovalContext(approvalId, actor);
  const attachment = await repository.findAttachmentById(attachmentId);

  if (!attachment || attachment.timesheet_id !== context.timesheet!.id) {
    throw ApiError.notFound('La evidencia no existe');
  }

  return {
    url: await signEvidence(attachment.storage_path),
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
  };
}

export async function attachEvidence(params: {
  approvalId: number;
  timesheetId: number;
  actorId: number;
  file: UploadedEvidence;
}): Promise<ApprovalAttachmentView> {
  const path = evidencePath(params.timesheetId, params.approvalId, params.file);
  await uploadEvidence(path, params.file);

  try {
    const record = await repository.insertAttachment({
      approvalId: params.approvalId,
      timesheetId: params.timesheetId,
      uploadedBy: params.actorId,
      storagePath: path,
      fileName: params.file.originalName,
      mimeType: params.file.mimeType,
      sizeBytes: params.file.size,
    });

    return toAttachmentView(record);
  } catch (error) {
    await removeEvidence(path);
    throw error;
  }
}

export type DecisionKind = 'APPROVED' | 'RETURNED_TO_PREVIOUS' | 'RETURNED_TO_CONSULTANT';

export type ApprovalDecisionHistoryView = {
  eventId: number;
  approvalId: number | null;
  timesheetId: number;
  decision: DecisionKind;
  decidedAt: string;
  comments: string | null;
  seq: number | null;
  submissionCode: string | null;
  timesheetStatus: TimesheetStatus;
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  totalHours: number;
  hourlyRate: number | null;
  currency: string;
  amount: number | null;
  pay: PaySummaryView | null;
  assignmentCode: string | null;
  consultant: { id: number; name: string };
  project: { id: number; name: string };
  client: { id: number; name: string };
  company: { id: number; name: string } | null;
};

const DECISION_KINDS: Record<string, DecisionKind> = {
  APPROVED: 'APPROVED',
  REJECTED_PREV: 'RETURNED_TO_PREVIOUS',
  REJECTED_CONSULTANT: 'RETURNED_TO_CONSULTANT',
};

export async function listMyDecisions(
  query: { page: number; pageSize: number },
  actor: Actor,
): Promise<{ decisions: ApprovalDecisionHistoryView[]; total: number }> {
  const { rows, total } = await repository.findDecisionsByActor({
    actorId: actor.id,
    page: query.page,
    pageSize: query.pageSize,
  });

  const pay = await payFor(
    rows.flatMap((row) => (row.timesheet ? [row.timesheet.id] : [])),
    actor,
  );

  const decisions = rows.flatMap((row) => {
    const timesheet = row.timesheet;
    const assignment = timesheet?.assignment;
    const project = assignment?.project;
    const client = project?.client;

    if (!timesheet || !assignment || !project || !client) return [];

    const totalHours = Number(timesheet.total_hours);
    const { payRate: _payRate, ...costs } = costsOf(
      pay.get(timesheet.id),
      Number(assignment.pay_rate),
      actor,
    );

    return [
      {
        eventId: row.id,
        approvalId: row.metadata?.approvalId ?? null,
        timesheetId: timesheet.id,
        decision: DECISION_KINDS[row.event_type] ?? 'APPROVED',
        decidedAt: row.occurred_at,
        comments: row.comments,
        seq: row.from_seq,
        submissionCode: timesheet.submission_code,
        timesheetStatus: timesheet.status,
        weekStart: timesheet.week_start_date,
        weekEnd: timesheet.week_end_date,
        totalMinutes: hoursToMinutes(totalHours),
        totalHours,
        ...costs,
        currency: assignment.currency,
        assignmentCode: assignment.assignment_code,
        consultant: {
          id: assignment.consultant?.id ?? 0,
          name: assignment.consultant?.full_name ?? '',
        },
        project: { id: project.id, name: project.project_name },
        client: { id: client.id, name: client.client_name },
        company: client.company ? { id: client.company.id, name: client.company.trade_name } : null,
      },
    ];
  });

  return { decisions, total };
}
