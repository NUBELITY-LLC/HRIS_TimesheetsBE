import { ApiError } from '../../utils/ApiError.js';
import { ROLE_CONSULTANT, ROLE_EMPLOYEE, ROLE_MANAGER } from '../../utils/roles.js';
import { payForTimesheets } from '../payroll/pay.service.js';
import type { PayBreakdown, PayLine } from '../payroll/pay.rules.js';
import { hoursToMinutes, minutesToHours } from '../timesheets/timesheets.rules.js';
import type { TimesheetStatus } from '../../types/database.types.js';
import type { ExportedFile } from '../timesheets/timesheets.export.js';
import * as repository from './reports.repository.js';
import { renderCompanyReport, renderHoursReport } from './reports.export.js';
import {
  rangeDays,
  type CompanyExportQuery,
  type CompanyReportQuery,
  type HoursExportQuery,
  type HoursReportQuery,
  type ListPeopleQuery,
} from './reports.schema.js';

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

export type CompanyPersonView = {
  id: number;
  fullName: string;
  jobTitle: string | null;
  minutes: number;
  hours: number;
  workedDays: number;
  hourlyRates: number[];
  totals: ReportTotalView[];
};

export type CompanyProjectView = {
  id: number;
  name: string;
  code: string | null;
  isClosed: boolean;
  clientName: string;
  minutes: number;
  hours: number;
  totals: ReportTotalView[];
  people: CompanyPersonView[];
};

export type CompanyDayView = {
  date: string;
  minutes: number;
  hours: number;
  totals: ReportTotalView[];
};

export type CompanyReportView = {
  company: { id: number; name: string };
  from: string;
  to: string;
  rangeDays: number;
  totalMinutes: number;
  totalHours: number;
  peopleCount: number;
  projectCount: number;
  totals: ReportTotalView[];
  days: CompanyDayView[];
  projects: CompanyProjectView[];
  people: CompanyPersonView[];
  options: CompanyFilterOptionsView;
};

export type CompanyFilterOptionsView = {
  projects: { id: number; name: string; code: string | null }[];
  people: { id: number; fullName: string }[];
};

export type ScopeCompanyView = { id: number; name: string };

export type ScopeProjectView = {
  id: number;
  name: string;
  code: string | null;
  isClosed: boolean;
  clientName: string;
  companyId: number;
};

export type ReportScopesView = {
  companies: ScopeCompanyView[];
  projects: ScopeProjectView[];
};

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

  const scoped = Boolean(query.companyId || query.projectId);
  const personIds = scoped
    ? await repository.findPersonIdsInScope({
        companyId: query.companyId,
        projectId: query.projectId,
      })
    : undefined;

  if (personIds && !personIds.length) return { people: [], total: 0 };

  const { rows, total } = await repository.findPeople({
    roleIds,
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    isActive: activeFilter(query.status),
    personIds,
  });

  return { people: rows.map(toPersonView), total };
}

export async function listScopes(): Promise<ReportScopesView> {
  const records = await repository.findScopeProjects();
  const companies = new Map<number, ScopeCompanyView>();
  const projects: ScopeProjectView[] = [];

  for (const record of records) {
    const company = record.client?.company;
    if (!company) continue;

    companies.set(company.id, { id: company.id, name: company.trade_name });
    projects.push({
      id: record.id,
      name: record.project_name,
      code: record.code,
      isClosed: record.status === 'CLOSED',
      clientName: record.client?.client_name ?? '',
      companyId: company.id,
    });
  }

  return {
    companies: [...companies.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    projects,
  };
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
    hourlyRate: dayPay?.hourlyRate ?? pay?.hourlyRate ?? 0,
    currency: assignment?.currency ?? '',
    amount: dayPay?.amount ?? 0,
    lines: dayPay?.lines ?? [],
  };
}

export async function getHoursReport(query: HoursReportQuery): Promise<HoursReportView> {
  const person = await repository.findPersonById(query.userId);

  if (!person || !REPORTABLE_ROLE_CODES.includes(person.role?.code ?? '')) {
    throw ApiError.notFound('El colaborador no existe o no reporta horas');
  }

  const records = await repository.findReportDays({
    consultantId: query.userId,
    from: query.from,
    to: query.to,
    statuses: REPORTABLE_STATUSES,
    companyId: query.companyId,
    projectId: query.projectId,
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

const PAY_BATCH_SIZE = 200;

async function payInBatches(ids: number[]): Promise<Map<number, PayBreakdown>> {
  const unique = [...new Set(ids)];
  const result = new Map<number, PayBreakdown>();

  for (let start = 0; start < unique.length; start += PAY_BATCH_SIZE) {
    const batch = await payForTimesheets(unique.slice(start, start + PAY_BATCH_SIZE));
    for (const [id, pay] of batch) result.set(id, pay);
  }

  return result;
}

function addAmount(totals: Map<string, number>, currency: string, amount: number): void {
  if (!currency) return;
  totals.set(currency, (totals.get(currency) ?? 0) + amount);
}

function toTotals(totals: Map<string, number>): ReportTotalView[] {
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount: Number(amount.toFixed(2)) }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

type PersonAccumulator = {
  id: number;
  fullName: string;
  jobTitle: string | null;
  minutes: number;
  dates: Set<string>;
  rates: Set<number>;
  totals: Map<string, number>;
};

type ProjectAccumulator = {
  id: number;
  name: string;
  code: string | null;
  isClosed: boolean;
  clientName: string;
  minutes: number;
  totals: Map<string, number>;
  people: Map<number, PersonAccumulator>;
};

type DayAccumulator = { minutes: number; totals: Map<string, number> };

function newPersonAccumulator(consultant: {
  id: number;
  full_name: string;
  job_title: string | null;
}): PersonAccumulator {
  return {
    id: consultant.id,
    fullName: consultant.full_name,
    jobTitle: consultant.job_title,
    minutes: 0,
    dates: new Set(),
    rates: new Set(),
    totals: new Map(),
  };
}

function toCompanyPeople(people: Iterable<PersonAccumulator>): CompanyPersonView[] {
  return [...people]
    .sort(
      (left, right) => right.minutes - left.minutes || left.fullName.localeCompare(right.fullName),
    )
    .map((person) => ({
      id: person.id,
      fullName: person.fullName,
      jobTitle: person.jobTitle,
      minutes: person.minutes,
      hours: minutesToHours(person.minutes),
      workedDays: person.dates.size,
      hourlyRates: [...person.rates].sort((left, right) => left - right),
      totals: toTotals(person.totals),
    }));
}

export type CompanyEntry = {
  date: string;
  projectName: string;
  projectCode: string | null;
  clientName: string;
  assignmentCode: string | null;
  consultantName: string;
  status: TimesheetStatus;
  minutes: number;
  hourlyRate: number;
  currency: string;
  amount: number;
};

export async function getCompanyReport(query: CompanyReportQuery): Promise<CompanyReportView> {
  return (await buildCompanyReport(query)).report;
}

export async function buildCompanyReport(
  query: CompanyReportQuery,
): Promise<{ report: CompanyReportView; entries: CompanyEntry[] }> {
  const company = await repository.findCompanyById(query.companyId);

  if (!company) {
    throw ApiError.notFound('La empresa no existe');
  }

  const records = await repository.findCompanyReportDays({
    companyId: query.companyId,
    from: query.from,
    to: query.to,
    statuses: REPORTABLE_STATUSES,
  });

  const pay = await payInBatches(
    records.flatMap((record) => (record.timesheet ? [record.timesheet.id] : [])),
  );

  const projects = new Map<number, ProjectAccumulator>();
  const projectOptions = new Map<number, CompanyFilterOptionsView['projects'][number]>();
  const peopleOptions = new Map<number, CompanyFilterOptionsView['people'][number]>();
  const days = new Map<string, DayAccumulator>();
  const people = new Map<number, PersonAccumulator>();
  const totals = new Map<string, number>();
  const entries: CompanyEntry[] = [];
  let totalMinutes = 0;

  for (const record of records) {
    const entry = toEntryView(record, record.timesheet ? pay.get(record.timesheet.id) : undefined);
    const consultant = record.timesheet?.assignment?.consultant;
    if (!entry || !entry.project || !consultant) continue;

    projectOptions.set(entry.project.id, {
      id: entry.project.id,
      name: entry.project.name,
      code: entry.project.code,
    });
    peopleOptions.set(consultant.id, { id: consultant.id, fullName: consultant.full_name });

    if (query.projectId && entry.project.id !== query.projectId) continue;
    if (query.userId && consultant.id !== query.userId) continue;

    const project = projects.get(entry.project.id) ?? {
      id: entry.project.id,
      name: entry.project.name,
      code: entry.project.code,
      isClosed: record.timesheet?.assignment?.project?.status === 'CLOSED',
      clientName: entry.client?.name ?? '',
      minutes: 0,
      totals: new Map(),
      people: new Map(),
    };
    projects.set(project.id, project);

    const person = project.people.get(consultant.id) ?? newPersonAccumulator(consultant);
    project.people.set(person.id, person);

    const companyPerson = people.get(consultant.id) ?? newPersonAccumulator(consultant);
    people.set(companyPerson.id, companyPerson);

    const day = days.get(record.work_date) ?? { minutes: 0, totals: new Map() };
    days.set(record.work_date, day);

    for (const target of [person, companyPerson]) {
      target.minutes += entry.minutes;
      target.dates.add(record.work_date);
      if (entry.hourlyRate) target.rates.add(entry.hourlyRate);
    }
    project.minutes += entry.minutes;
    day.minutes += entry.minutes;
    totalMinutes += entry.minutes;

    for (const target of [
      person.totals,
      companyPerson.totals,
      project.totals,
      day.totals,
      totals,
    ]) {
      addAmount(target, entry.currency, entry.amount);
    }

    entries.push({
      date: record.work_date,
      projectName: entry.project.name,
      projectCode: entry.project.code,
      clientName: entry.client?.name ?? '',
      assignmentCode: entry.assignmentCode,
      consultantName: consultant.full_name,
      status: entry.status,
      minutes: entry.minutes,
      hourlyRate: entry.hourlyRate,
      currency: entry.currency,
      amount: entry.amount,
    });
  }

  const report: CompanyReportView = {
    company: { id: company.id, name: company.trade_name },
    from: query.from,
    to: query.to,
    rangeDays: rangeDays(query.from, query.to),
    totalMinutes,
    totalHours: minutesToHours(totalMinutes),
    peopleCount: people.size,
    projectCount: projects.size,
    totals: toTotals(totals),
    days: [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({
        date,
        minutes: value.minutes,
        hours: minutesToHours(value.minutes),
        totals: toTotals(value.totals),
      })),
    projects: [...projects.values()]
      .sort((left, right) => right.minutes - left.minutes || left.name.localeCompare(right.name))
      .map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
        isClosed: project.isClosed,
        clientName: project.clientName,
        minutes: project.minutes,
        hours: minutesToHours(project.minutes),
        totals: toTotals(project.totals),
        people: toCompanyPeople(project.people.values()),
      })),
    people: toCompanyPeople(people.values()),
    options: {
      projects: [...projectOptions.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      people: [...peopleOptions.values()].sort((left, right) =>
        left.fullName.localeCompare(right.fullName),
      ),
    },
  };

  entries.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.projectName.localeCompare(right.projectName) ||
      left.consultantName.localeCompare(right.consultantName),
  );

  return { report, entries };
}

export async function exportHoursReport(query: HoursExportQuery): Promise<ExportedFile> {
  const [report, scopes] = await Promise.all([getHoursReport(query), listScopes()]);

  return renderHoursReport(
    report,
    {
      companyName:
        scopes.companies.find((company) => company.id === query.companyId)?.name ?? null,
      projectName:
        scopes.projects.find((project) => project.id === query.projectId)?.name ?? null,
    },
    query.format,
  );
}

export async function exportCompanyReport(query: CompanyExportQuery): Promise<ExportedFile> {
  const { report, entries } = await buildCompanyReport(query);

  return renderCompanyReport(
    report,
    entries,
    {
      byProject: query.byProject,
      byPerson: query.byPerson,
      groupBy: query.groupBy,
      projectName:
        report.options.projects.find((project) => project.id === query.projectId)?.name ?? null,
      personName:
        report.options.people.find((person) => person.id === query.userId)?.fullName ?? null,
    },
    query.format,
  );
}
