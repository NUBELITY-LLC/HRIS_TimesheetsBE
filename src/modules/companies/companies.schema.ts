import { z } from 'zod';

const legalName = z
  .string({ message: 'La razon social es obligatoria' })
  .trim()
  .min(1, 'La razon social es obligatoria')
  .max(200, 'La razon social excede los 200 caracteres');

const tradeName = z
  .string({ message: 'El nombre comercial es obligatorio' })
  .trim()
  .min(1, 'El nombre comercial es obligatorio')
  .max(150, 'El nombre comercial excede los 150 caracteres');

const rfc = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => value.length === 12 || value.length === 13,
    'El RFC debe tener 12 caracteres (persona moral) o 13 (persona fisica)',
  )
  .refine((value) => /^[A-ZÑ&0-9]+$/.test(value), 'El RFC solo admite letras y numeros');

export const createCompanySchema = z.object({
  legalName,
  tradeName,
  rfc: rfc.nullish(),
  isActive: z.boolean().optional(),
});

export const updateCompanySchema = z
  .object({
    legalName: legalName.optional(),
    tradeName: tradeName.optional(),
    rfc: rfc.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Envia al menos un campo para actualizar',
  });

export const companyIdParamSchema = z.object({
  id: z.coerce
    .number({ message: 'El id debe ser numerico' })
    .int('El id debe ser un numero entero')
    .positive('El id debe ser mayor que cero'),
});

export const listCompaniesQuerySchema = z.object({
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
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  sortBy: z.enum(['id', 'legalName', 'tradeName']).default('tradeName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;
