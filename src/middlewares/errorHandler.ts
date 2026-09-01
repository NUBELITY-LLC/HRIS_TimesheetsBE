import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
    stack?: string;
  };
};

function isJsonParseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    'status' in error &&
    (error as { status?: number }).status === 400 &&
    'body' in error
  );
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (isJsonParseError(err)) {
    apiError = ApiError.badRequest('El cuerpo de la peticion no es JSON valido');
  } else {
    apiError = ApiError.internal();
  }

  const requestId = String(req.id);
  const logPayload = { err, requestId, path: req.originalUrl, method: req.method };
  if (apiError.statusCode >= 500) {
    logger.error(logPayload, 'Error no controlado');
  } else {
    logger.warn(logPayload, apiError.message);
  }

  const body: ErrorBody = {
    error: {
      code: apiError.code,
      message: apiError.message,
      requestId,
    },
  };

  if (apiError.details !== undefined) {
    body.error.details = apiError.details;
  }

  const retryAfter = (apiError.details as { retryAfterSeconds?: number } | undefined)
    ?.retryAfterSeconds;
  if (typeof retryAfter === 'number') {
    res.setHeader('Retry-After', String(retryAfter));
  }

  if (!env.isProduction && !(err instanceof ApiError) && err instanceof Error) {
    body.error.stack = err.stack;
  }

  res.status(apiError.statusCode).json(body);
}
