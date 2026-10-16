import { z } from 'zod';
import { passwordSchema } from '../../utils/password.js';

export const loginSchema = z.object({
  username: z
    .string({ message: 'El usuario es obligatorio' })
    .trim()
    .min(1, 'El usuario es obligatorio')
    .max(254, 'El usuario excede la longitud permitida'),
  password: z
    .string({ message: 'La contrasena es obligatoria' })
    .min(1, 'La contrasena es obligatoria')
    .max(200, 'La contrasena excede la longitud permitida'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ message: 'La contrasena actual debe ser texto' })
      .max(200, 'La contrasena actual excede la longitud permitida')
      .optional(),
    newPassword: passwordSchema('La nueva contrasena'),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'La nueva contrasena debe ser distinta a la actual',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const accountTokenParamsSchema = z.object({
  token: z.string().trim().min(1).max(100),
});

export const setPasswordSchema = z.object({
  password: passwordSchema(),
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string({ message: 'El correo es obligatorio' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Escribe un correo valido' }).max(254)),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const updateLocaleSchema = z.object({
  locale: z.enum(['es', 'en'], { message: 'El idioma debe ser es o en' }),
});

export type UpdateLocaleInput = z.infer<typeof updateLocaleSchema>;
