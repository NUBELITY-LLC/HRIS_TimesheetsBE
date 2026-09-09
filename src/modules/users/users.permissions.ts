import {
  ROLE_ADMIN,
  ROLE_CONSULTANT,
  ROLE_EMPLOYEE,
  ROLE_FINANCE,
  ROLE_MANAGER,
} from '../../utils/roles.js';

export { ROLE_ADMIN, ROLE_MANAGER };

const MANAGER_MANAGEABLE_ROLES = [
  ROLE_CONSULTANT,
  ROLE_EMPLOYEE,
  ROLE_MANAGER,
  ROLE_FINANCE,
] as const;

const MANAGER_GRANTABLE_ROLES = [ROLE_CONSULTANT, ROLE_EMPLOYEE, ROLE_FINANCE] as const;

export const USER_MANAGER_ROLES = [ROLE_ADMIN, ROLE_MANAGER];

function includes(roles: readonly string[], roleCode: string): boolean {
  return roles.includes(roleCode);
}

export function canManageRole(actorRoleCode: string, targetRoleCode: string): boolean {
  if (actorRoleCode === ROLE_ADMIN) return true;
  if (actorRoleCode === ROLE_MANAGER) return includes(MANAGER_MANAGEABLE_ROLES, targetRoleCode);
  return false;
}

export function canGrantRole(actorRoleCode: string, roleCode: string): boolean {
  if (actorRoleCode === ROLE_ADMIN) return true;
  if (actorRoleCode === ROLE_MANAGER) return includes(MANAGER_GRANTABLE_ROLES, roleCode);
  return false;
}

export function manageableRolesFor(actorRoleCode: string): string[] | 'ALL' {
  if (actorRoleCode === ROLE_ADMIN) return 'ALL';
  if (actorRoleCode === ROLE_MANAGER) return [...MANAGER_MANAGEABLE_ROLES];
  return [];
}

export function grantableRolesFor(actorRoleCode: string): string[] | 'ALL' {
  if (actorRoleCode === ROLE_ADMIN) return 'ALL';
  if (actorRoleCode === ROLE_MANAGER) return [...MANAGER_GRANTABLE_ROLES];
  return [];
}
