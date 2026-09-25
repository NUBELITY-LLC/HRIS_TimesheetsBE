import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { created, ok } from '../../utils/httpResponse.js';
import { validatedQuery } from '../../middlewares/validate.js';
import * as holidaysService from './holidays.service.js';
import type { CreateHolidayInput, ListHolidaysQuery } from './holidays.schema.js';

function actorId(req: Request): number {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  return req.user.id;
}

export async function list(_req: Request, res: Response): Promise<void> {
  const holidays = await holidaysService.listHolidays(validatedQuery<ListHolidaysQuery>(res));
  ok(res, { holidays });
}

export async function create(req: Request, res: Response): Promise<void> {
  const holiday = await holidaysService.createHoliday(req.body as CreateHolidayInput, actorId(req));
  created(res, { holiday });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const holiday = await holidaysService.deleteHoliday(Number(req.params.id), actorId(req));
  ok(res, { holiday });
}
