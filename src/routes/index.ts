import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { clientsRouter } from '../modules/clients/clients.routes.js';
import { companiesRouter } from '../modules/companies/companies.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { projectsRouter } from '../modules/projects/projects.routes.js';
import { timesheetsRouter } from '../modules/timesheets/timesheets.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

export const apiRouter: Router = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/clients', clientsRouter);
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/timesheets', timesheetsRouter);
