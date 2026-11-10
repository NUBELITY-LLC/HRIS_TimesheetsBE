import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { forgetAuditIdentity } from '../utils/auditContext.js';
import { verifyAccessToken } from '../utils/jwt.js';

export function anonymousRequest(req: Request, _res: Response, next: NextFunction): void {
  forgetAuditIdentity();
  req.id = 'anonymous';
  next();
}

function bearerToken(req: Request): string | null {
  const [scheme, token] = (req.header('authorization') ?? '').split(' ');
  return token && scheme?.toLowerCase() === 'bearer' ? token.trim() || null : null;
}

export function requireSignedRole(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = bearerToken(req);
      if (!token) {
        next(ApiError.unauthorized('Falta el token Bearer'));
        return;
      }

      const payload = await verifyAccessToken(token);

      if (payload.mustChangePassword) {
        next(
          new ApiError(403, 'Debes cambiar tu contrasena antes de continuar', 'PASSWORD_CHANGE_REQUIRED'),
        );
        return;
      }

      if (!allowedRoles.includes(payload.roleCode)) {
        next(ApiError.forbidden('No cuentas con el rol requerido para esta operacion'));
        return;
      }

      res.locals.limitKey = createHash('sha256').update(payload.sub).digest('hex');
      next();
    } catch (error) {
      next(error);
    }
  };
}
