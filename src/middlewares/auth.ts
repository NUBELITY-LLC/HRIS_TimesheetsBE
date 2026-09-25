import type { NextFunction, Request, Response } from 'express';
import { findPermissionCodes } from '../modules/auth/auth.repository.js';
import { ApiError } from '../utils/ApiError.js';
import type { PermissionCode } from '../utils/permissions.js';
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

export async function loadPermissions(user: Express.AuthenticatedUser): Promise<string[]> {
  user.permissions ??= await findPermissionCodes(user.id);
  return user.permissions;
}

export function requirePermission(...anyOf: PermissionCode[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(ApiError.unauthorized());
        return;
      }

      const granted = await loadPermissions(req.user);

      if (!anyOf.some((code) => granted.includes(code))) {
        next(ApiError.forbidden('No cuentas con el permiso requerido para esta operacion'));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
