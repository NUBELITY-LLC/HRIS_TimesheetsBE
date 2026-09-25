import { z } from 'zod';

const positiveId = z.coerce
  .number({ message: 'El id debe ser numerico' })
  .int('El id debe ser un numero entero')
  .positive('El id debe ser mayor que cero');

export const approvalIdParamSchema = z.object({ id: positiveId });

export const attachmentParamsSchema = z.object({
  id: positiveId,
  attachmentId: positiveId,
});

export const approveOnBehalfSchema = z.object({
  comments: z
    .string()
    .trim()
    .max(500, 'El comentario excede los 500 caracteres')
    .optional()
    .transform((value) => value || null),
});

export const decisionCommentsSchema = z
  .string()
  .trim()
  .max(500, 'El comentario excede los 500 caracteres');

export const approveStepSchema = z.object({
  comments: decisionCommentsSchema.optional().transform((value) => value || null),
});

export const rejectStepSchema = z.object({
  target: z.enum(['PREVIOUS', 'CONSULTANT'], {
    message: 'El destino del rechazo debe ser PREVIOUS o CONSULTANT',
  }),
  comments: decisionCommentsSchema.min(1, 'Explica por que rechazas el timesheet'),
});

export const listPendingQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'La pagina debe ser mayor que cero').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'El tamano de pagina debe ser mayor que cero')
    .max(50, 'El tamano de pagina maximo es 50')
    .default(10),
});

export type ListPendingQuery = z.infer<typeof listPendingQuerySchema>;
export type ApproveOnBehalfInput = z.infer<typeof approveOnBehalfSchema>;
export type ApproveStepInput = z.infer<typeof approveStepSchema>;
export type RejectStepInput = z.infer<typeof rejectStepSchema>;
