import { z } from 'zod';

const isoDate = z
  .string({ message: 'La fecha es obligatoria' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'La fecha no es valida');

const positiveId = z.coerce
  .number({ message: 'El id debe ser numerico' })
  .int('El id debe ser un numero entero')
  .positive('El id debe ser mayor que cero');

export const MAX_REPORT_RANGE_DAYS = 366;

const scopeFields = {
  companyId: positiveId.optional(),
  projectId: positiveId.optional(),
};

export const listPeopleQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'La pagina debe ser mayor que cero').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'El tamano de pagina debe ser mayor que cero')
    .max(50, 'El tamano de pagina maximo es 50')
    .default(20),
  search: z
    .string()
    .trim()
    .max(100, 'La busqueda excede los 100 caracteres')
    .optional()
    .transform((value) => value || undefined),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  ...scopeFields,
});

function withValidRange<T extends z.ZodType<{ from: string; to: string }>>(schema: T) {
  return schema
    .refine((value) => value.from <= value.to, {
      message: 'La fecha inicial no puede ser mayor que la final',
      path: ['from'],
    })
    .refine((value) => rangeDays(value.from, value.to) <= MAX_REPORT_RANGE_DAYS, {
      message: `El rango no puede exceder ${MAX_REPORT_RANGE_DAYS} dias`,
      path: ['to'],
    });
}

export const hoursReportQuerySchema = withValidRange(
  z.object({
    userId: positiveId,
    from: isoDate,
    to: isoDate,
    ...scopeFields,
  }),
);

export const companyReportQuerySchema = withValidRange(
  z.object({
    companyId: positiveId,
    from: isoDate,
    to: isoDate,
    projectId: positiveId.optional(),
    userId: positiveId.optional(),
  }),
);

export const PERIOD_GROUPS = ['fortnight', 'month', 'year'] as const;

const formatField = {
  format: z.enum(['xlsx', 'pdf'], { message: 'El formato debe ser xlsx o pdf' }),
};

const flag = z
  .enum(['0', '1'])
  .default('0')
  .transform((value) => value === '1');

export const hoursExportQuerySchema = withValidRange(
  z.object({
    userId: positiveId,
    from: isoDate,
    to: isoDate,
    ...scopeFields,
    ...formatField,
  }),
);

export const companyExportQuerySchema = withValidRange(
  z.object({
    companyId: positiveId,
    from: isoDate,
    to: isoDate,
    projectId: positiveId.optional(),
    userId: positiveId.optional(),
    byProject: flag,
    byPerson: flag,
    groupBy: z.enum(PERIOD_GROUPS).default('fortnight'),
    ...formatField,
  }),
);

export function rangeDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);

  return Math.floor((end - start) / 86_400_000) + 1;
}

export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>;
export type HoursReportQuery = z.infer<typeof hoursReportQuerySchema>;
export type CompanyReportQuery = z.infer<typeof companyReportQuerySchema>;
export type HoursExportQuery = z.infer<typeof hoursExportQuerySchema>;
export type CompanyExportQuery = z.infer<typeof companyExportQuerySchema>;
export type PeriodGroup = (typeof PERIOD_GROUPS)[number];
