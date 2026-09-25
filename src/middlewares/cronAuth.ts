import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireCronSecret(req: Request, _res: Response, next: NextFunction): void {
  if (!env.CRON_SECRET) {
    next(ApiError.notFound());
    return;
  }

  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token || !sameSecret(token.trim(), env.CRON_SECRET)) {
    next(ApiError.unauthorized());
    return;
  }

  next();
}
