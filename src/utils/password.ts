import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';

const DUMMY_HASH = bcrypt.hashSync('__no_such_user__', 10);

export function passwordSchema(label = 'La contrasena') {
  return z
    .string({ message: `${label} es obligatoria` })
    .min(8, `${label} debe tener al menos 8 caracteres`)
    .max(200, `${label} excede los 200 caracteres`)
    .regex(/[a-z]/, `${label} debe incluir al menos una minuscula`)
    .regex(/[A-Z]/, `${label} debe incluir al menos una mayuscula`)
    .regex(/[0-9]/, `${label} debe incluir al menos un numero`)
    .regex(/[^A-Za-z0-9\s]/, `${label} debe incluir al menos un simbolo`);
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function fakeVerifyPassword(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}
