import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, created, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import { readEvidence } from '../../middlewares/upload.js';
import * as timesheetsService from './timesheets.service.js';
import type { ExportedFile } from './timesheets.export.js';
import type {
  CurrentTimesheetQuery,
  ExportQuery,
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

export async function discard(req: Request, res: Response): Promise<void> {
  await timesheetsService.discardDraft(Number(req.params.id), requireActor(req));
  ok(res, { discarded: true });
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

export async function listTeam(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListTimesheetsQuery>(res);
  const { timesheets, total } = await timesheetsService.listTeamTimesheets(query, requireActor(req));

  paginated(res, timesheets, buildPagination(query.page, query.pageSize, total));
}

export async function teamSummary(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<SummaryQuery>(res);
  const summary = await timesheetsService.getTeamSummary(query, requireActor(req));

  ok(res, { summary });
}

export async function attachEvidence(req: Request, res: Response): Promise<void> {
  const attachment = await timesheetsService.attachTimesheetEvidence(
    Number(req.params.id),
    readEvidence(req),
    requireActor(req),
  );

  created(res, { attachment });
}

export async function getEvidence(req: Request, res: Response): Promise<void> {
  const evidence = await timesheetsService.getTimesheetEvidenceLink(
    Number(req.params.id),
    Number(req.params.attachmentId),
    requireActor(req),
  );

  ok(res, { evidence });
}

export async function removeEvidence(req: Request, res: Response): Promise<void> {
  await timesheetsService.removeTimesheetEvidence(
    Number(req.params.id),
    Number(req.params.attachmentId),
    requireActor(req),
  );

  ok(res, { removed: true });
}

export function sendExportedFile(res: Response, file: ExportedFile): void {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.body);
}

export async function exportTimesheet(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ExportQuery>(res);
  const file = await timesheetsService.exportOwnTimesheet(
    Number(req.params.id),
    query.format,
    requireActor(req),
  );

  sendExportedFile(res, file);
}
