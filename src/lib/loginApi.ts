import { signIn } from './auth';

export type LoginCredentials = {
  userId: string;
  password: string;
};

export type LoginResult = {
  user: Awaited<ReturnType<typeof signIn>>;
};

export async function login(credentials: LoginCredentials): Promise<LoginResult> {
  return { user: await signIn(credentials.userId, credentials.password) };
}
