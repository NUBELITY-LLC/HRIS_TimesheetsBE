import { z } from 'zod';

const positiveId = z.coerce
  .number({ message: 'El id debe ser numerico' })
  .int('El id debe ser un numero entero')
  .positive('El id debe ser mayor que cero');

const clientName = z
  .string({ message: 'El nombre del cliente es obligatorio' })
  .trim()
  .min(1, 'El nombre del cliente es obligatorio')
  .max(150, 'El nombre del cliente excede los 150 caracteres');

const contactEmail = z
  .email({ message: 'El correo de contacto no es valido' })
  .max(150, 'El correo de contacto excede los 150 caracteres')
  .transform((value) => value.trim().toLowerCase());

export const createClientSchema = z.object({
  companyId: positiveId,
  clientName,
  contactEmail: contactEmail.nullish(),
  isActive: z.boolean().optional(),
});

export const updateClientSchema = z
  .object({
    companyId: positiveId.optional(),
    clientName: clientName.optional(),
    contactEmail: contactEmail.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Envia al menos un campo para actualizar',
  });

export const clientIdParamSchema = z.object({ id: positiveId });

export const listClientsQuerySchema = z.object({
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
  companyId: positiveId.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  sortBy: z.enum(['id', 'clientName']).default('clientName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
