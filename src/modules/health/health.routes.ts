import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as healthController from './health.controller.js';

export const healthRouter: Router = Router();

healthRouter.get('/', healthController.live);
healthRouter.get('/live', healthController.live);
healthRouter.get('/ready', asyncHandler(healthController.ready));
