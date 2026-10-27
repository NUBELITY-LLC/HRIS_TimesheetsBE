import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import { sendExportedFile } from '../timesheets/timesheets.controller.js';
import * as auditService from './audit.service.js';
import type { ExportAuditQuery, ListAuditQuery } from './audit.schema.js';

export async function listEntries(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListAuditQuery>(res);
  const { entries, total } = await auditService.listAuditEntries(query);

  paginated(res, entries, buildPagination(query.page, query.pageSize, total));
}

export async function listOptions(_req: Request, res: Response): Promise<void> {
  ok(res, await auditService.getAuditOptions());
}

export async function exportEntries(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();

  const query = validatedQuery<ExportAuditQuery>(res);
  sendExportedFile(
    res,
    await auditService.exportAuditEntries(query, { id: req.user.id, userName: req.user.userName }),
  );
}
