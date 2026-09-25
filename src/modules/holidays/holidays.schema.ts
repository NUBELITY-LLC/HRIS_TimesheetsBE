import { z } from 'zod';
import { COUNTRY_CODES } from '../../utils/countries.js';

const countryCode = z.enum(COUNTRY_CODES, {
  message: 'El pais no esta soportado',
});

export const listHolidaysQuerySchema = z.object({
  countryCode: countryCode.default('MX'),
  year: z.coerce
    .number({ message: 'El anio debe ser numerico' })
    .int()
    .min(2000, 'El anio no es valido')
    .max(2100, 'El anio no es valido')
    .default(() => new Date().getUTCFullYear()),
});

export const createHolidaySchema = z.object({
  countryCode: countryCode.default('MX'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
    .refine(
      (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
      'La fecha no es valida',
    ),
  name: z
    .string({ message: 'El nombre es obligatorio' })
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'El nombre excede los 120 caracteres'),
});

export const holidayIdParamSchema = z.object({
  id: z.coerce.number().int().positive('El id debe ser mayor que cero'),
});

export type ListHolidaysQuery = z.infer<typeof listHolidaysQuerySchema>;
export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
