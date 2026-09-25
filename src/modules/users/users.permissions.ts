import {
  allowedPermissionsFor,
  defaultPermissionsFor,
  hasFixedPermissions,
  PERMISSION_CODES,
  type PermissionCode,
} from '../../utils/permissions.js';
import {
  ROLE_ADMIN,
  ROLE_CONSULTANT,
  ROLE_EMPLOYEE,
  ROLE_EXTERNAL_MANAGER,
  ROLE_FINANCE,
  ROLE_MANAGER,
} from '../../utils/roles.js';

const DELEGATED_MANAGEABLE_ROLES = [
  ROLE_CONSULTANT,
  ROLE_EMPLOYEE,
  ROLE_MANAGER,
  ROLE_FINANCE,
  ROLE_EXTERNAL_MANAGER,
] as const;

const DELEGATED_GRANTABLE_ROLES = [
  ROLE_CONSULTANT,
  ROLE_EMPLOYEE,
  ROLE_FINANCE,
  ROLE_EXTERNAL_MANAGER,
] as const;

function includes(roles: readonly string[], roleCode: string): boolean {
  return roles.includes(roleCode);
}

export function canManageRole(actorRoleCode: string, targetRoleCode: string): boolean {
  if (actorRoleCode === ROLE_ADMIN) return true;
  return includes(DELEGATED_MANAGEABLE_ROLES, targetRoleCode);
}

export function canGrantRole(actorRoleCode: string, roleCode: string): boolean {
  if (actorRoleCode === ROLE_ADMIN) return true;
  return includes(DELEGATED_GRANTABLE_ROLES, roleCode);
}

export function manageableRolesFor(actorRoleCode: string): string[] | 'ALL' {
  if (actorRoleCode === ROLE_ADMIN) return 'ALL';
  return [...DELEGATED_MANAGEABLE_ROLES];
}

export function grantableRolesFor(actorRoleCode: string): string[] | 'ALL' {
  if (actorRoleCode === ROLE_ADMIN) return 'ALL';
  return [...DELEGATED_GRANTABLE_ROLES];
}

export function grantablePermissionsFor(
  actorRoleCode: string,
  actorPermissions: readonly string[],
): PermissionCode[] {
  if (actorRoleCode === ROLE_ADMIN) return [...PERMISSION_CODES];
  return PERMISSION_CODES.filter((code) => actorPermissions.includes(code));
}

export type PermissionResolution =
  | { ok: true; permissions: PermissionCode[] }
  | {
      ok: false;
      code: 'PERMISSION_NOT_ALLOWED_FOR_ROLE' | 'PERMISSION_NOT_GRANTABLE';
      rejected: string[];
    };

export function resolvePermissions(params: {
  roleCode: string;
  requested: readonly string[] | undefined;
  actorRoleCode: string;
  actorPermissions: readonly string[];
  current?: readonly string[];
}): PermissionResolution {
  const { roleCode, actorRoleCode, actorPermissions } = params;

  const requested =
    params.requested === undefined || hasFixedPermissions(roleCode)
      ? defaultPermissionsFor(roleCode)
      : [...new Set(params.requested)];

  const allowed = allowedPermissionsFor(roleCode);
  const outsideRole = requested.filter((code) => !includes(allowed, code));
  if (outsideRole.length) {
    return {
      ok: false,
      code: 'PERMISSION_NOT_ALLOWED_FOR_ROLE',
      rejected: outsideRole,
    };
  }

  if (hasFixedPermissions(roleCode)) {
    return { ok: true, permissions: requested as PermissionCode[] };
  }

  const grantable = [
    ...grantablePermissionsFor(actorRoleCode, actorPermissions),
    ...defaultPermissionsFor(roleCode),
    ...(params.current ?? []),
  ];
  const notGrantable = requested.filter((code) => !includes(grantable, code));
  if (notGrantable.length) {
    return {
      ok: false,
      code: 'PERMISSION_NOT_GRANTABLE',
      rejected: notGrantable,
    };
  }

  return { ok: true, permissions: requested as PermissionCode[] };
}
