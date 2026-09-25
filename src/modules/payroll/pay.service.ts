import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { COUNTRY_CODES, type CountryCode } from '../../utils/countries.js';
import { hoursToMinutes } from '../timesheets/timesheets.rules.js';
import * as repository from './pay.repository.js';
import {
  computePay,
  CONTRACT_TYPES,
  DEFAULT_PAY_TERMS,
  DEFAULT_PAYROLL_RULES,
  type ContractType,
  type PayBreakdown,
  type PayrollRules,
  type PayTerms,
} from './pay.rules.js';
import {
  toPayTermsColumns,
  type ListPayAssignmentsQuery,
  type PayrollRulesInput,
  type UpdatePayTermsInput,
} from './pay.schema.js';

export type PayTermsView = {
  contractType: ContractType;
  countryCode: CountryCode;
  hoursDivisor: number;
  dailyHours: number;
  overtimeMultiplier: number;
  holidayMultiplier: number;
};

export type PayrollRulesView = PayrollRules & {
  countryCode: string;
  configured: boolean;
  updatedAt: string | null;
};

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function toPayTermsView(
  record: Omit<repository.PayTermsRecord, 'pay_rate' | 'currency'>,
): PayTermsView {
  return {
    contractType: oneOf(CONTRACT_TYPES, record.contract_type, DEFAULT_PAY_TERMS.contractType),
    countryCode: oneOf(COUNTRY_CODES, record.country_code, DEFAULT_PAY_TERMS.countryCode),
    hoursDivisor: Number(record.hours_divisor),
    dailyHours: Number(record.daily_hours),
    overtimeMultiplier: Number(record.overtime_multiplier),
    holidayMultiplier: Number(record.holiday_multiplier),
  };
}

export function toPayTerms(record: repository.PayTermsRecord): PayTerms {
  return { payRate: Number(record.pay_rate), ...toPayTermsView(record) };
}

function toPayrollRules(record: repository.PayrollRulesRecord): PayrollRules {
  return {
    overtimeMultiplier: Number(record.overtime_multiplier),
    overtimeTripleMultiplier: Number(record.overtime_triple_multiplier),
    weeklyDoubleOvertimeHours:
      record.weekly_double_overtime_hours === null
        ? null
        : Number(record.weekly_double_overtime_hours),
    holidayMultiplier: Number(record.holiday_multiplier),
    sundayMultiplier: Number(record.sunday_multiplier),
  };
}

function toPayrollRulesView(
  countryCode: string,
  record: repository.PayrollRulesRecord | undefined,
): PayrollRulesView {
  return {
    countryCode,
    configured: Boolean(record),
    updatedAt: record?.updated_at ?? null,
    ...(record ? toPayrollRules(record) : DEFAULT_PAYROLL_RULES),
  };
}

export async function listPayrollRules(): Promise<PayrollRulesView[]> {
  const records = await repository.findPayrollRules();
  return records.map((record) => toPayrollRulesView(record.country_code, record));
}

export async function getPayrollRules(countryCode: CountryCode): Promise<PayrollRulesView> {
  const [record] = await repository.findPayrollRules([countryCode]);
  return toPayrollRulesView(countryCode, record);
}

export async function savePayrollRules(
  countryCode: CountryCode,
  input: PayrollRulesInput,
  actorId: number,
): Promise<PayrollRulesView> {
  const record = await repository.upsertPayrollRules({
    country_code: countryCode,
    overtime_multiplier: input.overtimeMultiplier,
    overtime_triple_multiplier: input.overtimeTripleMultiplier,
    weekly_double_overtime_hours: input.weeklyDoubleOvertimeHours,
    holiday_multiplier: input.holidayMultiplier,
    sunday_multiplier: input.sundayMultiplier,
    updated_by: actorId,
  });

  logger.info({ countryCode, updatedBy: actorId }, 'Reglas de nomina actualizadas');

  return toPayrollRulesView(countryCode, record);
}

function dateBounds(records: repository.TimesheetPayRecord[]): { from: string; to: string } {
  return records.reduce(
    (bounds, record) => ({
      from: record.week_start_date < bounds.from ? record.week_start_date : bounds.from,
      to: record.week_end_date > bounds.to ? record.week_end_date : bounds.to,
    }),
    { from: records[0]!.week_start_date, to: records[0]!.week_end_date },
  );
}

async function holidaySets(
  records: repository.TimesheetPayRecord[],
  countryCodes: string[],
): Promise<Map<string, Set<string>>> {
  if (!countryCodes.length) return new Map();

  const rows = await repository.findHolidayDates({ countryCodes, ...dateBounds(records) });
  const sets = new Map<string, Set<string>>();

  for (const row of rows) {
    const set = sets.get(row.country_code) ?? new Set<string>();
    set.add(row.holiday_date);
    sets.set(row.country_code, set);
  }

  return sets;
}

async function payrollRulesByCountry(
  records: repository.TimesheetPayRecord[],
): Promise<Map<string, PayrollRules>> {
  const countryCodes = [
    ...new Set(
      records
        .filter((record) => record.assignment?.contract_type === 'PAYROLL')
        .map((record) => record.assignment!.country_code),
    ),
  ];

  const rows = await repository.findPayrollRules(countryCodes);

  return new Map(rows.map((row) => [row.country_code, toPayrollRules(row)]));
}

export async function payForTimesheets(ids: number[]): Promise<Map<number, PayBreakdown>> {
  const records = await repository.findTimesheetsForPay([...new Set(ids)]);
  const result = new Map<number, PayBreakdown>();

  if (!records.length) return result;

  const countryCodes = [
    ...new Set(
      records.flatMap((record) => (record.assignment ? [record.assignment.country_code] : [])),
    ),
  ];

  const [holidays, rules] = await Promise.all([
    holidaySets(records, countryCodes),
    payrollRulesByCountry(records),
  ]);

  for (const record of records) {
    if (!record.assignment) continue;

    const countryCode = record.assignment.country_code;

    result.set(
      record.id,
      computePay({
        terms: toPayTerms(record.assignment),
        days: (record.days ?? []).map((day) => ({
          date: day.work_date,
          minutes: hoursToMinutes(Number(day.total_hours)),
        })),
        holidays: holidays.get(countryCode) ?? new Set(),
        payrollRules: rules.get(countryCode) ?? DEFAULT_PAYROLL_RULES,
      }),
    );
  }

  return result;
}

export type PaySummaryView = Omit<PayBreakdown, 'days'>;

export function toPaySummary(breakdown: PayBreakdown): PaySummaryView {
  const { days: _days, ...summary } = breakdown;
  return summary;
}

export type PayAssignmentView = {
  id: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  assignmentCode: string | null;
  payRate: number;
  currency: string;
  hourlyRate: number;
  payTerms: PayTermsView;
  consultant: { id: number; name: string; email: string } | null;
  project: { id: number; name: string; code: string | null } | null;
  client: { id: number; name: string } | null;
};

function toPayAssignmentView(record: repository.PayAssignmentRecord): PayAssignmentView {
  const terms = toPayTerms(record);

  return {
    id: record.id,
    startDate: record.start_date,
    endDate: record.end_date,
    isActive: record.is_active,
    assignmentCode: record.assignment_code,
    payRate: terms.payRate,
    currency: record.currency,
    hourlyRate:
      terms.hoursDivisor > 0 ? Number((terms.payRate / terms.hoursDivisor).toFixed(4)) : 0,
    payTerms: toPayTermsView(record),
    consultant: record.consultant
      ? {
          id: record.consultant.id,
          name: record.consultant.full_name,
          email: record.consultant.email,
        }
      : null,
    project: record.project
      ? { id: record.project.id, name: record.project.project_name, code: record.project.code }
      : null,
    client: record.project?.client
      ? { id: record.project.client.id, name: record.project.client.client_name }
      : null,
  };
}

export async function listPayAssignments(
  query: ListPayAssignmentsQuery,
): Promise<{ assignments: PayAssignmentView[]; total: number }> {
  const { rows, total } = await repository.findPayAssignments({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    contractType: query.contractType,
    isActive: query.status === 'all' ? undefined : query.status === 'active',
  });

  return { assignments: rows.map(toPayAssignmentView), total };
}

export async function updatePayTerms(
  id: number,
  input: UpdatePayTermsInput,
  actorId: number,
): Promise<PayAssignmentView> {
  const patch = {
    ...toPayTermsColumns(input),
    ...(input.payRate !== undefined ? { pay_rate: input.payRate } : {}),
  };
  const updated = await repository.updateAssignmentPayTerms(id, patch);

  if (!updated) {
    throw ApiError.notFound('La asignacion no existe');
  }

  logger.info(
    { assignmentId: id, updatedBy: actorId, fields: Object.keys(patch) },
    'Condiciones de pago actualizadas',
  );

  return toPayAssignmentView(updated);
}
