import type { Request, Response } from 'express';
import { readFeedbackEvidence } from '../../middlewares/upload.js';
import { validatedQuery } from '../../middlewares/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, created, ok, paginated } from '../../utils/httpResponse.js';
import { recordDataExport } from '../../utils/dataExports.js';
import { sendExportedFile } from '../timesheets/timesheets.controller.js';
import { renderFeedbackCases, renderFeedbackReport } from './feedback.export.js';
import { findReportsForExport } from './feedback.repository.js';
import * as feedbackService from './feedback.service.js';
import type {
  AddFeedbackNoteInput,
  ExportFeedbackCasesQuery,
  FeedbackReportExportQuery,
  FeedbackReportQuery,
  ListFeedbackQuery,
  SubmitFeedbackInput,
  TrackFeedbackInput,
  UpdateFeedbackStatusInput,
} from './feedback.schema.js';

function actorId(req: Request): number {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export async function submit(req: Request, res: Response): Promise<void> {
  const files = readFeedbackEvidence(req);
  created(res, await feedbackService.submitFeedback(req.body as SubmitFeedbackInput, files));
}

export async function track(req: Request, res: Response): Promise<void> {
  ok(res, { case: await feedbackService.trackFeedback((req.body as TrackFeedbackInput).code) });
}

export async function list(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListFeedbackQuery>(res);
  const { items, total } = await feedbackService.listFeedback(query);
  paginated(res, items, buildPagination(query.page, query.pageSize, total));
}

export async function summary(_req: Request, res: Response): Promise<void> {
  ok(res, await feedbackService.feedbackSummary());
}

export async function report(_req: Request, res: Response): Promise<void> {
  ok(res, { report: await feedbackService.feedbackReport(validatedQuery<FeedbackReportQuery>(res)) });
}

export async function exportCases(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ExportFeedbackCasesQuery>(res);
  const file = await renderFeedbackCases(await findReportsForExport(query), query);
  await recordDataExport({
    kind: 'FEEDBACK_CASES',
    label: file.label ?? file.fileName,
    records: file.records,
    format: 'xlsx',
    filters: query,
  });
  sendExportedFile(res, file);
}

export async function exportReport(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<FeedbackReportExportQuery>(res);
  const file = await renderFeedbackReport(await feedbackService.feedbackReport(query), query);
  await recordDataExport({
    kind: 'FEEDBACK_REPORT',
    label: file.label ?? file.fileName,
    records: file.records,
    format: 'xlsx',
    filters: query,
  });
  sendExportedFile(res, file);
}

export async function detail(req: Request, res: Response): Promise<void> {
  ok(res, { case: await feedbackService.getFeedbackCase(Number(req.params.id), actorId(req)) });
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const result = await feedbackService.updateFeedbackStatus(
    Number(req.params.id),
    req.body as UpdateFeedbackStatusInput,
    actorId(req),
  );
  ok(res, { case: result });
}

export async function addNote(req: Request, res: Response): Promise<void> {
  const result = await feedbackService.addFeedbackNote(
    Number(req.params.id),
    req.body as AddFeedbackNoteInput,
    actorId(req),
  );
  created(res, { case: result });
}

export async function evidence(req: Request, res: Response): Promise<void> {
  ok(
    res,
    await feedbackService.feedbackEvidenceLink(Number(req.params.id), Number(req.params.attachmentId)),
  );
}
