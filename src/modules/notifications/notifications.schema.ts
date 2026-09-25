import { z } from 'zod';

const positiveId = z.coerce
  .number({ message: 'El id debe ser numerico' })
  .int('El id debe ser un numero entero')
  .positive('El id debe ser mayor que cero');

export const notificationIdParamSchema = z.object({ id: positiveId });

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'La pagina debe ser mayor que cero').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'El tamano de pagina debe ser mayor que cero')
    .max(50, 'El tamano de pagina maximo es 50')
    .default(20),
  status: z.enum(['unread', 'read', 'all']).default('all'),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
