import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

export type CompanyRecord = {
  id: number;
  legal_name: string;
  trade_name: string;
  rfc: string | null;
  is_active: boolean;
  allowed_email_domains: string[];
};

export type NewCompanyRow = {
  legal_name: string;
  trade_name: string;
  rfc: string | null;
  is_active: boolean;
  allowed_email_domains: string[];
};

export type CompanyPatch = Partial<NewCompanyRow>;

export type SortColumn = 'id' | 'legal_name' | 'trade_name';

export type ListCompaniesFilters = {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
  sortColumn: SortColumn;
  ascending: boolean;
};

const COMPANY_COLUMNS = 'id, legal_name, trade_name, rfc, is_active, allowed_email_domains';

const UNIQUE_VIOLATION = '23505';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo companies');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

function throwIfDuplicate(error: { code?: string; message: string; details?: string | null }): void {
  if (error.code !== UNIQUE_VIOLATION) return;

  const detail = `${error.message} ${error.details ?? ''}`;
  if (detail.includes('rfc')) {
    throw ApiError.conflict('Ya existe una empresa con ese RFC');
  }
  if (detail.includes('legal_name')) {
    throw ApiError.conflict('Ya existe una empresa con esa razon social');
  }
  throw ApiError.conflict('Ya existe una empresa con esos datos');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

export async function insertCompany(row: NewCompanyRow): Promise<CompanyRecord> {
  const { data, error } = await supabase
    .from('COMPANIES')
    .insert(row)
    .select(COMPANY_COLUMNS)
    .single();

  if (error) {
    throwIfDuplicate(error);
    fail('insertCompany', error);
  }

  return data as CompanyRecord;
}

export async function findCompanyById(id: number): Promise<CompanyRecord | null> {
  const { data, error } = await supabase
    .from('COMPANIES')
    .select(COMPANY_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) fail('findCompanyById', error);

  return (data as CompanyRecord | null) ?? null;
}

export async function findCompanies(
  filters: ListCompaniesFilters,
): Promise<{ rows: CompanyRecord[]; total: number }> {
  let query = supabase.from('COMPANIES').select(COMPANY_COLUMNS, { count: 'exact' });

  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }
  if (filters.search) {
    const pattern = quoteFilterValue(`%${escapeLikePattern(filters.search)}%`);
    query = query.or(
      `legal_name.ilike.${pattern},trade_name.ilike.${pattern},rfc.ilike.${pattern}`,
    );
  }

  const from = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await query
    .order(filters.sortColumn, { ascending: filters.ascending, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + filters.pageSize - 1);

  if (error) fail('findCompanies', error);

  return { rows: (data ?? []) as CompanyRecord[], total: count ?? 0 };
}

export async function findActiveClientEmails(
  companyId: number,
): Promise<{ id: number; clientName: string; email: string }[]> {
  const { data, error } = await supabase
    .from('CLIENTS')
    .select('id, client_name, contact_email, user:USERS(email)')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error) fail('findActiveClientEmails', error);

  return ((data ?? []) as unknown as {
    id: number;
    client_name: string;
    contact_email: string | null;
    user: { email: string } | null;
  }[]).flatMap((row) => {
    const email = row.user?.email ?? row.contact_email;
    return email ? [{ id: row.id, clientName: row.client_name, email: email.toLowerCase() }] : [];
  });
}

export async function findActiveConsultantEmails(
  companyId: number,
): Promise<{ id: number; fullName: string; email: string }[]> {
  const { data, error } = await supabase
    .from('PROJECT_ASSIGNMENTS')
    .select(
      'consultant:USERS!inner(id, full_name, email), ' +
        'project:PROJECTS!inner(client:CLIENTS!inner(company_id))',
    )
    .eq('is_active', true)
    .eq('project.client.company_id', companyId);

  if (error) fail('findActiveConsultantEmails', error);

  const consultants = new Map<number, { id: number; fullName: string; email: string }>();
  for (const row of (data ?? []) as unknown as {
    consultant: { id: number; full_name: string; email: string } | null;
  }[]) {
    if (row.consultant) {
      consultants.set(row.consultant.id, {
        id: row.consultant.id,
        fullName: row.consultant.full_name,
        email: row.consultant.email.toLowerCase(),
      });
    }
  }

  return [...consultants.values()];
}

export async function updateCompany(
  id: number,
  patch: CompanyPatch,
): Promise<CompanyRecord | null> {
  const { data, error } = await supabase
    .from('COMPANIES')
    .update(patch)
    .eq('id', id)
    .select(COMPANY_COLUMNS)
    .maybeSingle();

  if (error) {
    throwIfDuplicate(error);
    fail('updateCompany', error);
  }

  return (data as CompanyRecord | null) ?? null;
}
