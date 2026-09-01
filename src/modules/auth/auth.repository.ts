import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../config/logger.js';

export type UserCredentialsRecord = {
  id: number;
  role_id: number;
  full_name: string;
  user_name: string;
  email: string;
  password_hash: string;
  job_title: string | null;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  is_active: boolean;
  must_change_password: boolean;
  role: { id: number; code: string; name: string } | null;
};

const USER_COLUMNS =
  'id, role_id, full_name, user_name, email, password_hash, job_title, failed_attempts, locked_until, last_login_at, is_active, must_change_password, role:ROLES!inner(id, code, name)';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo auth');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function findByColumn(
  column: 'user_name' | 'email',
  pattern: string,
): Promise<UserCredentialsRecord | null> {
  const { data, error } = await supabase
    .from('USERS')
    .select(USER_COLUMNS)
    .ilike(column, pattern)
    .maybeSingle();

  if (error) fail(`findByColumn:${column}`, error);

  return (data as UserCredentialsRecord | null) ?? null;
}

export async function findByUsernameOrEmail(
  identifier: string,
): Promise<UserCredentialsRecord | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const pattern = escapeLikePattern(trimmed);
  const columns: Array<'user_name' | 'email'> = trimmed.includes('@')
    ? ['email', 'user_name']
    : ['user_name', 'email'];

  for (const column of columns) {
    const found = await findByColumn(column, pattern);
    if (found) return found;
  }

  return null;
}

export async function findById(id: number): Promise<UserCredentialsRecord | null> {
  const { data, error } = await supabase
    .from('USERS')
    .select(USER_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findById', error);

  return (data as UserCredentialsRecord | null) ?? null;
}

export async function updateFailedAttempts(
  id: number,
  failedAttempts: number,
  lockedUntil: Date | null,
): Promise<void> {
  const { error } = await supabase
    .from('USERS')
    .update({
      failed_attempts: failedAttempts,
      locked_until: lockedUntil ? lockedUntil.toISOString() : null,
    })
    .eq('id', id);

  if (error) fail('updateFailedAttempts', error);
}

export async function registerSuccessfulLogin(id: number): Promise<void> {
  const { error } = await supabase
    .from('USERS')
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) fail('registerSuccessfulLogin', error);
}

export async function updatePassword(id: number, passwordHash: string): Promise<void> {
  const { error } = await supabase
    .from('USERS')
    .update({
      password_hash: passwordHash,
      must_change_password: false,
      failed_attempts: 0,
      locked_until: null,
    })
    .eq('id', id);

  if (error) fail('updatePassword', error);
}
