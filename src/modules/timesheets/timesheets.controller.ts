import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as timesheetsService from './timesheets.service.js';
import type {
  CurrentTimesheetQuery,
  ListTimesheetsQuery,
  SaveDraftInput,
  SummaryQuery,
} from './timesheets.schema.js';

function requireActor(req: Request): timesheetsService.Actor {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return { id: req.user.id, roleCode: req.user.roleCode };
}

export async function listAssignments(req: Request, res: Response): Promise<void> {
  const assignments = await timesheetsService.listAssignments(requireActor(req));
  ok(res, { assignments });
}

export async function getWeek(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<CurrentTimesheetQuery>(res);
  const timesheet = await timesheetsService.getWeek(
    query.assignmentId,
    query.weekStart,
    requireActor(req),
  );

  ok(res, { timesheet });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const timesheet = await timesheetsService.getTimesheet(Number(req.params.id), requireActor(req));
  ok(res, { timesheet });
}

export async function saveDraft(req: Request, res: Response): Promise<void> {
  const timesheet = await timesheetsService.saveDraft(req.body as SaveDraftInput, requireActor(req));
  ok(res, { timesheet });
}

export async function submit(req: Request, res: Response): Promise<void> {
  const result = await timesheetsService.submitTimesheet(Number(req.params.id), requireActor(req));
  ok(res, result);
}

export async function listMine(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListTimesheetsQuery>(res);
  const { timesheets, total } = await timesheetsService.listMyTimesheets(query, requireActor(req));

  paginated(res, timesheets, buildPagination(query.page, query.pageSize, total));
}

export async function summary(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<SummaryQuery>(res);
  const data = await timesheetsService.getSummary(query, requireActor(req));

  ok(res, { summary: data });
}
