import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FolderOpen, GitBranch, Monitor, RefreshCw, Save, Terminal } from 'lucide-react';
import { Button } from '../components/ctds/Button/Button';
import { Input } from '../components/ctds/Input/Input';
import { Radio } from '../components/ctds/Radio/Radio';
import { Badge } from '../components/ctds/Badge/Badge';
import { Callout } from '../components/ctds/Callout/Callout';
import { Spinner } from '../components/ctds/Spinner/Spinner';
import * as desktopBridge from './bridge.mjs';
import { desktopError, EMPTY_PROFILE, profileChanged, profileDraft, profilePayload, repositoryState, toolState } from './state.mjs';
import { LocalDevelopment } from './LocalDevelopment.jsx';
import './desktop.css';

const TOOLS = [['git', 'Git'], ['codex', 'Codex CLI'], ['claude', 'Claude Code CLI']];
function StateBadge({ value }) { return <Badge variant="soft" size="md" status={value.tone} data-ctds="badge">{value.label}</Badge>; }
function CheckedTime({ value }) {
  if (!value || Number.isNaN(Date.parse(value))) return <span>아직 진단하지 않았습니다.</span>;
  return <span>마지막 확인 <time dateTime={value}>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))}</time></span>;
}
function Diagnostics({ diagnostics, disabled, refreshing, onRefresh }) {
  const repository = diagnostics?.repository, status = repositoryState(repository);
  return <section className="desktop-panel desktop-stack" aria-labelledby="desktop-diagnostics-title">
    <header className="desktop-section-heading"><div className="desktop-title-line"><Terminal aria-hidden="true" /><h2 id="desktop-diagnostics-title">로컬 환경 진단</h2></div><Button type="button" size="sm" variant="ghost" disabled={disabled} loading={refreshing} onClick={onRefresh} leftIcon={<RefreshCw size={16} aria-hidden="true" />} data-ctds="button">다시 확인</Button></header>
    <p className="desktop-caption">선택한 폴더와 로컬에 저장한 연결 정보를 확인합니다.</p>
    <section className="desktop-repository desktop-stack" aria-label="로컬 Git 저장소 상태">
      <div className="desktop-section-heading"><h3>Git 저장소</h3><StateBadge value={status} /></div><p className="desktop-caption">{status.detail}</p>
      <dl className="desktop-facts">
        <div><dt>현재 브랜치</dt><dd><GitBranch aria-hidden="true" /><code>{repository?.branch || '확인 전'}</code></dd></div>
        <div><dt>작업 파일</dt><dd>{repository?.status !== 'ready' ? '확인 전' : repository.clean === true ? '변경 없음' : repository.clean === false ? '커밋하지 않은 변경 있음' : '변경 상태 확인 필요'}</dd></div>
        {repository?.head ? <div><dt>현재 커밋</dt><dd><code title={repository.head}>{repository.head.slice(0, 12)}</code></dd></div> : null}
        {repository?.origin ? <div><dt>origin</dt><dd><code>{repository.origin}</code></dd></div> : null}
      </dl>
      {repository?.errorCode ? <p className="desktop-caption">진단 코드 <code>{repository.errorCode}</code></p> : null}
    </section>
    <section className="desktop-stack" aria-label="CLI 설치 상태"><h3>개발 도구</h3><div className="desktop-tool-list">{TOOLS.map(([key, label]) => {
      const tool = diagnostics?.tools?.[key], state = toolState(tool);
      return <article key={key} className="desktop-tool"><div className="desktop-section-heading"><strong>{label}</strong><StateBadge value={state} /></div><p className="desktop-mono">{tool?.version || '버전 정보 없음'}</p>{tool?.path ? <p className="desktop-caption desktop-mono">{tool.path}</p> : null}{tool?.errorCode ? <p className="desktop-caption">진단 코드 <code>{tool.errorCode}</code></p> : null}</article>;
    })}</div><p className="desktop-caption">CLI 버전 확인은 도구의 로그인이나 Nora 연결 완료를 의미하지 않습니다.</p></section>
    <footer className="desktop-caption"><CheckedTime value={diagnostics?.checkedAt} /></footer>
  </section>;
}

export function DesktopApp({ api = desktopBridge, native = desktopBridge.isDesktopRuntime() }) {
  const [state, setState] = useState(null), [draft, setDraft] = useState(() => ({ ...EMPTY_PROFILE })), [pending, setPending] = useState('load'), [error, setError] = useState(null), [feedback, setFeedback] = useState('');
  const [executionBusy, setExecutionBusy] = useState(false);
  const lifecycle = useRef({ active: true, sequence: 0, operation: null });
  const load = useCallback(async () => {
    const sequence = ++lifecycle.current.sequence; setPending('load'); setError(null);
    try { const value = await api.getDesktopState(); if (!lifecycle.current.active || sequence !== lifecycle.current.sequence) return; setState(value); setDraft(profileDraft(value)); }
    catch (err) { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setError(desktopError(err)); }
    finally { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setPending(null); }
  }, [api]);
  useEffect(() => { lifecycle.current.active = true; void load(); return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; }; }, [load]);
  async function perform(kind, operation) {
    if (!native || lifecycle.current.operation || pending === 'load') return;
    const token = Symbol(kind); lifecycle.current.operation = token; setPending(kind); setError(null); setFeedback('');
    try {
      const value = await operation();
      if (!lifecycle.current.active || lifecycle.current.operation !== token) return;
      setState(value);
      if (kind === 'save') { setDraft(profileDraft(value)); setFeedback('이 기기에 프로젝트 정보를 저장했습니다. Nora 연결은 아직 완료되지 않았습니다.'); }
      if (kind === 'refresh') setFeedback('현재 로컬 환경을 다시 확인했습니다.');
    } catch (err) { if (lifecycle.current.active && lifecycle.current.operation === token) setError(desktopError(err)); }
    finally { if (lifecycle.current.operation === token) { lifecycle.current.operation = null; if (lifecycle.current.active) setPending(null); } }
  }
  function save(event) {
    event.preventDefault(); let payload;
    try { payload = profilePayload(draft); } catch (err) { setError(desktopError(err)); return; }
    void perform('save', () => api.saveProfile(payload));
  }
  const busy = Boolean(pending) || executionBusy, writable = native && state !== null, folder = state?.selectedFolder || state?.profile?.workingFolder;
  const dirty = profileChanged(draft, state), visibleError = error || desktopError(state?.lastError);
  function field(key) { return { value: draft[key], disabled: !writable || busy, onChange: event => { setDraft(current => ({ ...current, [key]: event.target.value })); setFeedback(''); } }; }
  return <main className="desktop-shell">
    <header className="desktop-header"><div className="desktop-brand"><Monitor aria-hidden="true" /><div><span className="desktop-wordmark">CTAS <span>Desktop</span></span><p>로컬 작업 환경</p></div></div><Button type="button" size="sm" variant="outline" disabled={!native || busy} onClick={() => void perform('open', api.openWorkspace)} rightIcon={<ArrowUpRight size={16} aria-hidden="true" />} data-ctds="button">CTAS 웹 열기</Button></header>
    <div className="desktop-intro"><h1>프로젝트의 개발 작업을 시작하세요</h1><p>작업할 저장소를 지정하고 Codex로 개발한 뒤 변경사항을 확인합니다.</p></div>
    <section className="desktop-connection" aria-labelledby="desktop-connection-title"><div className="desktop-stack"><div className="desktop-section-heading"><h2 id="desktop-connection-title">Nora 자동 작업 수신</h2><Badge variant="soft" size="md" status="warning" data-ctds="badge">아직 연결되지 않음</Badge></div><Callout tone="warning" title="Nora 작업 자동 수신은 아직 연결 전" data-ctds="callout">이 화면에서 직접 시작한 로컬 개발만 실행합니다. CTAS 칸반이나 Nora에서 요청한 작업을 자동으로 수신하지 않습니다.</Callout></div></section>
    {!native ? <Callout tone="neutral" title="브라우저에서 연 화면입니다" data-ctds="callout">로컬 폴더 선택·저장·진단은 설치한 CTAS Desktop에서 사용할 수 있습니다.</Callout> : null}
    {visibleError ? <Callout tone="destructive" role="alert" title={visibleError.message} actions={!state ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={load} data-ctds="button">다시 불러오기</Button> : undefined} data-ctds="callout">{visibleError.code ? <code>{visibleError.code}</code> : null}</Callout> : null}
    {pending === 'load' ? <div className="desktop-loading" role="status"><Spinner size="md" aria-hidden="true" role="presentation" /><span>이 기기의 설정을 불러오고 있습니다.</span></div> : null}
    <LocalDevelopment state={state} dirty={dirty} native={native} disabled={Boolean(pending)} api={api} onRunningChange={setExecutionBusy} />
    <div className="desktop-columns"><section className="desktop-panel desktop-stack" aria-labelledby="desktop-profile-title">
      <header className="desktop-section-heading"><h2 id="desktop-profile-title">프로젝트 연결 정보</h2><Badge variant="soft" size="md" data-ctds="badge">{dirty ? '저장 전 변경 있음' : state?.profile ? '이 기기에 저장됨' : '설정 전'}</Badge></header>
      <p className="desktop-caption">CTAS 프로젝트와 저장소를 지정합니다. 입력 정보는 이 기기에만 저장되며 서버 권한을 확인한 상태는 아닙니다.</p>
      <form className="desktop-stack" onSubmit={save}>
        <Input label="프로젝트 ID" description="CTAS 프로젝트 설정에서 확인할 수 있습니다." size="sm" {...field('projectId')} maxLength={200} required autoComplete="off" placeholder="예: ctas" data-ctds="input" />
        <Input label="Nora 워크스페이스 ID (선택)" description="Nora 자동 작업 수신을 연결할 때 사용할 정보입니다." size="sm" {...field('workspaceId')} maxLength={200} autoComplete="off" placeholder="Nora에서 복사한 워크스페이스 ID" data-ctds="input" />
        <Input label="대상 Git 저장소" size="sm" {...field('repositoryUrl')} maxLength={2000} required autoComplete="off" spellCheck={false} placeholder="https://github.com/organization/repository" data-ctds="input" />
        <fieldset className="desktop-provider"><legend>사용할 개발 도구</legend><div className="desktop-radio-group"><Radio name="provider" value="codex" checked={draft.provider === 'codex'} disabled={!writable || busy} onChange={() => { setDraft(current => ({ ...current, provider: 'codex' })); setFeedback(''); }}>Codex</Radio><Radio name="provider" value="claude-code" checked={draft.provider === 'claude-code'} disabled={!writable || busy} onChange={() => { setDraft(current => ({ ...current, provider: 'claude-code' })); setFeedback(''); }}>Claude Code</Radio></div></fieldset>
        <section className="desktop-folder desktop-stack" aria-labelledby="desktop-folder-title"><h3 id="desktop-folder-title">작업 폴더</h3><p className={folder ? 'desktop-folder-path desktop-mono' : 'desktop-caption'}>{folder || '이 컴퓨터에 있는 프로젝트 저장소를 선택해 주세요.'}</p><div><Button type="button" variant="outline" size="sm" disabled={!writable || busy} loading={pending === 'folder'} onClick={() => void perform('folder', api.chooseWorkspace)} leftIcon={<FolderOpen size={16} aria-hidden="true" />} data-ctds="button">{folder ? '다른 폴더 선택' : '작업 폴더 선택'}</Button></div><p className="desktop-caption">선택한 로컬 폴더의 저장소 정보를 읽습니다. 폴더 선택만으로 코드를 변경하지 않습니다.</p></section>
        <div className="desktop-form-footer"><Button type="submit" size="sm" disabled={!writable || busy || !folder || !dirty} loading={pending === 'save'} leftIcon={<Save size={16} aria-hidden="true" />} data-ctds="button">프로젝트 정보 저장</Button>{dirty ? <span className="desktop-caption">입력한 변경사항은 저장 후 적용됩니다.</span> : null}</div>
      </form>
      {feedback ? <p className="desktop-feedback" role="status">{feedback}</p> : null}
    </section><Diagnostics diagnostics={state?.diagnostics} disabled={!writable || busy} refreshing={pending === 'refresh'} onRefresh={() => void perform('refresh', api.refreshDiagnostics)} /></div>
    <footer className="desktop-footer"><span>CTAS Desktop{state?.appVersion ? ` · ${state.appVersion}` : ''}</span><span>로컬 준비와 Nora 연결 상태는 별도로 표시합니다.</span></footer>
  </main>;
}
