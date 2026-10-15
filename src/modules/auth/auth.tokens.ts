import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';

export type TokenPurpose = 'INVITE' | 'RESET';

export type IssuedAccountToken = {
  token: string;
  link: string;
  expiresAt: string;
};

export type ResolvedAccountToken = {
  id: number;
  userId: number;
  expiresAt: string;
};

const LIFETIME_MS: Record<TokenPurpose, number> = {
  INVITE: 72 * 60 * 60 * 1000,
  RESET: 60 * 60 * 1000,
};

const LINK_PATHS: Record<TokenPurpose, string> = {
  INVITE: '/invite',
  RESET: '/reset-password',
};

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en los enlaces de cuenta');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function accountLink(purpose: TokenPurpose, token: string): string {
  return `${env.appBaseUrl}${LINK_PATHS[purpose]}/${token}`;
}

export async function issueToken(
  userId: number,
  purpose: TokenPurpose,
  createdBy: number | null,
): Promise<IssuedAccountToken> {
  const { error: revokeError } = await supabase
    .from('USER_TOKENS')
    .delete()
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('used_at', null);

  if (revokeError) fail('issueToken:revoke', revokeError);

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + LIFETIME_MS[purpose]).toISOString();

  const { error } = await supabase.from('USER_TOKENS').insert({
    user_id: userId,
    purpose,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    created_by: createdBy,
  });

  if (error) fail('issueToken:insert', error);

  return { token, link: accountLink(purpose, token), expiresAt };
}

export async function findUsableToken(
  token: string,
  purpose: TokenPurpose,
): Promise<ResolvedAccountToken | null> {
  if (!TOKEN_FORMAT.test(token)) return null;

  const { data, error } = await supabase
    .from('USER_TOKENS')
    .select('id, user_id, expires_at')
    .eq('token_hash', hashToken(token))
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) fail('findUsableToken', error);
  if (!data) return null;

  return { id: data.id, userId: data.user_id, expiresAt: data.expires_at };
}

export async function consumeToken(id: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('USER_TOKENS')
    .update({ used_at: new Date().toISOString() })
    .eq('id', id)
    .is('used_at', null)
    .select('id');

  if (error) fail('consumeToken', error);

  return (data ?? []).length === 1;
}

export async function revokeTokens(userId: number, purpose: TokenPurpose): Promise<void> {
  const { error } = await supabase
    .from('USER_TOKENS')
    .delete()
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('used_at', null);

  if (error) fail('revokeTokens', error);
}

export async function latestPendingToken(
  userId: number,
  purpose: TokenPurpose,
): Promise<{ expiresAt: string; createdAt: string } | null> {
  const { data, error } = await supabase
    .from('USER_TOKENS')
    .select('expires_at, created_at')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) fail('latestPendingToken', error);
  if (!data) return null;

  return { expiresAt: data.expires_at, createdAt: data.created_at };
}
