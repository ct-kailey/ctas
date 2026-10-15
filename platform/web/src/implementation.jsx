import { useSharedView } from './shared-view.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCheck, ChevronRight, ClipboardCheck, Code2, Download, GitBranch, ListChecks, RefreshCw, Settings2, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { RepositoryAccess } from './repository-access.jsx';
import { NoraWorkspaceSettings } from './nora-workspace.jsx';
import { TaskAutomationSettings } from './task-automation.jsx';
import { AIDevelopmentWorkspace } from './ai-development.jsx';
import { developmentLegacyActive } from './ai-development-state.mjs';
import { DevelopmentChangeViewer } from './development-change-viewer.jsx';
import { ImplementationPlanComposer, ProjectScopeSummary } from './implementation-preparation.jsx';
import { PROJECT_KINDS } from './project-scope.mjs';
import { projectSettingsDraft, projectSettingsDirty, projectSettingsPatch } from './project-settings-state.mjs';
import { useConfirm } from './confirmation.jsx';
import { Badge, Button, Empty, ErrorNotice, FormField, Modal, SectionHeading, Spinner, dateTime, projectPath, shortId, Input, Textarea, ControlButton, Disclosure, Notice } from './ui.jsx';

const ACTIVE_PLAN = new Set(['queued', 'running']);
const ACTIVE_EXECUTION = new Set(['queued', 'claimed', 'running']);
const REPOSITORY_STATES = { ready: ['기준 브랜치 확인됨', 'green'], empty: ['빈 저장소', 'amber'], inaccessible: ['저장소 접근 확인 필요', 'amber'], branch_missing: ['기준 브랜치 없음', 'amber'] };
const REPOSITORY_MESSAGES = {
 AUTH_REQUIRED_OR_NOT_FOUND: '저장소를 찾지 못했거나 비공개 저장소의 인증이 없습니다. 주소가 맞다면 아래 읽기 토큰을 연결해 주세요.',
 AUTH_INVALID: 'GitHub 토큰이 만료되었거나 유효하지 않습니다. 읽기 토큰을 교체해 주세요.',
 ACCESS_DENIED: '저장소 접근이 거부되었습니다. 토큰의 대상 저장소, Contents 읽기 권한, 조직 승인·SSO 상태를 확인해 주세요.',
 RATE_LIMITED: 'GitHub 요청 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.',
 REPOSITORY_UNAVAILABLE: 'GitHub가 요청을 처리하지 못했습니다. 잠시 후 다시 확인해 주세요.',
 BRANCH_MISSING: '지정한 기준 브랜치를 찾지 못했습니다. 브랜치 이름을 확인해 주세요.',
 EMPTY_REPOSITORY: '저장소가 비어 있습니다. 초기 코드와 기준 브랜치를 준비한 뒤 다시 확인해 주세요.',
 REPOSITORY_ARCHIVED: '보관되었거나 비활성화된 저장소입니다. 작업할 수 있는 저장소를 선택해 주세요.',
 NETWORK_ERROR: 'GitHub 응답을 확인하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.',
 INVALID_RESPONSE: 'GitHub 응답에서 브랜치 정보를 확인하지 못했습니다. 다시 시도해 주세요.',
};
const EXECUTION_MESSAGES = {
 REPOSITORY_CLONE_AUTH_OR_URL_REQUIRED: '실행기가 저장소를 내려받지 못했습니다. 주소와 기준 브랜치를 확인하고, 비공개 저장소라면 실행기 컴퓨터에 AINS_GITHUB_READ_TOKEN을 설정해 주세요.',
 REPOSITORY_CLONE_ACCESS_FAILED: '실행기 읽기 토큰으로 저장소에 접근하지 못했습니다. 토큰의 만료일·대상 저장소·Contents 읽기 권한·조직 승인을 확인해 주세요.',
 REPOSITORY_READ_TOKEN_INVALID: '실행기에 설정된 읽기 토큰 형식이 올바르지 않습니다. 공백이나 줄바꿈이 포함되었는지 확인해 주세요.',
};
const EXECUTION_STATES = { awaiting_runner: ['실행기 연결 대기', 'quiet'], queued: ['실행 대기', 'quiet'], claimed: ['실행 준비', 'blue'], running: ['변경안 작성 중', 'blue'], succeeded: ['변경안 작성 완료', 'green'], completed: ['변경안 준비됨', 'green'], patch_ready: ['변경안 준비됨', 'green'], failed: ['실행 실패', 'red'], uncertain: ['실행 결과 확인 필요', 'amber'], cancelled: ['실행 취소', 'quiet'] };

function RepositoryState({ check }) {
  const state = REPOSITORY_STATES[check?.status] || ['연결 확인 전', 'quiet'];
  return <Badge tone={state[1]}>{state[0]}</Badge>;
}

function useRemote(path, request, key, shouldPoll = () => false) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const lifecycle = useRef({ active: true, sequence: 0, fetching: false });
  const refresh = useCallback(async ({ signal, quiet = false } = {}) => {
    if (quiet && lifecycle.current.fetching) return;
    lifecycle.current.fetching = true;
    const sequence = ++lifecycle.current.sequence;
    if (!quiet) setLoading(true);
    try {
      const response = await request(path, { signal });
      if (lifecycle.current.active && sequence === lifecycle.current.sequence) { setData(response[key]); setError(null); return response[key]; }
    } catch (err) { if (lifecycle.current.active && sequence === lifecycle.current.sequence && err.name !== 'AbortError') setError(err); }
    finally { if (sequence === lifecycle.current.sequence) { lifecycle.current.fetching = false; if (lifecycle.current.active) setLoading(false); } }
  }, [path, request, key]);
  useEffect(() => {
    lifecycle.current.active = true;
    const controller = new AbortController(); refresh({ signal: controller.signal });
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; controller.abort(); };
  }, [refresh]);
  const polling = shouldPoll(data);
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => { if (!document.hidden) refresh({ quiet: true }); }, 5000);
    return () => clearInterval(timer);
  }, [polling, refresh]);
  return { data, setData, error, setError, loading, refresh, active: lifecycle };
}

export function ProjectSettings({ project, request, onImplementation, notify, onDirty, onChanged }) {
  const route = `${projectPath(project.id)}/settings`;
  const remote = useRemote(route, request, 'settings');
  const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [actionError, setActionError] = useState(null);
  const [refreshError, setRefreshError] = useState(null), confirm = useConfirm(), sharedView = useSharedView();
  const owner = !sharedView && project.role === 'owner';
  const [accessDirty,setAccessDirty] = useState(false), [accessBusy,setAccessBusy] = useState(false);
  const [noraDirty,setNoraDirty] = useState(false), [noraBusy,setNoraBusy] = useState(false);
  const [automationDirty,setAutomationDirty] = useState(false);
  useEffect(() => { if (remote.data) setDraft(projectSettingsDraft(remote.data, project)); }, [remote.data]);
  const dirty = projectSettingsDirty(draft, remote.data, project);
  useEffect(() => { onDirty?.(dirty || busy || accessDirty || noraDirty || automationDirty); return () => onDirty?.(false); }, [dirty, busy, accessDirty, noraDirty, automationDirty, onDirty]);
  function update(field, value) { setDraft((current) => ({ ...current, [field]: value })); }
  async function refreshProjectList(settings) {
    try { await onChanged?.(settings); if (remote.active.current.active) setRefreshError(null); }
    catch { if (remote.active.current.active) setRefreshError(new Error('프로젝트 정보는 저장했습니다. 프로젝트 목록을 다시 불러와 주세요.')); }
  }
  async function save(event) {
    event.preventDefault(); if (!owner || busy || accessBusy || noraBusy || automationDirty) return;
    let body; try { body = projectSettingsPatch(draft, remote.data, project); } catch (err) { setActionError(err); return; }
    setBusy(true); setActionError(null); setRefreshError(null);
    try {
      const result = await request(route, { method: 'PATCH', body });
      if (remote.active.current.active) { remote.setData(result.settings); notify('프로젝트 이름과 정보를 저장했습니다.'); await refreshProjectList(result.settings); }
    } catch (err) { if (remote.active.current.active) setActionError(err); }
    finally { if (remote.active.current.active) setBusy(false); }
  }
  async function reloadAfterConflict() {
    if (busy || !await confirm('작성 중인 변경을 버리고 최신 프로젝트 정보를 불러올까요?')) return;
    setBusy(true);
    try { const settings = await remote.refresh(); if (settings && remote.active.current.active) { setActionError(null); await refreshProjectList(settings); } }
    finally { if (remote.active.current.active) setBusy(false); }
  }
  async function verify() {
    setBusy(true); setActionError(null);
    try {
      const result = await request(`${route}/verify-repository`, { method: 'POST', body: {} });
      if (remote.active.current.active) { remote.setData(result.settings); notify('저장소 확인 결과를 갱신했습니다.'); }
    } catch (err) { if (remote.active.current.active) setActionError(err); }
    finally { if (remote.active.current.active) setBusy(false); }
  }
  return <section className="project-settings"><ErrorNotice error={remote.error} onRetry={() => remote.refresh()} />{!draft ? !remote.error ? <Spinner label="프로젝트 설정을 불러오고 있습니다" /> : null : <div className="settings-grid"><form className="settings-form" onSubmit={save}><SectionHeading title="프로젝트·저장소" /><fieldset disabled={!owner || busy || accessBusy || noraBusy || automationDirty}><legend className="sr-only">프로젝트 이름</legend><FormField label="프로젝트 이름"><Input value={draft.name} onChange={(event) => update('name', event.target.value)} required maxLength={200} /></FormField></fieldset><Disclosure><summary>프로젝트 용도·목표</summary><fieldset disabled={!owner || busy || accessBusy || noraBusy || automationDirty}><legend className="sr-only">프로젝트 용도·목표</legend><div className="ains-section-stack"><fieldset className="project-kind-choices"><legend>프로젝트 용도</legend>{Object.entries(PROJECT_KINDS).filter(([value]) => value !== 'unspecified').map(([value, label]) => <label className="checkbox-label" key={value}><Input type="radio" name="project-kind" value={value} checked={draft.project_kind === value} onChange={() => update('project_kind', value)} /><span>{label}</span></label>)}</fieldset><FormField label="프로젝트 목표" hint="구현하려는 결과와 완료 기준을 구체적으로 작성하세요."><Textarea value={draft.goal} onChange={(event) => update('goal', event.target.value)} maxLength={5000} rows={3} placeholder="예: 고객 포털의 회원 가입과 권한 관리 과정을 구현하고, 로그인 실패 정책을 테스트로 검증합니다." /></FormField></div></fieldset></Disclosure><fieldset disabled={!owner || busy || accessBusy || noraBusy || automationDirty}><legend className="sr-only">저장소 설정</legend><FormField label="대상 저장소 URL"><Input type="url" value={draft.repository_url} onChange={(event) => update('repository_url', event.target.value)} maxLength={2000} placeholder="https://github.com/ct-kailey/nora-flow.git" /></FormField><FormField label="기준 브랜치" hint="변경안 작성의 출발점으로 사용할 기존 브랜치입니다."><Input value={draft.base_branch} onChange={(event) => update('base_branch', event.target.value)} maxLength={200} placeholder="예: main" /></FormField>{owner ? <Button type="submit" icon={CheckCheck} busy={busy} disabled={!dirty}>프로젝트 설정 저장</Button> : null}</fieldset>{!owner ? <p className="role-note"><ShieldCheck size={15} />프로젝트 관리자만 설정을 변경할 수 있습니다.</p> : null}<ErrorNotice error={actionError} />{actionError?.code === 'SETTINGS_VERSION_CONFLICT' ? <Notice tone="warning" title="입력한 변경 내용은 유지했습니다"><p>다른 사용자가 프로젝트 정보를 변경했습니다. 최신 설정을 확인한 뒤 다시 편집해 주세요.</p><Button type="button" variant="secondary" disabled={busy} onClick={reloadAfterConflict}>작성 내용 버리고 최신 설정 불러오기</Button></Notice> : null}<ErrorNotice error={refreshError} onRetry={() => refreshProjectList(remote.data)} /></form><aside className="settings-context"><NoraWorkspaceSettings project={project} request={request} notify={notify} onDirty={setNoraDirty} onBusy={setNoraBusy} disabled={dirty || busy || accessDirty || accessBusy || automationDirty} onChanged={onChanged} /><TaskAutomationSettings project={project} repositoryUrl={remote.data.repository_url} request={request} notify={notify} onDirty={setAutomationDirty} disabled={dirty || busy || accessDirty || accessBusy || noraDirty || noraBusy} /><section className="repository-check"><div className="settings-context-heading"><GitBranch size={19} /><h3>저장소 연결 확인</h3></div><RepositoryState check={remote.data.repository_check} /><p>{REPOSITORY_MESSAGES[remote.data.repository_check?.reason_code] || ({ ready: '지정한 저장소와 기준 브랜치를 확인했습니다. 코드 변경은 계획 승인 후 별도로 실행합니다.', empty: '저장소가 비어 있습니다. 초기 코드와 기준 브랜치를 준비한 뒤 다시 확인해 주세요.', inaccessible: '주소와 접근 권한을 확인해 주세요. 비공개 저장소는 아래 읽기 연결이 필요합니다.', branch_missing: '기준 브랜치를 찾지 못했습니다. 실제 브랜치 이름을 확인해 주세요.' })[remote.data.repository_check?.status] || '저장한 주소와 브랜치의 읽기 권한을 확인합니다.'}</p>{remote.data.repository_check?.checked_at ? <small>확인 {dateTime(remote.data.repository_check.checked_at)}</small> : null}{remote.data.repository_check?.head_sha ? <Disclosure><summary>확인한 커밋</summary><code>{remote.data.repository_check.head_sha}</code></Disclosure> : null}{owner ? <Button type="button" variant="secondary" icon={RefreshCw} busy={busy} disabled={dirty || accessDirty || accessBusy || noraBusy || automationDirty || !remote.data.repository_url || !remote.data.base_branch} onClick={verify}>저장소 확인</Button> : null}{dirty || accessDirty ? <small>설정과 읽기 연결을 저장한 뒤 확인할 수 있습니다.</small> : null}</section><RepositoryAccess project={project} settingsVersion={remote.data.version} disabled={dirty || busy || noraBusy || automationDirty} request={request} onChanged={() => remote.refresh()} onDirty={setAccessDirty} onBusy={setAccessBusy} notify={notify} /></aside></div>}</section>;
}

export function ImplementationWorkspace(props) {
  const [view, setView] = useState({ kind: 'workspace' });
  if (view.kind === 'execution') return <ExecutionDetail key={`${props.project.id}:${view.id}`} id={view.id} route={projectPath(props.project.id)} request={props.request} owner={props.project.role === 'owner'} onGovernance={props.onGovernance} onDelivery={props.onDelivery} onBack={() => setView({ kind: 'workspace' })} />;
  if (view.kind === 'plans') return <section className="ains-section-stack"><div><Button type="button" variant="ghost" icon={ArrowLeft} onClick={() => setView({ kind: 'workspace' })}>AI 개발 작업 목록으로</Button></div><LegacyImplementationWorkspace {...props} /></section>;
  return <AIDevelopmentWorkspace {...props} onOpenLegacyExecution={id => setView({ kind: 'execution', id })} onOpenPlans={() => setView({ kind: 'plans' })} />;
}

function LegacyImplementationWorkspace({ project, documents, request, canWrite, canReview, onSettings, onWorkItems, onGovernance, onDelivery, notify }) {
  const sharedView = useSharedView();
  const route = projectPath(project.id);
  const plans = useRemote(`${route}/implementation-plans`, request, 'plans', (rows) => rows?.some((plan) => ACTIVE_PLAN.has(plan.status)));
  const executions = useRemote(`${route}/implementation-requests`, request, 'requests', (rows) => developmentLegacyActive({ requests: rows }));
  const settings = useRemote(`${route}/settings`, request, 'settings');
  const [detail, setDetail] = useState(null);
  const sources = documents.filter((doc) => doc.record_kind === 'specification' && doc.baseline_revision_id && doc.revisions?.some((revision) => revision.id === doc.baseline_revision_id && revision.status === 'ready'));
  async function changed(message) { notify(message); await Promise.all([plans.refresh({ quiet: true }), executions.refresh({ quiet: true }), settings.refresh({ quiet: true })]); }
  if (detail?.type === 'plan') return <PlanDetail key={detail.id} id={detail.id} route={route} request={request} canReview={canReview} settings={settings.data} onBack={() => setDetail(null)} onSettings={onSettings} onWorkItems={onWorkItems} onGovernance={onGovernance} onChanged={changed} onExecution={(id) => setDetail({ type: 'execution', id })} />;
  if (detail?.type === 'execution') return <ExecutionDetail key={detail.id} id={detail.id} route={route} request={request} owner={project.role === 'owner'} onGovernance={onGovernance} onDelivery={onDelivery} onBack={() => setDetail(null)} />;
  return <section className="implementation-workspace"><div className="inline-actions"><Button variant="secondary" onClick={onGovernance}>작업 전 점검·범위 승인</Button>{!sharedView ? <Button variant="secondary" onClick={onDelivery}>검토한 변경안으로 PR 생성</Button> : null}</div><div className="implementation-path" aria-label="AI 구현 작업 순서">{[['01', '프로젝트 설정'], ['02', '문서 선택·적용 대상 확인'], ['03', '계획·작업 전 점검·범위 승인'], ['04', '실행 · 검수 · PR 발행']].map(([number, label]) => <div key={number}><span>{number}</span><strong>{label}</strong></div>)}</div><Notice className="notice subtle implementation-scope"><Code2 size={18} /><p>문서 등록은 추출·정리까지 자동 처리합니다. 이곳에서 AI 작업 계획을 요청하고 승인한 뒤 실행을 요청하면, 연결된 실행기가 코드 변경안과 테스트 결과를 작성합니다.</p></Notice><ErrorNotice error={plans.error || executions.error || settings.error} onRetry={() => Promise.all([plans.refresh(), executions.refresh(), settings.refresh()])} />
    {!sharedView ? <div className="implementation-create-grid"><ImplementationPlanComposer project={project} settings={settings.data} sources={sources} request={request} canWrite={canWrite} canReview={canReview} onSettings={onSettings} onCreated={async (plan) => { setDetail({ type: 'plan', id: plan.id }); await changed('확인한 문서로 AI 작업 계획을 요청했습니다.'); }} /><aside className="implementation-boundaries"><span className="eyebrow">작업 순서</span><h3>계획 승인 후 실행합니다.</h3><ol><li><ListChecks size={17} /><div><strong>AI가 계획 제안</strong><p>구현 작업, 완료 기준, 테스트 방향과 확인할 질문을 정리합니다.</p></div></li><li><ShieldCheck size={17} /><div><strong>검토자가 계획 승인</strong><p>원문 근거와 미해결 질문을 확인하고 승인·반려 사유를 남깁니다.</p></div></li><li><Terminal size={17} /><div><strong>연결된 실행기가 변경안 작성</strong><p>실행 요청 후 별도 작업 공간에서 변경안을 준비합니다. 생성된 패치와 테스트 결과를 사람이 검토합니다.</p></div></li></ol><p className="implementation-no-publish">검토한 변경안은 GitHub PR 발행에서 Draft PR로 보낼 수 있습니다. 병합·배포는 별도 절차로 진행합니다.</p></aside></div> : null}
    <section className="implementation-history"><SectionHeading eyebrow="이전 계획" title="작업 계획"><ControlButton className="text-button" onClick={() => plans.refresh()} disabled={plans.loading}><RefreshCw size={13} />새로고침</ControlButton></SectionHeading>{plans.loading && !plans.data ? <Spinner /> : plans.data?.length ? <div className="implementation-list">{plans.data.map((plan) => <ControlButton key={plan.id} onClick={() => setDetail({ type: 'plan', id: plan.id })}><span className="implementation-list-icon"><ListChecks size={19} /></span><div><strong>{plan.result?.title || `작업 계획 ${shortId(plan.id)}`}</strong><small>요청 {dateTime(plan.created_at)}{plan.stale_reasons?.length ? ' · 근거 변경 확인 필요' : ''}</small></div><Badge status={plan.status} /><ChevronRight size={16} /></ControlButton>)}</div> : !plans.error ? <Empty compact icon={ListChecks} title="아직 요청한 작업 계획이 없습니다">확정본을 선택해 첫 작업 계획을 만들어 보세요.</Empty> : null}</section>
    <section className="implementation-history"><SectionHeading eyebrow="실행 기록" title="코드 변경안 실행 요청"><ControlButton className="text-button" onClick={() => executions.refresh()} disabled={executions.loading}><RefreshCw size={13} />새로고침</ControlButton></SectionHeading>{executions.data?.length ? <div className="implementation-list">{executions.data.map((item) => <ControlButton key={item.id} onClick={() => setDetail({ type: 'execution', id: item.id })}><span className="implementation-list-icon"><Terminal size={19} /></span><div><strong>실행 요청 {shortId(item.id)}</strong><small>{dateTime(item.created_at)}</small></div><ExecutionStatus status={item.error_code === 'EXECUTION_CANCELLED' ? 'cancelled' : item.status} /><ChevronRight size={16} /></ControlButton>)}</div> : !executions.error ? <Empty compact icon={Terminal} title="실행 요청이 없습니다">승인한 계획에서 실행을 요청할 수 있습니다.</Empty> : null}</section>
  </section>;
}

function PlanDetail({ id, route, request, canReview, settings, onBack, onSettings, onWorkItems, onGovernance, onChanged, onExecution }) {
  const sharedView = useSharedView();
  const remote = useRemote(`${route}/implementation-plans/${encodeURIComponent(id)}`, request, 'plan', (plan) => ACTIVE_PLAN.has(plan?.status));
  const [action, setAction] = useState(null);
  const plan = remote.data, result = plan?.result;
  const stale = Boolean(plan?.stale_reasons?.length), blocking = result?.questions?.some((question) => question.blocking);
  const canDecide = canReview && plan?.status === 'needs_review' && !stale;
  async function changed(message) { setAction(null); await remote.refresh({ quiet: true }); await onChanged(message); }
  return <section className="implementation-plan-detail"><ControlButton className="back-link" onClick={onBack}><ArrowLeft size={16} />AI 구현 작업으로</ControlButton><ErrorNotice error={remote.error} onRetry={() => remote.refresh()} />{!plan ? !remote.error ? <Spinner label="작업 계획을 불러오고 있습니다" /> : null : <><header className="implementation-detail-heading"><div><span className="eyebrow">작업 계획</span><h2>{result?.title || 'AI 작업 계획'}</h2><p>요청 {dateTime(plan.created_at)} · 계획 {shortId(plan.id)}</p></div><Badge status={plan.status} /></header>{plan.input_snapshot ? <><ProjectScopeSummary project={plan.input_snapshot.project} repository={plan.input_snapshot.repository} title="계획 요청 당시의 프로젝트·저장소" /><section className="implementation-snapshot" aria-label="계획에 사용한 문서"><h3>계획에 사용한 문서</h3><ul>{(plan.input_snapshot.sources || []).map((source) => <li key={source.revision_id}>{source.title} · 확정본 {shortId(source.revision_id)}</li>)}</ul></section></> : null}{stale ? <Notice className="notice warning"><AlertTriangle size={18} /><div><strong>계획을 만든 이후 확정본이나 프로젝트 설정이 변경되었습니다.</strong><p>최신 근거로 새 작업 계획을 요청해 주세요.</p><Disclosure><summary>변경된 근거 확인</summary>{plan.stale_reasons.map((reason, index) => <small key={index}>{({ SOURCE_CONFIRMATION_REQUIRED: '문서의 적용 대상 확인이 추가되기 전에 생성한 계획입니다. 적용 대상을 검토하고 새 계획을 생성해 주세요.', SOURCE_REVIEW_CHANGED: '문서 적용 대상의 검토 결과가 변경되었습니다.', PROJECT_SCOPE_CHANGED: '프로젝트 이름 또는 용도가 변경되었습니다.' })[typeof reason === 'string' ? reason : reason?.code] || (typeof reason === 'string' ? reason : JSON.stringify(reason))}</small>)}</Disclosure></div></Notice> : null}{ACTIVE_PLAN.has(plan.status) ? <Notice className="notice subtle"><Sparkles size={18} /><div><strong>AI가 구현 작업과 검증 계획을 정리하고 있습니다.</strong><p>완료되면 자동으로 표시됩니다. 이 단계에서는 코드를 변경하지 않습니다.</p></div></Notice> : null}{['failed', 'uncertain'].includes(plan.status) ? <Notice className="notice warning"><AlertTriangle size={18} /><div><strong>계획 생성 결과를 확인해야 합니다.</strong><p>{plan.status === 'uncertain' ? 'Nora에서 실행되었을 수 있습니다. 관리자가 실행 이력을 먼저 확인해 주세요.' : '오류를 확인한 뒤 새 계획 요청을 진행해 주세요.'}</p>{plan.error_code ? <Disclosure><summary>기술 세부정보</summary><code>{plan.error_code}</code></Disclosure> : null}</div></Notice> : null}{result ? <><p className="implementation-plan-summary">{result.summary}<small>기획 확정본에 기반한 작업 계획입니다. 실제 수정 파일은 실행기가 저장소를 확인한 뒤 결정합니다.</small></p><div className="implementation-plan-grid"><div><SectionHeading eyebrow="구현 범위" title={`구현 작업 ${result.tasks?.length || 0}개`} />{(result.tasks || []).map((task, index) => <article className="implementation-task" key={task.id || index}><header><span>{String(index + 1).padStart(2, '0')}</span><h3>{task.title}</h3></header><p>{task.description}</p><div><strong>완료 기준</strong><ul>{(task.acceptance_criteria || []).map((criterion, criterionIndex) => <li key={criterionIndex}>{criterion}</li>)}</ul></div>{task.evidence?.length ? <div className="task-evidence"><strong>원문 근거</strong>{task.evidence.map((evidence, evidenceIndex) => <a key={evidenceIndex} href={`${route}/revisions/${encodeURIComponent(evidence.revision_id)}/original`}>문서 {shortId(evidence.revision_id)} · {evidence.segment_id}<Download size={11} /></a>)}</div> : null}{task.depends_on?.length ? <small>먼저 완료할 작업: {task.depends_on.join(', ')}</small> : null}</article>)}</div><aside className="implementation-plan-context"><section><SectionHeading eyebrow="추가 확인 사항" title="확인할 질문" />{result.questions?.length ? result.questions.map((question, index) => <div className="plan-question" key={index}>{question.blocking ? <Badge tone="amber">승인 전 확인 필요</Badge> : <Badge tone="quiet">추가 확인</Badge>}<p>{question.question}</p></div>) : <p className="plan-no-questions"><CheckCheck size={16} />추가 질문이 없습니다.</p>}{blocking ? <p className="plan-question-help">프로젝트 설정의 목표·범위를 보완하거나 기획서를 새 버전으로 확정한 뒤 새 계획을 생성해 주세요.</p> : null}</section>{result.assumptions?.length ? <section><h3>AI가 둔 가정</h3><ul>{result.assumptions.map((text, index) => <li key={index}>{text}</li>)}</ul></section> : null}{result.test_strategy?.length ? <section><h3>테스트 방향</h3><ul>{result.test_strategy.map((text, index) => <li key={index}>{text}</li>)}</ul></section> : null}<section className="plan-decision"><Button variant="secondary" onClick={onGovernance}>작업 전 점검·범위 승인 열기</Button><p>실행 요청 전 승인된 계획에 작업 전 점검과 코드 경로 범위를 연결하세요.</p><span className="eyebrow">담당자 검토</span><h3>{plan.status === 'approved' ? '계획이 승인되었습니다' : plan.status === 'rejected' ? '계획을 반려했습니다' : '실행할 계획을 확정하세요'}</h3>{plan.decision ? <><p>{plan.decision.reason}</p><small>{dateTime(plan.decision.decided_at || plan.decision.reviewed_at || plan.decision.created_at)}</small></> : <p>작업 범위, 원문 근거와 테스트 방향을 확인한 뒤 결정 사유를 남겨 주세요.</p>}{plan.status === 'needs_review' ? <div className="inline-actions"><Button icon={CheckCheck} disabled={!canDecide || blocking} onClick={() => setAction('approved')}>계획 승인</Button><Button variant="secondary" disabled={!canReview} onClick={() => setAction('rejected')}>반려</Button></div> : null}{plan.status === 'approved' ? <>{onWorkItems ? <Button variant="secondary" onClick={onWorkItems}>기능별 작업 관리</Button> : null}<Button icon={Terminal} disabled={!canReview || stale || settings?.repository_check?.status !== 'ready'} onClick={() => setAction('execution')}>코드 변경안 실행 요청</Button>{settings?.repository_check?.status !== 'ready' ? <p>저장소와 기준 브랜치를 먼저 확인해 주세요. {!sharedView ? <ControlButton className="text-button" onClick={onSettings}>설정 열기<ArrowRight size={12} /></ControlButton> : null}</p> : null}</> : null}{!canReview ? <p className="role-note">계획 승인·반려와 실행 요청은 관리자 또는 검토자가 진행합니다.</p> : null}</section></aside></div></> : null}{plan.trace_id ? <Disclosure className="implementation-trace"><summary>Nora 실행 참조</summary><code>{plan.trace_id}</code></Disclosure> : null}</>}{action && plan ? <PlanActionModal action={action} route={`${route}/implementation-plans/${encodeURIComponent(id)}`} request={request} onClose={() => setAction(null)} onDone={async (response) => { if (action === 'execution') { setAction(null); await onChanged('코드 변경안 실행을 요청했습니다. 실행기 연결 상태를 확인해 주세요.'); onExecution(response.request.id); } else await changed(action === 'approved' ? '작업 계획을 승인했습니다. 실행 요청을 진행할 수 있습니다.' : '작업 계획을 반려했습니다.'); }} /> : null}</section>;
}

function PlanActionModal({ action, route, request, onClose, onDone }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const execution = action === 'execution';
  async function submit(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    try {
      const body = execution ? { reason: form.get('reason').trim(), acknowledge_code_execution: form.get('acknowledge') === 'on' } : { decision: action, reason: form.get('reason').trim(), acknowledge_sources: form.get('acknowledge') === 'on' };
      const result = await request(`${route}/${execution ? 'execution-requests' : 'decision'}`, { method: 'POST', body }); await onDone(result);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <Modal title={execution ? '코드 변경안 실행 요청' : action === 'approved' ? 'AI 작업 계획 승인' : 'AI 작업 계획 반려'} eyebrow="RECORDED DECISION" busy={busy} onClose={onClose}><form onSubmit={submit}><div className="modal-body"><p className="form-intro">{execution ? '승인한 계획을 연결된 실행기에 전달합니다. 실행기는 별도 작업 공간에서 코드 변경안과 테스트 결과를 준비합니다.' : '원문과 구현 범위, 완료 기준 및 테스트 방향을 확인한 결정을 기록합니다.'}</p>{execution ? <Notice className="notice subtle"><Terminal size={17} /><p>연결된 실행기가 없으면 연결 대기 상태로 남습니다. 검토한 변경안은 GitHub PR 발행에서 Draft PR로 보낼 수 있습니다. 병합·배포는 별도 절차로 진행합니다.</p></Notice> : null}<FormField label={execution ? '실행 요청 사유' : '검토 사유'}><Textarea name="reason" rows={3} minLength={3} maxLength={2000} required /></FormField><label className="checkbox-label"><Input name="acknowledge" type="checkbox" required /><span>{execution ? '승인된 계획과 저장소를 확인했고, 실행기가 코드 변경안을 작성하도록 요청합니다.' : '계획에 사용한 확정본과 원문 근거를 확인했습니다.'}</span></label><ErrorNotice error={error} /></div><footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>취소</Button><Button type="submit" busy={busy} icon={execution ? Terminal : CheckCheck}>{execution ? '실행 요청 등록' : action === 'approved' ? '계획 승인' : '반려 사유 저장'}</Button></footer></form></Modal>;
}

function ExecutionStatus({ status }) { const state = EXECUTION_STATES[status] || [status || '상태 확인 필요', 'quiet']; return <Badge tone={state[1]}>{state[0]}</Badge>; }

function ExecutionEvidence({ result }) {
  const commands = Array.isArray(result.observed_commands) ? result.observed_commands : [];
  return <section className="execution-evidence" aria-label="실제 실행 기록">
    <h3>실제로 실행한 명령</h3>
    <p>실행기가 수집한 명령과 프로세스 종료 코드입니다.</p>
    {commands.length ? <ol className="execution-commands">{commands.map((entry, index) => <li key={index}>
      <code>{entry.command}</code>
      <Badge tone={entry.exit_code === 0 ? 'green' : Number.isInteger(entry.exit_code) ? 'red' : 'quiet'}>{Number.isInteger(entry.exit_code) ? `종료 코드 ${entry.exit_code}` : '종료 코드 미확인'}</Badge>
    </li>)}</ol> : <p className="execution-no-commands">수집된 명령 실행 기록이 없습니다.</p>}
    {result.base_commit_sha || result.patch_sha256 ? <Disclosure className="execution-integrity"><summary>변경 기준과 패치 식별값</summary><dl>
      {result.base_commit_sha ? <div><dt>기준 커밋</dt><dd><code>{result.base_commit_sha}</code></dd></div> : null}
      {result.patch_sha256 ? <div><dt>패치 SHA-256</dt><dd><code>{result.patch_sha256}</code></dd></div> : null}
    </dl></Disclosure> : null}
  </section>;
}

function ExecutionDetail({ id, route, request, owner, onBack, onGovernance, onDelivery }) {
  const sharedView = useSharedView();
  const path = `${route}/implementation-requests/${encodeURIComponent(id)}`;
  const remote = useRemote(path, request, 'request', (item) => developmentLegacyActive({ requests: item ? [item] : [] }));
  const item = remote.data, result = item?.result, stale = Boolean(item?.stale_reasons?.length);
  const [ticketBusy, setTicketBusy] = useState(false), [ticketError, setTicketError] = useState(null), [ticketNote, setTicketNote] = useState(''), [cancelReason, setCancelReason] = useState('');
  async function downloadTicket() {
    setTicketBusy(true); setTicketError(null);
    try {
      const response = await request(`${path}/runner-ticket`, { method: 'POST', body: {} });
      if (!remote.active.current.active) return;
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(response.ticket, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = blobUrl; link.download = response.filename || 'ains-execution.json'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      setTicketNote('실행 연결 파일을 내려받았습니다. 발급 후 2시간 동안 이 요청 한 건에만 사용할 수 있습니다.');
    } catch (err) { if (remote.active.current.active) setTicketError(err); }
    finally { if (remote.active.current.active) setTicketBusy(false); }
  }
  async function revokeTicket() {
    setTicketBusy(true); setTicketError(null);
    try { await request(`${path}/revoke-runner-ticket`, { method: 'POST', body: {} }); if (remote.active.current.active) setTicketNote('발급한 실행 연결 파일을 취소했습니다. 새 파일을 받아야 연결할 수 있습니다.'); }
    catch (err) { if (remote.active.current.active) setTicketError(err); }
    finally { if (remote.active.current.active) setTicketBusy(false); }
  }
  async function cancelExecution(event) {
    event.preventDefault();setTicketBusy(true);setTicketError(null);
    try { await request(`${path}/cancel`, {method:'POST',body:{reason:cancelReason.trim()}}); if(remote.active.current.active){setCancelReason('');setTicketNote('시작 전 실행 요청을 취소했습니다. 기존 범위를 해제하고 새 계획을 검토할 수 있습니다.');await remote.refresh();} }
    catch(err){if(remote.active.current.active)setTicketError(err);}
    finally{if(remote.active.current.active)setTicketBusy(false);}
  }
  return <section className="implementation-execution"><ControlButton className="back-link" onClick={onBack}><ArrowLeft size={16} />AI 구현 작업으로</ControlButton><ErrorNotice error={remote.error} onRetry={() => remote.refresh()} />{!item ? !remote.error ? <Spinner /> : null : <><header className="implementation-detail-heading"><div><span className="eyebrow">구현 실행</span><h2>코드 변경안 실행 요청</h2><p>{dateTime(item.created_at)} · 요청 {shortId(item.id)}</p></div><ExecutionStatus status={item.error_code === 'EXECUTION_CANCELLED' ? 'cancelled' : item.status} /></header>{stale ? <Notice className="notice warning"><AlertTriangle size={18} /><div><strong>실행 요청의 근거가 변경되었습니다.</strong><p>최신 설정과 확정본으로 새 계획을 승인한 뒤 실행을 요청해 주세요.</p></div></Notice> : null}{item.status === 'awaiting_runner' ? <div className="runner-waiting"><Terminal size={25} /><h3>실행기 연결을 기다리고 있습니다.</h3><p>요청은 저장되었으며 아직 코드 작업이 시작되지 않았습니다.<br />관리자가 승인된 저장소에 접근할 수 있는 실행기를 연결하면 변경안 작성을 시작할 수 있습니다.</p><Button variant="secondary" icon={RefreshCw} onClick={() => remote.refresh()}>실행 상태 확인</Button>{owner ? <section className="runner-connect"><h4>이 요청에 실행기 연결</h4><p>Node.js 22 이상·Git·Codex CLI가 설치되어 있고 Codex 로그인을 마친 컴퓨터에서 실행하세요.</p><div className="inline-actions"><Button asChild variant="secondary"><a href={`${route}/implementation-runner-script`} download><Download size={16} />실행기 다운로드</a></Button><Button variant="secondary" icon={Download} busy={ticketBusy} disabled={stale} onClick={downloadTicket}>실행 연결 파일 받기</Button><ControlButton type="button" className="text-button" disabled={ticketBusy} onClick={revokeTicket}>기존 연결 파일 취소</ControlButton></div><small>이 요청 전용 · 발급 후 2시간 유효 · 새 파일을 받으면 이전 파일은 취소됩니다.</small><Disclosure><summary>실행 방법</summary><p>실행기와 연결 파일을 같은 폴더에 두고 아래 명령을 실행하세요. 파일 이름은 실제 내려받은 이름으로 바꿔 주세요.</p><code>{`node ains-implementation-runner.cjs --ticket ains-execution-${item.id}.json`}</code><p>macOS에서는 Codex 기본 설치 경로를 자동으로 찾습니다. 다른 운영체제에서는 AINS_CODEX_BIN 환경변수를 codex 또는 실행 파일 경로로 지정해 주세요. 별도의 패키지 설치는 필요하지 않습니다.</p><p>비공개 저장소는 실행기 컴퓨터에도 Contents 읽기 권한이 있는 토큰을 <code>AINS_GITHUB_READ_TOKEN</code> 환경변수로 설정하세요. 서버의 읽기 연결과 별개이며 토큰은 Git 다운로드에만 사용됩니다. 토큰을 명령 인수나 저장소 주소에 넣지 마세요.</p><p>별도 작업 폴더에서 변경안을 작성합니다. 원격 저장소로 push하거나 병합하지 않습니다.</p></Disclosure><form onSubmit={cancelExecution} className="runner-cancel"><h4>시작 전 실행 요청 취소</h4><p>아직 실행기가 시작하지 않은 요청을 취소하고 연결 파일을 폐기합니다. 취소 이력은 보존됩니다.</p><FormField label="실행 취소 사유"><Textarea required value={cancelReason} onChange={event=>setCancelReason(event.target.value)} rows={2} maxLength={2000} disabled={ticketBusy} /></FormField><Button type="submit" variant="secondary" disabled={ticketBusy||!cancelReason.trim()}>실행 요청 취소</Button></form>{ticketNote ? <p role="status">{ticketNote}</p> : null}<ErrorNotice error={ticketError} /></section> : <p className="role-note">프로젝트 관리자가 실행 연결 파일을 발급할 수 있습니다.</p>}</div> : ACTIVE_EXECUTION.has(item.status) ? <Notice className="notice subtle"><Code2 size={18} /><p>실행기가 변경안을 준비하고 있습니다. 완료되면 결과가 표시됩니다.</p></Notice> : ['failed', 'uncertain'].includes(item.status) ? <Notice className="notice warning"><AlertTriangle size={18} /><div><strong>{item.error_code === 'EXECUTION_CANCELLED' ? '시작 전 실행 요청을 취소했습니다.' : '실행 결과를 확인해 주세요.'}</strong><p>{item.error_code === 'EXECUTION_CANCELLED' ? '작업 범위에서 기존 예약을 해제한 뒤 최신 기준으로 새 계획을 검토할 수 있습니다.' : EXECUTION_MESSAGES[item.error_code] || '동일 작업을 다시 실행하기 전에 실행기 로그와 생성된 변경안을 확인해 주세요.'}</p>{item.error_code ? <Disclosure><summary>기술 세부정보</summary><code>{item.error_code}</code></Disclosure> : null}</div></Notice> : null}{result ? <section className="execution-result"><SectionHeading eyebrow="결과 검토" title="생성된 변경안" /><div className="inline-actions"><Button variant="secondary" onClick={onGovernance}>요구사항·정책 결과 검수</Button>{!sharedView ? <Button variant="secondary" onClick={onDelivery}>GitHub PR 발행 검토</Button> : null}</div>{result.summary ? <p>{result.summary}</p> : null}{result.patch && !sharedView ? <Button asChild variant="secondary"><a href={`${path}/patch`}><Download size={16} />패치 내려받기</a></Button> : null}<DevelopmentChangeViewer artifact={{ kind: 'local_patch', diff: result.patch, changed_files: result.changed_files, base_sha: result.base_commit_sha }} sharedView={sharedView} /><ExecutionEvidence result={result} />{result.reported_checks?.length ? <div><h3>실행기가 보고한 검증 결과</h3><ul>{result.reported_checks.map((check, index) => <li key={index}>{typeof check === 'string' ? check : JSON.stringify(check)}</li>)}</ul></div> : null}{result.limitations?.length ? <div><h3>남은 확인 사항</h3><ul>{result.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></div> : null}</section> : null}<p className="implementation-no-publish"><ShieldCheck size={15} />변경안은 검토를 위한 결과물입니다. 자동 커밋·PR 생성·병합·배포는 수행하지 않습니다.</p></>}</section>;
}
