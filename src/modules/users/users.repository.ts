import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

export type RoleRecord = { id: number; code: string; name: string };

export type UserRecord = {
  id: number;
  full_name: string;
  user_name: string;
  email: string;
  job_title: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  role: RoleRecord | null;
};

export type NewUserRow = {
  role_id: number;
  full_name: string;
  user_name: string;
  email: string;
  password_hash: string;
  job_title: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

export type UserPatch = {
  role_id?: number;
  full_name?: string;
  user_name?: string;
  email?: string;
  password_hash?: string;
  job_title?: string | null;
  is_active?: boolean;
  must_change_password?: boolean;
};

export type SortColumn = 'id' | 'full_name' | 'user_name' | 'email' | 'last_login_at';

export type ListUsersFilters = {
  page: number;
  pageSize: number;
  search?: string;
  roleId?: number;
  isActive?: boolean;
  sortColumn: SortColumn;
  ascending: boolean;
};

const USER_COLUMNS =
  'id, full_name, user_name, email, job_title, is_active, must_change_password, last_login_at, role:ROLES!inner(id, code, name)';

const UNIQUE_VIOLATION = '23505';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo users');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

function throwIfDuplicate(error: { code?: string; message: string; details?: string | null }): void {
  if (error.code !== UNIQUE_VIOLATION) return;

  const detail = `${error.message} ${error.details ?? ''}`;
  if (detail.includes('email')) {
    throw ApiError.conflict('Ya existe un usuario con ese correo');
  }
  if (detail.includes('user_name')) {
    throw ApiError.conflict('Ya existe un usuario con ese nombre de usuario');
  }
  throw ApiError.conflict('Ya existe un usuario con esos datos');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

export async function findRoleByCode(code: string): Promise<RoleRecord | null> {
  const { data, error } = await supabase
    .from('ROLES')
    .select('id, code, name')
    .eq('code', code)
    .maybeSingle();

  if (error) fail('findRoleByCode', error);

  return data ?? null;
}

export async function insertUser(row: NewUserRow): Promise<UserRecord> {
  const { data, error } = await supabase.from('USERS').insert(row).select(USER_COLUMNS).single();

  if (error) {
    throwIfDuplicate(error);
    fail('insertUser', error);
  }

  return data as UserRecord;
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from('USERS')
    .select(USER_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findUserById', error);

  return (data as UserRecord | null) ?? null;
}

export async function findUsers(
  filters: ListUsersFilters,
): Promise<{ rows: UserRecord[]; total: number }> {
  let query = supabase.from('USERS').select(USER_COLUMNS, { count: 'exact' });

  if (filters.roleId !== undefined) {
    query = query.eq('role_id', filters.roleId);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }
  if (filters.search) {
    const pattern = quoteFilterValue(`%${escapeLikePattern(filters.search)}%`);
    query = query.or(
      `full_name.ilike.${pattern},user_name.ilike.${pattern},email.ilike.${pattern}`,
    );
  }

  const from = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await query
    .order(filters.sortColumn, { ascending: filters.ascending, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + filters.pageSize - 1);

  if (error) fail('findUsers', error);

  return { rows: (data ?? []) as UserRecord[], total: count ?? 0 };
}

export async function updateUser(id: number, patch: UserPatch): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from('USERS')
    .update(patch)
    .eq('id', id)
    .select(USER_COLUMNS)
    .maybeSingle();

  if (error) {
    throwIfDuplicate(error);
    fail('updateUser', error);
  }

  return (data as UserRecord | null) ?? null;
}
