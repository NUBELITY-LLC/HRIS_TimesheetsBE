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

  PRETTY_LOGS: booleanish.optional(),
});

const parsed = envSchema.safeParse(process.env);

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
  corsOrigins:
    raw.CORS_ORIGINS.trim() === '*'
      ? ('*' as const)
      : raw.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
} as const;

export type Env = typeof env;
