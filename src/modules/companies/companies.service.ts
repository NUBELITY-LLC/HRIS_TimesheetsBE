import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { isEmailAllowed } from '../../utils/emailDomains.js';
import * as companiesRepository from './companies.repository.js';
import type { CompanyPatch, CompanyRecord, SortColumn } from './companies.repository.js';
import type {
  CreateCompanyInput,
  ListCompaniesQuery,
  UpdateCompanyInput,
} from './companies.schema.js';

export type Actor = { id: number; roleCode: string };

export type CompanyView = {
  id: number;
  legalName: string;
  tradeName: string;
  rfc: string | null;
  isActive: boolean;
  allowedEmailDomains: string[];
};

const SORT_COLUMNS: Record<ListCompaniesQuery['sortBy'], SortColumn> = {
  id: 'id',
  legalName: 'legal_name',
  tradeName: 'trade_name',
};

export function toCompanyView(record: CompanyRecord): CompanyView {
  return {
    id: record.id,
    legalName: record.legal_name,
    tradeName: record.trade_name,
    rfc: record.rfc,
    isActive: record.is_active,
    allowedEmailDomains: record.allowed_email_domains ?? [],
  };
}

export function assertEmailAllowed(
  email: string | null | undefined,
  company: { trade_name: string; allowed_email_domains: string[] | null },
  field: string,
): void {
  const domains = company.allowed_email_domains ?? [];

  if (!email || isEmailAllowed(email, domains)) return;

  throw ApiError.unprocessable(
    `El correo debe pertenecer a ${domains.length === 1 ? 'el dominio' : 'uno de los dominios'} de ${company.trade_name}: ${domains.join(', ')}`,
    { field, code: 'EMAIL_DOMAIN_NOT_ALLOWED', allowedDomains: domains },
  );
}

export async function resolveCompany(companyId: number): Promise<CompanyRecord> {
  const company = await companiesRepository.findCompanyById(companyId);

  if (!company) {
    throw ApiError.badRequest('La empresa indicada no existe', { field: 'companyId' });
  }

  if (!company.is_active) {
    throw ApiError.unprocessable('La empresa esta inactiva', { field: 'companyId' });
  }

  return company;
}

export async function createCompany(
  input: CreateCompanyInput,
  actor: Actor,
): Promise<CompanyView> {
  const created = await companiesRepository.insertCompany({
    legal_name: input.legalName,
    trade_name: input.tradeName,
    rfc: input.rfc ?? null,
    is_active: input.isActive ?? true,
    allowed_email_domains: input.allowedEmailDomains ?? [],
  });

  logger.info({ companyId: created.id, createdBy: actor.id }, 'Empresa creada');

  return toCompanyView(created);
}

export async function listCompanies(
  query: ListCompaniesQuery,
): Promise<{ companies: CompanyView[]; total: number }> {
  const { rows, total } = await companiesRepository.findCompanies({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    isActive: query.status === 'all' ? undefined : query.status === 'active',
    sortColumn: SORT_COLUMNS[query.sortBy],
    ascending: query.sortDir === 'asc',
  });

  return { companies: rows.map(toCompanyView), total };
}

export async function getCompanyById(id: number): Promise<CompanyView> {
  const record = await companiesRepository.findCompanyById(id);

  if (!record) {
    throw ApiError.notFound('La empresa no existe');
  }

  return toCompanyView(record);
}

export async function updateCompany(
  id: number,
  input: UpdateCompanyInput,
  actor: Actor,
): Promise<CompanyView> {
  const target = await companiesRepository.findCompanyById(id);

  if (!target) {
    throw ApiError.notFound('La empresa no existe');
  }

  const patch: CompanyPatch = {};

  if (input.legalName !== undefined) patch.legal_name = input.legalName;
  if (input.tradeName !== undefined) patch.trade_name = input.tradeName;
  if (input.rfc !== undefined) patch.rfc = input.rfc;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.allowedEmailDomains !== undefined) {
    await assertClientsMatchDomains(id, input.allowedEmailDomains);
    patch.allowed_email_domains = input.allowedEmailDomains;
  }

  const updated = await companiesRepository.updateCompany(id, patch);

  if (!updated) {
    throw ApiError.notFound('La empresa no existe');
  }

  logger.info(
    { companyId: id, updatedBy: actor.id, fields: Object.keys(patch) },
    'Empresa actualizada',
  );

  return toCompanyView(updated);
}

async function assertClientsMatchDomains(companyId: number, domains: string[]): Promise<void> {
  if (domains.length === 0) return;

  const outside = (await companiesRepository.findActiveClientEmails(companyId)).filter(
    (client) => !isEmailAllowed(client.email, domains),
  );

  const outsideUsers = (await companiesRepository.findActiveConsultantEmails(companyId)).filter(
    (user) => !isEmailAllowed(user.email, domains),
  );

  if (outsideUsers.length > 0) {
    throw ApiError.unprocessable(
      `Hay colaboradores asignados a proyectos de esta empresa con correo fuera de los dominios indicados: ${outsideUsers
        .map((user) => `${user.fullName} (${user.email})`)
        .join(', ')}`,
      {
        field: 'allowedEmailDomains',
        code: 'CONSULTANT_EMAIL_OUTSIDE_DOMAINS',
        users: outsideUsers,
      },
    );
  }

  if (outside.length === 0) return;

  throw ApiError.unprocessable(
    `Hay gerentes con correo fuera de los dominios indicados: ${outside
      .map((client) => `${client.clientName} (${client.email})`)
      .join(', ')}`,
    {
      field: 'allowedEmailDomains',
      code: 'CLIENT_EMAIL_OUTSIDE_DOMAINS',
      clients: outside,
    },
  );
}

export async function deactivateCompany(id: number, actor: Actor): Promise<CompanyView> {
  const target = await companiesRepository.findCompanyById(id);

  if (!target) {
    throw ApiError.notFound('La empresa no existe');
  }

  if (!target.is_active) {
    return toCompanyView(target);
  }

  const updated = await companiesRepository.updateCompany(id, { is_active: false });

  if (!updated) {
    throw ApiError.notFound('La empresa no existe');
  }

  logger.info({ companyId: id, deactivatedBy: actor.id }, 'Empresa desactivada');

  return toCompanyView(updated);
}
