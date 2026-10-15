import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react';
import { api } from './api.js';
import { Button, ErrorNotice, FormField, Input, ControlButton } from './ui.jsx';
import googleLogo from './assets/google-g.png';
import { LoginLanguage } from './language-settings.jsx';

const AUTH_ERRORS = {
  state_invalid: '로그인 요청이 만료되었거나 확인되지 않았습니다. 이 화면에서 다시 시작해 주세요.',
  cancelled: 'Google 로그인을 취소했습니다. 다시 시도하거나 이메일로 로그인해 주세요.',
  account_not_allowed: '가입이 허용된 회사 Google 계정인지 확인해 주세요. 이미 등록된 계정도 연결되지 않으면 관리자에게 문의해 주세요.',
  identity_conflict: '등록된 계정과 Google 계정의 연결을 확인해야 합니다. 워크스페이스 관리자에게 문의해 주세요.',
  unavailable: '지금은 Google 로그인을 이용할 수 없습니다. 이메일로 로그인하거나 잠시 후 다시 시도해 주세요.',
  failed: 'Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.',
};

function readAuthError() {
  const code = new URL(window.location.href).searchParams.get('auth_error');
  return code === null ? null : new Error(Object.hasOwn(AUTH_ERRORS, code) ? AUTH_ERRORS[code] : AUTH_ERRORS.failed);
}

export function Login({ onLogin, onGoogleStart }) {
  const [busy, setBusy] = useState(false), [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState(readAuthError);
  const [providers, setProviders] = useState({ loading: true, google: false, failed: false, signupDomains: [] });
  const [providerAttempt, setProviderAttempt] = useState(0);
  const errorRegion = useRef(null);
  const loginForm = useRef(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('auth_error')) {
      url.searchParams.delete('auth_error');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const restore = () => setRedirecting(false);
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setProviders({ loading: true, google: false, failed: false, signupDomains: [] });
    api('/api/auth/providers', { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setProviders({ loading: false, google: data.google?.enabled === true, failed: false, signupDomains: Array.isArray(data.google?.signup_domains) ? data.google.signup_domains.filter(domain => typeof domain === 'string') : [] });
    }).catch(() => {
      if (!controller.signal.aborted) setProviders({ loading: false, google: false, failed: true, signupDomains: [] });
    });
    return () => controller.abort();
  }, [providerAttempt]);

  useEffect(() => { if (error) errorRegion.current?.focus(); }, [error]);

  async function submit(event) {
    event.preventDefault();
    if (busy || redirecting) return;
    setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    try {
      onLogin(await api('/api/auth/login', { method: 'POST', body: { email: data.get('email'), password: data.get('password') } }));
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  function continueWithGoogle() {
    if (busy || redirecting || !providers.google) return;
    setError(null); setRedirecting(true);
    try { onGoogleStart?.(); window.location.assign('/api/auth/google'); }
    catch { setRedirecting(false); setError(new Error(AUTH_ERRORS.failed)); }
  }

  return <main className="login-page">
    <section className="login-story">
      <a className="wordmark light" href="/" aria-label="AINS 홈">ains<span>●</span></a>
      <div className="login-story-body"><h1>변경을 이해하고,<br />다음 기준을 세우다.</h1><p>문서 속 작은 차이부터 프로젝트의 다음 결정까지.<br />근거가 이어지는 SI·SM 작업실.</p><div className="login-process"><span>문서</span><ArrowRight size={18} /><span>검토</span><ArrowRight size={18} /><span>확정본</span></div></div>
      <footer><span>AINS × Nora</span><span>일의 맥락을 연결합니다.</span></footer><div className="login-line line-one" /><div className="login-line line-two" />
    </section>
    <section className="login-form-panel"><div className="login-form-wrap">
      <LoginLanguage busy={busy || redirecting} hasInput={() => Boolean(loginForm.current?.elements.email?.value || loginForm.current?.elements.password?.value)} />
      <h2>작업실에 들어가기</h2><p className="muted">{providers.google && providers.signupDomains.length ? '회사 Google 계정으로 가입하거나 로그인하세요.' : '등록된 계정으로 업무를 이어가세요.'}</p>
      <div ref={errorRegion} tabIndex={-1} className="login-error-region"><ErrorNotice error={error} /></div>
      {providers.loading ? <div className="login-provider-state" role="status"><LoaderCircle size={15} className="spin" />로그인 방식을 확인하고 있습니다.</div> : providers.google ? <div className="login-google">
        <ControlButton variant="outline" type="button" className="google-continue" disabled={busy || redirecting} onClick={continueWithGoogle} aria-busy={redirecting}><img src={googleLogo} width="20" height="20.4" alt="" aria-hidden="true" /><span>{redirecting ? 'Google로 이동 중…' : providers.signupDomains.length ? 'Google로 가입·로그인' : 'Google로 계속하기'}</span>{redirecting ? <LoaderCircle size={16} className="spin google-progress" aria-hidden="true" /> : null}</ControlButton>
        <div className="login-divider"><span>또는 이메일로 로그인</span></div>
      </div> : providers.failed ? <div className="login-provider-state provider-unavailable" role="status"><span>Google 로그인 정보를 확인하지 못했습니다.</span><ControlButton type="button" className="text-button" disabled={busy || redirecting} onClick={() => setProviderAttempt((attempt) => attempt + 1)}>다시 확인</ControlButton></div> : null}
      <form ref={loginForm} onSubmit={submit} aria-busy={busy || redirecting}>
        <FormField label="이메일"><Input name="email" type="email" autoComplete="username" required autoFocus={!error} disabled={busy || redirecting} placeholder="name@company.com" /></FormField>
        <FormField label="비밀번호"><Input name="password" type="password" autoComplete="current-password" required disabled={busy || redirecting} /></FormField>
        <Button busy={busy} disabled={redirecting} type="submit" icon={ArrowRight}>이메일로 로그인</Button>
      </form>
      <div className="login-access"><ShieldCheck size={17} /><p>{providers.google && providers.signupDomains.length ? <>{providers.signupDomains.map(domain => `@${domain}`).join(', ')} 회사 계정은 첫 Google 로그인 때 자동 가입됩니다.<br />기존 프로젝트는 관리자가 구성원으로 추가하면 볼 수 있습니다.</> : <>프로젝트 구성원에게만 문서와 검토 기록이 공개됩니다.<br />계정이 없다면 워크스페이스 관리자에게 요청해 주세요.</>}</p></div>
    </div><span className="login-copyright">AINS SI·SM WORKSPACE</span></section>
  </main>;
}
