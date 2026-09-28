import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import type { CountryCode } from '../../utils/countries.js';
import { buildPagination, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as payService from './pay.service.js';
import * as projectsRepository from '../projects/projects.repository.js';
import * as projectsService from '../projects/projects.service.js';
import type { CreateRateChangeInput } from '../projects/projects.schema.js';
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

async function projectOfAssignment(assignmentId: number): Promise<number> {
  const assignment = await projectsRepository.findAssignmentById(assignmentId);

  if (!assignment) {
    throw ApiError.notFound('La asignacion no existe');
  }

  return assignment.project_id;
}

function payrollActor(req: Request): projectsService.Actor {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return { id: req.user.id, roleCode: req.user.roleCode };
}

export async function addRateChange(req: Request, res: Response): Promise<void> {
  const assignmentId = Number(req.params.id);
  const assignment = await projectsService.addRateChange(
    await projectOfAssignment(assignmentId),
    assignmentId,
    req.body as CreateRateChangeInput,
    payrollActor(req),
  );

  ok(res, { assignment }, 201);
}

export async function removeRateChange(req: Request, res: Response): Promise<void> {
  const assignmentId = Number(req.params.id);
  const assignment = await projectsService.removeRateChange(
    await projectOfAssignment(assignmentId),
    assignmentId,
    Number(req.params.rateId),
    payrollActor(req),
  );

  ok(res, { assignment });
}
