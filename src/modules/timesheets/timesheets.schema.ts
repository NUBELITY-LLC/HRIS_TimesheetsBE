import { z } from 'zod';
import {
  ACTIVITY_MAX_MINUTES,
  ACTIVITY_MIN_MINUTES,
  DAY_MAX_MINUTES,
  MINUTE_STEP,
  formatMinutes,
} from './timesheets.rules.js';

const isoDate = z
  .string({ message: 'La fecha es obligatoria' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'La fecha no es valida');

const positiveId = z.coerce
  .number({ message: 'El id debe ser numerico' })
  .int('El id debe ser un numero entero')
  .positive('El id debe ser mayor que cero');

const minutes = z
  .number({ message: 'Los minutos son obligatorios' })
  .int('Los minutos deben ser un numero entero')
  .min(ACTIVITY_MIN_MINUTES, `Cada actividad requiere al menos ${formatMinutes(ACTIVITY_MIN_MINUTES)}`)
  .max(ACTIVITY_MAX_MINUTES, `Cada actividad admite como maximo ${formatMinutes(ACTIVITY_MAX_MINUTES)}`)
  .refine(
    (value) => value % MINUTE_STEP === 0,
    `Los minutos deben ir en bloques de ${MINUTE_STEP}`,
  );

const activitySchema = z.object({
  minutes,
  activity: z
    .string({ message: 'La actividad es obligatoria' })
    .trim()
    .min(1, 'Describe la actividad realizada')
    .max(255, 'La actividad excede los 255 caracteres'),
});

const daySchema = z.object({
  date: isoDate,
  note: z.string().trim().max(500, 'La nota excede los 500 caracteres').nullish(),
  activities: z
    .array(activitySchema)
    .max(20, 'Como maximo 20 actividades por dia')
    .default([])
    .refine(
      (rows) => rows.reduce((total, row) => total + row.minutes, 0) <= DAY_MAX_MINUTES,
      `Un dia no admite mas de ${formatMinutes(DAY_MAX_MINUTES)}`,
    ),
});

export const saveDraftSchema = z
  .object({
    assignmentId: positiveId,
    weekStart: isoDate,
    days: z.array(daySchema).max(7, 'La semana solo admite 7 dias').default([]),
  })
  .refine(
    (value) => new Set(value.days.map((day) => day.date)).size === value.days.length,
    { message: 'Hay dias repetidos en la semana', path: ['days'] },
  );

export const timesheetIdParamSchema = z.object({ id: positiveId });

export const currentTimesheetQuerySchema = z.object({
  assignmentId: positiveId,
  weekStart: isoDate,
});

export const listTimesheetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'La pagina debe ser mayor que cero').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'El tamano de pagina debe ser mayor que cero')
    .max(50, 'El tamano de pagina maximo es 50')
    .default(10),
  status: z
    .enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'REJECTED', 'APPROVED', 'CLOSED', 'PAID', 'all'])
    .default('all'),
});

export const summaryQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'El mes debe tener el formato YYYY-MM')
    .optional(),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type CurrentTimesheetQuery = z.infer<typeof currentTimesheetQuerySchema>;
export type ListTimesheetsQuery = z.infer<typeof listTimesheetsQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
