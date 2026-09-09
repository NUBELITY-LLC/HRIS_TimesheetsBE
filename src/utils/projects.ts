export const PROJECT_STATUSES = ['ACTIVE', 'CLOSED'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_ACTIVE: ProjectStatus = 'ACTIVE';
export const PROJECT_STATUS_CLOSED: ProjectStatus = 'CLOSED';
