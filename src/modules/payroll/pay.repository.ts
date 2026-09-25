import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import type { PayTermsColumns } from './pay.schema.js';

export type PayTermsRecord = {
  pay_rate: number;
  currency: string;
  contract_type: string;
  country_code: string;
  hours_divisor: number;
  daily_hours: number;
  overtime_multiplier: number;
  holiday_multiplier: number;
};

export type TimesheetPayRecord = {
  id: number;
  week_start_date: string;
  week_end_date: string;
  assignment: PayTermsRecord | null;
  days: { work_date: string; total_hours: number }[] | null;
};

export const PAY_TERMS_COLUMNS =
  'pay_rate, currency, contract_type, country_code, hours_divisor, daily_hours, ' +
  'overtime_multiplier, holiday_multiplier';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo payroll');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

export async function findTimesheetsForPay(ids: number[]): Promise<TimesheetPayRecord[]> {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('TIMESHEETS')
    .select(
      `id, week_start_date, week_end_date, ` +
        `assignment:PROJECT_ASSIGNMENTS!inner(${PAY_TERMS_COLUMNS}), ` +
        'days:TIMESHEET_DAYS(work_date, total_hours)',
    )
    .in('id', ids);

  if (error) fail('findTimesheetsForPay', error);

  return (data ?? []) as unknown as TimesheetPayRecord[];
}

export async function findHolidayDates(params: {
  countryCodes: string[];
  from: string;
  to: string;
}): Promise<{ country_code: string; holiday_date: string }[]> {
  if (!params.countryCodes.length) return [];

  const { data, error } = await supabase
    .from('HOLIDAYS')
    .select('country_code, holiday_date')
    .in('country_code', params.countryCodes)
    .gte('holiday_date', params.from)
    .lte('holiday_date', params.to);

  if (error) fail('findHolidayDates', error);

  return data ?? [];
}

export type PayrollRulesRecord = {
  country_code: string;
  overtime_multiplier: number;
  overtime_triple_multiplier: number;
  weekly_double_overtime_hours: number | null;
  holiday_multiplier: number;
  sunday_multiplier: number;
  updated_at: string;
};

const PAYROLL_RULES_COLUMNS =
  'country_code, overtime_multiplier, overtime_triple_multiplier, weekly_double_overtime_hours, ' +
  'holiday_multiplier, sunday_multiplier, updated_at';

export async function findPayrollRules(countryCodes?: string[]): Promise<PayrollRulesRecord[]> {
  let query = supabase.from('PAYROLL_COUNTRY_RULES').select(PAYROLL_RULES_COLUMNS);

  if (countryCodes) {
    if (!countryCodes.length) return [];
    query = query.in('country_code', countryCodes);
  }

  const { data, error } = await query.order('country_code', { ascending: true });

  if (error) fail('findPayrollRules', error);

  return (data ?? []) as unknown as PayrollRulesRecord[];
}

export async function upsertPayrollRules(
  row: Omit<PayrollRulesRecord, 'updated_at'> & { updated_by: number },
): Promise<PayrollRulesRecord> {
  const { data, error } = await supabase
    .from('PAYROLL_COUNTRY_RULES')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'country_code' })
    .select(PAYROLL_RULES_COLUMNS)
    .single();

  if (error) fail('upsertPayrollRules', error);

  return data as unknown as PayrollRulesRecord;
}

export type PayAssignmentRecord = PayTermsRecord & {
  id: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  assignment_code: string | null;
  consultant: { id: number; full_name: string; email: string } | null;
  project: {
    id: number;
    project_name: string;
    code: string | null;
    client: { id: number; client_name: string } | null;
  } | null;
};

const PAY_ASSIGNMENT_COLUMNS =
  `id, start_date, end_date, is_active, assignment_code, ${PAY_TERMS_COLUMNS}, ` +
  'consultant:USERS!inner(id, full_name, email), ' +
  'project:PROJECTS!inner(id, project_name, code, client:CLIENTS!inner(id, client_name))';

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function findPayAssignments(filters: {
  page: number;
  pageSize: number;
  search?: string;
  contractType?: string;
  isActive?: boolean;
}): Promise<{ rows: PayAssignmentRecord[]; total: number }> {
  let query = supabase
    .from('PROJECT_ASSIGNMENTS')
    .select(PAY_ASSIGNMENT_COLUMNS, { count: 'exact' });

  if (filters.isActive !== undefined) query = query.eq('is_active', filters.isActive);
  if (filters.contractType) query = query.eq('contract_type', filters.contractType);
  if (filters.search) {
    query = query.ilike('consultant.full_name', `%${escapeLikePattern(filters.search)}%`);
  }

  const from = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await query
    .order('project_id', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + filters.pageSize - 1);

  if (error) fail('findPayAssignments', error);

  return { rows: (data ?? []) as unknown as PayAssignmentRecord[], total: count ?? 0 };
}

export async function updateAssignmentPayTerms(
  id: number,
  patch: PayTermsColumns & { pay_rate?: number },
): Promise<PayAssignmentRecord | null> {
  const { data, error } = await supabase
    .from('PROJECT_ASSIGNMENTS')
    .update(patch)
    .eq('id', id)
    .select(PAY_ASSIGNMENT_COLUMNS)
    .maybeSingle();

  if (error) fail('updateAssignmentPayTerms', error);

  return (data as unknown as PayAssignmentRecord | null) ?? null;
}
