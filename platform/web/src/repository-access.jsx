import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, ErrorNotice, FormField, Spinner, projectPath } from './ui.jsx';

const SOURCES = { project: '프로젝트 읽기 토큰', github_delivery: '같은 저장소의 GitHub PR 연결', server: '서버 읽기 연결', anonymous: '공개 저장소 확인 · 인증 없음' };

export function RepositoryAccess({ project, settingsVersion, disabled, request, onChanged, onDirty, onBusy, notify }) {
  const route = `${projectPath(project.id)}/settings/repository-access`;
  const [access, setAccess] = useState(null), [token, setToken] = useState(''), [remove, setRemove] = useState(false), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const lifecycle = useRef({ active: true, sequence: 0 });
  const owner = project.role === 'owner';
  const dirty = Boolean(token || remove);
  const load = useCallback(async signal => {
    const sequence = ++lifecycle.current.sequence;
    try { const response = await request(route, { signal }); if (lifecycle.current.active && sequence === lifecycle.current.sequence) { setAccess(response.access); setError(null); } }
    catch (err) { if (lifecycle.current.active && sequence === lifecycle.current.sequence && err.name !== 'AbortError') setError(err); }
  }, [route, request]);
  useEffect(() => {
    lifecycle.current.active = true;
    const controller = new AbortController(); load(controller.signal);
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; controller.abort(); };
  }, [load, settingsVersion]);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await request(route, { method: 'PUT', body: { expected_version: access.version, expected_settings_version: settingsVersion, ...(token ? { token } : { remove_token: true }) } });
      if (!lifecycle.current.active) return;
      setAccess(response.access); setToken(''); setRemove(false);
      notify?.(token ? '읽기 연결을 저장했습니다. 저장소 확인을 눌러 접근 권한을 검증해 주세요.' : '프로젝트 읽기 토큰을 삭제했습니다.');
      await onChanged?.();
    } catch (err) { if (lifecycle.current.active) setError(err); }
    finally { if (lifecycle.current.active) setBusy(false); }
  }
  return <section className="repository-check">
    <div className="settings-context-heading"><KeyRound size={19} /><h3>비공개 저장소 연결</h3></div>
    <p>GitHub 로그인과 별도로, AINS 서버가 저장소를 읽을 수 있는 인증이 필요합니다.</p>
    <ErrorNotice error={error} onRetry={() => load()} />
    {!access ? !error ? <Spinner label="저장소 인증 정보를 확인하고 있습니다" /> : null : <>
      <p><strong>확인에 사용할 연결</strong><br />{SOURCES[access.credential_source] || SOURCES.anonymous}</p>
      {access.credential_error ? <p className="role-note">저장한 연결 정보를 해독할 수 없습니다. 관리자에게 암호화 설정 확인 또는 토큰 재등록을 요청하세요.</p> : null}
      {!access.repository_matches ? <p className="role-note">저장한 읽기 토큰의 대상과 현재 저장소가 다릅니다. 현재 저장소 전용 토큰을 다시 등록해 주세요.</p> : null}
      {owner ? <form onSubmit={save}>
        <FormField label="GitHub 읽기 토큰" hint="Fine-grained PAT의 Repository access에서 이 저장소만 선택하고, Contents 권한을 Read-only로 설정하세요.">
          <input type="password" value={token} autoComplete="new-password" spellCheck={false} maxLength={500} disabled={disabled || busy || !access.can_store_credentials || !access.repository_url} onChange={event => { setToken(event.target.value); setRemove(false); }} placeholder={access.has_project_token ? '새 토큰을 입력하면 교체합니다' : 'github_pat_…'} />
        </FormField>
        <p><a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noreferrer">GitHub 토큰 발급 안내</a> · 조직 저장소는 관리자 승인이나 SSO 설정이 필요할 수 있습니다.</p>
        {access.has_project_token ? <label className="checkbox-label"><input type="checkbox" checked={remove} disabled={disabled || busy} onChange={event => { setRemove(event.target.checked); setToken(''); }} /><span>프로젝트 읽기 토큰 삭제</span></label> : null}
        {!access.can_store_credentials ? <p className="role-note">서버의 연결 정보 암호화 키가 설정되어야 토큰을 저장할 수 있습니다.</p> : null}
        {disabled ? <p className="role-note">작성 중인 프로젝트 설정을 먼저 저장해 주세요.</p> : null}
        <Button type="submit" variant="secondary" busy={busy} disabled={disabled || !dirty || !access.repository_url}>읽기 연결 저장</Button>
        <p>토큰은 암호화하여 저장하며 다시 표시하지 않습니다. 읽기 연결 저장은 코드 변경이나 PR 발행을 허용하지 않습니다.</p>
      </form> : <p className="role-note">프로젝트 관리자만 읽기 연결을 등록할 수 있습니다.</p>}
      <details><summary>연결 선택 순서와 AI 실행기</summary><p>프로젝트 읽기 토큰 → 같은 저장소의 활성 PR 연결 → 서버 읽기 연결 → 인증 없는 공개 조회 순서로 확인합니다. 토큰을 삭제하면 다음 연결을 사용합니다.</p><p>이 연결은 서버의 저장소 확인에 사용합니다. 개인 PC의 AI 실행기는 별도로 <code>AINS_GITHUB_READ_TOKEN</code>을 설정해야 비공개 저장소를 내려받을 수 있습니다. 해당 토큰은 Git 다운로드에만 사용하고 AI 모델에는 전달하지 않습니다.</p></details>
    </>}
  </section>;
}
