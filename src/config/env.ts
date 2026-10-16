import 'dotenv/config';
import { z } from 'zod';

const booleanish = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  CORS_ORIGINS: z.string().default('*'),

  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 60 * 60),
  JWT_ISSUER: z.string().min(1).default('hris-timesheets-be'),
  JWT_AUDIENCE: z.string().min(1).default('hris-timesheets'),

  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),

  MAIL_FROM_ADDRESS: z.email(),
  MAIL_FROM_NAME: z.string().min(1).default('Nubelity HRIS'),
  MAIL_REPLY_TO: z.email().optional(),
  MAIL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(14000).default(8000),
  MAIL_EXTERNAL_ENABLED: booleanish.default(false),

  GRAPH_TENANT_ID: z.string().min(1),
  GRAPH_CLIENT_ID: z.string().min(1),
  GRAPH_CLIENT_SECRET: z.string().min(1),

  APP_BASE_URL: z.url(),
  APPROVAL_LINK_BASE_URL: z.url().default('http://localhost:5173/aprobaciones'),

  CRON_SECRET: z.string().min(16, 'CRON_SECRET debe tener al menos 16 caracteres').optional(),

  PRETTY_LOGS: booleanish.optional(),
});

const definedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value?.trim()),
);

const parsed = envSchema.safeParse(definedEnv);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  console.error(
    `Variables de entorno invalidas:\n${details}\n\nRevisa tu archivo .env (ver .env.example).`,
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  approvalLinkBaseUrl: raw.APPROVAL_LINK_BASE_URL.replace(/\/+$/, ''),
  appBaseUrl: raw.APP_BASE_URL.replace(/\/+$/, ''),
  corsOrigins:
    raw.CORS_ORIGINS.trim() === '*'
      ? ('*' as const)
      : raw.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
} as const;

export type Env = typeof env;
