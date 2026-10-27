import './_env.js';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { query, tableName } from './_snowflake.js';
import {
  clearSessionCookie,
  createSessionToken,
  sessionCookie,
  sessionFromRequest,
} from './_session.js';

type Row = Record<string, unknown>;
type UserRow = {
  USER_KEY: number;
  USER_ID: string;
  PASSWORD_HASH: string;
  DISPLAY_NAME: string | null;
  STATUS: string | null;
};
type LegacyRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type LegacyResponse = {
  status(code: number): LegacyResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
};

const USER_ID_PATTERN = /^[A-Za-z0-9_]{3,30}$/;
const ITERATIONS = 120_000;

const json = (body: unknown, status = 200, headers: HeadersInit = {}) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
});

const text = (value: unknown) => String(value ?? '').trim();

async function findUser(userId: string) {
  const rows = await query<UserRow>(
    `SELECT USER_KEY, USER_ID, PASSWORD_HASH, DISPLAY_NAME, STATUS FROM ${tableName('LUKA_USER')} WHERE UPPER(USER_ID) = UPPER(?) ORDER BY USER_KEY LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  try {
    const iterations = Number(parts[1]);
    const salt = Buffer.from(parts[2], 'base64');
    const expected = Buffer.from(parts[3], 'base64');
    const actual = pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function publicUser(user: Pick<UserRow, 'USER_KEY' | 'USER_ID' | 'DISPLAY_NAME'>) {
  return {
    userKey: Number(user.USER_KEY),
    userId: user.USER_ID,
    displayName: user.DISPLAY_NAME || user.USER_ID,
  };
}

function authenticated(user: UserRow) {
  const visible = publicUser(user);
  const token = createSessionToken({ ...visible });
  return json({ authenticated: true, user: visible }, 200, { 'Set-Cookie': sessionCookie(token) });
}

async function login(input: Row) {
  const userId = text(input.userId).toLowerCase();
  const password = String(input.password ?? '');
  if (!userId || !password) return json({ message: '아이디와 비밀번호를 입력해 주세요.' }, 400);
  const user = await findUser(userId);
  if (!user || !verifyPassword(password, user.PASSWORD_HASH)) {
    return json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
  }
  if (user.STATUS && user.STATUS.toUpperCase() !== 'ACTIVE') {
    return json({ message: '사용할 수 없는 계정입니다.' }, 403);
  }
  await query(`UPDATE ${tableName('LUKA_USER')} SET LAST_LOGIN_AT = CURRENT_TIMESTAMP() WHERE USER_KEY = ?`, [user.USER_KEY]);
  return authenticated(user);
}

async function signup(input: Row) {
  const userId = text(input.userId).toLowerCase();
  const password = String(input.password ?? '');
  const passwordConfirm = String(input.passwordConfirm ?? '');
  const displayName = text(input.displayName);
  const email = text(input.email);
  if (!USER_ID_PATTERN.test(userId)) return json({ message: '아이디는 영문, 숫자, 밑줄 3자 이상 30자 이하로 입력해 주세요.' }, 400);
  if (password.length < 4 || password.length > 50) return json({ message: '비밀번호는 4자 이상 50자 이하로 입력해 주세요.' }, 400);
  if (password !== passwordConfirm) return json({ message: '비밀번호 확인이 일치하지 않습니다.' }, 400);
  if (displayName.length > 100) return json({ message: '이름은 100자 이하로 입력해 주세요.' }, 400);
  if (email.length > 255) return json({ message: '이메일은 255자 이하로 입력해 주세요.' }, 400);
  if (await findUser(userId)) return json({ message: '이미 사용 중인 아이디입니다.' }, 409);

  await query(
    `INSERT INTO ${tableName('LUKA_USER')} (USER_ID, PASSWORD_HASH, DISPLAY_NAME, EMAIL, STATUS) VALUES (?, ?, ?, ?, 'ACTIVE')`,
    [userId, hashPassword(password), displayName || userId, email || null],
  );
  const created = await findUser(userId);
  if (!created) throw new Error('가입한 사용자 정보를 확인하지 못했습니다.');
  return authenticated(created);
}

async function fetchHandler(request: Request) {
  try {
    if (request.method === 'GET') {
      const session = sessionFromRequest(request);
      return json(session
        ? { authenticated: true, user: { userKey: session.userKey, userId: session.userId, displayName: session.displayName } }
        : { authenticated: false, user: null });
    }
    if (request.method !== 'POST') return json({ message: '허용되지 않은 메서드입니다.' }, 405);
    const body = await request.json() as { action?: string } & Row;
    if (body.action === 'login') return login(body);
    if (body.action === 'signup') return signup(body);
    if (body.action === 'logout') return json({ authenticated: false, user: null }, 200, { 'Set-Cookie': clearSessionCookie() });
    return json({ message: '지원하지 않는 인증 요청입니다.' }, 400);
  } catch (reason) {
    const error = reason as { message?: string; code?: string };
    console.error('Snowflake auth error', error.code, error.message);
    return json({ message: error.message || '인증 요청을 처리하지 못했습니다.' }, 500);
  }
}

export default async function handler(request: LegacyRequest, response: LegacyResponse) {
  const headers = new Headers();
  Object.entries(request.headers).forEach(([name, value]) => {
    if (value != null) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  });
  const method = request.method || 'GET';
  const origin = `https://${headers.get('host') || 'localhost'}`;
  const url = new URL(request.url || '/api/auth', origin);
  const body = method === 'GET' || method === 'HEAD' || request.body == null
    ? undefined
    : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const result = await fetchHandler(new Request(url, { method, headers, body }));
  result.headers.forEach((value, name) => response.setHeader(name, value));
  response.status(result.status).send(await result.text());
}
