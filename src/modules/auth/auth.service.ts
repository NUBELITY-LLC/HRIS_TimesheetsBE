import { waitUntil } from '@vercel/functions';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { fakeVerifyPassword, hashPassword, verifyPassword } from '../../utils/password.js';
import { signAccessToken } from '../../utils/jwt.js';
import { parseDbTimestamp } from '../../utils/timestamps.js';
import { PERMISSION_CODES } from '../../utils/permissions.js';
import * as authRepository from './auth.repository.js';
import type { UserCredentialsRecord } from './auth.repository.js';
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  type AccountRecipient,
} from './auth.emails.js';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  SetPasswordInput,
  UpdateLocaleInput,
} from './auth.schema.js';
import {
  consumeToken,
  findUsableToken,
  issueToken,
  latestPendingToken,
  type TokenPurpose,
} from './auth.tokens.js';

export type AuthenticatedUser = {
  id: number;
  fullName: string;
  userName: string;
  email: string;
  jobTitle: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  locale: 'es' | 'en';
  role: { id: number; code: string; name: string };
  permissions: string[];
};

export type LoginResult = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
  user: AuthenticatedUser;
};

const INVALID_CREDENTIALS_MESSAGE = 'Usuario o contrasena incorrectos';

function lockedError(lockedUntil: Date): ApiError {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));

  return new ApiError(
    423,
    'La cuenta esta bloqueada temporalmente por multiples intentos fallidos',
    'ACCOUNT_LOCKED',
    {
      lockedUntil: lockedUntil.toISOString(),
      retryAfterSeconds,
      remainingAttempts: 0,
    },
  );
}

function invalidCredentialsError(remainingAttempts?: number): ApiError {
  return new ApiError(
    401,
    INVALID_CREDENTIALS_MESSAGE,
    'INVALID_CREDENTIALS',
    remainingAttempts === undefined ? undefined : { remainingAttempts },
  );
}

async function toAuthenticatedUser(record: UserCredentialsRecord): Promise<AuthenticatedUser> {
  if (!record.role) {
    logger.error({ userId: record.id, roleId: record.role_id }, 'Usuario sin rol asociado');
    throw ApiError.internal('La cuenta no tiene un rol valido asignado');
  }

  return {
    id: record.id,
    fullName: record.full_name,
    userName: record.user_name,
    email: record.email,
    jobTitle: record.job_title,
    lastLoginAt: record.last_login_at,
    mustChangePassword: record.must_change_password,
    locale: record.locale,
    role: record.role,
    permissions: await permissionsOf(record.id),
  };
}

async function permissionsOf(userId: number): Promise<string[]> {
  const granted = await authRepository.findPermissionCodes(userId);
  return PERMISSION_CODES.filter((code) => granted.includes(code));
}

async function issueSession(user: AuthenticatedUser): Promise<LoginResult> {
  const issued = await signAccessToken({
    sub: String(user.id),
    userName: user.userName,
    email: user.email,
    roleId: user.role.id,
    roleCode: user.role.code,
    mustChangePassword: user.mustChangePassword,
  });

  return {
    accessToken: issued.token,
    tokenType: 'Bearer',
    expiresIn: issued.expiresIn,
    expiresAt: issued.expiresAt.toISOString(),
    user,
  };
}

function assertActiveAccount(isActive: boolean): void {
  if (!isActive) {
    throw new ApiError(
      403,
      'La cuenta esta inactiva. Contacta al administrador.',
      'ACCOUNT_INACTIVE',
    );
  }
}

function activeLock(record: UserCredentialsRecord): Date | null {
  if (!record.locked_until) return null;

  const lockedUntil = parseDbTimestamp(record.locked_until);
  return lockedUntil.getTime() > Date.now() ? lockedUntil : null;
}

async function registerFailedAttempt(record: UserCredentialsRecord): Promise<never> {
  const attempts = record.failed_attempts + 1;

  if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + env.LOCKOUT_MINUTES * 60_000);
    await authRepository.updateFailedAttempts(record.id, 0, lockedUntil);

    logger.warn(
      { userId: record.id, lockedUntil: lockedUntil.toISOString() },
      'Cuenta bloqueada por intentos fallidos',
    );
    throw lockedError(lockedUntil);
  }

  await authRepository.updateFailedAttempts(record.id, attempts, null);
  throw invalidCredentialsError(env.MAX_LOGIN_ATTEMPTS - attempts);
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const record = await authRepository.findByUsernameOrEmail(input.username);

  if (!record?.password_hash) {
    await fakeVerifyPassword(input.password);
    throw invalidCredentialsError();
  }

  assertActiveAccount(record.is_active);

  const lockedUntil = activeLock(record);
  if (lockedUntil) {
    throw lockedError(lockedUntil);
  }

  const passwordMatches = await verifyPassword(input.password, record.password_hash);
  if (!passwordMatches) {
    await registerFailedAttempt(record);
  }

  const user = await toAuthenticatedUser(record);
  await authRepository.registerSuccessfulLogin(record.id);

  logger.info(
    { userId: user.id, roleCode: user.role.code, mustChangePassword: user.mustChangePassword },
    'Login exitoso',
  );

  return issueSession(user);
}

export async function getProfile(userId: number): Promise<AuthenticatedUser> {
  const record = await authRepository.findById(userId);

  if (!record) {
    throw ApiError.unauthorized('La cuenta asociada al token ya no existe');
  }
  assertActiveAccount(record.is_active);

  return await toAuthenticatedUser(record);
}

export async function updateLocale(
  userId: number,
  input: UpdateLocaleInput,
): Promise<{ locale: UpdateLocaleInput['locale'] }> {
  await authRepository.updateLocale(userId, input.locale);
  return { locale: input.locale };
}

export async function changePassword(
  userId: number,
  input: ChangePasswordInput,
): Promise<LoginResult> {
  const record = await authRepository.findById(userId);

  if (!record?.password_hash) {
    throw ApiError.unauthorized('La cuenta asociada al token ya no existe');
  }
  assertActiveAccount(record.is_active);

  if (record.must_change_password) {
    const reusesProvisional = await verifyPassword(input.newPassword, record.password_hash);
    if (reusesProvisional) {
      throw new ApiError(
        400,
        'La nueva contrasena debe ser distinta a la provisional',
        'PASSWORD_NOT_CHANGED',
      );
    }
  } else {
    if (input.currentPassword === undefined) {
      throw new ApiError(
        400,
        'Debes enviar tu contrasena actual',
        'CURRENT_PASSWORD_REQUIRED',
      );
    }

    const currentMatches = await verifyPassword(input.currentPassword, record.password_hash);
    if (!currentMatches) {
      logger.warn({ userId }, 'Intento fallido de cambio de contrasena');
      throw new ApiError(401, 'La contrasena actual no es correcta', 'INVALID_CURRENT_PASSWORD');
    }
  }

  await authRepository.updatePassword(userId, await hashPassword(input.newPassword));

  logger.info(
    { userId, forced: record.must_change_password },
    'Contrasena actualizada por el propio usuario',
  );

  waitUntil(sendPasswordChangedEmail(recipientOf(record)));

  return issueSession({ ...(await toAuthenticatedUser(record)), mustChangePassword: false });
}

export type AccountLinkView = {
  purpose: 'INVITE' | 'RESET';
  fullName: string;
  userName: string;
  email: string;
  expiresAt: string;
};

type UsableLink = { tokenId: number; record: UserCredentialsRecord; expiresAt: string };

const RESET_REQUEST_COOLDOWN_MS = 2 * 60 * 1000;

function recipientOf(record: UserCredentialsRecord): AccountRecipient {
  return {
    id: record.id,
    fullName: record.full_name,
    userName: record.user_name,
    email: record.email,
    locale: record.locale,
  };
}

function invalidLinkError(purpose: TokenPurpose): ApiError {
  return purpose === 'INVITE'
    ? new ApiError(404, 'La invitacion no es valida o ya vencio', 'INVITATION_INVALID')
    : new ApiError(404, 'El enlace no es valido o ya vencio', 'RESET_LINK_INVALID');
}

function isEligible(record: UserCredentialsRecord, purpose: TokenPurpose): boolean {
  if (!record.is_active) return false;
  return purpose === 'INVITE' ? !record.password_hash : Boolean(record.password_hash);
}

async function resolveLink(token: string, purpose: TokenPurpose): Promise<UsableLink> {
  const found = await findUsableToken(token, purpose);
  if (!found) throw invalidLinkError(purpose);

  const record = await authRepository.findById(found.userId);
  if (!record || !isEligible(record, purpose)) throw invalidLinkError(purpose);

  return { tokenId: found.id, record, expiresAt: found.expiresAt };
}

export async function describeAccountLink(
  token: string,
  purpose: TokenPurpose,
): Promise<AccountLinkView> {
  const { record, expiresAt } = await resolveLink(token, purpose);

  return {
    purpose,
    fullName: record.full_name,
    userName: record.user_name,
    email: record.email,
    expiresAt: parseDbTimestamp(expiresAt).toISOString(),
  };
}

export async function completeAccountLink(
  token: string,
  purpose: TokenPurpose,
  input: SetPasswordInput,
): Promise<LoginResult> {
  const { tokenId, record } = await resolveLink(token, purpose);

  if (!(await consumeToken(tokenId))) throw invalidLinkError(purpose);

  await authRepository.updatePassword(record.id, await hashPassword(input.password));
  await authRepository.registerSuccessfulLogin(record.id);

  logger.info(
    { userId: record.id, purpose },
    purpose === 'INVITE' ? 'Invitacion aceptada' : 'Contrasena restablecida por enlace',
  );

  if (purpose === 'RESET') {
    waitUntil(sendPasswordChangedEmail(recipientOf(record)));
  }

  return issueSession({ ...(await toAuthenticatedUser(record)), mustChangePassword: false });
}

async function processResetRequest(email: string): Promise<void> {
  const record = await authRepository.findByEmail(email);

  if (!record || !isEligible(record, 'RESET')) {
    logger.info('Solicitud de restablecimiento sin cuenta elegible');
    return;
  }

  const pending = await latestPendingToken(record.id, 'RESET');
  if (
    pending &&
    Date.now() - parseDbTimestamp(pending.createdAt).getTime() < RESET_REQUEST_COOLDOWN_MS
  ) {
    logger.info({ userId: record.id }, 'Solicitud de restablecimiento repetida, se omite');
    return;
  }

  const issued = await issueToken(record.id, 'RESET', null);
  const sent = await sendPasswordResetEmail(recipientOf(record), issued.link, issued.expiresAt);

  logger.info({ userId: record.id, emailSent: sent }, 'Enlace de restablecimiento solicitado');
}

export function requestPasswordReset(input: ForgotPasswordInput): void {
  waitUntil(
    processResetRequest(input.email).catch((error: unknown) => {
      logger.error({ err: error }, 'Fallo la solicitud de restablecimiento');
    }),
  );
}
