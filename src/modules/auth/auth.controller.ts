import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/httpResponse.js';
import * as authService from './auth.service.js';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  SetPasswordInput,
  UpdateLocaleInput,
} from './auth.schema.js';

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

function tokenParam(req: Request): string {
  return String(req.params.token ?? '');
}

export async function describeInvitation(req: Request, res: Response): Promise<void> {
  ok(res, { link: await authService.describeAccountLink(tokenParam(req), 'INVITE') });
}

export async function acceptInvitation(req: Request, res: Response): Promise<void> {
  const result = await authService.completeAccountLink(
    tokenParam(req),
    'INVITE',
    req.body as SetPasswordInput,
  );
  ok(res, result);
}

export async function describePasswordReset(req: Request, res: Response): Promise<void> {
  ok(res, { link: await authService.describeAccountLink(tokenParam(req), 'RESET') });
}

export async function completePasswordReset(req: Request, res: Response): Promise<void> {
  const result = await authService.completeAccountLink(
    tokenParam(req),
    'RESET',
    req.body as SetPasswordInput,
  );
  ok(res, result);
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  authService.requestPasswordReset(req.body as ForgotPasswordInput);
  ok(res, { requested: true }, 202);
}

export async function updateLocale(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const result = await authService.updateLocale(req.user.id, req.body as UpdateLocaleInput);
  ok(res, result);
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const result = await authService.changePassword(req.user.id, req.body as ChangePasswordInput);
  ok(res, result);
}
