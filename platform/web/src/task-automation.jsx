import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, GitMerge, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Button, ControlButton, Disclosure, ErrorNotice, FormField, Input, Modal, Notice, Select, Spinner, Textarea, dateTime, projectPath } from './ui.jsx';
import { useSharedView } from './shared-view.jsx';
import { useConfirm } from './confirmation.jsx';
import { Modal as CTDSModal } from './components/ctds/Modal/Modal';
import { AUTOMATION_COLUMNS, RISK_STATES, automationActive, automationArtifactStages, automationBlockerLabel, automationCanRefreshArtifact, automationCanStart, automationColumn, automationExecutionLabel, automationHasCodeArtifact, automationMergeReadiness, automationPermissions, automationPreviewUrl, automationPrUrl, automationReportedChecks, automationSdkConnectionKey, automationSdkConnectionRequest, automationSdkConnections, automationSdkSelectedConnection, automationSettingsDraft, automationSettingsPayload, refreshAutomationArtifact, startAutomationTask } from './task-automation-state.mjs';
import { retainProjectRequest } from './nora-workspace-state.mjs';
import { mergeTaskDraftPage, taskDraftSourceUrl } from './task-draft-state.mjs';
import { ImplementationNotesPanel, RelatedImplementationNotes } from './implementation-notes.jsx';
import { journeyTaskSelection } from './project-journey-navigation.mjs';
import './task-automation.css';

function useAutomationResource(path, request, poll = automationActive) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const lifecycle = useRef({ active: true, sequence: 0, controller: null });
  const load = useCallback(async () => {
    if (!path) return null;
    lifecycle.current.controller?.abort();
    const controller = new AbortController(), sequence = ++lifecycle.current.sequence;
    lifecycle.current.controller = controller;
    const current = () => lifecycle.current.active && sequence === lifecycle.current.sequence && !controller.signal.aborted;
    try { const value = await request(path, { signal: controller.signal }); if (current()) { setData(value); setError(null); } return value; }
    catch (err) { if (current() && err.name !== 'AbortError') setError(err); }
    finally { if (current()) setLoading(false); }
  }, [path, request]);
  useEffect(() => { lifecycle.current.active = true; setData(null); setLoading(Boolean(path)); setError(null); if (path) void load(); return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; lifecycle.current.controller?.abort(); }; }, [load]);
  const active = Boolean(data && poll(data));
  useEffect(() => { if (!active) return; const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000); return () => clearInterval(timer); }, [active, load]);
  return { data, error, loading, load, lifecycle, setData };
}

function useTaskDrafts(path, request) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const lifecycle = useRef({ active: true, sequence: 0, controller: null, page: null, more: false });
  const load = useCallback(async (more = false) => {
    lifecycle.current.controller?.abort();
    const controller = new AbortController(), sequence = ++lifecycle.current.sequence;
    lifecycle.current.controller = controller; lifecycle.current.more = more;
    const previous = more ? lifecycle.current.page : null;
    const current = () => lifecycle.current.active && sequence === lifecycle.current.sequence && !controller.signal.aborted;
    setLoading(true);
    try {
      const page = await request(`${path}?limit=100&offset=${previous?.next_offset || 0}`, { signal: controller.signal });
      if (current()) { const value = mergeTaskDraftPage(previous, page); lifecycle.current.page = value; setData(value); setError(null); }
    } catch (err) { if (current() && err.name !== 'AbortError') setError(err); }
    finally { if (current()) setLoading(false); }
  }, [path, request]);
  useEffect(() => {
    lifecycle.current.active = true; lifecycle.current.page = null; setData(null); setError(null); void load();
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; lifecycle.current.controller?.abort(); };
  }, [load]);
  return { data, error, loading, load, retry: () => load(lifecycle.current.more) };
}

function CapabilityNotice({ capabilities, onSettings }) {
  const blockers = capabilities?.blockers || [];
  if (!blockers.length) return null;
  return <Notice tone="warning" title="자동 작업 연결을 확인해 주세요" actions={onSettings ? <Button type="button" variant="secondary" onClick={onSettings}>프로젝트 연결 설정</Button> : null}><ul className="ains-prose-list">{blockers.map((value, index) => <li key={index}>{automationBlockerLabel(value)}</li>)}</ul></Notice>;
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
    {analysis.temporary_decisions?.length || analysis.work_gaps?.length ? <p className="task-auto-help">확인할 구현 내용 {analysis.temporary_decisions?.length || 0}개 · 예상 작업 공백 {analysis.work_gaps?.length || 0}개. 실제 임시 구현 이력은 AI 개발 후 자동으로 기록합니다.</p> : null}
    {analysis.feedback?.note_id ? <p className="task-auto-help">사람의 피드백에 따른 보완 분석입니다. 기존 작업 상태는 보존됩니다.</p> : null}
    {risks.length ? <ul className="task-auto-risks">{risks.map((risk, index) => <li key={risk.id || index}><strong>{risk.title || risk.question || '확인할 위험'}</strong>{risk.description || risk.reason || risk.message ? <p>{risk.description || risk.reason || risk.message}</p> : null}{risk.blocking || risk.severity === 'blocking' ? <Badge tone="amber">고객 확인 필요</Badge> : null}</li>)}</ul> : analysis.status === 'completed' ? <p className="task-auto-help">차단 위험 없이 분석을 마쳤습니다. 연결된 작업 {taskCount}개를 확인하세요.</p> : null}
    {analysis.question_ids?.length ? <><p className="task-auto-help">고객에게 확인할 질문 초안 {analysis.question_ids.length}개가 등록되었습니다. 내용을 검토해 전달하세요.</p>{onQuestions ? <Button type="button" variant="secondary" onClick={onQuestions}>고객 질문 확인</Button> : null}</> : null}
    {analysis.error_code ? <Disclosure><summary>분석 준비·오류 정보</summary><p>{automationBlockerLabel(analysis.error_code)}</p></Disclosure> : null}
  </article>;
}

function ProvisionalStartConfirmation({ task, check, onConfirm, onCancel }) {
  const questions = check.questions || [];
  return <CTDSModal open title="임시 구현 확인" description={questions.length ? '고객 검토가 필요한 질문이 남아있습니다. 임의로 임시 구현을 진행하고 히스토리를 남길까요?' : '확인이 필요한 내용이 남아있습니다. 임의로 임시 구현을 진행하고 히스토리를 남길까요?'} onOpenChange={open => { if (!open) onCancel(); }} dismissLabel="취소" data-ctds="modal" footer={<><Button type="button" variant="secondary" onClick={onCancel}>취소</Button><Button type="button" onClick={onConfirm}>확인 · AI 개발 시작</Button></>}>
    <div className="task-auto-start-review"><strong>{task.title}</strong>
      {questions.length ? <section><h3>확인할 질문 · {questions.length}개</h3><ul>{questions.map(question => <li key={question.id}><strong>{question.title || '고객 확인 사항'}</strong><p>{question.question}</p>{question.answer ? <p className="task-auto-help">전달받은 답변: {question.answer}</p> : null}</li>)}</ul></section> : null}
      {check.temporary_decisions.length || check.work_gaps.length ? <Disclosure><summary>기존 임시 구현 제안·작업 공백 · {check.temporary_decisions.length + check.work_gaps.length}개</summary><ul>{[...check.temporary_decisions, ...check.work_gaps].map((item, index) => <li key={item.id || index}><strong>{item.title || '확인할 내용'}</strong>{item.uncertainty ? <p>{item.uncertainty}</p> : null}</li>)}</ul></Disclosure> : null}
      <p className="task-auto-help">Nora가 개발을 진행한 뒤 어떤 내용을 언제, 어떻게 임시로 구현했는지 자동으로 기록합니다. 고객 답변과 피드백은 이 기록에 연결해 보완할 수 있습니다.</p>
    </div>
  </CTDSModal>;
}

function ArtifactVerification({ artifact, settings }) {
  return <dl className="task-auto-facts" aria-label="개발 결과와 검증 상태">{automationArtifactStages(artifact, settings).map(stage => <div key={stage.label}><dt>{stage.label}</dt><dd><Badge tone={stage.tone}>{stage.stateLabel}</Badge></dd></div>)}</dl>;
}

export function TaskAutomationBoard({ projectId, request, role, notify, onDirty, onChanged, onSettings, onQuestions, onSourceRevision, initialTarget }) {
  const sharedView = useSharedView(), route = `${projectPath(projectId)}/task-automation`;
  const remote = useAutomationResource(route, request), drafts = useTaskDrafts(`${projectPath(projectId)}/task-drafts`, request);
  const [selectedId, setSelectedId] = useState(() => journeyTaskSelection(initialTarget).taskId), [selectedDraftId, setSelectedDraftId] = useState(() => journeyTaskSelection(initialTarget).draftId);
  const [noteTarget, setNoteTarget] = useState(() => journeyTaskSelection(initialTarget).noteId ? { id: initialTarget.id, nonce: crypto.randomUUID() } : null), [dirtyFields, setDirtyFields] = useState({});
  const [startBusy, setStartBusy] = useState(false), [startError, setStartError] = useState(null), [startConfirmation, setStartConfirmation] = useState(null), [draggedId, setDraggedId] = useState(null);
  const startSession = useRef(null), draggedTask = useRef(null), startMounted = useRef(true);
  const automationDirty = useCallback(value => setDirtyFields(current => ({ ...current, automation: value })), []);
  const notesDirty = useCallback(value => setDirtyFields(current => ({ ...current, notes: value })), []);
  useEffect(() => { onDirty?.(startBusy || Object.values(dirtyFields).some(Boolean)); }, [dirtyFields, startBusy, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => { startMounted.current = true; return () => { startMounted.current = false; const session = startSession.current; startSession.current = null; session?.controller.abort(); session?.resolve?.(false); }; }, [projectId]);
  function openNote(id) { setSelectedId(null); setSelectedDraftId(null); setNoteTarget({ id, nonce: crypto.randomUUID() }); }
  function createNote(seed) { setSelectedId(null); setSelectedDraftId(null); setNoteTarget({ create: seed, nonce: crypto.randomUUID() }); }
  const permissions = automationPermissions(role, sharedView), tasks = remote.data?.tasks || [], analyses = remote.data?.analyses || [];
  const draftItems = drafts.data?.items || [];
  async function changed(message) { notify?.(message); await remote.load(); await onChanged?.({ quiet: true }); }
  async function start(task, restoreDetail = false) {
    if (startSession.current || !automationCanStart(task, permissions, remote.data?.capabilities)) return;
    const session = { controller: new AbortController(), resolve: null };
    startSession.current = session; setStartBusy(true); setStartError(null); if (restoreDetail) setSelectedId(null);
    const current = () => startMounted.current && startSession.current === session;
    try {
      const outcome = await startAutomationTask({ request, taskPath: `${route}/tasks/${encodeURIComponent(task.id)}`, taskId: task.id, signal: session.controller.signal, isActive: current,
        confirm: check => new Promise(resolve => { if (!current()) { resolve(false); return; } session.resolve = resolve; setStartConfirmation({ task, check }); }),
      });
      if (current() && outcome.status === 'started') await changed('작업을 진행 중으로 옮기고 AI 개발을 요청했습니다. 임시 구현 이력은 개발 후 자동으로 기록합니다.');
    } catch (err) {
      if (current() && err.name !== 'AbortError') { setStartError(err); await remote.load(); }
    } finally {
      if (current()) { startSession.current = null; setStartBusy(false); setStartConfirmation(null); if (restoreDetail) setSelectedId(task.id); }
    }
  }
  function settleStart(accepted) {
    const resolve = startSession.current?.resolve;
    if (!resolve) return;
    startSession.current.resolve = null; setStartConfirmation(null); resolve(accepted);
  }
  function dropTask(event, status) {
    if (status !== 'in_progress' || !draggedTask.current) return;
    event.preventDefault();
    const id = draggedTask.current; draggedTask.current = null; setDraggedId(null);
    if (event.dataTransfer.getData('application/x-ains-automation-task') !== id) return;
    const task = tasks.find(item => item.id === id);
    if (task) void start(task);
  }
  return <section className="task-automation ains-section-stack" aria-label="Nora 정책 분석·개발 작업">
    <header className="task-auto-heading"><div><h2>정책 분석·AI 개발 작업</h2><p>할 일을 진행 중으로 옮기면 AI 개발을 시작합니다. 검토가 필요한 내용은 확인 후 임시로 구현하고 자동 기록합니다.</p></div><Button type="button" variant="secondary" icon={RefreshCw} disabled={startBusy} onClick={() => { void remote.load(); void drafts.load(); }}>새로고침</Button></header>
    <ErrorNotice error={startError} />
    {startBusy && !startConfirmation ? <Spinner label="개발 시작 요청을 확인하고 있습니다" /> : null}
    {remote.error ? <div aria-label="정책 분석·개발 작업 조회 오류"><p className="task-auto-help">정책 분석·개발 작업을 불러오지 못했습니다.</p><ErrorNotice error={remote.error} onRetry={remote.load} /></div> : null}
    {drafts.error ? <div aria-label="출처 기반 작업 초안 조회 오류"><p className="task-auto-help">출처 기반 작업 초안을 불러오지 못했습니다.{drafts.data ? ' 이미 표시한 작업은 유지했습니다.' : ''}</p><ErrorNotice error={drafts.error} onRetry={drafts.retry} /></div> : null}
    {!remote.data && remote.loading ? <Spinner label="정책 분석과 개발 작업을 불러오고 있습니다" /> : null}
    {!drafts.data && drafts.loading ? <Spinner label="출처 기반 작업 초안을 불러오고 있습니다" /> : null}
    {remote.data && !sharedView ? <CapabilityNotice capabilities={remote.data.capabilities} onSettings={onSettings} /> : null}
    <IntakeNotice items={remote.data?.intake} />
    {remote.data || drafts.data ? <>
      {/* No CTDS Kanban primitive exists; columns compose existing CTDS card buttons and badges. */}
      <div className="task-auto-board" role="region" aria-label="AI 개발 작업 칸반" tabIndex={0}>{AUTOMATION_COLUMNS.map(([status, label]) => {
        const column = tasks.filter(task => automationColumn(task) === status);
        const sourceDrafts = status === 'todo' ? draftItems : [], count = column.length + sourceDrafts.length;
        return <section className={`task-auto-column${status === 'in_progress' && draggedId ? ' task-auto-drop-target' : ''}`} key={status} aria-label={label} onDragOver={event => { if (status === 'in_progress' && draggedTask.current && !startBusy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => dropTask(event, status)}><header><h3>{label}</h3><Badge tone="quiet">{count}</Badge></header><div className="task-auto-cards">{sourceDrafts.map(item => <ControlButton type="button" variant="outline" layout="card" className="task-auto-card" key={`draft:${item.id}`} disabled={startBusy} onClick={() => setSelectedDraftId(item.id)}><span><Badge tone="amber">Nora 검증 전</Badge><strong>{item.title}</strong><small>{item.source_title} · 출처 기반 초안</small><small>{item.key}{item.depends_on?.length ? ` · 선행 작업 ${item.depends_on.length}개` : ''}</small></span></ControlButton>)}{column.map(task => {
          const startable = automationCanStart(task, permissions, remote.data?.capabilities);
          return <div className="task-auto-card-group" key={`automation:${task.id}`}><ControlButton type="button" variant="outline" layout="card" className="task-auto-card" disabled={startBusy} draggable={startable && !startBusy} onDragStart={event => { if (!startable || startBusy) { event.preventDefault(); return; } draggedTask.current = task.id; setDraggedId(task.id); event.dataTransfer.setData('application/x-ains-automation-task', task.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { draggedTask.current = null; setDraggedId(null); }} onClick={() => setSelectedId(task.id)}><span><strong>{task.title}</strong>{task.requires_provisional_confirmation ? <Badge tone="amber">검토 필요</Badge> : null}<small>{automationExecutionLabel(task)}</small><small>{status === 'qa' ? '코드·자동 이력 확인 · 검증 후 병합 승인' : status === 'done' ? '기준 브랜치 병합 확인됨' : `${dateTime(task.updated_at)} 갱신`}</small></span></ControlButton>{startable ? <Button type="button" variant="ghost" icon={ArrowRight} disabled={startBusy} aria-label={`${task.title} · 진행 중으로 이동하고 AI 개발 시작`} onClick={() => void start(task)}>진행 중으로 이동</Button> : null}</div>;
        })}</div>{status === 'in_progress' && draggedId ? <p className="task-auto-help">여기에 놓으면 개발 시작을 확인합니다.</p> : !count ? <p className="task-auto-help">작업 없음</p> : null}</section>;
      })}</div>
      {drafts.data?.total ? <div className="inline-actions"><p className="task-auto-help">출처 기반 작업 초안 {draftItems.length} / {drafts.data.total}개 표시</p>{drafts.data.has_more ? <Button type="button" variant="secondary" busy={drafts.loading} onClick={() => drafts.load(true)}>작업 초안 더 불러오기</Button> : null}</div> : null}
      {drafts.data && !drafts.data.has_more && draftItems.length < drafts.data.total ? <Notice title="조회 중 작업 목록이 바뀌었습니다">전체 작업을 확인하려면 목록을 다시 불러와 주세요.<Button type="button" variant="secondary" busy={drafts.loading} onClick={() => drafts.load()}>작업 초안 목록 새로고침</Button></Notice> : null}
      {!tasks.length && !draftItems.length ? <p className="task-auto-help">자료·기록에 정책 문서를 등록하고 Nora 리스크 분석을 요청하세요. 실행 가능한 범위를 작업으로 등록하고, 확인할 내용이 있으면 검토 필요로 표시합니다.</p> : null}
    </> : null}
    {remote.data ? <Disclosure><summary>정책 분석·고객 질문 이력 · {analyses.length}건</summary><div className="task-auto-analysis-list">{analyses.length ? analyses.map(analysis => <RiskAnalysis key={analysis.id} analysis={analysis} taskCount={tasks.filter(task => task.analysis_id === analysis.id).length} onQuestions={onQuestions} />) : <p className="task-auto-help">아직 정책 분석 이력이 없습니다.</p>}</div></Disclosure> : null}
    <ImplementationNotesPanel projectId={projectId} request={request} role={role} notify={notify} onDirty={notesDirty} onChanged={async options => { await remote.load(); await onChanged?.(options); }} onSourceRevision={onSourceRevision} target={noteTarget} analyses={analyses} onRefreshAnalysis={remote.load} refreshKey={[...tasks, ...analyses].map(item => `${item.id}:${item.updated_at}:${item.status}`).join('|')} />
    {selectedId ? <AutomationTaskDetail key={selectedId} id={selectedId} projectId={projectId} route={route} request={request} permissions={permissions} sharedView={sharedView} settings={remote.data?.settings} capabilities={remote.data?.capabilities} onClose={() => setSelectedId(null)} onDirty={automationDirty} onChanged={changed} onOpenNote={openNote} onStart={task => void start(task, true)} startError={startError} /> : null}
    {selectedDraftId ? <SourceTaskDraftDetail key={selectedDraftId} id={selectedDraftId} projectId={projectId} route={`${projectPath(projectId)}/task-drafts`} request={request} onClose={() => setSelectedDraftId(null)} onDependency={setSelectedDraftId} onSourceRevision={onSourceRevision} onSettings={!sharedView && remote.data?.capabilities?.risk_analysis !== true ? onSettings : undefined} onOpenNote={openNote} onCreateNote={permissions.canWrite ? createNote : undefined} /> : null}
    {startConfirmation ? <ProvisionalStartConfirmation {...startConfirmation} onCancel={() => settleStart(false)} onConfirm={() => settleStart(true)} /> : null}
  </section>;
}

function SourceTaskDraftDetail({ id, projectId, route, request, onClose, onDependency, onSourceRevision, onSettings, onOpenNote, onCreateNote }) {
  const remote = useAutomationResource(`${route}/${encodeURIComponent(id)}`, request, () => false), item = remote.data?.item;
  const sourceUrl = taskDraftSourceUrl(item?.source_url);
  return <Modal title={item?.title || '검토 전 작업 초안'} eyebrow="검토 전 작업 초안" onClose={onClose} wide><div className="modal-body task-auto-detail"><ErrorNotice error={remote.error} onRetry={remote.load} />{!item ? remote.loading ? <Spinner label="작업 초안의 근거와 완료 기준을 불러오고 있습니다" /> : null : <>
    <div className="inline-actions"><Badge tone="quiet">할 일</Badge><Badge tone="amber">Nora 검증 전</Badge><span>{item.key} · 우선순위 {{ high: '높음', normal: '보통', low: '낮음' }[item.priority] || '보통'}</span></div>
    <Notice tone="warning" title="다음 단계: 원문 검토와 Nora 리스크 분석"><p>정책 원문을 바탕으로 등록한 초안입니다. 원문을 검토하고 Nora 리스크 분석을 요청한 뒤, 분석 결과에서 실행할 작업을 확인하세요. 이 초안에서 AI 개발이나 병합을 직접 실행하지는 않습니다.</p><div className="inline-actions">{onSourceRevision ? <Button type="button" variant="secondary" onClick={() => onSourceRevision(item.source_revision_id)}>정책 원문·Nora 리스크 분석 열기</Button> : null}{onSettings ? <Button type="button" variant="secondary" onClick={onSettings}>Nora 연결 설정</Button> : null}</div></Notice>
    <p>{item.description}</p>
    <section><h3>완료 기준</h3><ul>{item.acceptance_criteria?.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></section>
    <section><h3>출처</h3><dl className="task-auto-facts"><div><dt>문서</dt><dd>{onSourceRevision ? <Button type="button" variant="ghost" onClick={() => onSourceRevision(item.source_revision_id)}>{item.source_title}</Button> : item.source_title}</dd></div><div><dt>등록한 원문 버전</dt><dd><code>{item.source_revision_id}</code></dd></div><div><dt>등록 시각</dt><dd>{dateTime(item.created_at)}</dd></div></dl>{sourceUrl ? <Button type="button" asChild variant="secondary"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">외부 출처 열기<ExternalLink size={15} /></a></Button> : null}</section>
    {item.evidence?.length ? <Disclosure open><summary>원문 근거 · {item.evidence.length}개</summary>{item.evidence.map((evidence, index) => <blockquote key={index}><small>{evidence.locator?.label || evidence.segment_id}</small><p>{evidence.quote}</p></blockquote>)}</Disclosure> : null}
    <section><h3>선행 작업</h3>{item.dependencies?.length ? <ul>{item.dependencies.map(dependency => <li key={dependency.id}><Button type="button" variant="ghost" onClick={() => onDependency(dependency.id)}>{dependency.key} · {dependency.title}</Button></li>)}</ul> : <p className="task-auto-help">등록된 선행 작업이 없습니다.</p>}</section>
    {item.question_notes?.length ? <section><h3>확인할 질문·메모</h3><ul>{item.question_notes.map((note, index) => <li key={index}>{note}</li>)}</ul></section> : null}
    <RelatedImplementationNotes projectId={projectId} request={request} draftId={id} onOpen={onOpenNote} />
    {onCreateNote ? <Button type="button" variant="secondary" onClick={() => onCreateNote({ source_revision_id: item.source_revision_id, task_draft_id: item.id, evidence: item.evidence })}>추가 기록 직접 남기기</Button> : null}
  </>}</div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>닫기</Button></footer></Modal>;
}

function AutomationTaskDetail({ id, projectId, route, request, permissions, sharedView, settings, capabilities, onClose, onDirty, onChanged, onOpenNote, onStart, startError }) {
  const remote = useAutomationResource(`${route}/tasks/${encodeURIComponent(id)}`, request, data => ['queued', 'running', 'merging'].includes(data.task?.execution_status));
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [note, setNote] = useState(''), [previewAck, setPreviewAck] = useState(false), [diffAck, setDiffAck] = useState(false);
  const [reviewedHead, setReviewedHead] = useState(null), [reconciling, setReconciling] = useState(false), confirm = useConfirm();
  const task = remote.data?.task, artifact = task?.artifact, preview = automationPreviewUrl(artifact?.preview_url, settings?.preview_origins), refreshPending = useRef(false);
  const dirty = Boolean(note || previewAck || diffAck || busy);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { setReviewedHead(artifact?.head_sha || null); setPreviewAck(false); setDiffAck(false); setNote(''); }, [artifact?.head_sha, artifact?.diff, artifact?.preview_url, artifact?.target_branch, artifact?.base_sha]);
  useEffect(() => { if (!reconciling) return; const timer = setInterval(() => { if (!document.hidden) void remote.load(); }, 5000); const timeout = setTimeout(() => setReconciling(false), 60000); return () => { clearInterval(timer); clearTimeout(timeout); }; }, [reconciling, remote.load]);
  useEffect(() => { if (task?.execution_status !== 'uncertain') setReconciling(false); }, [task?.execution_status]);
  async function close() { if (!busy && (!dirty || await confirm('작성 중인 작업 검토 내용을 버리고 닫을까요?'))) onClose(); }
  async function openRelatedNote(noteId) { if (!busy && (!dirty || await confirm('작성 중인 작업 검토 내용을 버리고 기록을 열까요?'))) onOpenNote(noteId); }
  async function beginDevelopment() { if (!busy && automationCanStart(task, permissions, capabilities) && (!dirty || await confirm('작성 중인 작업 검토 내용을 버리고 개발을 시작할까요?'))) onStart(task); }
  async function refreshArtifact() {
    if (busy || refreshPending.current || sharedView || !automationCanRefreshArtifact(task, permissions)) return;
    refreshPending.current = true; setBusy(true); setError(null);
    try {
      const result = await refreshAutomationArtifact({ request, taskPath: `${route}/tasks/${encodeURIComponent(id)}`, task, permissions });
      if (!remote.lifecycle.current.active) return;
      if (result.task) remote.setData(result);
      setPreviewAck(false); setDiffAck(false);
      await remote.load(); await onChanged('개발 결과의 PR·CI·웹 미리보기 상태를 갱신했습니다.');
    } catch (err) { if (remote.lifecycle.current.active) { setError(err); await remote.load(); } }
    finally { refreshPending.current = false; if (remote.lifecycle.current.active) setBusy(false); }
  }
  async function mutate(suffix, body, method) {
    if (busy || sharedView) return; setBusy(true); setError(null);
    try { const result = await request(`${route}/tasks/${encodeURIComponent(id)}${suffix}`, { method, body }); if (!remote.lifecycle.current.active) return; if (result.task) remote.setData(result); setNote(''); setPreviewAck(false); setDiffAck(false); if (suffix === '/reconcile-merge') setReconciling(true); await remote.load(); await onChanged(suffix === '/reconcile-merge' ? '기존 병합 요청의 결과 확인을 요청했습니다.' : suffix ? '검토한 변경의 병합을 요청했습니다. 병합 결과를 확인하고 있습니다.' : '작업을 진행 중으로 옮기고 AI 개발을 요청했습니다.'); }
    catch (err) { if (remote.lifecycle.current.active) { setError(err); await remote.load(); } }
    finally { if (remote.lifecycle.current.active) setBusy(false); }
  }
  const merge = automationMergeReadiness(task, capabilities, settings), reportedChecks = automationReportedChecks(artifact, sharedView);
  return <Modal title={task?.title || 'AI 개발 작업'} eyebrow="정책 분석에서 생성한 작업" busy={busy} onClose={close} wide><div className="modal-body task-auto-detail"><ErrorNotice error={remote.error} onRetry={remote.load} /><ErrorNotice error={error || startError} />{!task ? remote.loading ? <Spinner /> : null : <>
    <div className="inline-actions"><Badge tone={AUTOMATION_COLUMNS.find(([status]) => status === task.status)?.[2]}>{AUTOMATION_COLUMNS.find(([status]) => status === task.status)?.[1] || '확인 필요'}</Badge>{task.requires_provisional_confirmation ? <Badge tone="amber">검토 필요</Badge> : null}<span>{automationExecutionLabel(task)}</span></div>
    <p>{task.description}</p><section><h3>완료 기준</h3><ul>{task.acceptance_criteria?.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></section>
    {task.evidence?.length ? <Disclosure><summary>정책 원문 근거 · {task.evidence.length}개</summary>{task.evidence.map((evidence, index) => <blockquote key={index}><small>{evidence.segment_id}</small><p>{evidence.quote}</p></blockquote>)}</Disclosure> : null}
    {task.error_code ? <Notice tone="warning" title="작업 준비 상태를 확인해 주세요">{automationBlockerLabel(task.error_code)}</Notice> : null}
    {task.status === 'todo' && permissions.canWrite ? <><Button type="button" icon={ArrowRight} busy={busy} disabled={!automationCanStart(task, permissions, capabilities)} onClick={beginDevelopment}>진행 중으로 이동 · AI 개발 시작</Button>{capabilities?.development !== true ? <CapabilityNotice capabilities={capabilities} /> : null}</> : null}
    {task.status === 'in_progress' && ['queued', 'running'].includes(task.execution_status) ? <Notice title="AI 개발 결과를 기다리고 있습니다">코드 변경안과 임시 구현 이력이 준비되면 먼저 검토할 수 있습니다. CI·웹 미리보기와 병합 여부는 별도로 확인합니다.</Notice> : null}
    {automationHasCodeArtifact(artifact) ? <section className="ains-section-stack"><h3>개발 결과 검토</h3><ArtifactVerification artifact={artifact} settings={settings} />
      {!sharedView && automationPrUrl(artifact) ? <Button type="button" asChild variant="secondary"><a href={automationPrUrl(artifact)} target="_blank" rel="noopener noreferrer">PR #{artifact.pr_number} 열기<ExternalLink size={15} /></a></Button> : null}
      {artifact.evidence_status === 'unverified' ? <Notice tone="warning" title="코드 변경 근거를 확인해야 합니다">AI가 전달한 변경안입니다. 실제 파일·커밋과 일치하는지 확인되기 전에는 검증된 개발 결과로 처리하거나 병합할 수 없습니다.</Notice> : null}
      <dl className="task-auto-facts"><div><dt>병합 대상 브랜치</dt><dd>{artifact.target_branch || '확인 필요'}</dd></div><div><dt>변경 커밋</dt><dd><code>{artifact.head_sha || '아직 확인되지 않음'}</code></dd></div><div><dt>기준 커밋</dt><dd><code>{artifact.base_sha || '확인 필요'}</code></dd></div></dl>
      {!sharedView ? <Disclosure open><summary>{artifact.evidence_status === 'unverified' ? 'AI가 전달한 코드 변경안' : '코드 변경 내역'}</summary>{artifact.diff ? <pre className="task-auto-diff">{artifact.diff}</pre> : <p>코드 변경 내역이 아직 없습니다.</p>}</Disclosure> : <p className="task-auto-help">공유 화면에서는 코드 변경 내역과 외부 미리보기를 표시하지 않습니다.</p>}
      <section><h4>CI·웹 미리보기</h4>{artifact.checks?.length ? <ul className="ains-prose-list">{artifact.checks.map((check, index) => <li key={index}>{check.name} · {{ passed: '통과', failed: '실패', pending: '확인 중', unavailable: '미연결' }[check.status] || '확인 필요'}</li>)}</ul> : <p>검증 결과가 아직 없습니다.</p>}
        {!sharedView && preview ? <Button type="button" asChild variant="secondary"><a href={preview} target="_blank" rel="noopener noreferrer">웹 미리보기 열기<ExternalLink size={15} /></a></Button> : !sharedView ? <p className="task-auto-help">웹 미리보기가 준비되면 여기에서 열 수 있습니다. 코드 변경안과 자동 기록은 먼저 확인할 수 있습니다.</p> : null}
      </section>
      {automationCanRefreshArtifact(task, permissions) ? <div><Button type="button" variant="secondary" icon={RefreshCw} busy={busy} onClick={refreshArtifact}>PR·CI·미리보기 상태 갱신</Button><p className="task-auto-help">기존 개발 결과의 상태를 다시 조회합니다. AI 개발을 다시 실행하지 않습니다.</p></div> : null}
    </section> : null}
    {reportedChecks.length ? <Disclosure><summary>AI가 보고한 실행 내역 · 독립 검증 전 · {reportedChecks.length}건</summary><p className="task-auto-help">AI가 보고한 명령과 출력입니다. 저장소의 CI 검증 결과와 별도로 보관하며, 병합 승인 조건에 포함하지 않습니다.</p><div className="ains-section-stack">{reportedChecks.map((check, index) => <article key={index}><p className="task-auto-help">실행 보고 {index + 1} · 보고한 종료 코드: {check.exitCodeLabel}</p><pre className="task-auto-diff"><code>{check.command}</code></pre>{check.output ? <pre className="task-auto-diff">{check.output}</pre> : <p className="task-auto-help">보고된 출력이 없습니다.</p>}</article>)}</div></Disclosure> : null}
    {artifact?.implementation_report ? <section><h3>구현 범위와 남은 작업</h3><Notice tone={artifact.implementation_report.completion === 'complete' ? 'neutral' : 'warning'} title={{ complete: '개발 결과 보고: 완료', partial: '개발 결과 보고: 부분 구현', blocked: '개발 결과 보고: 차단됨' }[artifact.implementation_report.completion] || '개발 결과 보고 확인 필요'}>개발 결과의 보고 상태입니다. 코드·미리보기·남은 공백을 사람이 확인한 뒤 병합을 결정합니다.</Notice>{artifact.implementation_report.remaining_criteria?.length ? <ul>{artifact.implementation_report.remaining_criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul> : null}</section> : null}
    <RelatedImplementationNotes key={task.updated_at} projectId={projectId} request={request} taskId={id} onOpen={openRelatedNote} />
    {task.status === 'qa' ? <p className="task-auto-help">검수 대기는 모든 요구사항의 구현 완료를 뜻하지 않습니다. 위 임시 구현·작업 공백과 실제 코드 변경을 함께 검토하세요.</p> : null}
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
  return <section className="task-auto-policy"><h3>정책 리스크·개발 작업</h3><p className="task-auto-help">확인할 내용은 고객 질문으로 남기고, 실행 가능한 작업을 등록합니다. 검토가 필요한 작업은 개발 시작 때 임시 구현 여부를 확인합니다.</p><ErrorNotice error={remote.error || error} onRetry={remote.load} />
    {remote.data ? <><CapabilityNotice capabilities={remote.data.capabilities} /><IntakeNotice items={remote.data.intake?.filter(item => item.revision_id === revisionId)} />{!sourceReady ? <p className="task-auto-help">문서 추출과 원문에서 확인이 필요한 구간을 먼저 검토해 주세요.</p> : null}<div className="inline-actions">{canWrite && !sharedView ? <Button type="button" variant="secondary" icon={Sparkles} busy={busy} disabled={active || !sourceReady || !remote.data.capabilities?.risk_analysis} onClick={analyze}>{pending.current ? '같은 리스크 분석 요청 확인' : 'Nora 리스크 분석'}</Button> : null}{onWorkItems ? <Button type="button" variant="secondary" onClick={onWorkItems}>분석·개발 작업 보기</Button> : null}</div>{analyses.slice(0, 1).map(analysis => <RiskAnalysis key={analysis.id} analysis={analysis} taskCount={remote.data.tasks?.filter(task => task.analysis_id === analysis.id).length || 0} onQuestions={onQuestions} />)}</> : remote.loading ? <Spinner label="정책 리스크 분석 상태를 확인하고 있습니다" /> : null}
  </section>;
}

function SdkExecutionSettings({ route, request, draft, setDraft, owner, disabled, onBusy }) {
  const remote = useAutomationResource(owner ? `${route}/sdk-connections` : null, request, () => false);
  const [requesting, setRequesting] = useState(false), [requestError, setRequestError] = useState(null), [requestNotice, setRequestNotice] = useState(null), pending = useRef(false);
  const connections = automationSdkConnections(remote.data, draft.sdk_provider), selected = automationSdkSelectedConnection(connections, draft);
  const selectedKey = selected ? automationSdkConnectionKey(selected) : '', unavailableKey = draft.sdk_working_folder ? 'saved-disconnected' : '';
  useEffect(() => { onBusy?.(requesting); return () => onBusy?.(false); }, [requesting, onBusy]);
  async function connect() {
    if (!owner || disabled || pending.current) return;
    let body; try { body = automationSdkConnectionRequest(draft); } catch (err) { setRequestError(err); return; }
    pending.current = true; setRequesting(true); setRequestError(null); setRequestNotice(null);
    try {
      await request(`${route}/sdk-connections`, { method: 'POST', body });
      if (!remote.lifecycle.current.active) return;
      setRequestNotice('SDK 연결을 요청했습니다. Nora 데스크톱에서 실행 도구와 작업 폴더를 확인하고 승인한 뒤 연결 목록을 새로고침하세요.');
      await remote.load();
    } catch (err) {
      if (remote.lifecycle.current.active) { setRequestError(err); setRequestNotice('연결 요청 결과를 확인하지 못했습니다. 다시 요청하기 전에 Nora 데스크톱과 연결 목록에서 접수 여부를 확인하세요.'); await remote.load(); }
    } finally { pending.current = false; if (remote.lifecycle.current.active) setRequesting(false); }
  }
  return <section className="ains-section-stack" aria-label="Nora SDK 실행 연결">
    <FormField label="개발 실행 도구"><Select value={draft.sdk_provider} disabled={disabled || requesting} onChange={event => { setRequestNotice(null); setDraft(current => ({ ...current, sdk_provider: event.target.value, sdk_connection_id: '', sdk_working_folder: '' })); }}><option value="">선택</option><option value="codex">Codex</option><option value="claude-code">Claude Code</option></Select></FormField>
    <FormField label="Nora에 연결된 실행 환경"><Select value={selectedKey || unavailableKey} disabled={disabled || requesting || remote.loading} onChange={event => { const connection = connections.find(item => automationSdkConnectionKey(item) === event.target.value); if (connection) setDraft(current => ({ ...current, sdk_connection_id: connection.id || '', sdk_working_folder: connection.workingFolder })); }}><option value="">연결 선택</option>{unavailableKey && !selected ? <option value={unavailableKey} disabled>현재 작업 폴더 · 연결 확인 필요</option> : null}{connections.map(connection => <option key={automationSdkConnectionKey(connection)} value={automationSdkConnectionKey(connection)}>{connection.provider} · {connection.workingFolder}{connection.busy ? ' · 실행 중' : ''}</option>)}</Select></FormField>
    <FormField label="저장소 작업 폴더" hint="Nora 데스크톱에서 이 프로젝트의 저장소를 읽고 작업할 절대 경로입니다. 연결된 폴더를 선택하거나 새 연결을 요청하세요."><Input value={draft.sdk_working_folder} disabled={disabled || requesting} maxLength={2000} onChange={event => { setRequestNotice(null); setDraft(current => ({ ...current, sdk_connection_id: '', sdk_working_folder: event.target.value })); }} placeholder="/Users/사용자/프로젝트" /></FormField>
    {owner ? <><ErrorNotice error={remote.error || requestError} onRetry={remote.load} />{requestNotice ? <Notice title="Nora 데스크톱에서 연결 확인">{requestNotice}</Notice> : null}{remote.loading ? <Spinner label="Nora SDK 실행 연결을 확인하고 있습니다" /> : remote.data ? selected ? <Notice title={selected.busy ? 'SDK 실행 환경 사용 중' : 'SDK 실행 환경 연결됨'}>{selected.busy ? '다른 실행이 끝난 뒤 개발을 시작할 수 있습니다.' : '개발 시작 전에 프로젝트 저장소·브랜치·작업 폴더를 다시 확인합니다.'}</Notice> : <Notice tone="warning" title="Nora SDK 실행 환경을 연결해 주세요">아래에서 연결을 요청한 뒤 Nora 데스크톱에서 승인하세요. 실제 연결이 확인되어야 AI 개발을 시작할 수 있습니다.</Notice> : null}<div className="inline-actions"><Button type="button" variant="secondary" busy={requesting} disabled={disabled || Boolean(selected)} onClick={connect}>Nora SDK 연결 요청</Button><Button type="button" variant="secondary" icon={RefreshCw} busy={remote.loading} disabled={disabled || requesting} onClick={remote.load}>SDK 연결 새로고침</Button></div></> : <p className="task-auto-help">프로젝트 관리자만 SDK 실행 연결을 변경할 수 있습니다.</p>}
  </section>;
}

export function TaskAutomationSettings({ project, request, notify, onDirty, disabled }) {
  const route = `${projectPath(project.id)}/task-automation`, remote = useAutomationResource(route, request, () => false);
  const flowRemote = useAutomationResource(`${projectPath(project.id)}/nora-workspace/flows`, request, () => false), flows = flowRemote.data?.flows?.filter(flow => flow.published === true);
  const [draft, setDraft] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [sdkBusy, setSdkBusy] = useState(false);
  const sharedView = useSharedView(), owner = !sharedView && project.role === 'owner', settings = remote.data?.settings;
  useEffect(() => { if (settings) setDraft(automationSettingsDraft(settings)); }, [settings]);
  const initial = settings ? automationSettingsDraft(settings) : null;
  const dirty = Boolean(draft && initial && Object.keys(initial).some(key => draft[key] !== initial[key]));
  useEffect(() => { onDirty?.(dirty || busy || sdkBusy); return () => onDirty?.(false); }, [dirty, busy, sdkBusy, onDirty]);
  async function save(event) {
    event.preventDefault(); if (!owner || disabled || busy || sdkBusy) return;
    let body; try { body = automationSettingsPayload(draft, settings.version); } catch (err) { setError(err); return; }
    setBusy(true); setError(null);
    try { await request(`${route}/settings`, { method: 'PUT', body }); if (remote.lifecycle.current.active) { await remote.load(); notify?.('정책 분석·AI 개발 연결을 저장했습니다.'); } }
    catch (err) { if (remote.lifecycle.current.active) setError(err); }
    finally { if (remote.lifecycle.current.active) setBusy(false); }
  }
  const field = key => ({ value: draft[key], disabled: !owner || disabled || busy || sdkBusy, onChange: event => setDraft(current => ({ ...current, [key]: event.target.value })) });
  return <section className="repository-check" aria-label="정책 분석·AI 개발 연결"><div className="settings-context-heading"><Sparkles size={19} /><h3>정책 분석·AI 개발</h3></div><ErrorNotice error={remote.error} onRetry={remote.load} />{!draft ? remote.loading ? <Spinner /> : null : <>
    <CapabilityNotice capabilities={remote.data.capabilities} /><form className="ains-section-stack" onSubmit={save}><label className="checkbox-label"><Input type="checkbox" checked={draft.enabled} disabled={!owner || disabled || busy || sdkBusy} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} /><span>정책 분석·AI 개발 활성화</span></label>
      <Notice title="임시 구현은 작업을 시작할 때 확인합니다">고객 질문이나 확인할 내용이 남은 작업을 진행 중으로 옮기면 확인창을 표시합니다. 확인하면 AI가 개발을 시작하고, 임시로 구현한 내용과 남은 작업 공백을 자동으로 기록합니다.</Notice>
      <FormField label="AI 개발 실행 방식"><Select value={draft.execution_mode} disabled={!owner || disabled || busy || sdkBusy} onChange={event => setDraft(current => ({ ...current, execution_mode: event.target.value, sdk_provider: event.target.value === 'nora_sdk' ? current.sdk_provider || 'codex' : current.sdk_provider }))}><option value="connector_api">GitHub 커넥터를 통한 개발</option><option value="nora_sdk">Nora SDK · Codex / Claude Code</option></Select></FormField>
      {draft.execution_mode === 'nora_sdk' ? <SdkExecutionSettings route={route} request={request} draft={draft} setDraft={setDraft} owner={owner} disabled={!owner || disabled || busy} onBusy={setSdkBusy} /> : null}
      <ErrorNotice error={flowRemote.error} onRetry={flowRemote.load} />{[['risk_flow_slug', '정책 리스크 분석 흐름', '기본 Nora 리스크 분석 흐름 · 자동 준비'], ['development_flow_slug', 'AI 개발 흐름', '연결 필요']].map(([key, label, empty]) => <FormField label={label} key={key}><Select {...field(key)}><option value="">{empty}</option>{draft[key] && !flows?.some(flow => flow.slug === draft[key]) ? <option value={draft[key]} disabled>{draft[key]} · 현재 설정</option> : null}{flows?.map(flow => <option key={flow.slug} value={flow.slug}>{flow.name || flow.slug}</option>)}</Select></FormField>)}
      <FormField label="웹 미리보기 허용 주소" hint="예: https://preview.example.com — 경로 없이 한 줄에 한 도메인, 최대 10개. 미리보기 연결 전에도 코드 변경안과 자동 기록을 확인할 수 있습니다."><Textarea {...field('preview_origins')} rows={3} maxLength={4000} /></FormField>
      <p>CI·웹 미리보기 상태는 개발 결과와 별도로 확인합니다. 실제 PR·검증·미리보기가 준비되면 사람이 검토한 뒤 기준 브랜치 병합을 승인합니다.</p><ErrorNotice error={error} />{owner ? <Button type="submit" variant="secondary" busy={busy} disabled={disabled || sdkBusy || !dirty}>분석·개발 연결 저장</Button> : <p>프로젝트 관리자만 연결을 변경할 수 있습니다.</p>}
    </form></>}
  </section>;
}
