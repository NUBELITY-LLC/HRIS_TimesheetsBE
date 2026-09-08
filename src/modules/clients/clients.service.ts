import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { resolveCompany } from '../companies/companies.service.js';
import type { CompanyView } from '../companies/companies.service.js';
import * as clientsRepository from './clients.repository.js';
import type { ClientPatch, ClientRecord, SortColumn } from './clients.repository.js';
import type { CreateClientInput, ListClientsQuery, UpdateClientInput } from './clients.schema.js';

export type Actor = { id: number; roleCode: string };

export type ClientView = {
  id: number;
  clientName: string;
  contactEmail: string | null;
  isActive: boolean;
  company: CompanyView | null;
};

const SORT_COLUMNS: Record<ListClientsQuery['sortBy'], SortColumn> = {
  id: 'id',
  clientName: 'client_name',
};

function toClientView(record: ClientRecord): ClientView {
  return {
    id: record.id,
    clientName: record.client_name,
    contactEmail: record.contact_email,
    isActive: record.is_active,
    company: record.company
      ? {
          id: record.company.id,
          legalName: record.company.legal_name,
          tradeName: record.company.trade_name,
          rfc: record.company.rfc,
          isActive: record.company.is_active,
        }
      : null,
  };
}

export async function createClient(input: CreateClientInput, actor: Actor): Promise<ClientView> {
  await resolveCompany(input.companyId);

  const created = await clientsRepository.insertClient({
    company_id: input.companyId,
    client_name: input.clientName,
    contact_email: input.contactEmail ?? null,
    is_active: input.isActive ?? true,
  });

  logger.info({ clientId: created.id, createdBy: actor.id }, 'Cliente creado');

  return toClientView(created);
}

export async function listClients(
  query: ListClientsQuery,
): Promise<{ clients: ClientView[]; total: number }> {
  const { rows, total } = await clientsRepository.findClients({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    companyId: query.companyId,
    isActive: query.status === 'all' ? undefined : query.status === 'active',
    sortColumn: SORT_COLUMNS[query.sortBy],
    ascending: query.sortDir === 'asc',
  });

  return { clients: rows.map(toClientView), total };
}

export async function getClientById(id: number): Promise<ClientView> {
  const record = await clientsRepository.findClientById(id);

  if (!record) {
    throw ApiError.notFound('El cliente no existe');
  }

  return toClientView(record);
}

export async function updateClient(
  id: number,
  input: UpdateClientInput,
  actor: Actor,
): Promise<ClientView> {
  const target = await clientsRepository.findClientById(id);

  if (!target) {
    throw ApiError.notFound('El cliente no existe');
  }

  const patch: ClientPatch = {};

  if (input.companyId !== undefined) {
    await resolveCompany(input.companyId);
    patch.company_id = input.companyId;
  }
  if (input.clientName !== undefined) patch.client_name = input.clientName;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const updated = await clientsRepository.updateClient(id, patch);

  if (!updated) {
    throw ApiError.notFound('El cliente no existe');
  }

  logger.info({ clientId: id, updatedBy: actor.id, fields: Object.keys(patch) }, 'Cliente actualizado');

  return toClientView(updated);
}

export async function deactivateClient(id: number, actor: Actor): Promise<ClientView> {
  const target = await clientsRepository.findClientById(id);

  if (!target) {
    throw ApiError.notFound('El cliente no existe');
  }

  if (!target.is_active) {
    return toClientView(target);
  }

  const updated = await clientsRepository.updateClient(id, { is_active: false });

  if (!updated) {
    throw ApiError.notFound('El cliente no existe');
  }

  logger.info({ clientId: id, deactivatedBy: actor.id }, 'Cliente desactivado');

  return toClientView(updated);
}
