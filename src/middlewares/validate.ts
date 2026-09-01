import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ApiError } from '../utils/ApiError.js';

export type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

function formatIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        res.locals.query = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.badRequest('Error de validacion', formatIssues(error)));
        return;
      }
      next(error);
    }
  };
}

export function validatedQuery<T>(res: Response): T {
  return res.locals.query as T;
}
