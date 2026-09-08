import { z } from 'zod';
import { APPROVER_ROLES } from '../../utils/roles.js';

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
  sortBy: z.enum(['id', 'projectName', 'startDate']).default('projectName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
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

const approvalStepSchema = z
  .object({
    approverType: z.enum(['CLIENT_EMAIL', 'USER', 'ROLE'], {
      message: 'El tipo de aprobador debe ser CLIENT_EMAIL, USER o ROLE',
    }),
    userId: positiveId.nullish(),
    roleCode: z
      .string()
      .trim()
      .max(30, 'El rol excede los 30 caracteres')
      .transform((value) => value.toUpperCase())
      .nullish(),
  })
  .refine((step) => step.approverType !== 'USER' || step.userId != null, {
    message: 'Un paso de tipo USER requiere `userId`',
    path: ['userId'],
  })
  .refine((step) => step.approverType !== 'ROLE' || Boolean(step.roleCode), {
    message: 'Un paso de tipo ROLE requiere `roleCode`',
    path: ['roleCode'],
  })
  .refine((step) => step.approverType === 'USER' || step.userId == null, {
    message: 'Solo un paso de tipo USER admite `userId`',
    path: ['userId'],
  })
  .refine((step) => step.approverType === 'ROLE' || !step.roleCode, {
    message: 'Solo un paso de tipo ROLE admite `roleCode`',
    path: ['roleCode'],
  })
  .refine((step) => step.approverType !== 'ROLE' || APPROVER_ROLES.includes(step.roleCode ?? ''), {
    message: `Un paso por rol solo admite ${APPROVER_ROLES.join(' o ')}`,
    path: ['roleCode'],
  });

export const replaceApprovalStepsSchema = z.object({
  steps: z
    .array(approvalStepSchema)
    .min(1, 'Define al menos un paso de aprobacion')
    .max(10, 'El flujo admite como maximo 10 pasos'),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type ReplaceApprovalStepsInput = z.infer<typeof replaceApprovalStepsSchema>;
