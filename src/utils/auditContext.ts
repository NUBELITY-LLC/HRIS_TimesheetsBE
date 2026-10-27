import { AsyncLocalStorage } from 'node:async_hooks';

export type AuditContext = {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  actorId: number | null;
};

const storage = new AsyncLocalStorage<AuditContext>();

function headerSafe(value: string, max: number): string {
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, max);
}

export function runWithAuditContext<T>(context: AuditContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function setAuditActor(actorId: number): void {
  const context = storage.getStore();
  if (context) context.actorId = actorId;
}

export function auditHeaders(): Record<string, string> {
  const context = storage.getStore();
  if (!context) return {};

  const headers: Record<string, string> = {
    'x-audit-request-id': headerSafe(context.requestId, 128),
  };

  if (context.actorId) headers['x-audit-actor-id'] = String(context.actorId);
  if (context.ip) headers['x-audit-ip'] = headerSafe(context.ip, 64);
  if (context.userAgent) headers['x-audit-user-agent'] = headerSafe(context.userAgent, 400);

  return headers;
}
