export type AuthUser = {
  userKey: number;
  userId: string;
  displayName: string;
};

type AuthResponse = {
  authenticated: boolean;
  user: AuthUser | null;
  message?: string;
};

export type SignupInput = {
  userId: string;
  password: string;
  passwordConfirm: string;
  displayName: string;
  email: string;
};

async function authRequest(init?: RequestInit) {
  const response = await fetch('/api/auth', {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as AuthResponse;
  if (!response.ok) throw new Error(payload.message || '인증 요청을 처리하지 못했습니다.');
  return payload;
}

export async function currentUser() {
  const result = await authRequest();
  return result.authenticated ? result.user : null;
}

export async function signIn(userId: string, password: string) {
  const result = await authRequest({
    method: 'POST',
    body: JSON.stringify({ action: 'login', userId: userId.trim(), password }),
  });
  if (!result.user) throw new Error('로그인한 사용자 정보를 확인하지 못했습니다.');
  return result.user;
}

export async function signUp(input: SignupInput) {
  const result = await authRequest({
    method: 'POST',
    body: JSON.stringify({ action: 'signup', ...input, userId: input.userId.trim() }),
  });
  if (!result.user) throw new Error('가입한 사용자 정보를 확인하지 못했습니다.');
  return result.user;
}

export async function signOut() {
  await authRequest({ method: 'POST', body: JSON.stringify({ action: 'logout' }) });
}

export function userDisplayName(user: AuthUser) {
  return user.displayName.trim() || user.userId;
}
