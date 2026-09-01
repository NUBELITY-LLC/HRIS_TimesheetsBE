import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/jwt.js';

function extractBearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;

  return token.trim() || null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      next(ApiError.unauthorized('Falta el token Bearer'));
      return;
    }

    const payload = await verifyAccessToken(token);
    const id = Number(payload.sub);

    if (!Number.isInteger(id) || id <= 0) {
      next(ApiError.unauthorized('Token invalido'));
      return;
    }

    req.user = {
      id,
      userName: payload.userName,
      email: payload.email,
      roleId: payload.roleId,
      roleCode: payload.roleCode,
      mustChangePassword: payload.mustChangePassword,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePasswordChanged(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(ApiError.unauthorized());
    return;
  }

  if (req.user.mustChangePassword) {
    next(
      new ApiError(
        403,
        'Debes cambiar tu contrasena antes de continuar',
        'PASSWORD_CHANGE_REQUIRED',
      ),
    );
    return;
  }

  next();
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (!allowedRoles.includes(req.user.roleCode)) {
      next(ApiError.forbidden('No cuentas con el rol requerido para esta operacion'));
      return;
    }

    next();
  };
}
