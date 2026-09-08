import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

export type CompanyRef = {
  id: number;
  legal_name: string;
  trade_name: string;
  rfc: string | null;
  is_active: boolean;
};

export type ClientRecord = {
  id: number;
  company_id: number;
  client_name: string;
  contact_email: string | null;
  is_active: boolean;
  company: CompanyRef | null;
};

export type NewClientRow = {
  company_id: number;
  client_name: string;
  contact_email: string | null;
  is_active: boolean;
};

export type ClientPatch = {
  company_id?: number;
  client_name?: string;
  contact_email?: string | null;
  is_active?: boolean;
};

export type SortColumn = 'id' | 'client_name';

export type ListClientsFilters = {
  page: number;
  pageSize: number;
  search?: string;
  companyId?: number;
  isActive?: boolean;
  sortColumn: SortColumn;
  ascending: boolean;
};

const CLIENT_COLUMNS =
  'id, company_id, client_name, contact_email, is_active, ' +
  'company:COMPANIES!inner(id, legal_name, trade_name, rfc, is_active)';

const UNIQUE_VIOLATION = '23505';

function throwIfDuplicate(error: { code?: string }): void {
  if (error.code === UNIQUE_VIOLATION) {
    throw ApiError.conflict('Esa empresa ya tiene un cliente con ese nombre');
  }
}

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo clients');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

export async function insertClient(row: NewClientRow): Promise<ClientRecord> {
  const { data, error } = await supabase
    .from('CLIENTS')
    .insert(row)
    .select(CLIENT_COLUMNS)
    .single();

  if (error) {
    throwIfDuplicate(error);
    fail('insertClient', error);
  }

  return data as unknown as ClientRecord;
}

export async function findClientById(id: number): Promise<ClientRecord | null> {
  const { data, error } = await supabase
    .from('CLIENTS')
    .select(CLIENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findClientById', error);

  return (data as unknown as ClientRecord | null) ?? null;
}

export async function findClients(
  filters: ListClientsFilters,
): Promise<{ rows: ClientRecord[]; total: number }> {
  let query = supabase.from('CLIENTS').select(CLIENT_COLUMNS, { count: 'exact' });

  if (filters.companyId !== undefined) {
    query = query.eq('company_id', filters.companyId);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }
  if (filters.search) {
    const pattern = quoteFilterValue(`%${escapeLikePattern(filters.search)}%`);
    query = query.or(`client_name.ilike.${pattern},contact_email.ilike.${pattern}`);
  }

  const from = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await query
    .order(filters.sortColumn, { ascending: filters.ascending, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + filters.pageSize - 1);

  if (error) fail('findClients', error);

  return { rows: (data ?? []) as unknown as ClientRecord[], total: count ?? 0 };
}

export async function updateClient(id: number, patch: ClientPatch): Promise<ClientRecord | null> {
  const { data, error } = await supabase
    .from('CLIENTS')
    .update(patch)
    .eq('id', id)
    .select(CLIENT_COLUMNS)
    .maybeSingle();

  if (error) {
    throwIfDuplicate(error);
    fail('updateClient', error);
  }

  return (data as unknown as ClientRecord | null) ?? null;
}
