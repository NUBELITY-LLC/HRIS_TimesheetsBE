import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import { readEvidence } from '../../middlewares/upload.js';
import * as approvalsService from './approvals.service.js';
import type {
  ApproveOnBehalfInput,
  ApproveStepInput,
  ListPendingQuery,
  RejectStepInput,
} from './approvals.schema.js';

function requireActor(req: Request): approvalsService.Actor {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return { id: req.user.id, roleCode: req.user.roleCode };
}

export async function listPending(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListPendingQuery>(res);
  const { approvals, total } = await approvalsService.listPending(query, requireActor(req));

  paginated(res, approvals, buildPagination(query.page, query.pageSize, total));
}

export async function approveOnBehalf(req: Request, res: Response): Promise<void> {
  const body = req.body as ApproveOnBehalfInput;
  const approval = await approvalsService.approveOnBehalf(
    Number(req.params.id),
    body.comments,
    requireActor(req),
    readEvidence(req),
  );

  ok(res, { approval });
}

export async function approveStep(req: Request, res: Response): Promise<void> {
  const body = req.body as ApproveStepInput;
  const approval = await approvalsService.decideStep(
    Number(req.params.id),
    'APPROVE',
    body.comments,
    requireActor(req),
    readEvidence(req),
  );

  ok(res, { approval });
}

export async function rejectStep(req: Request, res: Response): Promise<void> {
  const body = req.body as RejectStepInput;
  const approval = await approvalsService.decideStep(
    Number(req.params.id),
    body.target === 'PREVIOUS' ? 'REJECT_TO_PREVIOUS' : 'REJECT_TO_CONSULTANT',
    body.comments,
    requireActor(req),
    readEvidence(req),
  );

  ok(res, { approval });
}

export async function getDetail(req: Request, res: Response): Promise<void> {
  const approval = await approvalsService.getApprovalDetail(
    Number(req.params.id),
    requireActor(req),
  );

  ok(res, { approval });
}

export async function getAttachment(req: Request, res: Response): Promise<void> {
  const evidence = await approvalsService.getAttachmentLink(
    Number(req.params.id),
    Number(req.params.attachmentId),
    requireActor(req),
  );

  ok(res, { evidence });
}

export async function listDecisions(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListPendingQuery>(res);
  const { decisions, total } = await approvalsService.listMyDecisions(query, requireActor(req));

  paginated(res, decisions, buildPagination(query.page, query.pageSize, total));
}
