import { z } from 'zod';
import { COUNTRY_CODES } from '../../utils/countries.js';
import { CONTRACT_TYPES } from './pay.rules.js';

function twoDecimals(value: number): boolean {
  return Number((value * 100).toFixed(0)) / 100 === value;
}

const multiplier = z
  .number({ message: 'El multiplicador debe ser numerico' })
  .min(1, 'El multiplicador no puede ser menor a 1')
  .max(10, 'El multiplicador no puede ser mayor a 10')
  .refine(twoDecimals, 'El multiplicador admite como maximo 2 decimales');

export const payTermsShape = {
  contractType: z
    .enum(CONTRACT_TYPES, { message: 'El tipo de contratacion no es valido' })
    .optional(),
  countryCode: z.enum(COUNTRY_CODES, { message: 'El pais no esta soportado' }).optional(),
  hoursDivisor: z
    .number({ message: 'El divisor debe ser numerico' })
    .positive('El divisor debe ser mayor que cero')
    .max(1000, 'El divisor no puede ser mayor a 1000')
    .refine(twoDecimals, 'El divisor admite como maximo 2 decimales')
    .optional(),
  dailyHours: z
    .number({ message: 'La jornada debe ser numerica' })
    .min(1, 'La jornada debe ser de al menos 1 hora')
    .max(24, 'La jornada no puede exceder 24 horas')
    .refine(twoDecimals, 'La jornada admite como maximo 2 decimales')
    .optional(),
  overtimeMultiplier: multiplier.optional(),
  holidayMultiplier: multiplier.optional(),
};

export type PayTermsInput = {
  contractType?: (typeof CONTRACT_TYPES)[number];
  countryCode?: (typeof COUNTRY_CODES)[number];
  hoursDivisor?: number;
  dailyHours?: number;
  overtimeMultiplier?: number;
  holidayMultiplier?: number;
};

export type PayTermsColumns = {
  contract_type?: string;
  country_code?: string;
  hours_divisor?: number;
  daily_hours?: number;
  overtime_multiplier?: number;
  holiday_multiplier?: number;
};

export function toPayTermsColumns(input: PayTermsInput): PayTermsColumns {
  const columns: PayTermsColumns = {};
  if (input.contractType !== undefined) columns.contract_type = input.contractType;
  if (input.countryCode !== undefined) columns.country_code = input.countryCode;
  if (input.hoursDivisor !== undefined) columns.hours_divisor = input.hoursDivisor;
  if (input.dailyHours !== undefined) columns.daily_hours = input.dailyHours;
  if (input.overtimeMultiplier !== undefined)
    columns.overtime_multiplier = input.overtimeMultiplier;
  if (input.holidayMultiplier !== undefined) columns.holiday_multiplier = input.holidayMultiplier;
  return columns;
}

export const countryParamSchema = z.object({
  countryCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.enum(COUNTRY_CODES, { message: 'El pais no existe' })),
});

export const payrollRulesSchema = z.object({
  overtimeMultiplier: multiplier,
  overtimeTripleMultiplier: multiplier,
  weeklyDoubleOvertimeHours: z
    .number({ message: 'El limite semanal debe ser numerico' })
    .min(0, 'El limite semanal no puede ser negativo')
    .max(168, 'El limite semanal no puede exceder 168 horas')
    .refine(twoDecimals, 'El limite semanal admite como maximo 2 decimales')
    .nullable(),
  holidayMultiplier: multiplier,
  sundayMultiplier: multiplier,
});

export type PayrollRulesInput = z.infer<typeof payrollRulesSchema>;

export const listPayAssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'La pagina debe ser mayor que cero').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'El tamano de pagina debe ser mayor que cero')
    .max(100, 'El tamano de pagina maximo es 100')
    .default(20),
  search: z
    .string()
    .trim()
    .max(100, 'La busqueda excede los 100 caracteres')
    .optional()
    .transform((value) => value || undefined),
  contractType: z.enum(CONTRACT_TYPES).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});

export const assignmentIdParamSchema = z.object({
  id: z.coerce.number().int().positive('El id debe ser mayor que cero'),
});

export const updatePayTermsSchema = z
  .object({
    ...payTermsShape,
    payRate: z
      .number({ message: 'La tarifa debe ser numerica' })
      .nonnegative('La tarifa no puede ser negativa')
      .max(99_999_999.99, 'La tarifa excede el maximo permitido')
      .refine(twoDecimals, 'La tarifa admite como maximo 2 decimales')
      .optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Envia al menos un campo para actualizar',
  });

export type UpdatePayTermsInput = z.infer<typeof updatePayTermsSchema>;

export type ListPayAssignmentsQuery = z.infer<typeof listPayAssignmentsQuerySchema>;
