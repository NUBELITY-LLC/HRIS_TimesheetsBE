import { z } from 'zod';
import { rangeDays } from '../reports/reports.schema.js';

export const AUDIT_CATEGORIES = [
  'WORKFLOW',
  'NOTIFICATION',
  'EVIDENCE',
  'CATALOG',
  'ASSIGNMENT',
  'USERS',
  'ACCESS',
  'PAYROLL',
] as const;

export const AUDIT_SOURCES = ['USER', 'SYSTEM', 'EXTERNAL'] as const;

export const AUDIT_ACTIONS = [
  'CREATED',
  'UPDATED',
  'DELETED',
  'ACTIVATED',
  'DEACTIVATED',
  'MODIFIED',
  'SUBMITTED',
  'STEP_ENTERED',
  'APPROVED',
  'REJECTED_PREV',
  'REJECTED_CONSULTANT',
  'NOTIFIED',
  'RECALLED',
  'CLOSED',
  'REOPENED',
  'PAID',
  'CLIENT_APPROVED',
  'CLIENT_REJECTED',
  'REQUEST_EXPIRED',
  'APPROVAL_EMAIL_SENT',
  'NOTIFICATION_CREATED',
  'EMAIL_SENT',
  'EMAIL_FAILED',
  'EMAIL_SKIPPED',
  'EVIDENCE_UPLOADED',
  'EVIDENCE_REMOVED',
  'PERMISSION_GRANTED',
  'PERMISSION_REVOKED',
  'APPROVAL_FLOW_UPDATED',
  'RATE_CHANGE_SCHEDULED',
  'RATE_CHANGE_REMOVED',
  'PAY_FROZEN',
  'SIGNED_IN',
  'SIGN_IN_FAILED',
  'ACCOUNT_LOCKED',
  'PASSWORD_CHANGED',
  'INVITE_SENT',
  'INVITE_ACCEPTED',
  'RESET_REQUESTED',
  'PASSWORD_RESET',
] as const;

export const AUDIT_COLUMNS = [
  'occurredAt',
  'category',
  'action',
  'timesheet',
  'week',
  'project',
  'subject',
  'entity',
  'actor',
  'actorEmail',
  'actorRole',
  'source',
  'fromStatus',
  'toStatus',
  'comments',
  'changes',
  'details',
  'ipAddress',
  'userAgent',
  'requestId',
] as const;

export const DEFAULT_AUDIT_COLUMNS: AuditColumn[] = [
  'occurredAt',
  'category',
  'action',
  'timesheet',
  'project',
  'subject',
  'entity',
  'actor',
  'actorRole',
  'fromStatus',
  'toStatus',
  'comments',
  'changes',
];

export const MAX_AUDIT_RANGE_DAYS = 366;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'La fecha no es valida');

const positiveId = z.coerce
  .number({ message: 'El id debe ser numerico' })
  .int('El id debe ser un numero entero')
  .positive('El id debe ser mayor que cero');

function csvOf<const T extends readonly [string, ...string[]]>(values: T, message: string) {
  return z.preprocess(
    (value) => {
      const raw = Array.isArray(value) ? value.join(',') : value;
      if (typeof raw !== 'string') return [];
      return [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))];
    },
    z.array(z.enum(values, { message })),
  );
}

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => value || undefined);

const filterFields = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  categories: csvOf(AUDIT_CATEGORIES, 'Area no valida'),
  actions: csvOf(AUDIT_ACTIONS, 'Accion no valida'),
  sources: csvOf(AUDIT_SOURCES, 'Origen no valido'),
  actorId: positiveId.optional(),
  subjectUserId: positiveId.optional(),
  projectId: positiveId.optional(),
  timesheet: optionalText(30, 'El timesheet excede los 30 caracteres'),
  search: optionalText(100, 'La busqueda excede los 100 caracteres'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
};

function withValidRange<T extends z.ZodType<{ from?: string; to?: string }>>(schema: T) {
  return schema
    .refine((value) => !value.from || !value.to || value.from <= value.to, {
      message: 'La fecha inicial no puede ser mayor que la final',
      path: ['from'],
    })
    .refine(
      (value) => !value.from || !value.to || rangeDays(value.from, value.to) <= MAX_AUDIT_RANGE_DAYS,
      { message: `El rango no puede exceder ${MAX_AUDIT_RANGE_DAYS} dias`, path: ['to'] },
    );
}

export const listAuditQuerySchema = withValidRange(
  z.object({
    ...filterFields,
    page: z.coerce.number().int().min(1, 'La pagina debe ser mayor que cero').default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'El tamano de pagina debe ser mayor que cero')
      .max(100, 'El tamano de pagina maximo es 100')
      .default(25),
  }),
);

export const exportAuditQuerySchema = withValidRange(
  z.object({
    ...filterFields,
    columns: csvOf(AUDIT_COLUMNS, 'Columna no valida').transform((columns) =>
      columns.length ? AUDIT_COLUMNS.filter((column) => columns.includes(column)) : DEFAULT_AUDIT_COLUMNS,
    ),
    changeDetail: z
      .enum(['0', '1'])
      .default('0')
      .transform((value) => value === '1'),
    locale: z.enum(['es', 'en']).default('es'),
  }),
);

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export type AuditSource = (typeof AUDIT_SOURCES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditColumn = (typeof AUDIT_COLUMNS)[number];
export type AuditLocale = 'es' | 'en';
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
export type ExportAuditQuery = z.infer<typeof exportAuditQuerySchema>;
export type AuditFilters = Omit<ListAuditQuery, 'page' | 'pageSize'>;
