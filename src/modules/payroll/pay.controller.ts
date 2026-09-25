import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import type { CountryCode } from '../../utils/countries.js';
import { buildPagination, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as payService from './pay.service.js';
import type {
  ListPayAssignmentsQuery,
  PayrollRulesInput,
  UpdatePayTermsInput,
} from './pay.schema.js';

function countryOf(req: Request): CountryCode {
  return String(req.params.countryCode).toUpperCase() as CountryCode;
}

export async function listRules(_req: Request, res: Response): Promise<void> {
  ok(res, { rules: await payService.listPayrollRules() });
}

export async function getRules(req: Request, res: Response): Promise<void> {
  ok(res, { rules: await payService.getPayrollRules(countryOf(req)) });
}

export async function saveRules(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const rules = await payService.savePayrollRules(
    countryOf(req),
    req.body as PayrollRulesInput,
    req.user.id,
  );

  ok(res, { rules });
}

export async function listAssignments(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListPayAssignmentsQuery>(res);
  const { assignments, total } = await payService.listPayAssignments(query);

  paginated(res, assignments, buildPagination(query.page, query.pageSize, total));
}

export async function updateAssignment(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const assignment = await payService.updatePayTerms(
    Number(req.params.id),
    req.body as UpdatePayTermsInput,
    req.user.id,
  );

  ok(res, { assignment });
}
