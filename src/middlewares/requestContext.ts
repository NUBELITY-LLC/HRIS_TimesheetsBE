import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import { runWithAuditContext } from '../utils/auditContext.js';

const REQUEST_ID_HEADER = 'x-request-id';
const CLIENT_IP_HEADER = 'x-client-ip';
const CLIENT_AGENT_HEADER = 'x-client-user-agent';

function clientIp(req: Request): string | null {
  const forwarded = req.header(CLIENT_IP_HEADER)?.trim();
  if (forwarded && isIP(forwarded)) return forwarded;
  return req.ip ?? null;
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  req.id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.id);

  runWithAuditContext(
    {
      requestId: String(req.id),
      ip: clientIp(req),
      userAgent: req.header(CLIENT_AGENT_HEADER) ?? req.header('user-agent') ?? null,
      actorId: null,
    },
    next,
  );
}
