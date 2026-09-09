import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { buildPagination, created, ok, paginated } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as projectsService from './projects.service.js';
import type {
  CloseProjectInput,
  CreateAssignmentInput,
  CreateProjectInput,
  ListProjectsQuery,
  ReplaceApprovalStepsInput,
  UpdateAssignmentInput,
  UpdateProjectInput,
} from './projects.schema.js';

function requireActor(req: Request): projectsService.Actor {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return { id: req.user.id, roleCode: req.user.roleCode };
}

export async function create(req: Request, res: Response): Promise<void> {
  const project = await projectsService.createProject(
    req.body as CreateProjectInput,
    requireActor(req),
  );

  created(res, { project });
}

export async function list(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListProjectsQuery>(res);
  const { projects, total } = await projectsService.listProjects(query);

  paginated(res, projects, buildPagination(query.page, query.pageSize, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const project = await projectsService.getProjectById(Number(req.params.id));
  ok(res, { project });
}

export async function update(req: Request, res: Response): Promise<void> {
  const project = await projectsService.updateProject(
    Number(req.params.id),
    req.body as UpdateProjectInput,
    requireActor(req),
  );

  ok(res, { project });
}

export async function close(req: Request, res: Response): Promise<void> {
  const result = await projectsService.closeProject(
    Number(req.params.id),
    req.body as CloseProjectInput,
    requireActor(req),
  );

  ok(res, result);
}

export async function reopen(req: Request, res: Response): Promise<void> {
  const project = await projectsService.reopenProject(Number(req.params.id), requireActor(req));
  ok(res, { project });
}

export async function listAssignments(req: Request, res: Response): Promise<void> {
  const assignments = await projectsService.listAssignments(Number(req.params.id));
  ok(res, { assignments });
}

export async function assign(req: Request, res: Response): Promise<void> {
  const assignment = await projectsService.assignConsultant(
    Number(req.params.id),
    req.body as CreateAssignmentInput,
    requireActor(req),
  );

  created(res, { assignment });
}

export async function updateAssignment(req: Request, res: Response): Promise<void> {
  const assignment = await projectsService.updateAssignment(
    Number(req.params.id),
    Number(req.params.assignmentId),
    req.body as UpdateAssignmentInput,
    requireActor(req),
  );

  ok(res, { assignment });
}

export async function unassign(req: Request, res: Response): Promise<void> {
  const assignment = await projectsService.deactivateAssignment(
    Number(req.params.id),
    Number(req.params.assignmentId),
    requireActor(req),
  );

  ok(res, { assignment });
}

export async function getApprovalSteps(req: Request, res: Response): Promise<void> {
  const workflow = await projectsService.getApprovalSteps(Number(req.params.id));
  ok(res, workflow);
}

export async function replaceApprovalSteps(req: Request, res: Response): Promise<void> {
  const workflow = await projectsService.replaceApprovalSteps(
    Number(req.params.id),
    req.body as ReplaceApprovalStepsInput,
    requireActor(req),
  );

  ok(res, workflow);
}
