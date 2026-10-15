import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, GitMerge, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Button, ControlButton, Disclosure, ErrorNotice, FormField, Input, Modal, Notice, Select, Spinner, Textarea, dateTime, projectPath } from './ui.jsx';
import { useSharedView } from './shared-view.jsx';
import { useConfirm } from './confirmation.jsx';
import { AUTOMATION_COLUMNS, RISK_STATES, automationActive, automationBlockerLabel, automationColumn, automationExecutionLabel, automationMergeReadiness, automationPermissions, automationPreviewUrl, parsePreviewOrigins } from './task-automation-state.mjs';
import { retainProjectRequest } from './nora-workspace-state.mjs';
import './task-automation.css';

function useAutomationResource(path, request, poll = automationActive) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const lifecycle = useRef({ active: true, sequence: 0, controller: null });
  const load = useCallback(async () => {
    lifecycle.current.controller?.abort();
    const controller = new AbortController(), sequence = ++lifecycle.current.sequence;
    lifecycle.current.controller = controller;
    const current = () => lifecycle.current.active && sequence === lifecycle.current.sequence && !controller.signal.aborted;
    try { const value = await request(path, { signal: controller.signal }); if (current()) { setData(value); setError(null); } return value; }
    catch (err) { if (current() && err.name !== 'AbortError') setError(err); }
    finally { if (current()) setLoading(false); }
  }, [path, request]);
  useEffect(() => { lifecycle.current.active = true; setData(null); setLoading(true); void load(); return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; lifecycle.current.controller?.abort(); }; }, [load]);
  const active = Boolean(data && poll(data));
  useEffect(() => { if (!active) return; const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000); return () => clearInterval(timer); }, [active, load]);
  return { data, error, loading, load, lifecycle, setData };
}

function CapabilityNotice({ capabilities, onSettings }) {
  const blockers = capabilities?.blockers || [];
  if (!blockers.length) return null;
  return <Notice tone="warning" title="자동 작업 연결을 확인해 주세요"><ul>{blockers.map((value, index) => <li key={index}>{automationBlockerLabel(value)}</li>)}</ul>{onSettings ? <Button type="button" variant="secondary" onClick={onSettings}>프로젝트 연결 설정</Button> : null}</Notice>;
}

function IntakeNotice({ items = [] }) {
  const pending = items.filter(item => item.status !== 'submitted');
  if (!pending.length) return null;
  return <Disclosure><summary>정책 자동 분석 접수 · {pending.length}건</summary><ul>{pending.map(item => <li key={item.revision_id}>{item.status === 'pending' ? '추출한 정책을 분석 요청으로 등록하는 중입니다.' : item.error_code ? automationBlockerLabel(item.error_code) : item.status === 'awaiting_connection' ? '연결 준비 후 자동 분석을 요청합니다.' : '자동 분석 접수를 확인해 주세요.'} <small>{dateTime(item.created_at)}</small></li>)}</ul></Disclosure>;
}

function RiskAnalysis({ analysis, taskCount, onQuestions }) {
  const risks = analysis.risks || [];
  return <article className="task-auto-analysis"><header><Badge tone={analysis.status === 'blocked' ? 'amber' : analysis.status === 'completed' ? 'green' : 'quiet'}>{RISK_STATES[analysis.status] || '상태 확인 필요'}</Badge><strong>{analysis.title || analysis.document_title || '정책 문서 분석'}</strong><time>{dateTime(analysis.created_at)}</time></header>
    {analysis.summary ? <p className="task-auto-help">{analysis.summary}</p> : null}
    {risks.length ? <ul className="task-auto-risks">{risks.map((risk, index) => <li key={risk.id || index}><strong>{risk.title || risk.question || '확인할 위험'}</strong>{risk.description || risk.reason || risk.message ? <p>{risk.description || risk.reason || risk.message}</p> : null}{risk.blocking || risk.severity === 'blocking' ? <Badge tone="amber">고객 확인 필요</Badge> : null}</li>)}</ul> : analysis.status === 'completed' ? <p className="task-auto-help">차단 위험 없이 분석을 마쳤습니다. 연결된 작업 {taskCount}개를 확인하세요.</p> : null}
    {analysis.question_ids?.length ? <><p className="task-auto-help">고객에게 확인할 질문 초안 {analysis.question_ids.length}개가 등록되었습니다. 내용을 검토해 전달하세요.</p>{onQuestions ? <Button type="button" variant="secondary" onClick={onQuestions}>고객 질문 확인</Button> : null}</> : null}
    {analysis.error_code ? <Disclosure><summary>분석 준비·오류 정보</summary><p>{automationBlockerLabel(analysis.error_code)}</p></Disclosure> : null}
  </article>;
}

export function TaskAutomationBoard({ projectId, request, role, notify, onDirty, onChanged, onSettings, onQuestions }) {
  const sharedView = useSharedView(), route = `${projectPath(projectId)}/task-automation`;
  const remote = useAutomationResource(route, request), [selectedId, setSelectedId] = useState(null);
  const permissions = automationPermissions(role, sharedView), tasks = remote.data?.tasks || [], analyses = remote.data?.analyses || [];
  async function changed(message) { notify?.(message); await remote.load(); await onChanged?.({ quiet: true }); }
  return <section className="task-automation" aria-label="Nora 정책 분석·개발 작업">
    <header className="task-auto-heading"><div><h2>정책 분석·AI 개발 작업</h2><p>정책의 차단 위험은 고객 질문으로 확인하고, 준비된 작업을 진행 중으로 옮기면 AI 개발을 요청합니다.</p></div><Button type="button" variant="secondary" icon={RefreshCw} onClick={remote.load}>새로고침</Button></header>
    <ErrorNotice error={remote.error} onRetry={remote.load} />
    {!remote.data ? remote.loading ? <Spinner label="정책 분석과 개발 작업을 불러오고 있습니다" /> : null : <>
      {!sharedView ? <CapabilityNotice capabilities={remote.data.capabilities} onSettings={onSettings} /> : null}
      <IntakeNotice items={remote.data.intake} />
      {/* No CTDS Kanban primitive exists; columns compose existing CTDS card buttons and badges. */}
      <div className="task-auto-board" role="region" aria-label="AI 개발 작업 칸반" tabIndex={0}>{AUTOMATION_COLUMNS.map(([status, label]) => {
        const column = tasks.filter(task => automationColumn(task) === status);
        return <section className="task-auto-column" key={status} aria-label={label}><header><h3>{label}</h3><Badge tone="quiet">{column.length}</Badge></header><div className="task-auto-cards">{column.map(task => <ControlButton type="button" variant="outline" className="task-auto-card" key={task.id} onClick={() => setSelectedId(task.id)}><span><strong>{task.title}</strong><small>{automationExecutionLabel(task)}</small><small>{status === 'qa' ? '미리보기·코드 확인 후 병합 승인' : status === 'done' ? '기준 브랜치 병합 확인됨' : `${dateTime(task.updated_at)} 갱신`}</small></span></ControlButton>)}</div>{!column.length ? <p className="task-auto-help">작업 없음</p> : null}</section>;
      })}</div>
      {!tasks.length ? <p className="task-auto-help">자료·기록에 정책 문서를 등록하세요. 추출 후 Nora 리스크 분석을 진행하며, 차단 위험이 없는 결과에서 작업을 등록합니다.</p> : null}
      <Disclosure><summary>정책 분석·고객 질문 이력 · {analyses.length}건</summary><div className="task-auto-analysis-list">{analyses.length ? analyses.map(analysis => <RiskAnalysis key={analysis.id} analysis={analysis} taskCount={tasks.filter(task => task.analysis_id === analysis.id).length} onQuestions={onQuestions} />) : <p className="task-auto-help">아직 정책 분석 이력이 없습니다.</p>}</div></Disclosure>
    </>}
    {selectedId ? <AutomationTaskDetail key={selectedId} id={selectedId} route={route} request={request} permissions={permissions} sharedView={sharedView} settings={remote.data?.settings} capabilities={remote.data?.capabilities} onClose={() => setSelectedId(null)} onDirty={onDirty} onChanged={changed} /> : null}
  </section>;
}

function AutomationTaskDetail({ id, route, request, permissions, sharedView, settings, capabilities, onClose, onDirty, onChanged }) {
  const remote = useAutomationResource(`${route}/tasks/${encodeURIComponent(id)}`, request, data => ['queued', 'running', 'merging'].includes(data.task?.execution_status));
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [note, setNote] = useState(''), [previewAck, setPreviewAck] = useState(false), [diffAck, setDiffAck] = useState(false);
  const [reviewedHead, setReviewedHead] = useState(null), [reconciling, setReconciling] = useState(false), confirm = useConfirm();
  const task = remote.data?.task, artifact = task?.artifact, preview = automationPreviewUrl(artifact?.preview_url, settings?.preview_origins);
  const dirty = Boolean(note || previewAck || diffAck || busy);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { setReviewedHead(artifact?.head_sha || null); setPreviewAck(false); setDiffAck(false); setNote(''); }, [artifact?.head_sha, artifact?.diff, artifact?.preview_url, artifact?.target_branch, artifact?.base_sha]);
  useEffect(() => { if (!reconciling) return; const timer = setInterval(() => { if (!document.hidden) void remote.load(); }, 5000); const timeout = setTimeout(() => setReconciling(false), 60000); return () => { clearInterval(timer); clearTimeout(timeout); }; }, [reconciling, remote.load]);
  useEffect(() => { if (task?.execution_status !== 'uncertain') setReconciling(false); }, [task?.execution_status]);
  async function close() { if (!busy && (!dirty || await confirm('작성 중인 작업 검토 내용을 버리고 닫을까요?'))) onClose(); }
  async function mutate(suffix, body, method) {
    if (busy || sharedView) return; setBusy(true); setError(null);
    try { const result = await request(`${route}/tasks/${encodeURIComponent(id)}${suffix}`, { method, body }); if (!remote.lifecycle.current.active) return; if (result.task) remote.setData(result); setNote(''); setPreviewAck(false); setDiffAck(false); if (suffix === '/reconcile-merge') setReconciling(true); await remote.load(); await onChanged(suffix === '/reconcile-merge' ? '기존 병합 요청의 결과 확인을 요청했습니다.' : suffix ? '검토한 변경의 병합을 요청했습니다. 병합 결과를 확인하고 있습니다.' : '작업을 진행 중으로 옮기고 AI 개발을 요청했습니다.'); }
    catch (err) { if (remote.lifecycle.current.active) { setError(err); await remote.load(); } }
    finally { if (remote.lifecycle.current.active) setBusy(false); }
  }
  const merge = automationMergeReadiness(task, capabilities, settings);
  return <Modal title={task?.title || 'AI 개발 작업'} eyebrow="정책 분석에서 생성한 작업" busy={busy} onClose={close} wide><div className="modal-body task-auto-detail"><ErrorNotice error={remote.error} onRetry={remote.load} /><ErrorNotice error={error} />{!task ? remote.loading ? <Spinner /> : null : <>
    <div className="inline-actions"><Badge tone={AUTOMATION_COLUMNS.find(([status]) => status === task.status)?.[2]}>{AUTOMATION_COLUMNS.find(([status]) => status === task.status)?.[1] || '확인 필요'}</Badge><span>{automationExecutionLabel(task)}</span></div>
    <p>{task.description}</p><section><h3>완료 기준</h3><ul>{task.acceptance_criteria?.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></section>
    {task.evidence?.length ? <Disclosure><summary>정책 원문 근거 · {task.evidence.length}개</summary>{task.evidence.map((evidence, index) => <blockquote key={index}><small>{evidence.segment_id}</small><p>{evidence.quote}</p></blockquote>)}</Disclosure> : null}
    {task.error_code ? <Notice tone="warning" title="작업 준비 상태를 확인해 주세요">{automationBlockerLabel(task.error_code)}</Notice> : null}
    {task.status === 'todo' && permissions.canWrite ? <><Button type="button" icon={ArrowRight} busy={busy} disabled={capabilities?.development !== true} onClick={() => mutate('', { expected_version: task.version, status: 'in_progress' }, 'PATCH')}>진행 중으로 이동 · AI 개발 시작</Button>{capabilities?.development !== true ? <CapabilityNotice capabilities={capabilities} /> : null}</> : null}
    {task.status === 'in_progress' && ['queued', 'running'].includes(task.execution_status) ? <Notice title="AI 개발 결과를 기다리고 있습니다">결과가 준비되면 검수 대기로 이동합니다. 검토 전에는 완료로 표시하지 않습니다.</Notice> : null}
    {artifact ? <section><h3>개발 결과 검토</h3><dl className="task-auto-facts"><div><dt>병합 대상 브랜치</dt><dd>{artifact.target_branch || '확인 필요'}</dd></div><div><dt>변경 커밋</dt><dd><code>{artifact.head_sha || '확인 필요'}</code></dd></div><div><dt>기준 커밋</dt><dd><code>{artifact.base_sha || '확인 필요'}</code></dd></div></dl>
      {!sharedView && preview ? <Button type="button" asChild variant="secondary"><a href={preview} target="_blank" rel="noopener noreferrer">웹 미리보기 열기<ExternalLink size={15} /></a></Button> : !sharedView ? <p>허용된 주소의 웹 미리보기가 아직 없습니다.</p> : null}
      {!sharedView ? <Disclosure><summary>실제 코드 변경 내역</summary>{artifact.diff ? <pre className="task-auto-diff">{artifact.diff}</pre> : <p>코드 변경 내역이 아직 없습니다.</p>}</Disclosure> : <p className="task-auto-help">공유 화면에서는 코드 변경 내역과 외부 미리보기를 표시하지 않습니다.</p>}
      <h3>검증 결과</h3>{artifact.checks?.length ? <ul>{artifact.checks.map((check, index) => <li key={index}>{check.name} · {{ passed: '통과', failed: '실패', pending: '확인 중' }[check.status] || '확인 필요'}</li>)}</ul> : <p>검증 결과가 없습니다.</p>}
    </section> : null}
    {task.status === 'qa' && task.execution_status === 'merging' ? <Notice title="승인한 변경을 병합하고 있습니다">기준 브랜치의 병합 결과가 확인되면 완료로 이동합니다.</Notice> : null}
    {task.execution_status === 'uncertain' && task.review ? <Notice tone="warning" title="기존 병합 요청의 결과를 확인해야 합니다"><p>기준 브랜치의 실제 병합 결과를 확인한 뒤 완료로 표시합니다.</p>{permissions.canReview ? <Button type="button" variant="secondary" icon={RefreshCw} busy={busy || reconciling} onClick={() => mutate('/reconcile-merge', { expected_version: task.version }, 'POST')}>기존 병합 결과 확인</Button> : null}</Notice> : null}
    {task.status === 'qa' && permissions.canReview && task.execution_status === 'ready' ? <form className="task-auto-review" onSubmit={event => { event.preventDefault(); if (merge.allowed && previewAck && diffAck && note.trim() && reviewedHead === artifact.head_sha) void mutate('/approve-merge', { expected_version: task.version, head_sha: reviewedHead, note: note.trim() }, 'POST'); }}>
      <h3>검토 후 기준 브랜치에 병합</h3>{!merge.allowed ? <Notice tone="warning" title="병합 전에 확인할 사항"><ul>{merge.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></Notice> : null}
      <label className="checkbox-label"><Input type="checkbox" checked={previewAck} disabled={busy || !preview} onChange={event => setPreviewAck(event.target.checked)} /><span>웹 미리보기에서 완료 기준과 동작을 확인했습니다.</span></label>
      <label className="checkbox-label"><Input type="checkbox" checked={diffAck} disabled={busy || !artifact?.diff} onChange={event => setDiffAck(event.target.checked)} /><span>코드 변경·검증 결과·대상 브랜치를 확인했습니다.</span></label>
      <FormField label="검토 근거"><Textarea rows={3} maxLength={3000} value={note} required disabled={busy} onChange={event => setNote(event.target.value)} /></FormField>
      <Button type="submit" icon={GitMerge} busy={busy} disabled={!merge.allowed || !previewAck || !diffAck || !note.trim() || reviewedHead !== artifact?.head_sha}>검토한 변경 승인·병합</Button>
    </form> : task.status === 'qa' && !permissions.canReview ? <p className="task-auto-help"><ShieldCheck size={15} />관리자 또는 검토자가 결과를 확인한 뒤 병합을 승인합니다.</p> : null}
    {task.status === 'done' ? <Notice tone="success" title="기준 브랜치 병합을 확인했습니다">승인한 변경의 실제 병합 결과에 따라 완료 처리되었습니다.</Notice> : null}
  </>}</div><footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>닫기</Button></footer></Modal>;
}

export function PolicyRiskAnalysis({ projectId, revisionId, sourceReady, request, canWrite, onDirty, onWorkItems, onQuestions }) {
  const sharedView = useSharedView(), route = `${projectPath(projectId)}/task-automation`;
  const remote = useAutomationResource(route, request), [busy, setBusy] = useState(false), [error, setError] = useState(null), pending = useRef(null);
  const analyses = remote.data?.analyses?.filter(analysis => analysis.revision_id === revisionId) || [], active = analyses.some(analysis => ['queued', 'running'].includes(analysis.status));
  useEffect(() => { onDirty?.(busy || Boolean(pending.current)); return () => onDirty?.(false); }, [busy, error, onDirty]);
  async function analyze() {
    if (busy || sharedView || !canWrite) return; setBusy(true); setError(null); pending.current ||= { revision_id: revisionId, request_id: crypto.randomUUID() };
    try { await request(`${route}/analyze`, { method: 'POST', body: pending.current }); if (remote.lifecycle.current.active) { pending.current = null; await remote.load(); } }
    catch (err) { if (remote.lifecycle.current.active) { if (!retainProjectRequest(err)) pending.current = null; setError(err); } }
    finally { if (remote.lifecycle.current.active) setBusy(false); }
  }
  return <section className="task-auto-policy"><h3>정책 리스크·개발 작업</h3><p className="task-auto-help">차단 위험이 있으면 고객 질문 초안을 남기고, 없으면 개발 작업을 등록합니다.</p><ErrorNotice error={remote.error || error} onRetry={remote.load} />
    {remote.data ? <><CapabilityNotice capabilities={remote.data.capabilities} /><IntakeNotice items={remote.data.intake?.filter(item => item.revision_id === revisionId)} />{!sourceReady ? <p className="task-auto-help">문서 추출과 원문에서 확인이 필요한 구간을 먼저 검토해 주세요.</p> : null}<div className="inline-actions">{canWrite && !sharedView ? <Button type="button" variant="secondary" icon={Sparkles} busy={busy} disabled={active || !sourceReady || !remote.data.capabilities?.risk_analysis} onClick={analyze}>{pending.current ? '같은 리스크 분석 요청 확인' : 'Nora 리스크 분석'}</Button> : null}{onWorkItems ? <Button type="button" variant="secondary" onClick={onWorkItems}>분석·개발 작업 보기</Button> : null}</div>{analyses.slice(0, 1).map(analysis => <RiskAnalysis key={analysis.id} analysis={analysis} taskCount={remote.data.tasks?.filter(task => task.analysis_id === analysis.id).length || 0} onQuestions={onQuestions} />)}</> : remote.loading ? <Spinner label="정책 리스크 분석 상태를 확인하고 있습니다" /> : null}
  </section>;
}

export function TaskAutomationSettings({ project, request, notify, onDirty, disabled }) {
  const route = `${projectPath(project.id)}/task-automation`, remote = useAutomationResource(route, request, () => false);
  const flowRemote = useAutomationResource(`${projectPath(project.id)}/nora-workspace/flows`, request, () => false), flows = flowRemote.data?.flows?.filter(flow => flow.published === true);
  const [draft, setDraft] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const owner = project.role === 'owner', settings = remote.data?.settings;
  useEffect(() => { if (settings) setDraft({ enabled: settings.enabled, risk_flow_slug: settings.risk_flow_slug === 'ains-policy-risk-v1' ? '' : settings.risk_flow_slug || '', development_flow_slug: settings.development_flow_slug || '', preview_origins: (settings.preview_origins || []).join('\n') }); }, [settings]);
  const initial = settings ? { enabled: settings.enabled, risk_flow_slug: settings.risk_flow_slug === 'ains-policy-risk-v1' ? '' : settings.risk_flow_slug || '', development_flow_slug: settings.development_flow_slug || '', preview_origins: (settings.preview_origins || []).join('\n') } : null;
  const dirty = Boolean(draft && initial && Object.keys(initial).some(key => draft[key] !== initial[key]));
  useEffect(() => { onDirty?.(dirty || busy); return () => onDirty?.(false); }, [dirty, busy, onDirty]);
  async function save(event) {
    event.preventDefault(); if (!owner || disabled || busy) return;
    let origins; try { origins = parsePreviewOrigins(draft.preview_origins); } catch (err) { setError(err); return; }
    setBusy(true); setError(null);
    try { await request(`${route}/settings`, { method: 'PUT', body: { expected_version: settings.version, enabled: draft.enabled, risk_flow_slug: draft.risk_flow_slug, development_flow_slug: draft.development_flow_slug || null, preview_origins: origins } }); if (remote.lifecycle.current.active) { await remote.load(); notify?.('정책 분석·AI 개발 연결을 저장했습니다.'); } }
    catch (err) { if (remote.lifecycle.current.active) setError(err); }
    finally { if (remote.lifecycle.current.active) setBusy(false); }
  }
  const field = key => ({ value: draft[key], disabled: !owner || disabled || busy, onChange: event => setDraft(current => ({ ...current, [key]: event.target.value })) });
  return <section className="repository-check" aria-label="정책 분석·AI 개발 연결"><div className="settings-context-heading"><Sparkles size={19} /><h3>정책 분석·AI 개발</h3></div><ErrorNotice error={remote.error} onRetry={remote.load} />{!draft ? remote.loading ? <Spinner /> : null : <>
    <CapabilityNotice capabilities={remote.data.capabilities} /><form onSubmit={save}><label className="checkbox-label"><Input type="checkbox" checked={draft.enabled} disabled={!owner || disabled || busy} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} /><span>정책 분석·AI 개발 활성화</span></label>
      <ErrorNotice error={flowRemote.error} onRetry={flowRemote.load} />{[['risk_flow_slug', '정책 리스크 분석 흐름', '기본 Nora 리스크 분석 흐름 · 자동 준비'], ['development_flow_slug', 'AI 개발 흐름', '연결 필요']].map(([key, label, empty]) => <FormField label={label} key={key}><Select {...field(key)}><option value="">{empty}</option>{draft[key] && !flows?.some(flow => flow.slug === draft[key]) ? <option value={draft[key]} disabled>{draft[key]} · 현재 설정</option> : null}{flows?.map(flow => <option key={flow.slug} value={flow.slug}>{flow.name || flow.slug}</option>)}</Select></FormField>)}
      <FormField label="웹 미리보기 허용 주소" hint="예: https://preview.example.com — 경로 없이 한 줄에 한 도메인, 최대 10개를 입력하세요."><Textarea {...field('preview_origins')} rows={3} maxLength={4000} /></FormField>
      <p>병합 대상은 프로젝트의 기준 브랜치입니다. 개발 결과·미리보기·테스트를 검토한 뒤 병합을 승인합니다.</p><ErrorNotice error={error} />{owner ? <Button type="submit" variant="secondary" busy={busy} disabled={disabled || !dirty}>분석·개발 연결 저장</Button> : <p>프로젝트 관리자만 연결을 변경할 수 있습니다.</p>}
    </form></>}
  </section>;
}
