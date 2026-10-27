import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  currentUser,
  signOut,
  signUp,
  type AuthUser,
} from '../lib/auth';
import { LoginPage } from './LoginPage';

export type LukaAuthSession = {
  user: AuthUser;
  logout: () => Promise<void>;
};

type AuthGateProps = {
  children: (session: LukaAuthSession) => ReactNode;
};

const SESSION_QUERY_KEY = ['auth', 'session'] as const;

const authErrorMessage = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : '인증 요청을 처리하지 못했습니다.';
  if (/invalid login credentials/i.test(message)) return '아이디 또는 비밀번호가 올바르지 않습니다.';
  return message;
};

export function AuthGate({ children }: AuthGateProps) {
  const queryClient = useQueryClient();
  const [signupOpen, setSignupOpen] = useState(false);
  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: currentUser,
    retry: false,
    staleTime: 60_000,
  });

  if (sessionQuery.isPending) {
    return <div className="auth-loading"><span className="auth-logo">L</span><p>로그인 상태를 확인하고 있습니다.</p></div>;
  }

  if (!sessionQuery.data) return <>
    <LoginPage
      onAuthenticated={(user) => queryClient.setQueryData(SESSION_QUERY_KEY, user)}
      onSignup={() => setSignupOpen(true)}
    />
    {sessionQuery.isError && <div className="auth-bootstrap-toast" role="alert">{authErrorMessage(sessionQuery.error)}</div>}
    {signupOpen && <SignupDialog
      close={() => setSignupOpen(false)}
      complete={(user) => {
        queryClient.setQueryData(SESSION_QUERY_KEY, user);
        setSignupOpen(false);
      }}
    />}
  </>;

  const session: LukaAuthSession = {
    user: sessionQuery.data,
    logout: async () => {
      await signOut();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
  };
  return children(session);
}

function SignupDialog({ close, complete }: {
  close: () => void;
  complete: (user: AuthUser) => void;
}) {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!/^[A-Za-z0-9_]{3,30}$/.test(userId.trim())) {
      setError('아이디는 영문, 숫자, 밑줄 3자 이상 30자 이하로 입력해 주세요.');
      return;
    }
    if (password.length < 4 || password.length > 50) {
      setError('비밀번호는 4자 이상 50자 이하로 입력해 주세요.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setSubmitting(true);
    try {
      complete(await signUp({ userId, password, passwordConfirm, displayName, email }));
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="auth-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <form className="auth-card auth-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="signup-dialog-title">
      <button type="button" className="modal-close" onClick={close} aria-label="닫기">×</button>
      <span className="auth-kicker">LUKA PERSONAL ACCOUNT</span>
      <h2 id="signup-dialog-title">회원가입</h2>
      <p>아이디와 비밀번호로 계정을 만드세요. 이메일은 선택 사항입니다.</p>
      <label>아이디<input value={userId} onChange={(event) => setUserId(event.target.value)} autoComplete="username" placeholder="영문, 숫자, 밑줄 3~30자" required /></label>
      <label>비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="4자 이상 입력하세요" required /></label>
      <label>비밀번호 확인<input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" placeholder="비밀번호를 한 번 더 입력하세요" required /></label>
      <label>이름<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="선택 입력" /></label>
      <label>이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="선택 입력" /></label>
      {error && <div className="auth-message error" role="alert">{error}</div>}
      <button className="auth-submit" disabled={submitting}>{submitting ? '가입 중…' : '가입하고 시작하기'}</button>
      <small>계정 정보는 Snowflake LUKA_USER 테이블에 저장됩니다.</small>
    </form>
  </div>;
}
