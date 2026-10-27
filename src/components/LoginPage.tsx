import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { login } from '../lib/loginApi';
import type { AuthUser } from '../lib/auth';
import '../styles/login.css';

function errorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : '로그인 요청을 처리하지 못했습니다.';
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/email not confirmed/i.test(message)) return '이메일 인증을 완료한 뒤 로그인해 주세요.';
  return message;
}

export function LoginPage({ onAuthenticated, onSignup }: { onAuthenticated: (user: AuthUser) => void; onSignup: () => void }) {
  const [userId, setUserId] = useState('testuser');
  const [password, setPassword] = useState('testuser');
  const [validationError, setValidationError] = useState('');

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (result) => onAuthenticated(result.user),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError('');
    loginMutation.reset();
    if (!userId.trim() || !password) {
      setValidationError('아이디와 비밀번호를 입력해 주세요.');
      return;
    }
    loginMutation.mutate({ userId, password });
  };

  const error = validationError || (loginMutation.error ? errorMessage(loginMutation.error) : '');

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <p className="login-brand">Luka</p>
      <h1 id="login-title">로그인</h1>
      <p className="login-lead">체험 계정이 입력되어 있습니다. 로그인 버튼만 누르면 바로 시작할 수 있습니다.</p>
      {error && <p className="login-error" role="alert">{error}</p>}

      <form onSubmit={submit} autoComplete="off" noValidate>
        <label htmlFor="login-user-id">아이디</label>
        <input
          id="login-user-id"
          name="userId"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          autoComplete="username"
          required
          disabled={loginMutation.isPending}
        />
        <label htmlFor="login-password">비밀번호</label>
        <input
          id="login-password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          disabled={loginMutation.isPending}
        />
        <button type="submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? '로그인 중…' : '로그인'}
        </button>
      </form>

      <p className="login-switch">계정이 없나요? <button type="button" onClick={onSignup}>회원가입</button></p>
    </section>
  </main>;
}
