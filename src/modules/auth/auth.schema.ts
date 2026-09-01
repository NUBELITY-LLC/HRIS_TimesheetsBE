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
