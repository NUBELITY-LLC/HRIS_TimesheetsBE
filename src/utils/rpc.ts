export type RpcFailure = { code: string; detail?: string };

export const RAISE_EXCEPTION = 'P0001';

export class RpcError extends Error {
  readonly failure: RpcFailure;

  constructor(failure: RpcFailure) {
    super(failure.code);
    this.name = 'RpcError';
    this.failure = failure;
  }
}

export function parseRpcFailure(message: string): RpcFailure {
  const trimmed = message.trim();
  const separator = trimmed.indexOf(':');

  if (separator === -1) return { code: trimmed };

  return { code: trimmed.slice(0, separator), detail: trimmed.slice(separator + 1).trim() };
}
