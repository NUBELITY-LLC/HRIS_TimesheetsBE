import type { Request } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as authController from './auth.controller.js';
import {
  accountTokenParamsSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  setPasswordSchema,
  updateLocaleSchema,
} from './auth.schema.js';

const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Demasiados intentos de inicio de sesion. Intenta mas tarde.',
    },
  },
});

function keyedRateLimiter(limit: number, key: (req: Request) => string) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    keyGenerator: key,
    message: {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Demasiados intentos. Intenta mas tarde.',
      },
    },
  });
}

const forgotPasswordRateLimiter = keyedRateLimiter(5, (req) =>
  `forgot:${String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase()}`,
);

const accountLinkRateLimiter = keyedRateLimiter(20, (req) => `link:${String(req.params.token ?? '')}`);

export const authRouter: Router = Router();

authRouter.post(
  '/login',
  loginRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);

authRouter.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword),
);

authRouter.get(
  '/invitations/:token',
  accountLinkRateLimiter,
  validate({ params: accountTokenParamsSchema }),
  asyncHandler(authController.describeInvitation),
);

authRouter.post(
  '/invitations/:token/accept',
  accountLinkRateLimiter,
  validate({ params: accountTokenParamsSchema, body: setPasswordSchema }),
  asyncHandler(authController.acceptInvitation),
);

authRouter.get(
  '/password-resets/:token',
  accountLinkRateLimiter,
  validate({ params: accountTokenParamsSchema }),
  asyncHandler(authController.describePasswordReset),
);

authRouter.post(
  '/password-resets/:token',
  accountLinkRateLimiter,
  validate({ params: accountTokenParamsSchema, body: setPasswordSchema }),
  asyncHandler(authController.completePasswordReset),
);

authRouter.get('/me', requireAuth, asyncHandler(authController.me));

authRouter.patch(
  '/me/locale',
  requireAuth,
  validate({ body: updateLocaleSchema }),
  asyncHandler(authController.updateLocale),
);

authRouter.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword),
);
