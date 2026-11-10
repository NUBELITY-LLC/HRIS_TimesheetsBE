import type { Request, Response } from 'express';
import { buildPagination, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import { recordDataExport } from '../../utils/dataExports.js';
import { sendExportedFile } from '../timesheets/timesheets.controller.js';
import * as reportsService from './reports.service.js';
import type {
  CompanyExportQuery,
  CompanyReportQuery,
  HoursExportQuery,
  HoursReportQuery,
  ListPeopleQuery,
} from './reports.schema.js';

export async function listPeople(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListPeopleQuery>(res);
  const { people, total } = await reportsService.listPeople(query);

  paginated(res, people, buildPagination(query.page, query.pageSize, total));
}

export async function hoursReport(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<HoursReportQuery>(res);
  const report = await reportsService.getHoursReport(query);

  ok(res, { report });
}

export async function listScopes(_req: Request, res: Response): Promise<void> {
  const scopes = await reportsService.listScopes();

  ok(res, scopes);
}

export async function companyReport(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<CompanyReportQuery>(res);
  const report = await reportsService.getCompanyReport(query);

  ok(res, { report });
}

export async function exportHoursReport(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<HoursExportQuery>(res);
  const file = await reportsService.exportHoursReport(query);
  await recordDataExport({
    kind: 'HOURS_REPORT',
    label: file.label ?? file.fileName,
    records: file.records,
    format: query.format,
    filters: query,
  });
  sendExportedFile(res, file);
}

export async function exportCompanyReport(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<CompanyExportQuery>(res);
  const file = await reportsService.exportCompanyReport(query);
  await recordDataExport({
    kind: 'COMPANY_REPORT',
    label: file.label ?? file.fileName,
    records: file.records,
    format: query.format,
    filters: query,
  });
  sendExportedFile(res, file);
}
