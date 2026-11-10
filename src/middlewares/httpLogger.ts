import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const UNLOGGED_PREFIXES = [
  `${env.API_PREFIX}/feedback/submissions`,
  `${env.API_PREFIX}/feedback/tracking`,
];

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
  autoLogging: {
    ignore: (req) =>
      req.url === '/health' ||
      req.url === '/health/live' ||
      UNLOGGED_PREFIXES.some((prefix) => req.url?.startsWith(prefix)),
  },
});
