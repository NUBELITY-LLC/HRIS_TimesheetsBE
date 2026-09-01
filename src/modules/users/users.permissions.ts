export const ROLE_ADMIN = 'ADMIN';
export const ROLE_PM = 'PM';

const PM_MANAGEABLE_ROLES = ['CONSULTANT', 'EMPLOYEE'] as const;

export const USER_MANAGER_ROLES = [ROLE_ADMIN, ROLE_PM];

export function canManageRole(actorRoleCode: string, targetRoleCode: string): boolean {
  if (actorRoleCode === ROLE_ADMIN) return true;
  if (actorRoleCode === ROLE_PM) {
    return PM_MANAGEABLE_ROLES.includes(targetRoleCode as (typeof PM_MANAGEABLE_ROLES)[number]);
  }
  return false;
}

export function manageableRolesFor(actorRoleCode: string): string[] | 'ALL' {
  if (actorRoleCode === ROLE_ADMIN) return 'ALL';
  if (actorRoleCode === ROLE_PM) return [...PM_MANAGEABLE_ROLES];
  return [];
}
