import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';

const SESSION_COOKIE = 'mg_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const secretKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface SessionClaims {
  sid: string;
  uid: string;
  role: 'owner' | 'admin' | 'member';
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    if (typeof payload.sid !== 'string' || typeof payload.sub !== 'string') return null;
    if (payload.role !== 'owner' && payload.role !== 'admin' && payload.role !== 'member') return null;
    return { sid: payload.sid, uid: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: SESSION_COOKIE,
  ttlSeconds: SESSION_TTL_SECONDS,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: true,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  },
};

/** In local development the app may be served over plain http, so secure cookies must be relaxed. */
export function cookieOptionsForEnv() {
  const { secure, ...rest } = sessionCookie.options;
  return { ...rest, secure: env.NODE_ENV === 'production' };
}
