import { z } from 'zod';
import { APPROVER_TYPES, MAX_APPROVAL_STEPS, MIN_APPROVAL_STEPS } from '../../utils/approvals.js';
import { APPROVER_ROLES } from '../../utils/roles.js';
import { PROJECT_STATUSES } from '../../utils/projects.js';

const positiveId = z.coerce
  .number({ message: 'El id debe ser numerico' })
  .int('El id debe ser un numero entero')
  .positive('El id debe ser mayor que cero');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'La fecha no es valida');

const projectName = z
  .string({ message: 'El nombre del proyecto es obligatorio' })
  .trim()
  .min(1, 'El nombre del proyecto es obligatorio')
  .max(150, 'El nombre del proyecto excede los 150 caracteres');

const projectCode = z.string().trim().max(40, 'El codigo excede los 40 caracteres');

const currency = z
  .string()
  .trim()
  .length(3, 'La moneda debe tener 3 letras (ISO 4217)')
  .transform((value) => value.toUpperCase());

const payRate = z
  .number({ message: 'La tarifa es obligatoria' })
  .nonnegative('La tarifa no puede ser negativa')
  .max(99_999_999.99, 'La tarifa excede el maximo permitido')
  .refine(
    (value) => Number((value * 100).toFixed(0)) / 100 === value,
    'La tarifa admite como maximo 2 decimales',
  );

function endsAfterStart(value: { startDate?: string | null; endDate?: string | null }): boolean {
  if (!value.startDate || !value.endDate) return true;
  return value.endDate >= value.startDate;
}

const DATE_ORDER_ISSUE = {
  message: 'La fecha de fin no puede ser anterior a la de inicio',
  path: ['endDate'],
};

export const createProjectSchema = z
  .object({
    clientId: positiveId,
    managerId: positiveId.nullish(),
    projectName,
    code: projectCode.nullish(),
    startDate: isoDate.nullish(),
    endDate: isoDate.nullish(),
  })
  .refine(endsAfterStart, DATE_ORDER_ISSUE);

export const updateProjectSchema = z
  .object({
    clientId: positiveId.optional(),
    managerId: positiveId.nullish(),
    projectName: projectName.optional(),
    code: projectCode.nullish(),
    startDate: isoDate.nullish(),
    endDate: isoDate.nullish(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Envia al menos un campo para actualizar',
  })
  .refine(endsAfterStart, DATE_ORDER_ISSUE);

export const projectIdParamSchema = z.object({ id: positiveId });

export const assignmentParamsSchema = z.object({
  id: positiveId,
  assignmentId: positiveId,
});

export const listProjectsQuerySchema = z.object({
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
  clientId: positiveId.optional(),
  managerId: positiveId.optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  sortBy: z.enum(['id', 'projectName', 'startDate']).default('projectName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export const closeProjectSchema = z.object({
  effectiveDate: isoDate,
});

export const createAssignmentSchema = z
  .object({
    consultantId: positiveId,
    payRate,
    currency: currency.optional(),
    startDate: isoDate,
    endDate: isoDate.nullish(),
  })
  .refine(endsAfterStart, DATE_ORDER_ISSUE);

export const updateAssignmentSchema = z
  .object({
    payRate: payRate.optional(),
    currency: currency.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Envia al menos un campo para actualizar',
  })
  .refine(endsAfterStart, DATE_ORDER_ISSUE);

const approverName = z
  .string()
  .trim()
  .max(150, 'El nombre del aprobador excede los 150 caracteres')
  .transform((value) => value || null);

const approvalStepSchema = z.discriminatedUnion(
  'approverType',
  [
    z
      .object({
        approverType: z.literal('USER'),
        userId: positiveId,
        approverName: approverName.nullish(),
      })
      .strict(),
    z
      .object({
        approverType: z.literal('ROLE'),
        roleCode: z
          .string({ message: 'Un paso de tipo ROLE requiere `roleCode`' })
          .trim()
          .max(30, 'El rol excede los 30 caracteres')
          .transform((value) => value.toUpperCase())
          .refine((value) => APPROVER_ROLES.includes(value), {
            message: `Un paso por rol solo admite ${APPROVER_ROLES.join(' o ')}`,
          }),
        approverName: approverName.nullish(),
      })
      .strict(),
    z
      .object({
        approverType: z.literal('CLIENT_EMAIL'),
        clientId: positiveId,
      })
      .strict(),
  ],
  { message: `El tipo de aprobador debe ser ${APPROVER_TYPES.join(', ')}` },
);

export const replaceApprovalStepsSchema = z.object({
  steps: z
    .array(approvalStepSchema)
    .min(MIN_APPROVAL_STEPS, `El flujo requiere al menos ${MIN_APPROVAL_STEPS} aprobadores`)
    .max(MAX_APPROVAL_STEPS, `El flujo admite como maximo ${MAX_APPROVAL_STEPS} aprobadores`),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CloseProjectInput = z.infer<typeof closeProjectSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type ReplaceApprovalStepsInput = z.infer<typeof replaceApprovalStepsSchema>;
