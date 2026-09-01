import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/httpResponse.js';
import * as authService from './auth.service.js';
import type { ChangePasswordInput, LoginInput } from './auth.schema.js';

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  ok(res, result);
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const profile = await authService.getProfile(req.user.id);
  ok(res, { user: profile });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const result = await authService.changePassword(req.user.id, req.body as ChangePasswordInput);
  ok(res, result);
}
