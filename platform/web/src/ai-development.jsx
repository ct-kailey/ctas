import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Code2, FileText, RefreshCw, Settings2 } from 'lucide-react';
import { Badge, Button, ControlButton, Disclosure, Empty, ErrorNotice, Notice, Spinner, dateTime, projectPath } from './ui.jsx';
import { useSharedView } from './shared-view.jsx';
import { DevelopmentChangeViewer } from './development-change-viewer.jsx';
import { IMPLEMENTATION_NOTE_KINDS, IMPLEMENTATION_NOTE_STATES } from './implementation-notes-state.mjs';
import { createDevelopmentReadSession, developmentActivity, developmentBlockers, developmentGroups, developmentLegacyActive, developmentNextAction, developmentNextStep, developmentNotesPath, developmentOverviewActive, developmentSelection, developmentState, developmentTaskRefreshing } from './ai-development-state.mjs';
import './ai-development.css';

const neverPoll = () => false;
function useDevelopmentResource(path, request, shouldPoll = neverPoll) {
  const session = useRef(null); if (!session.current) session.current = createDevelopmentReadSession();
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!path) return;
    if (!quiet) setState(value => ({ ...value, loading: true }));
    const result = await session.current.read(request, path, { skipIfPending: quiet });
    if (result.ignored) return;
    setState(value => result.error ? { ...value, error: result.error, loading: false } : { data: result.data, error: null, loading: false });
    return result.data;
  }, [request, path]);
  useEffect(() => { session.current.open(); setState({ data: null, error: null, loading: Boolean(path) }); if (path) void load(); return () => session.current.close(); }, [load, path]);
  const active = Boolean(state.data && shouldPoll(state.data));
  useEffect(() => { if (!active) return; const interval = setInterval(() => { if (!document.hidden) void load({ quiet: true }); }, 5000); return () => clearInterval(interval); }, [active, load]);
  return { ...state, load };
}

function DevelopmentTaskList({ title, items, selectedId, onSelect, onLegacy, emptyMessage }) {
  return <section className="ai-dev-list-section" aria-label={title}>
    <header><h3>{title}</h3><Badge tone="quiet">{items.length}</Badge></header>
    {items.length ? <div className="ai-dev-task-list">{items.map(item => <ControlButton type="button" variant="outline" layout="card" className="ai-dev-task-card" key={item.key} aria-pressed={item.kind === 'task' && selectedId === item.id} onClick={() => item.kind === 'legacy' ? onLegacy?.(item.id) : onSelect(item.id)}>
      <span className="ai-dev-task-card-content"><span className="ai-dev-task-card-meta"><Badge tone={item.state.tone}>{item.state.label}</Badge>{item.kind === 'legacy' ? <small>계획 기반 작업</small> : null}</span><strong>{item.title}</strong><small>{dateTime(item.at)}</small></span>
    </ControlButton>)}</div> : <p className="ai-dev-empty-line">{emptyMessage}</p>}
  </section>;
}

function PreparationNotice({ draftCount, preparedCount, hasWork, blockers, sharedView, onWorkItems, onSettings }) {
  if (!draftCount && !preparedCount && hasWork && !blockers.length) return null;
  const title = draftCount ? `검토 전 작업 초안 ${draftCount}개` : preparedCount ? `시작 전 작업 ${preparedCount}개` : blockers.length ? '개발 연결 확인이 필요합니다' : '첫 개발 작업을 준비해 주세요';
  return <Notice className="ai-dev-preparation" title={title} tone={blockers.length ? 'warning' : 'neutral'} actions={<>
    {onWorkItems ? <Button type="button" icon={ArrowRight} onClick={() => onWorkItems()}>{draftCount ? '작업 초안 확인' : preparedCount ? '시작할 작업 확인' : '작업 보드 열기'}</Button> : null}
    {!sharedView && blockers.length && onSettings ? <Button type="button" variant="secondary" icon={Settings2} onClick={onSettings}>Nora 연결 확인</Button> : null}
  </>}>
    <div className="ai-dev-preparation-text">{draftCount ? <p>작업 보드에서 원문을 확인하고 Nora 리스크 분석으로 개발할 Task를 준비하세요.</p> : !hasWork && !preparedCount ? <p>정책 문서를 분석해 Task를 만들거나, 승인된 개발 계획에서 실행을 요청할 수 있습니다.</p> : preparedCount ? <p>작업 내용을 확인한 뒤 작업 보드에서 AI 개발을 시작할 수 있습니다.</p> : null}
      {blockers.map((blocker, index) => <p key={`${blocker.code}:${index}`}>{blocker.message}</p>)}
    </div>
  </Notice>;
}

function DevelopmentActivity({ remote }) {
  const items = developmentActivity(remote.data);
  return <section className="ai-dev-activity ains-section-stack" aria-label="실행 활동 기록"><header className="ai-dev-section-heading"><h3>실행 활동</h3>{remote.data?.has_more ? <small>최근 {remote.data.limit || items.length}건</small> : null}</header>
    <ErrorNotice error={remote.error} onRetry={() => remote.load()} />
    {!remote.data && remote.loading ? <Spinner label="저장된 실행 활동을 불러오고 있습니다" /> : items.length ? <ol className="ai-dev-activity-list">{items.map(item => <li key={item.id}><div className="ai-dev-activity-time"><time dateTime={item.at}>{dateTime(item.at)}</time></div><div className="ai-dev-activity-content"><strong>{item.title}</strong>{item.summary ? <p>{item.summary}</p> : null}{item.error_code || item.trace_id ? <Disclosure><summary>실행 식별 정보</summary>{item.trace_id ? <p>Trace <code>{item.trace_id}</code></p> : null}{item.error_code ? <p>오류 코드 <code>{item.error_code}</code></p> : null}</Disclosure> : null}</div></li>)}</ol> : !remote.error ? <p className="ai-dev-empty-line">아직 저장된 실행 활동이 없습니다.</p> : null}
  </section>;
}

function DevelopmentNotes({ remote, onWorkItems, taskId }) {
  const notes = remote.data?.notes || [];
  return <section className="ains-section-stack" aria-label="임시 구현과 남은 작업"><header className="ai-dev-section-heading"><h3>임시 구현·남은 작업</h3>{remote.data?.total ? <small>{remote.data.total}건</small> : null}</header><ErrorNotice error={remote.error} onRetry={() => remote.load()} />
    {!remote.data && remote.loading ? <Spinner label="이 작업의 임시 구현 기록을 불러오고 있습니다" /> : notes.length ? <div className="ai-dev-note-list">{notes.map(note => <Disclosure key={note.id}><summary>{IMPLEMENTATION_NOTE_KINDS[note.kind] || '검토 기록'} · {note.title}</summary><div className="ai-dev-note-content"><Badge tone="quiet">{IMPLEMENTATION_NOTE_STATES[note.status] || '상태 확인 필요'}</Badge>{note.uncertainty ? <p>{note.uncertainty}</p> : null}{note.temporary_approach ? <p>{note.temporary_approach}</p> : null}{note.replacement_condition ? <p>보완 조건 · {note.replacement_condition}</p> : null}</div></Disclosure>)}</div> : !remote.error ? <p className="ai-dev-empty-line">등록된 임시 구현·작업 공백 기록이 없습니다.</p> : null}
    {notes.length && onWorkItems ? <div><Button type="button" variant="secondary" onClick={() => onWorkItems({ automationTaskId: taskId })}>기록 전체 확인·피드백</Button></div> : null}
  </section>;
}

function AutomatedDevelopmentDetail({ projectId, taskId, request, settings, capabilities, canWrite, canReview, sharedView, onWorkItems, onSettings }) {
  const projectRoute = projectPath(projectId), path = `${projectRoute}/task-automation/tasks/${encodeURIComponent(taskId)}`;
  const taskRemote = useDevelopmentResource(path, request, data => developmentTaskRefreshing(data.task));
  const task = taskRemote.data?.task, active = developmentTaskRefreshing(task);
  const activity = useDevelopmentResource(`${path}/activity`, request, () => active), notes = useDevelopmentResource(developmentNotesPath(projectRoute, taskId), request, () => active);
  const evidenceVersion = task ? `${task.version}:${task.updated_at}:${task.status}:${task.execution_status}` : null, previous = useRef(null);
  useEffect(() => { if (evidenceVersion && previous.current !== evidenceVersion) { previous.current = evidenceVersion; void activity.load(); void notes.load(); } }, [evidenceVersion, activity.load, notes.load]);
  const state = developmentState(task), action = developmentNextAction(task, { capabilities, canWrite, canReview, sharedView });
  const report = task?.artifact?.implementation_report || task?.artifact?.reported_implementation_report;
  function openAction() { if (action.target === 'settings') onSettings?.(); else onWorkItems?.({ automationTaskId: taskId }); }
  return <article className="ai-dev-detail ains-section-stack" aria-label="선택한 AI 개발 작업">
    <ErrorNotice error={taskRemote.error} onRetry={() => taskRemote.load()} />
    {!task ? taskRemote.loading ? <Spinner label="개발 작업의 결과를 불러오고 있습니다" /> : null : <>
      <header className="ai-dev-detail-heading"><div className="ains-section-stack"><Badge tone={state.tone}>{state.label}</Badge><h2>{task.title}</h2></div><div className="ai-dev-actions"><Button type="button" variant="ghost" icon={RefreshCw} disabled={taskRemote.loading} onClick={() => { void taskRemote.load(); void activity.load(); void notes.load(); }} aria-label="선택한 개발 작업 새로고침">새로고침</Button></div></header>
      <Notice className="ai-dev-next-step" title="다음 할 일" actions={(action.target === 'work' && onWorkItems || action.target === 'settings' && onSettings) ? <Button type="button" onClick={openAction}>{action.label}</Button> : null}>{developmentNextStep(task)}</Notice>
      {task.description ? <p className="ai-dev-description">{task.description}</p> : null}
      {task.acceptance_criteria?.length ? <Disclosure><summary>완료 기준 · {task.acceptance_criteria.length}개</summary><ul className="ains-prose-list">{task.acceptance_criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></Disclosure> : null}
      {task.requires_provisional_confirmation && task.execution_status === 'idle' ? <p className="ai-dev-help">고객에게 확인할 내용이 남아 있습니다. 개발 시작 시 임시 구현 진행 여부를 확인합니다.</p> : null}
      {task.artifact ? <DevelopmentChangeViewer artifact={task.artifact} previewOrigins={settings?.preview_origins || []} sharedView={sharedView} previewFramePath={`${path}/preview-frame`} /> : <p className="ai-dev-help">아직 저장된 개발 결과가 없습니다.</p>}
      {report ? <section className="ains-section-stack"><header className="ai-dev-section-heading"><h3>AI 구현 보고</h3><Badge tone={report.completion === 'complete' ? 'green' : 'amber'}>{{ complete: '구현 완료 보고', partial: '부분 구현', blocked: '보완 필요' }[report.completion] || '검토 필요'}</Badge></header><p className="ai-dev-help">AI가 보고한 구현 범위입니다. 실제 변경 내용과 완료 기준을 함께 검토하세요.</p>{report.remaining_criteria?.length ? <ul className="ains-prose-list">{report.remaining_criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul> : null}</section> : null}
      <DevelopmentActivity remote={activity} />
      <DevelopmentNotes remote={notes} onWorkItems={onWorkItems} taskId={taskId} />
      {sharedView ? <p className="ai-dev-help">공유 화면에서는 작업 이력을 조회할 수 있습니다. 코드와 외부 미리보기는 표시하지 않습니다.</p> : null}
    </>}
  </article>;
}

export function AIDevelopmentWorkspace(props) {
  // Remount every project boundary before rendering a different project's results.
  return <DevelopmentWorkspaceContent key={props.project.id} {...props} />;
}
function DevelopmentWorkspaceContent({ project, request, canWrite, canReview, onSettings, onWorkItems, onOpenLegacyExecution, onOpenPlans }) {
  const sharedView = useSharedView(), route = projectPath(project.id);
  const overview = useDevelopmentResource(`${route}/task-automation`, request, developmentOverviewActive);
  const legacy = useDevelopmentResource(`${route}/implementation-requests`, request, developmentLegacyActive);
  const drafts = useDevelopmentResource(`${route}/task-drafts?limit=1`, request);
  const [selectedId, setSelectedId] = useState(null), detailRef = useRef(null);
  const groups = useMemo(() => developmentGroups(overview.data?.tasks, legacy.data?.requests), [overview.data, legacy.data]);
  const selected = developmentSelection(groups, selectedId), blockers = developmentBlockers(overview.data?.capabilities), draftCount = drafts.data?.total || 0;
  useEffect(() => { if (selected?.id !== selectedId) setSelectedId(selected?.id || null); }, [selected?.id, selectedId]);
  function select(id) { setSelectedId(id); if (window.matchMedia('(max-width: 900px)').matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })); }
  function refresh() { void overview.load(); void legacy.load(); void drafts.load(); }
  return <section className="ai-development ains-section-stack" aria-label="AI 개발 작업실">
    <header className="ai-dev-page-heading"><div><h2>AI 개발</h2><p>진행 중인 작업과 변경 결과를 확인합니다.</p></div><div className="ai-dev-actions">{onOpenPlans ? <Button type="button" variant="secondary" icon={FileText} onClick={onOpenPlans}>개발 계획 보기</Button> : null}<Button type="button" variant="ghost" icon={RefreshCw} onClick={refresh}>새로고침</Button></div></header>
    <ErrorNotice error={overview.error || legacy.error || drafts.error} onRetry={refresh} />
    {overview.data || drafts.data ? <PreparationNotice draftCount={draftCount} preparedCount={groups.prepared.filter(item => item.kind === 'task').length} hasWork={Boolean(groups.all.length)} blockers={blockers} sharedView={sharedView} onWorkItems={onWorkItems} onSettings={onSettings} /> : null}
    {!overview.data && overview.loading ? <Spinner label="AI 개발 작업을 불러오고 있습니다" /> : null}
    <div className="ai-dev-workspace"><aside className="ai-dev-sidebar ains-section-stack" aria-label="개발 작업 목록">
      <DevelopmentTaskList title="진행 중인 작업" items={groups.active} selectedId={selected?.id} onSelect={select} onLegacy={onOpenLegacyExecution} emptyMessage={overview.error || legacy.error ? '목록을 확인하지 못했습니다.' : '진행 중인 AI 개발이 없습니다.'} />
      <DevelopmentTaskList title="작업 내역" items={groups.history} selectedId={selected?.id} onSelect={select} onLegacy={onOpenLegacyExecution} emptyMessage={overview.error || legacy.error ? '목록을 확인하지 못했습니다.' : '아직 실행한 작업이 없습니다.'} />
      {groups.prepared.length ? <Disclosure open={!groups.active.length && !groups.history.length}><summary>시작 전 작업 · {groups.prepared.length}개</summary><DevelopmentTaskList title="시작할 작업" items={groups.prepared} selectedId={selected?.id} onSelect={select} onLegacy={onOpenLegacyExecution} emptyMessage="" /></Disclosure> : null}
      {overview.data?.tasks?.length >= 200 || legacy.data?.requests?.length >= 100 ? <p className="ai-dev-help">정책 기반 작업은 최근 200개, 계획 기반 실행은 최근 100개를 표시합니다.</p> : null}
    </aside><div className="ai-dev-detail-container" ref={detailRef}>
      {selected ? <AutomatedDevelopmentDetail key={`${project.id}:${selected.id}`} projectId={project.id} taskId={selected.id} request={request} settings={overview.data?.settings} capabilities={overview.data?.capabilities} canWrite={canWrite && !sharedView} canReview={canReview && !sharedView} sharedView={sharedView} onWorkItems={onWorkItems} onSettings={onSettings} /> : <Empty icon={Code2} title={groups.all.length ? '확인할 작업을 선택하세요' : draftCount ? '초안을 개발 작업으로 준비하세요' : '개발 결과가 여기에 모입니다'}>{groups.all.length ? '목록에서 작업을 열면 실제 실행 기록과 결과를 확인할 수 있습니다.' : draftCount ? '작업 초안 확인에서 정책을 검토하고 분석하면 개발할 Task가 생성됩니다.' : '개발을 시작하면 실행 활동, 코드 변경, 미리보기를 작업별로 확인할 수 있습니다.'}</Empty>}
    </div></div>
  </section>;
}
