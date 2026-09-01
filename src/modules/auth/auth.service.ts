import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { fakeVerifyPassword, hashPassword, verifyPassword } from '../../utils/password.js';
import { signAccessToken } from '../../utils/jwt.js';
import * as authRepository from './auth.repository.js';
import type { UserCredentialsRecord } from './auth.repository.js';
import type { ChangePasswordInput, LoginInput } from './auth.schema.js';

export type AuthenticatedUser = {
  id: number;
  fullName: string;
  userName: string;
  email: string;
  jobTitle: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  role: { id: number; code: string; name: string };
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

function toAuthenticatedUser(record: UserCredentialsRecord): AuthenticatedUser {
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
    role: record.role,
  };
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

  const lockedUntil = new Date(record.locked_until);
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

  if (!record) {
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

  const user = toAuthenticatedUser(record);
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

  return toAuthenticatedUser(record);
}

export async function changePassword(
  userId: number,
  input: ChangePasswordInput,
): Promise<LoginResult> {
  const record = await authRepository.findById(userId);

  if (!record) {
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

  return issueSession({ ...toAuthenticatedUser(record), mustChangePassword: false });
}
