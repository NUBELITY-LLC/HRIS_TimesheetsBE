import type { Request, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { anonymousRequest, requireSignedRole } from '../../middlewares/anonymous.js';
import {
  requireAuth,
  requirePasswordChanged,
  requirePermission,
} from '../../middlewares/auth.js';
import { acceptFeedbackEvidence } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { PERMISSION_FEEDBACK_REVIEW } from '../../utils/permissions.js';
import { ROLE_CONSULTANT, ROLE_EMPLOYEE, ROLE_FINANCE, ROLE_MANAGER } from '../../utils/roles.js';
import * as feedbackController from './feedback.controller.js';
import {
  addFeedbackNoteSchema,
  exportFeedbackCasesQuerySchema,
  feedbackAttachmentParamSchema,
  feedbackIdParamSchema,
  feedbackReportExportQuerySchema,
  feedbackReportQuerySchema,
  listFeedbackQuerySchema,
  submitFeedbackSchema,
  trackFeedbackSchema,
  updateFeedbackStatusSchema,
} from './feedback.schema.js';

function limiter(limit: number, key?: (req: Request, res: Response) => string) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    ...(key ? { keyGenerator: key } : {}),
    message: {
      error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Intenta mas tarde.' },
    },
  });
}

const submitLimiter = limiter(10, (_req, res) => `feedback:${String(res.locals.limitKey)}`);
const trackLimiter = limiter(120);

export const feedbackRouter: Router = Router();

feedbackRouter.post(
  '/submissions',
  anonymousRequest,
  requireSignedRole(ROLE_CONSULTANT, ROLE_EMPLOYEE, ROLE_MANAGER, ROLE_FINANCE),
  submitLimiter,
  acceptFeedbackEvidence,
  validate({ body: submitFeedbackSchema }),
  asyncHandler(feedbackController.submit),
);

feedbackRouter.post(
  '/tracking',
  trackLimiter,
  anonymousRequest,
  validate({ body: trackFeedbackSchema }),
  asyncHandler(feedbackController.track),
);

feedbackRouter.use(
  '/cases',
  requireAuth,
  requirePasswordChanged,
  requirePermission(PERMISSION_FEEDBACK_REVIEW),
);

feedbackRouter.get(
  '/cases',
  validate({ query: listFeedbackQuerySchema }),
  asyncHandler(feedbackController.list),
);

feedbackRouter.get('/cases/summary', asyncHandler(feedbackController.summary));

feedbackRouter.get(
  '/cases/export',
  validate({ query: exportFeedbackCasesQuerySchema }),
  asyncHandler(feedbackController.exportCases),
);

feedbackRouter.get(
  '/cases/report',
  validate({ query: feedbackReportQuerySchema }),
  asyncHandler(feedbackController.report),
);

feedbackRouter.get(
  '/cases/report/export',
  validate({ query: feedbackReportExportQuerySchema }),
  asyncHandler(feedbackController.exportReport),
);

feedbackRouter.get(
  '/cases/:id',
  validate({ params: feedbackIdParamSchema }),
  asyncHandler(feedbackController.detail),
);

feedbackRouter.patch(
  '/cases/:id/status',
  validate({ params: feedbackIdParamSchema, body: updateFeedbackStatusSchema }),
  asyncHandler(feedbackController.updateStatus),
);

feedbackRouter.post(
  '/cases/:id/notes',
  validate({ params: feedbackIdParamSchema, body: addFeedbackNoteSchema }),
  asyncHandler(feedbackController.addNote),
);

feedbackRouter.get(
  '/cases/:id/evidence/:attachmentId',
  validate({ params: feedbackAttachmentParamSchema }),
  asyncHandler(feedbackController.evidence),
);
