import { ApiError } from '../../utils/ApiError.js';
import { ROLE_CONSULTANT, ROLE_EMPLOYEE, ROLE_MANAGER } from '../../utils/roles.js';
import { payForTimesheets } from '../payroll/pay.service.js';
import type { PayBreakdown, PayLine } from '../payroll/pay.rules.js';
import { hoursToMinutes, minutesToHours } from '../timesheets/timesheets.rules.js';
import type { TimesheetStatus } from '../../types/database.types.js';
import * as repository from './reports.repository.js';
import { rangeDays, type HoursReportQuery, type ListPeopleQuery } from './reports.schema.js';

export const REPORTABLE_ROLE_CODES = [ROLE_CONSULTANT, ROLE_EMPLOYEE, ROLE_MANAGER];

export const REPORTABLE_STATUSES: TimesheetStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'CLOSED',
  'PAID',
];

export type PersonView = {
  id: number;
  fullName: string;
  userName: string;
  email: string;
  jobTitle: string | null;
  isActive: boolean;
  roleCode: string;
  roleName: string;
};

export type ReportEntryView = {
  timesheetId: number;
  submissionCode: string | null;
  status: TimesheetStatus;
  weekStart: string;
  weekEnd: string;
  minutes: number;
  hours: number;
  project: { id: number; name: string; code: string | null } | null;
  client: { id: number; name: string } | null;
  company: { id: number; name: string } | null;
  assignmentCode: string | null;
  payRate: number;
  hourlyRate: number;
  currency: string;
  amount: number;
  lines: PayLine[];
};

export type ReportDayView = {
  date: string;
  minutes: number;
  hours: number;
  amount: number;
  entries: ReportEntryView[];
};

export type ReportTotalView = { currency: string; amount: number };

export type HoursReportView = {
  person: PersonView;
  from: string;
  to: string;
  rangeDays: number;
  workedDays: number;
  totalMinutes: number;
  totalHours: number;
  totals: ReportTotalView[];
  days: ReportDayView[];
};

function toPersonView(record: repository.PersonRecord): PersonView {
  return {
    id: record.id,
    fullName: record.full_name,
    userName: record.user_name,
    email: record.email,
    jobTitle: record.job_title,
    isActive: record.is_active,
    roleCode: record.role?.code ?? '',
    roleName: record.role?.name ?? '',
  };
}

function activeFilter(status: ListPeopleQuery['status']): boolean | undefined {
  if (status === 'active') return true;
  if (status === 'inactive') return false;
  return undefined;
}

export async function listPeople(
  query: ListPeopleQuery,
): Promise<{ people: PersonView[]; total: number }> {
  const roleIds = await repository.findRoleIdsByCodes(REPORTABLE_ROLE_CODES);

  if (!roleIds.length) return { people: [], total: 0 };

  const { rows, total } = await repository.findPeople({
    roleIds,
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    isActive: activeFilter(query.status),
  });

  return { people: rows.map(toPersonView), total };
}

function toEntryView(
  record: repository.ReportDayRecord,
  pay: PayBreakdown | undefined,
): ReportEntryView | null {
  const timesheet = record.timesheet;
  if (!timesheet) return null;

  const assignment = timesheet.assignment;
  const project = assignment?.project ?? null;
  const minutes = hoursToMinutes(record.total_hours);
  const hours = minutesToHours(minutes);
  const payRate = Number(assignment?.pay_rate ?? 0);
  const dayPay = pay?.days.find((day) => day.date === record.work_date);

  return {
    timesheetId: timesheet.id,
    submissionCode: timesheet.submission_code,
    status: timesheet.status,
    weekStart: timesheet.week_start_date,
    weekEnd: timesheet.week_end_date,
    minutes,
    hours,
    project: project
      ? { id: project.id, name: project.project_name, code: project.code }
      : null,
    client: project?.client
      ? { id: project.client.id, name: project.client.client_name }
      : null,
    company: project?.client?.company
      ? { id: project.client.company.id, name: project.client.company.trade_name }
      : null,
    assignmentCode: assignment?.assignment_code ?? null,
    payRate,
    hourlyRate: pay?.hourlyRate ?? 0,
    currency: assignment?.currency ?? '',
    amount: dayPay?.amount ?? 0,
    lines: dayPay?.lines ?? [],
  };
}

export async function getHoursReport(query: HoursReportQuery): Promise<HoursReportView> {
  const person = await repository.findPersonById(query.userId);

  if (!person || !REPORTABLE_ROLE_CODES.includes(person.role?.code ?? '')) {
    throw ApiError.notFound('La persona no existe o no reporta horas');
  }

  const records = await repository.findReportDays({
    consultantId: query.userId,
    from: query.from,
    to: query.to,
    statuses: REPORTABLE_STATUSES,
  });

  const pay = await payForTimesheets(
    records.flatMap((record) => (record.timesheet ? [record.timesheet.id] : [])),
  );
  const byDate = new Map<string, ReportDayView>();

  for (const record of records) {
    const entry = toEntryView(record, record.timesheet ? pay.get(record.timesheet.id) : undefined);
    if (!entry) continue;

    const day = byDate.get(record.work_date) ?? {
      date: record.work_date,
      minutes: 0,
      hours: 0,
      amount: 0,
      entries: [],
    };

    day.minutes += entry.minutes;
    day.amount += entry.amount;
    day.entries.push(entry);
    byDate.set(record.work_date, day);
  }

  const days = [...byDate.values()]
    .map((day) => ({
      ...day,
      hours: minutesToHours(day.minutes),
      amount: Number(day.amount.toFixed(2)),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const totalMinutes = days.reduce((total, day) => total + day.minutes, 0);

  const byCurrency = new Map<string, number>();

  for (const day of days) {
    for (const entry of day.entries) {
      if (!entry.currency) continue;
      byCurrency.set(
        entry.currency,
        (byCurrency.get(entry.currency) ?? 0) + entry.amount,
      );
    }
  }

  const totals = [...byCurrency.entries()]
    .map(([currency, amount]) => ({ currency, amount: Number(amount.toFixed(2)) }))
    .sort((left, right) => left.currency.localeCompare(right.currency));

  return {
    person: toPersonView(person),
    from: query.from,
    to: query.to,
    rangeDays: rangeDays(query.from, query.to),
    workedDays: days.length,
    totalMinutes,
    totalHours: minutesToHours(totalMinutes),
    totals,
    days,
  };
}
