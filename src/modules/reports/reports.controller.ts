import type { Request, Response } from 'express';
import { buildPagination, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as reportsService from './reports.service.js';
import type { HoursReportQuery, ListPeopleQuery } from './reports.schema.js';

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
