import { ROLE_ADMIN, ROLE_CONSULTANT, ROLE_EMPLOYEE, ROLE_MANAGER } from '../../utils/roles.js';

export { ROLE_ADMIN, ROLE_MANAGER };

const MANAGER_MANAGEABLE_ROLES = [ROLE_CONSULTANT, ROLE_EMPLOYEE] as const;

export const USER_MANAGER_ROLES = [ROLE_ADMIN, ROLE_MANAGER];

export function canManageRole(actorRoleCode: string, targetRoleCode: string): boolean {
  if (actorRoleCode === ROLE_ADMIN) return true;
  if (actorRoleCode === ROLE_MANAGER) {
    return MANAGER_MANAGEABLE_ROLES.includes(
      targetRoleCode as (typeof MANAGER_MANAGEABLE_ROLES)[number],
    );
  }
  return false;
}

export function manageableRolesFor(actorRoleCode: string): string[] | 'ALL' {
  if (actorRoleCode === ROLE_ADMIN) return 'ALL';
  if (actorRoleCode === ROLE_MANAGER) return [...MANAGER_MANAGEABLE_ROLES];
  return [];
}
