import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword } from '../../utils/password.js';
import * as usersRepository from './users.repository.js';
import type { SortColumn, UserPatch, UserRecord } from './users.repository.js';
import { canManageRole, manageableRolesFor } from './users.permissions.js';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateOwnProfileInput,
  UpdateUserInput,
} from './users.schema.js';

export type UserView = {
  id: number;
  fullName: string;
  userName: string;
  email: string;
  jobTitle: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  role: { id: number; code: string; name: string };
};

export type Actor = { id: number; roleCode: string };

const SORT_COLUMNS: Record<ListUsersQuery['sortBy'], SortColumn> = {
  id: 'id',
  fullName: 'full_name',
  userName: 'user_name',
  email: 'email',
  lastLoginAt: 'last_login_at',
};

function toUserView(record: UserRecord): UserView {
  if (!record.role) {
    logger.error({ userId: record.id }, 'Usuario sin rol asociado');
    throw ApiError.internal('El usuario no tiene un rol valido asignado');
  }

  return {
    id: record.id,
    fullName: record.full_name,
    userName: record.user_name,
    email: record.email,
    jobTitle: record.job_title,
    isActive: record.is_active,
    mustChangePassword: record.must_change_password,
    lastLoginAt: record.last_login_at,
    role: record.role,
  };
}

function roleNotAllowedError(actorRoleCode: string, targetRoleCode: string): ApiError {
  return new ApiError(
    403,
    `Tu rol no puede gestionar usuarios con el rol "${targetRoleCode}"`,
    'ROLE_NOT_ALLOWED',
    { allowedRoles: manageableRolesFor(actorRoleCode) },
  );
}

async function resolveRole(roleCode: string, actor: Actor): Promise<usersRepository.RoleRecord> {
  const role = await usersRepository.findRoleByCode(roleCode);

  if (!role) {
    throw ApiError.badRequest(`El rol "${roleCode}" no existe`, {
      allowedRoles: manageableRolesFor(actor.roleCode),
    });
  }

  if (!canManageRole(actor.roleCode, role.code)) {
    logger.warn(
      { actorId: actor.id, actorRole: actor.roleCode, targetRole: role.code },
      'Intento de asignar un rol no permitido',
    );
    throw roleNotAllowedError(actor.roleCode, role.code);
  }

  return role;
}

async function loadManageableUser(id: number, actor: Actor): Promise<UserRecord> {
  const record = await usersRepository.findUserById(id);

  if (!record) {
    throw ApiError.notFound('El usuario no existe');
  }

  const view = toUserView(record);

  if (!canManageRole(actor.roleCode, view.role.code)) {
    logger.warn(
      { actorId: actor.id, actorRole: actor.roleCode, targetUserId: id },
      'Intento de gestionar un usuario fuera de su alcance',
    );
    throw roleNotAllowedError(actor.roleCode, view.role.code);
  }

  return record;
}

export async function createUser(input: CreateUserInput, actor: Actor): Promise<UserView> {
  const role = await resolveRole(input.roleCode, actor);

  const created = await usersRepository.insertUser({
    role_id: role.id,
    full_name: input.fullName,
    user_name: input.userName,
    email: input.email,
    password_hash: await hashPassword(input.password),
    job_title: input.jobTitle ?? null,
    is_active: input.isActive ?? true,
    must_change_password: true,
  });

  logger.info({ userId: created.id, roleCode: role.code, createdBy: actor.id }, 'Usuario creado');

  return toUserView(created);
}

export async function listUsers(
  query: ListUsersQuery,
): Promise<{ users: UserView[]; total: number }> {
  let roleId: number | undefined;

  if (query.roleCode) {
    const role = await usersRepository.findRoleByCode(query.roleCode);
    if (!role) {
      return { users: [], total: 0 };
    }
    roleId = role.id;
  }

  const { rows, total } = await usersRepository.findUsers({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    roleId,
    isActive: query.status === 'all' ? undefined : query.status === 'active',
    sortColumn: SORT_COLUMNS[query.sortBy],
    ascending: query.sortDir === 'asc',
  });

  return { users: rows.map(toUserView), total };
}

export async function getUserById(id: number): Promise<UserView> {
  const record = await usersRepository.findUserById(id);

  if (!record) {
    throw ApiError.notFound('El usuario no existe');
  }

  return toUserView(record);
}

export async function updateUser(
  id: number,
  input: UpdateUserInput,
  actor: Actor,
): Promise<UserView> {
  const target = await loadManageableUser(id, actor);
  const isSelf = target.id === actor.id;

  const patch: UserPatch = {};

  if (input.roleCode !== undefined) {
    const role = await resolveRole(input.roleCode, actor);
    if (isSelf && role.id !== target.role?.id) {
      throw new ApiError(403, 'No puedes cambiar tu propio rol', 'SELF_ROLE_CHANGE');
    }
    patch.role_id = role.id;
  }

  if (input.isActive !== undefined) {
    if (isSelf && !input.isActive) {
      throw new ApiError(403, 'No puedes desactivar tu propia cuenta', 'SELF_DEACTIVATION');
    }
    patch.is_active = input.isActive;
  }

  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.userName !== undefined) patch.user_name = input.userName;
  if (input.email !== undefined) patch.email = input.email;
  if (input.jobTitle !== undefined) patch.job_title = input.jobTitle;

  if (input.password !== undefined) {
    patch.password_hash = await hashPassword(input.password);
    patch.must_change_password = !isSelf;
  }

  const updated = await usersRepository.updateUser(id, patch);

  if (!updated) {
    throw ApiError.notFound('El usuario no existe');
  }

  logger.info(
    { userId: id, updatedBy: actor.id, fields: Object.keys(patch) },
    'Usuario actualizado',
  );

  return toUserView(updated);
}

export async function deactivateUser(id: number, actor: Actor): Promise<UserView> {
  const target = await loadManageableUser(id, actor);

  if (target.id === actor.id) {
    throw new ApiError(403, 'No puedes desactivar tu propia cuenta', 'SELF_DEACTIVATION');
  }

  if (!target.is_active) {
    return toUserView(target);
  }

  const updated = await usersRepository.updateUser(id, { is_active: false });

  if (!updated) {
    throw ApiError.notFound('El usuario no existe');
  }

  logger.info({ userId: id, deactivatedBy: actor.id }, 'Usuario desactivado');

  return toUserView(updated);
}

export async function updateOwnProfile(
  actorId: number,
  input: UpdateOwnProfileInput,
): Promise<UserView> {
  const updated = await usersRepository.updateUser(actorId, { full_name: input.fullName });

  if (!updated) {
    throw ApiError.unauthorized('La cuenta asociada al token ya no existe');
  }

  logger.info({ userId: actorId }, 'Perfil actualizado por el propio usuario');

  return toUserView(updated);
}
