import './_env.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type AuthSession = {
  userKey: number;
  userId: string;
  displayName: string;
  expiresAt: number;
};

const COOKIE_NAME = 'luka_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function sessionSecret() {
  const secret = process.env.LUKA_SESSION_SECRET?.trim()
    || process.env.SNOWFLAKE_PRIVATE_KEY_BASE64?.trim()
    || process.env.SNOWFLAKE_PRIVATE_KEY?.trim();
  if (!secret) throw new Error('LUKA_SESSION_SECRET 환경변수가 설정되지 않았습니다.');
  return secret;
}

function signature(payload: string) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function cookieValue(request: Request, name: string) {
  const source = request.headers.get('cookie') ?? '';
  for (const item of source.split(';')) {
    const [key, ...parts] = item.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return '';
}

export function createSessionToken(user: Omit<AuthSession, 'expiresAt'>) {
  const session: AuthSession = {
    ...user,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function sessionFromRequest(request: Request): AuthSession | null {
  const token = cookieValue(request, COOKIE_NAME);
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature) return null;
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthSession;
    if (!session.userId || !session.userKey || session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
