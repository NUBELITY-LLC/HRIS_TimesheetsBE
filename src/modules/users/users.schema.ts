import { z } from 'zod';
import { passwordSchema } from '../../utils/password.js';
import { ASSIGNABLE_ROLES, ROLE_CONSULTANT } from '../../utils/roles.js';

const fullName = z
  .string({ message: 'El nombre completo es obligatorio' })
  .trim()
  .min(1, 'El nombre completo es obligatorio')
  .max(150, 'El nombre completo excede los 150 caracteres');

const userName = z
  .string({ message: 'El usuario es obligatorio' })
  .trim()
  .min(3, 'El usuario debe tener al menos 3 caracteres')
  .max(50, 'El usuario excede los 50 caracteres')
  .regex(/^[a-zA-Z0-9._-]+$/, 'El usuario solo admite letras, numeros, punto, guion y guion bajo');

const email = z
  .email({ message: 'El correo no es valido' })
  .max(254, 'El correo excede los 254 caracteres')
  .transform((value) => value.trim().toLowerCase());

const password = passwordSchema();

const roleCode = z
  .string({ message: 'El rol es obligatorio' })
  .trim()
  .min(1, 'El rol es obligatorio')
  .max(30, 'El rol excede los 30 caracteres')
  .transform((value) => value.toUpperCase());

const jobTitle = z.string().trim().max(100, 'El puesto excede los 100 caracteres');

const positiveId = z.coerce
  .number({ message: 'El id debe ser numerico' })
  .int('El id debe ser un numero entero')
  .positive('El id debe ser mayor que cero');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'La fecha no es valida');

const payRate = z
  .number({ message: 'La tarifa es obligatoria' })
  .nonnegative('La tarifa no puede ser negativa')
  .max(99_999_999.99, 'La tarifa excede el maximo permitido')
  .refine(
    (value) => Number((value * 100).toFixed(0)) / 100 === value,
    'La tarifa admite como maximo 2 decimales',
  );

export const userProjectSchema = z
  .object({
    projectId: positiveId,
    payRate,
    startDate: isoDate,
    endDate: isoDate.nullish(),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['endDate'],
  });

export const updateUserProjectSchema = z
  .object({
    payRate: payRate.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Envia al menos un campo para actualizar',
  })
  .refine(
    (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
    { message: 'La fecha de fin no puede ser anterior a la de inicio', path: ['endDate'] },
  );

export const createUserSchema = z
  .object({
    fullName,
    userName,
    email,
    password,
    roleCode,
    jobTitle: jobTitle.optional(),
    isActive: z.boolean().optional(),
    projects: z
      .array(userProjectSchema)
      .max(20, 'Se admiten como maximo 20 proyectos en el alta')
      .optional(),
  })
  .superRefine((value, ctx) => {
    const projects = value.projects ?? [];

    if (value.roleCode === ROLE_CONSULTANT && projects.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['projects'],
        message: 'Un usuario consultor requiere al menos un proyecto',
      });
    }

    if (projects.length > 0 && !ASSIGNABLE_ROLES.includes(value.roleCode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['projects'],
        message: `Solo se asignan proyectos a usuarios con rol ${ASSIGNABLE_ROLES.join(' o ')}`,
      });
    }

    const seen = new Set<number>();

    projects.forEach((project, index) => {
      if (seen.has(project.projectId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['projects', index, 'projectId'],
          message: 'El proyecto esta repetido en el alta',
        });
      }
      seen.add(project.projectId);
    });
  });

export const updateUserSchema = z
  .object({
    fullName: fullName.optional(),
    userName: userName.optional(),
    email: email.optional(),
    password: password.optional(),
    roleCode: roleCode.optional(),
    jobTitle: jobTitle.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Envia al menos un campo para actualizar',
  });

export const updateOwnProfileSchema = z.object({
  fullName,
});

export const userIdParamSchema = z.object({ id: positiveId });

export const userAssignmentParamsSchema = z.object({
  id: positiveId,
  assignmentId: positiveId,
});

export const listUsersQuerySchema = z.object({
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
  roleCode: z
    .string()
    .trim()
    .max(30, 'El rol excede los 30 caracteres')
    .optional()
    .transform((value) => (value ? value.toUpperCase() : undefined)),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  sortBy: z.enum(['id', 'fullName', 'userName', 'email', 'lastLoginAt']).default('fullName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type UserProjectInput = z.infer<typeof userProjectSchema>;
export type UpdateUserProjectInput = z.infer<typeof updateUserProjectSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
