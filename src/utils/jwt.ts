import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ALGORITHM = 'HS256';

export type AccessTokenPayload = {
  sub: string;
  userName: string;
  email: string;
  roleId: number;
  roleCode: string;
  mustChangePassword: boolean;
};

export type IssuedToken = {
  token: string;
  expiresIn: number;
  expiresAt: Date;
};

export async function signAccessToken(payload: AccessTokenPayload): Promise<IssuedToken> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + env.JWT_EXPIRES_IN_SECONDS;

  const token = await new SignJWT({
    userName: payload.userName,
    email: payload.email,
    roleId: payload.roleId,
    roleCode: payload.roleCode,
    mustChangePassword: payload.mustChangePassword,
  })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(secret);

  return {
    token,
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
    expiresAt: new Date(expiresAt * 1000),
  };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.userName !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.roleId !== 'number' ||
      typeof payload.roleCode !== 'string' ||
      typeof payload.mustChangePassword !== 'boolean'
    ) {
      throw ApiError.unauthorized('El token no contiene los claims esperados');
    }

    return {
      sub: payload.sub,
      userName: payload.userName,
      email: payload.email,
      roleId: payload.roleId,
      roleCode: payload.roleCode,
      mustChangePassword: payload.mustChangePassword,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof joseErrors.JWTExpired) {
      throw new ApiError(401, 'La sesion expiro, vuelve a iniciar sesion', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Token invalido');
  }
}
