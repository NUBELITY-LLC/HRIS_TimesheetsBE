import pino from 'pino';
import { env } from './env.js';

const usePrettyTransport = env.PRETTY_LOGS ?? env.isDevelopment;

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'hris-timesheets-be' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
  ...(usePrettyTransport
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
