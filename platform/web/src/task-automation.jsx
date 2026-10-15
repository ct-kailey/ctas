import { List, ListItem } from './ctds-lists.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, GitMerge, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Button, ControlButton, Disclosure, Empty, ErrorNotice, FormField, Input, Modal, Notice, Select, Spinner, Textarea, dateTime, projectPath } from './ui.jsx';
import { useSharedView } from './shared-view.jsx';
import { useConfirm } from './confirmation.jsx';
import { Modal as CTDSModal } from './components/ctds/Modal/Modal';
import { AUTOMATION_COLUMNS, RISK_STATES, automationActive, automationArtifactStages, automationBlockerLabel, automationCanRefreshArtifact, automationCanRequestStart, automationCanStart, automationExecutionLabel, automationHasCodeArtifact, automationMergeReadiness, automationPermissions, automationPreviewUrl, automationPrUrl, automationReportedChecks, automationSdkConnectionKey, automationSdkConnectionRequest, automationSdkConnections, automationSdkSelectedConnection, automationSettingsDraft, automationSettingsPayload, refreshAutomationArtifact, startAutomationTask } from './task-automation-state.mjs';
import { retainProjectRequest } from './nora-workspace-state.mjs';
import { mergeTaskDraftPage, taskDraftSourceUrl } from './task-draft-state.mjs';
import { ImplementationNotesPanel, RelatedImplementationNotes } from './implementation-notes.jsx';
import { journeyTaskSelection } from './project-journey-navigation.mjs';
import './task-automation.css';
import { TaskAreasPanel } from './task-areas.jsx';
import { TaskAutomationKanban } from './task-automation-kanban.jsx';
import { draftPolicyResultKey, draftPolicyResults, draftPolicySourceState, policyAnalysisRetryPayload } from './draft-policy-preparation-state.mjs';
import { QUESTION_LANGUAGES } from './question-language-state.mjs';

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
  const blockers = [...new Set((capabilities?.blockers || []).map(automationBlockerLabel))];
  if (!blockers.length) return null;
  return <Notice tone="warning" title="AI 개발 연결이 필요합니다" actions={onSettings ? <Button type="button" variant="secondary" onClick={onSettings}>연결 설정</Button> : null}><div className="ains-section-stack"><p>{blockers[0]}</p>{blockers.length > 1 ? <Disclosure><summary>추가 확인 사항 · {blockers.length - 1}개</summary><List>{blockers.slice(1).map(value => <ListItem key={value}><ListItem.Description>{value}</ListItem.Description></ListItem>)}</List></Disclosure> : null}</div></Notice>;
}

function IntakeNotice({ items = [] }) {
  const pending = items.filter(item => item.status !== 'submitted');
  if (!pending.length) return null;
  return <Disclosure><summary>정책 자동 분석 접수 · {pending.length}건</summary><List>{pending.map(item => <ListItem key={item.revision_id}><ListItem.Description>{item.status === 'pending' ? '추출한 정책을 분석 요청으로 등록하는 중입니다.' : item.error_code ? automationBlockerLabel(item.error_code) : item.status === 'awaiting_connection' ? '연결 준비 후 자동 분석을 요청합니다.' : '자동 분석 접수를 확인해 주세요.'}</ListItem.Description><ListItem.Meta><time dateTime={item.created_at}>{dateTime(item.created_at)}</time></ListItem.Meta></ListItem>)}</List></Disclosure>;
}

function RiskAnalysis({ analysis, taskCount, onQuestions }) {
  const risks = analysis.risks || [];
  return <ListItem trailing={<Badge tone={analysis.status === 'blocked' ? 'amber' : analysis.status === 'completed' ? 'green' : 'quiet'}>{RISK_STATES[analysis.status] || '상태 확인 필요'}</Badge>}><ListItem.Title>{analysis.title || analysis.document_title || '정책 문서 분석'}</ListItem.Title><ListItem.Meta><time dateTime={analysis.created_at}>{dateTime(analysis.created_at)}</time></ListItem.Meta>
    {analysis.summary ? <ListItem.Description>{analysis.summary}</ListItem.Description> : null}
    {analysis.temporary_decisions?.length || analysis.work_gaps?.length ? <p className="task-auto-help">확인할 구현 내용 {analysis.temporary_decisions?.length || 0}개 · 예상 작업 공백 {analysis.work_gaps?.length || 0}개. 실제 임시 구현 이력은 AI 개발 후 자동으로 기록합니다.</p> : null}
    {analysis.feedback?.note_id ? <p className="task-auto-help">사람의 피드백에 따른 보완 분석입니다. 기존 작업 상태는 보존됩니다.</p> : null}
    {risks.length ? <List aria-label="확인할 위험">{risks.map((risk, index) => <ListItem key={risk.id || index} trailing={risk.blocking || risk.severity === 'blocking' ? <Badge tone="amber">고객 확인 필요</Badge> : null}><ListItem.Title>{risk.title || risk.question || '확인할 위험'}</ListItem.Title>{risk.description || risk.reason || risk.message ? <ListItem.Description>{risk.description || risk.reason || risk.message}</ListItem.Description> : null}</ListItem>)}</List> : analysis.status === 'completed' ? <p className="task-auto-help">차단 위험 없이 분석을 마쳤습니다. 연결된 작업 {taskCount}개를 확인하세요.</p> : null}
    {analysis.question_ids?.length ? <><p className="task-auto-help">고객에게 확인할 질문 초안 {analysis.question_ids.length}개가 등록되었습니다. 내용을 검토해 전달하세요.</p>{analysis.customer_question_language && QUESTION_LANGUAGES[analysis.customer_question_language] ? <Badge tone="quiet">{QUESTION_LANGUAGES[analysis.customer_question_language]}</Badge> : null}{onQuestions ? <Button type="button" variant="secondary" onClick={onQuestions}>고객 질문 확인</Button> : null}</> : null}
    {analysis.error_code ? <Disclosure><summary>분석 준비·오류 정보</summary><p>{automationBlockerLabel(analysis.error_code)}</p></Disclosure> : null}
  </ListItem>;
}

function ProvisionalStartConfirmation({ task, check, onConfirm, onCancel }) {
  const questions = check.questions || [];
  return <CTDSModal open title="임시 구현 확인" description={questions.length ? '고객 검토가 필요한 질문이 남아있습니다. 임의로 임시 구현을 진행하고 히스토리를 남길까요?' : '확인이 필요한 내용이 남아있습니다. 임의로 임시 구현을 진행하고 히스토리를 남길까요?'} onOpenChange={open => { if (!open) onCancel(); }} dismissLabel="취소" data-ctds="modal" footer={<><Button type="button" variant="secondary" onClick={onCancel}>취소</Button><Button type="button" onClick={onConfirm}>확인 · AI 개발 시작</Button></>}>
    <div className="task-auto-start-review"><strong>{task.title}</strong>
      {questions.length ? <section><h3>확인할 질문 · {questions.length}개</h3><List>{questions.map(question => <ListItem key={question.id}><ListItem.Title>{question.title || '고객 확인 사항'}</ListItem.Title><ListItem.Description>{question.question}</ListItem.Description>{question.answer ? <p className="task-auto-help">전달받은 답변: {question.answer}</p> : null}</ListItem>)}</List></section> : null}
      {check.temporary_decisions.length || check.work_gaps.length ? <Disclosure><summary>기존 임시 구현 제안·작업 공백 · {check.temporary_decisions.length + check.work_gaps.length}개</summary><List>{[...check.temporary_decisions, ...check.work_gaps].map((item, index) => <ListItem key={item.id || index}><ListItem.Title>{item.title || '확인할 내용'}</ListItem.Title>{item.uncertainty ? <ListItem.Description>{item.uncertainty}</ListItem.Description> : null}</ListItem>)}</List></Disclosure> : null}
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
  const areas = useAutomationResource(`${route}/areas`, request, () => false);
  const [selectedId, setSelectedId] = useState(() => journeyTaskSelection(initialTarget).taskId), [selectedDraftId, setSelectedDraftId] = useState(() => journeyTaskSelection(initialTarget).draftId);
  const [noteTarget, setNoteTarget] = useState(() => journeyTaskSelection(initialTarget).noteId ? { id: initialTarget.id, nonce: crypto.randomUUID() } : null), [dirtyFields, setDirtyFields] = useState({});
  const [notesOpen, setNotesOpen] = useState(() => Boolean(journeyTaskSelection(initialTarget).noteId));
  const [notesError, setNotesError] = useState(null);
  const notesErrorChanged = useCallback(error => { setNotesError(error); if (error) setNotesOpen(true); }, []);
  const [startBusy, setStartBusy] = useState(false), [startError, setStartError] = useState(null), [startConfirmation, setStartConfirmation] = useState(null), [draftStart, setDraftStart] = useState(null), [connectionNeeded, setConnectionNeeded] = useState(false);
  const startSession = useRef(null), startMounted = useRef(true);
  const automationDirty = useCallback(value => setDirtyFields(current => ({ ...current, automation: value })), []);
  const notesDirty = useCallback(value => setDirtyFields(current => ({ ...current, notes: value })), []);
  useEffect(() => { onDirty?.(startBusy || Object.values(dirtyFields).some(Boolean)); }, [dirtyFields, startBusy, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => { startMounted.current = true; return () => { startMounted.current = false; const session = startSession.current; startSession.current = null; session?.controller.abort(); session?.resolve?.(false); }; }, [projectId]);
  function openNote(id) { setNotesOpen(true); setSelectedId(null); setSelectedDraftId(null); setNoteTarget({ id, nonce: crypto.randomUUID() }); }
  function createNote(seed) { setNotesOpen(true); setSelectedId(null); setSelectedDraftId(null); setNoteTarget({ create: seed, nonce: crypto.randomUUID() }); }
  const permissions = automationPermissions(role, sharedView), tasks = remote.data?.tasks || [], analyses = remote.data?.analyses || [];
  const draftItems = drafts.data?.items || [];
  const areaTaskIds = tasks.map(task => task.id).sort().join('|');
  useEffect(() => { if (areaTaskIds) void areas.load(); }, [areaTaskIds, areas.load]);
  async function changed(message) { if (message) notify?.(message); await Promise.all([remote.load(), areas.load()]); await onChanged?.({ quiet: true }); }
  function areasChanged(value) {
    areas.setData(current => ({ ...(current || {}), items: [...(current?.items || []).filter(item => item.task_id !== value.task_id), { task_id: value.task_id, areas: value.areas, progress: value.progress }] }));
    notify?.('영역별 담당자와 진행 상태를 저장했습니다.');
    void onChanged?.({ quiet: true });
  }
  async function start(task, restoreDetail = false) {
    if (startSession.current || !automationCanRequestStart(task, permissions)) return;
    if (!automationCanStart(task, permissions, remote.data?.capabilities)) { setStartError(null); setConnectionNeeded(true); return; }
    const session = { controller: new AbortController(), resolve: null };
    startSession.current = session; setStartBusy(true); setStartError(null); setConnectionNeeded(false); if (restoreDetail) setSelectedId(null);
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
  return <section className="task-automation ains-section-stack" aria-label="Nora 정책 분석·개발 작업">
    <header className="task-auto-heading"><div><h2>작업 보드</h2></div><Button type="button" variant="secondary" icon={RefreshCw} disabled={startBusy} onClick={() => { void remote.load(); void drafts.load(); void areas.load(); }}>새로고침</Button></header>
    <ErrorNotice error={startError} />
    {startBusy && !startConfirmation ? <Spinner label="개발 시작 요청을 확인하고 있습니다" /> : null}
    {remote.error ? <div aria-label="정책 분석·개발 작업 조회 오류"><p className="task-auto-help">정책 분석·개발 작업을 불러오지 못했습니다.</p><ErrorNotice error={remote.error} onRetry={remote.load} /></div> : null}
    {drafts.error ? <div aria-label="출처 기반 작업 초안 조회 오류"><p className="task-auto-help">출처 기반 작업 초안을 불러오지 못했습니다.{drafts.data ? ' 이미 표시한 작업은 유지했습니다.' : ''}</p><ErrorNotice error={drafts.error} onRetry={drafts.retry} /></div> : null}
    {!remote.data && remote.loading ? <Spinner label="정책 분석과 개발 작업을 불러오고 있습니다" /> : null}
    {!drafts.data && drafts.loading ? <Spinner label="출처 기반 작업 초안을 불러오고 있습니다" /> : null}
    {remote.data && !sharedView ? <CapabilityNotice capabilities={remote.data.capabilities} onSettings={onSettings} /> : null}
    {areas.error ? <ErrorNotice error={areas.error} onRetry={areas.load} /> : null}
    {remote.data || drafts.data ? <>
      {tasks.length || draftItems.length ? <TaskAutomationKanban key={projectId} tasks={tasks} drafts={draftItems} areas={areas.data?.items} areasUnavailable={Boolean(areas.error)} permissions={permissions} busy={startBusy} onStart={task => void start(task)} onDraftStart={setDraftStart} onSelectTask={setSelectedId} onSelectDraft={setSelectedDraftId} onInvalidMove={notify} /> : !remote.loading && !drafts.loading && !remote.error && !drafts.error ? <Empty compact title="분석으로 생성한 작업이 없습니다">자료·기록에서 정책 문서를 등록하고 분석하면 작업이 생성됩니다.</Empty> : null}
      {drafts.data?.has_more ? <div className="inline-actions"><p className="task-auto-help">출처 기반 작업 초안 {draftItems.length} / {drafts.data.total}개 표시</p>{drafts.data.has_more ? <Button type="button" variant="secondary" busy={drafts.loading} onClick={() => drafts.load(true)}>작업 초안 더 불러오기</Button> : null}</div> : null}
      {drafts.data && !drafts.data.has_more && draftItems.length < drafts.data.total ? <Notice title="조회 중 작업 목록이 바뀌었습니다">전체 작업을 확인하려면 목록을 다시 불러와 주세요.<Button type="button" variant="secondary" busy={drafts.loading} onClick={() => drafts.load()}>작업 초안 목록 새로고침</Button></Notice> : null}
    </> : null}
    <IntakeNotice items={remote.data?.intake} />
    {remote.data ? <Disclosure><summary>정책 분석·고객 질문 이력 · {analyses.length}건</summary>{analyses.length ? <List aria-label="정책 분석 이력">{analyses.map(analysis => <RiskAnalysis key={analysis.id} analysis={analysis} taskCount={tasks.filter(task => task.analysis_id === analysis.id).length} onQuestions={onQuestions} />)}</List> : <p className="task-auto-help">아직 정책 분석 이력이 없습니다.</p>}</Disclosure> : null}
    <Disclosure open={notesOpen} onOpenChange={setNotesOpen}><summary>임시 구현·보완 기록{notesError ? ' · 조회 오류' : ''}</summary><ImplementationNotesPanel projectId={projectId} request={request} role={role} notify={notify} onDirty={notesDirty} onErrorChange={notesErrorChanged} onChanged={async options => { await remote.load(); await onChanged?.(options); }} onSourceRevision={onSourceRevision} target={noteTarget} analyses={analyses} onRefreshAnalysis={remote.load} refreshKey={[...tasks, ...analyses].map(item => `${item.id}:${item.updated_at}:${item.status}`).join('|')} /></Disclosure>
    {selectedId ? <AutomationTaskDetail key={`${projectId}:${selectedId}`} id={selectedId} projectId={projectId} route={route} request={request} permissions={permissions} sharedView={sharedView} settings={remote.data?.settings} capabilities={remote.data?.capabilities} onClose={() => setSelectedId(null)} onDirty={automationDirty} onChanged={changed} onAreasChanged={areasChanged} onOpenNote={openNote} onStart={task => void start(task, true)} startError={startError} /> : null}
    {selectedDraftId ? <SourceTaskDraftDetail key={selectedDraftId} id={selectedDraftId} projectId={projectId} route={`${projectPath(projectId)}/task-drafts`} request={request} onClose={() => setSelectedDraftId(null)} onDependency={setSelectedDraftId} onPrepare={item => { setSelectedDraftId(null); setDraftStart(item); }} onSourceRevision={onSourceRevision} onSettings={!sharedView && remote.data?.capabilities?.risk_analysis !== true ? onSettings : undefined} onOpenNote={openNote} onCreateNote={permissions.canWrite ? createNote : undefined} /> : null}
    {draftStart ? <DraftPolicyPreparation key={`${projectId}:${draftStart.id}`} draft={draftStart} projectId={projectId} request={request} canWrite={permissions.canWrite} onClose={() => setDraftStart(null)} onChanged={() => { void remote.load(); void drafts.load(); void onChanged?.({ quiet: true }); }} onSourceRevision={onSourceRevision ? revisionId => { setDraftStart(null); onSourceRevision(revisionId); } : undefined} onTask={id => { setDraftStart(null); setSelectedId(id); }} onQuestions={onQuestions ? () => { setDraftStart(null); onQuestions(); } : undefined} /> : null}
    {connectionNeeded ? <CTDSModal open title="AI 개발 실행 환경이 연결되지 않았습니다" description="작업을 진행 중으로 옮기려면 실행 환경 연결이 필요합니다. 개발을 요청하거나 작업 상태를 바꾸지 않았습니다." onOpenChange={open => { if (!open) setConnectionNeeded(false); }} dismissLabel="닫기" data-ctds="modal" footer={<><Button type="button" variant="secondary" onClick={() => setConnectionNeeded(false)}>닫기</Button>{onSettings ? <Button type="button" onClick={() => { setConnectionNeeded(false); onSettings(); }}>프로젝트 연결 설정</Button> : null}</>}><CapabilityNotice capabilities={remote.data?.capabilities} /></CTDSModal> : null}
    {startConfirmation ? <ProvisionalStartConfirmation {...startConfirmation} onCancel={() => settleStart(false)} onConfirm={() => settleStart(true)} /> : null}
  </section>;
}

function SourceTaskDraftDetail({ id, projectId, route, request, onClose, onDependency, onPrepare, onSourceRevision, onSettings, onOpenNote, onCreateNote }) {
  const remote = useAutomationResource(`${route}/${encodeURIComponent(id)}`, request, () => false), item = remote.data?.item;
  const sourceUrl = taskDraftSourceUrl(item?.source_url);
  return <Modal title={item?.title || '검토 전 작업 초안'} eyebrow="검토 전 작업 초안" onClose={onClose} wide><div className="modal-body task-auto-detail"><ErrorNotice error={remote.error} onRetry={remote.load} />{!item ? remote.loading ? <Spinner label="작업 초안의 근거와 완료 기준을 불러오고 있습니다" /> : null : <>
    <div className="inline-actions"><Badge tone="quiet">할 일</Badge><Badge tone="amber">Nora 검증 전</Badge><span>{item.key} · 우선순위 {{ high: '높음', normal: '보통', low: '낮음' }[item.priority] || '보통'}</span></div>
    <Notice tone="warning" title="개발 전 정책을 확인해 주세요" actions={<>{onPrepare ? <Button type="button" variant="secondary" onClick={() => onPrepare(item)}>정책 분석 시작</Button> : null}{onSettings ? <Button type="button" variant="secondary" onClick={onSettings}>Nora 연결 설정</Button> : null}</>}>초안을 분석한 뒤 개발할 작업을 확인할 수 있습니다.</Notice>
    <p>{item.description}</p>
    <section><h3>완료 기준</h3><List>{item.acceptance_criteria?.map((criterion, index) => <ListItem key={index}><ListItem.Description>{criterion}</ListItem.Description></ListItem>)}</List></section>
    <section><h3>출처</h3><dl className="task-auto-facts"><div><dt>문서</dt><dd>{onSourceRevision ? <Button type="button" variant="ghost" onClick={() => onSourceRevision(item.source_revision_id)}>{item.source_title}</Button> : item.source_title}</dd></div><div><dt>등록 시각</dt><dd>{dateTime(item.created_at)}</dd></div></dl>{sourceUrl ? <Button type="button" asChild variant="secondary"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">외부 출처 열기<ExternalLink size={15} /></a></Button> : null}</section>
    {item.evidence?.length ? <Disclosure open><summary>원문 근거 · {item.evidence.length}개</summary><List>{item.evidence.map((evidence, index) => <ListItem key={index}><ListItem.Title>{evidence.locator?.label || evidence.segment_id}</ListItem.Title><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{evidence.quote}</p></ListItem>)}</List></Disclosure> : null}
    <section><h3>선행 작업</h3>{item.dependencies?.length ? <List>{item.dependencies.map(dependency => <ListItem key={dependency.id}><ListItem.Title><Button type="button" variant="ghost" onClick={() => onDependency(dependency.id)}>{dependency.title}</Button></ListItem.Title><ListItem.Meta>{dependency.key}</ListItem.Meta></ListItem>)}</List> : <p className="task-auto-help">등록된 선행 작업이 없습니다.</p>}</section>
    {item.question_notes?.length ? <section><h3>확인할 질문·메모</h3><List>{item.question_notes.map((note, index) => <ListItem key={index}><ListItem.Description>{note}</ListItem.Description></ListItem>)}</List></section> : null}
    <RelatedImplementationNotes projectId={projectId} request={request} draftId={id} onOpen={onOpenNote} />
    {onCreateNote ? <Button type="button" variant="secondary" onClick={() => onCreateNote({ source_revision_id: item.source_revision_id, task_draft_id: item.id, evidence: item.evidence })}>추가 기록 직접 남기기</Button> : null}
  </>}</div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>닫기</Button></footer></Modal>;
}

function AutomationTaskDetail({ id, projectId, route, request, permissions, sharedView, settings, capabilities, onClose, onDirty, onChanged, onAreasChanged, onOpenNote, onStart, startError }) {
  const remote = useAutomationResource(`${route}/tasks/${encodeURIComponent(id)}`, request, data => ['queued', 'running', 'merging'].includes(data.task?.execution_status));
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [note, setNote] = useState(''), [previewAck, setPreviewAck] = useState(false), [diffAck, setDiffAck] = useState(false);
  const [reviewedHead, setReviewedHead] = useState(null), [reconciling, setReconciling] = useState(false), confirm = useConfirm();
  const task = remote.data?.task, artifact = task?.artifact, preview = automationPreviewUrl(artifact?.preview_url, settings?.preview_origins), refreshPending = useRef(false);
  const [areasDirty, setAreasDirty] = useState(false), [areasBusy, setAreasBusy] = useState(false);
  const dirty = Boolean(note || previewAck || diffAck || busy || areasDirty || areasBusy);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { setReviewedHead(artifact?.head_sha || null); setPreviewAck(false); setDiffAck(false); setNote(''); }, [artifact?.head_sha, artifact?.diff, artifact?.preview_url, artifact?.target_branch, artifact?.base_sha]);
  useEffect(() => { if (!reconciling) return; const timer = setInterval(() => { if (!document.hidden) void remote.load(); }, 5000); const timeout = setTimeout(() => setReconciling(false), 60000); return () => { clearInterval(timer); clearTimeout(timeout); }; }, [reconciling, remote.load]);
  useEffect(() => { if (task?.execution_status !== 'uncertain') setReconciling(false); }, [task?.execution_status]);
  async function close() { if (!busy && !areasBusy && (!dirty || await confirm('작성 중인 작업 검토 내용을 버리고 닫을까요?'))) onClose(); }
  async function openRelatedNote(noteId) { if (!busy && !areasBusy && (!dirty || await confirm('작성 중인 작업 검토 내용을 버리고 기록을 열까요?'))) onOpenNote(noteId); }
  async function beginDevelopment() { if (!busy && !areasBusy && automationCanStart(task, permissions, capabilities) && (!dirty || await confirm('작성 중인 작업 검토 내용을 버리고 개발을 시작할까요?'))) onStart(task); }
  async function refreshArtifact() {
    if (busy || areasBusy || refreshPending.current || sharedView || !automationCanRefreshArtifact(task, permissions)) return;
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
    if (busy || areasBusy || sharedView) return; setBusy(true); setError(null);
    try { const result = await request(`${route}/tasks/${encodeURIComponent(id)}${suffix}`, { method, body }); if (!remote.lifecycle.current.active) return; if (result.task) remote.setData(result); setNote(''); setPreviewAck(false); setDiffAck(false); if (suffix === '/reconcile-merge') setReconciling(true); await remote.load(); await onChanged(suffix === '/reconcile-merge' ? '기존 병합 요청의 결과 확인을 요청했습니다.' : suffix ? '검토한 변경의 병합을 요청했습니다. 병합 결과를 확인하고 있습니다.' : '작업을 진행 중으로 옮기고 AI 개발을 요청했습니다.'); }
    catch (err) { if (remote.lifecycle.current.active) { setError(err); await remote.load(); } }
    finally { if (remote.lifecycle.current.active) setBusy(false); }
  }
  const merge = automationMergeReadiness(task, capabilities, settings), reportedChecks = automationReportedChecks(artifact, sharedView);
  return <Modal title={task?.title || 'AI 개발 작업'} eyebrow="정책 분석에서 생성한 작업" busy={busy || areasBusy} onClose={close} wide><div className="modal-body task-auto-detail"><ErrorNotice error={remote.error} onRetry={remote.load} /><ErrorNotice error={error || startError} />{!task ? remote.loading ? <Spinner /> : null : <>
    <div className="inline-actions"><Badge tone={AUTOMATION_COLUMNS.find(([status]) => status === task.status)?.[2]}>{AUTOMATION_COLUMNS.find(([status]) => status === task.status)?.[1] || '확인 필요'}</Badge>{task.requires_provisional_confirmation ? <Badge tone="amber">검토 필요</Badge> : null}<span>{automationExecutionLabel(task)}</span></div>
    <p>{task.description}</p><section><h3>완료 기준</h3><List>{task.acceptance_criteria?.map((criterion, index) => <ListItem key={index}><ListItem.Description>{criterion}</ListItem.Description></ListItem>)}</List></section>
    <TaskAreasPanel key={`${projectId}:${id}`} projectId={projectId} taskId={id} request={request} canWrite={permissions.canWrite && !sharedView} disabled={busy} onDirty={setAreasDirty} onBusy={setAreasBusy} onChanged={onAreasChanged} />
    {task.evidence?.length ? <Disclosure><summary>정책 원문 근거 · {task.evidence.length}개</summary><List>{task.evidence.map((evidence, index) => <ListItem key={index}><ListItem.Title>{evidence.segment_id}</ListItem.Title><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{evidence.quote}</p></ListItem>)}</List></Disclosure> : null}
    {task.error_code ? <Notice tone="warning" title="작업 준비 상태를 확인해 주세요">{automationBlockerLabel(task.error_code)}</Notice> : null}
    {task.status === 'todo' && permissions.canWrite ? <><Button type="button" icon={ArrowRight} busy={busy} disabled={areasBusy || !automationCanStart(task, permissions, capabilities)} onClick={beginDevelopment}>AI 개발 시작</Button>{capabilities?.development !== true ? <CapabilityNotice capabilities={capabilities} /> : null}</> : null}
    {task.status === 'in_progress' && ['queued', 'running'].includes(task.execution_status) ? <Notice title="AI 개발 결과를 기다리고 있습니다">코드 변경안과 임시 구현 이력이 준비되면 먼저 검토할 수 있습니다. CI·웹 미리보기와 병합 여부는 별도로 확인합니다.</Notice> : null}
    {automationHasCodeArtifact(artifact) ? <section className="ains-section-stack"><h3>개발 결과 검토</h3><ArtifactVerification artifact={artifact} settings={settings} />
      {!sharedView && automationPrUrl(artifact) ? <Button type="button" asChild variant="secondary"><a href={automationPrUrl(artifact)} target="_blank" rel="noopener noreferrer">PR #{artifact.pr_number} 열기<ExternalLink size={15} /></a></Button> : null}
      {artifact.evidence_status === 'unverified' ? <Notice tone="warning" title="코드 변경 근거를 확인해야 합니다">AI가 전달한 변경안입니다. 실제 파일·커밋과 일치하는지 확인되기 전에는 검증된 개발 결과로 처리하거나 병합할 수 없습니다.</Notice> : null}
      <Disclosure><summary>브랜치·커밋 정보</summary><dl className="task-auto-facts"><div><dt>병합 대상 브랜치</dt><dd>{artifact.target_branch || '확인 필요'}</dd></div><div><dt>변경 커밋</dt><dd><code>{artifact.head_sha || '아직 확인되지 않음'}</code></dd></div><div><dt>기준 커밋</dt><dd><code>{artifact.base_sha || '확인 필요'}</code></dd></div></dl></Disclosure>
      {!sharedView ? <Disclosure open><summary>{artifact.evidence_status === 'unverified' ? 'AI가 전달한 코드 변경안' : '코드 변경 내역'}</summary>{artifact.diff ? <pre className="task-auto-diff">{artifact.diff}</pre> : <p>코드 변경 내역이 아직 없습니다.</p>}</Disclosure> : <p className="task-auto-help">공유 화면에서는 코드 변경 내역과 외부 미리보기를 표시하지 않습니다.</p>}
      <section><h4>CI·웹 미리보기</h4>{artifact.checks?.length ? <List>{artifact.checks.map((check, index) => <ListItem key={index}><ListItem.Title>{check.name}</ListItem.Title><ListItem.Meta>{{ passed: '통과', failed: '실패', pending: '확인 중', unavailable: '미연결' }[check.status] || '확인 필요'}</ListItem.Meta></ListItem>)}</List> : <p>검증 결과가 아직 없습니다.</p>}
        {!sharedView && preview ? <Button type="button" asChild variant="secondary"><a href={preview} target="_blank" rel="noopener noreferrer">웹 미리보기 열기<ExternalLink size={15} /></a></Button> : !sharedView ? <p className="task-auto-help">웹 미리보기가 준비되면 여기에서 열 수 있습니다. 코드 변경안과 자동 기록은 먼저 확인할 수 있습니다.</p> : null}
      </section>
      {automationCanRefreshArtifact(task, permissions) ? <div><Button type="button" variant="secondary" icon={RefreshCw} busy={busy} disabled={areasBusy} onClick={refreshArtifact}>PR·CI·미리보기 상태 갱신</Button></div> : null}
    </section> : null}
    {reportedChecks.length ? <Disclosure><summary>AI가 보고한 실행 내역 · 독립 검증 전 · {reportedChecks.length}건</summary><p className="task-auto-help">AI가 보고한 명령과 출력입니다. 저장소의 CI 검증 결과와 별도로 보관하며, 병합 승인 조건에 포함하지 않습니다.</p><List>{reportedChecks.map((check, index) => <ListItem key={index}><ListItem.Title>실행 보고 {index + 1}</ListItem.Title><ListItem.Meta>보고한 종료 코드: {check.exitCodeLabel}</ListItem.Meta><pre className="task-auto-diff"><code>{check.command}</code></pre>{check.output ? <pre className="task-auto-diff">{check.output}</pre> : <p className="task-auto-help">보고된 출력이 없습니다.</p>}</ListItem>)}</List></Disclosure> : null}
    {artifact?.implementation_report ? <section><h3>구현 범위와 남은 작업</h3><Notice tone={artifact.implementation_report.completion === 'complete' ? 'neutral' : 'warning'} title={{ complete: '개발 결과 보고: 완료', partial: '개발 결과 보고: 부분 구현', blocked: '개발 결과 보고: 차단됨' }[artifact.implementation_report.completion] || '개발 결과 보고 확인 필요'}>개발 결과의 보고 상태입니다. 코드·미리보기·남은 공백을 사람이 확인한 뒤 병합을 결정합니다.</Notice>{artifact.implementation_report.remaining_criteria?.length ? <List>{artifact.implementation_report.remaining_criteria.map((criterion, index) => <ListItem key={index}><ListItem.Description>{criterion}</ListItem.Description></ListItem>)}</List> : null}</section> : null}
    <RelatedImplementationNotes key={task.updated_at} projectId={projectId} request={request} taskId={id} onOpen={openRelatedNote} />
    {task.status === 'qa' ? <p className="task-auto-help">검수 대기는 모든 요구사항의 구현 완료를 뜻하지 않습니다. 위 임시 구현·작업 공백과 실제 코드 변경을 함께 검토하세요.</p> : null}
    {task.status === 'qa' && task.execution_status === 'merging' ? <Notice title="승인한 변경을 병합하고 있습니다">기준 브랜치의 병합 결과가 확인되면 완료로 이동합니다.</Notice> : null}
    {task.execution_status === 'uncertain' && task.review ? <Notice tone="warning" title="기존 병합 요청의 결과를 확인해야 합니다"><p>기준 브랜치의 실제 병합 결과를 확인한 뒤 완료로 표시합니다.</p>{permissions.canReview ? <Button type="button" variant="secondary" icon={RefreshCw} busy={busy || reconciling} disabled={areasBusy} onClick={() => mutate('/reconcile-merge', { expected_version: task.version }, 'POST')}>기존 병합 결과 확인</Button> : null}</Notice> : null}
    {task.status === 'qa' && permissions.canReview && task.execution_status === 'ready' ? <form className="task-auto-review" onSubmit={event => { event.preventDefault(); if (!areasBusy && !areasDirty && merge.allowed && previewAck && diffAck && note.trim() && reviewedHead === artifact.head_sha) void mutate('/approve-merge', { expected_version: task.version, head_sha: reviewedHead, note: note.trim() }, 'POST'); }}>
      <h3>검토 후 기준 브랜치에 병합</h3>{!merge.allowed ? <Notice tone="warning" title="병합 전에 확인할 사항"><List>{merge.reasons.map(reason => <ListItem key={reason}><ListItem.Description>{reason}</ListItem.Description></ListItem>)}</List></Notice> : null}
      <label className="checkbox-label"><Input type="checkbox" checked={previewAck} disabled={busy || !preview} onChange={event => setPreviewAck(event.target.checked)} /><span>웹 미리보기에서 완료 기준과 동작을 확인했습니다.</span></label>
      <label className="checkbox-label"><Input type="checkbox" checked={diffAck} disabled={busy || !artifact?.diff} onChange={event => setDiffAck(event.target.checked)} /><span>코드 변경·검증 결과·대상 브랜치를 확인했습니다.</span></label>
      <FormField label="검토 근거"><Textarea rows={3} maxLength={3000} value={note} required disabled={busy} onChange={event => setNote(event.target.value)} /></FormField>
      <Button type="submit" icon={GitMerge} busy={busy} disabled={areasBusy || areasDirty || !merge.allowed || !previewAck || !diffAck || !note.trim() || reviewedHead !== artifact?.head_sha}>검토한 변경 승인·병합</Button>
    </form> : task.status === 'qa' && !permissions.canReview ? <p className="task-auto-help"><ShieldCheck size={15} />관리자 또는 검토자가 결과를 확인한 뒤 병합을 승인합니다.</p> : null}
    {task.status === 'done' ? <Notice tone="success" title="기준 브랜치 병합을 확인했습니다">승인한 변경의 실제 병합 결과에 따라 완료 처리되었습니다.</Notice> : null}
  </>}</div><footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy || areasBusy} onClick={close}>닫기</Button></footer></Modal>;
}

export function DraftPolicyPreparation({ draft, projectId, request, canWrite, onClose, onChanged, onSourceRevision, onTask, onQuestions }) {
  const revisionId = draft.source_revision_id;
  const source = useAutomationResource(revisionId ? `${projectPath(projectId)}/revisions/${encodeURIComponent(revisionId)}` : null, request, data => draftPolicySourceState(data.revision).pending);
  const state = draftPolicySourceState(source.data?.revision), [busy, setBusy] = useState(false);
  return <Modal title="작업 초안을 개발할 Task로 준비" eyebrow="정책 리스크 분석" onClose={() => { if (!busy) onClose(); }} busy={busy} wide>
    <div className="modal-body task-policy-preparation ains-section-stack"><strong>{draft.title}</strong>
      <p className="task-auto-help">이 카드는 원문에서 추출한 초안입니다. 리스크 분석 결과로 생성된 Task를 확인한 뒤 개발을 시작할 수 있습니다.</p>
      <Notice title={draft.source_title || '연결된 정책 원문'} actions={onSourceRevision && revisionId ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onSourceRevision(revisionId)}>정책 원문 보기</Button> : null}>{state.message}</Notice>
      <ErrorNotice error={source.error} onRetry={source.load} />
      {!revisionId ? <Notice tone="warning" title="연결된 원문이 없습니다">작업 초안의 출처를 확인해 주세요.</Notice> : <PolicyRiskAnalysis projectId={projectId} revisionId={revisionId} sourceReady={state.ready} request={request} canWrite={canWrite} onBusy={setBusy} onUpdated={onChanged} onTask={onTask} onQuestions={onQuestions} />}
      <p className="task-auto-help">리스크 분석은 개발 실행이나 기존 분석 결과의 승인을 대신하지 않습니다.</p>
    </div><footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>닫기</Button></footer>
  </Modal>;
}

export function PolicyRiskAnalysis({ projectId, revisionId, sourceReady, request, canWrite, onDirty, onWorkItems, onQuestions, onTask, onUpdated, onBusy }) {
  const sharedView = useSharedView(), route = `${projectPath(projectId)}/task-automation`;
  const [questionLanguage, setQuestionLanguage] = useState('');
  const remote = useAutomationResource(route, request), [busy, setBusy] = useState(false), [retryBusy, setRetryBusy] = useState(false), [error, setError] = useState(null), pending = useRef(null);
  const { analyses, tasks, active } = draftPolicyResults(remote.data, revisionId), callbacks = useRef({ onUpdated, onDirty, onBusy });
  callbacks.current = { onUpdated, onDirty, onBusy };
  const resultKey = draftPolicyResultKey(remote.data, revisionId), previousResult = useRef(null);
  useEffect(() => {
    if (!remote.data) return;
    if (previousResult.current !== null && previousResult.current !== resultKey) callbacks.current.onUpdated?.();
    previousResult.current = resultKey;
  }, [resultKey, remote.data]);
  useEffect(() => { callbacks.current.onBusy?.(busy || retryBusy); return () => callbacks.current.onBusy?.(false); }, [busy, retryBusy]);
  useEffect(() => { callbacks.current.onDirty?.(busy || retryBusy || Boolean(pending.current)); return () => callbacks.current.onDirty?.(false); }, [busy, retryBusy, error]);
  async function analyze() {
    if (busy || retryBusy || sharedView || !canWrite || !sourceReady || active || !remote.data?.capabilities?.risk_analysis) return;
    setBusy(true); setError(null); pending.current ||= { revision_id: revisionId, request_id: crypto.randomUUID(), ...(questionLanguage ? { customer_question_language: questionLanguage } : {}) };
    try {
      await request(`${route}/analyze`, { method: 'POST', body: pending.current });
      if (remote.lifecycle.current.active) { pending.current = null; await remote.load(); callbacks.current.onUpdated?.(); }
    } catch (err) { if (remote.lifecycle.current.active) { if (!retainProjectRequest(err)) pending.current = null; setError(err); } }
    finally { if (remote.lifecycle.current.active) setBusy(false); }
  }
  return <section className="task-auto-policy ains-section-stack" aria-label="현재 프로젝트 정책 리스크 분석"><h3>정책 리스크·개발 작업</h3><p className="task-auto-help">확인할 내용은 고객 질문으로 남기고, 실행 가능한 작업을 등록합니다. 검토가 필요한 작업은 개발 시작 때 임시 구현 여부를 확인합니다.</p><ErrorNotice error={remote.error || error} onRetry={remote.load} />
    {remote.data ? <>
      {!remote.data.capabilities?.risk_analysis ? <CapabilityNotice capabilities={remote.data.capabilities} /> : null}
      <IntakeNotice items={remote.data.intake?.filter(item => item.revision_id === revisionId)} />
      {!sourceReady ? <p className="task-auto-help">문서 추출과 원문에서 확인이 필요한 구간을 먼저 검토해 주세요.</p> : null}
      {canWrite && !sharedView ? <FormField label="이번 분석의 고객 질문 언어" hint="프로젝트 기본 언어는 고객 질문 메뉴에서 변경할 수 있습니다."><Select value={questionLanguage} disabled={busy || retryBusy || active || Boolean(pending.current)} onChange={event => setQuestionLanguage(event.target.value)}><option value="">프로젝트 기본 언어</option><option value="ko">한국어</option><option value="en">English</option></Select></FormField> : null}
      <div className="task-policy-actions">{canWrite && !sharedView && !['failed', 'uncertain'].includes(analyses[0]?.status) ? <Button type="button" variant="secondary" icon={Sparkles} busy={busy} disabled={active || retryBusy || !sourceReady || !remote.data.capabilities?.risk_analysis} onClick={analyze}>{active ? 'Nora 리스크 분석 진행 중' : pending.current ? '같은 리스크 분석 요청 확인' : 'Nora 리스크 분석'}</Button> : null}<Button type="button" variant="ghost" icon={RefreshCw} disabled={busy || retryBusy} onClick={remote.load}>분석 상태 새로고침</Button>{onWorkItems ? <Button type="button" variant="secondary" onClick={onWorkItems}>분석·개발 작업 보기</Button> : null}</div>
      <List aria-label="최근 정책 분석">{analyses.slice(0, 1).map(analysis => <RiskAnalysis key={analysis.id} analysis={analysis} taskCount={tasks.filter(task => task.analysis_id === analysis.id).length} onQuestions={onQuestions} />)}</List>
      {analyses[0] && ['failed', 'uncertain'].includes(analyses[0].status) ? <PolicyAnalysisRetry key={`${analyses[0].id}:${analyses[0].execution?.id || ''}`} analysis={analyses[0]} route={route} request={request} canWrite={canWrite && !sharedView} disabled={busy || !sourceReady || !remote.data.capabilities?.risk_analysis} onBusy={setRetryBusy} onFreshAnalysis={analyze} onChanged={async () => { await remote.load(); callbacks.current.onUpdated?.(); }} /> : null}
      {tasks.length ? <section className="ains-section-stack" aria-label="분석으로 생성된 Task"><h4>생성된 Task · {tasks.length}개</h4><List aria-label="분석으로 생성된 작업">{tasks.map(task => <ListItem key={task.id}><ListItem.Title>{onTask ? <ControlButton type="button" variant="ghost" disabled={busy || retryBusy} onClick={() => onTask(task.id)}>{task.title}</ControlButton> : task.title}</ListItem.Title><ListItem.Meta>{automationExecutionLabel(task)}</ListItem.Meta></ListItem>)}</List><p className="task-auto-help">Task를 열어 내용을 확인하세요. 개발은 작업 보드에서 별도로 시작합니다.</p></section> : null}
      {remote.data.capabilities?.risk_analysis && remote.data.capabilities?.development === false ? <p className="task-auto-help">정책 분석과 Task 생성은 가능합니다. AI 개발 시작 전에는 프로젝트의 실행 환경 연결을 확인해야 합니다.</p> : null}
    </> : remote.loading ? <Spinner label="정책 리스크 분석 상태를 확인하고 있습니다" /> : null}
  </section>;
}

function PolicyAnalysisRetry({ analysis, route, request, canWrite, disabled, onBusy, onChanged, onFreshAnalysis }) {
  const [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null), pending = useRef(null), mounted = useRef(true);
  const callbacks = useRef({ onBusy, onChanged }); callbacks.current = { onBusy, onChanged };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { callbacks.current.onBusy?.(busy); return () => callbacks.current.onBusy?.(false); }, [busy]);
  async function retry() {
    if (busy || disabled || !canWrite || !analysis.can_retry) return;
    let body; try { body = pending.current || policyAnalysisRetryPayload(analysis, crypto.randomUUID(), acknowledged); } catch (err) { setError(err); return; }
    pending.current = body; setBusy(true); setError(null);
    try {
      await request(`${route}/analyses/${encodeURIComponent(analysis.id)}/retry`, { method: 'POST', body });
      if (mounted.current) { pending.current = null; await callbacks.current.onChanged?.(); }
    } catch (err) {
      if (mounted.current) { if (!retainProjectRequest(err)) pending.current = null; setError(err); if (err.status === 409) await callbacks.current.onChanged?.(); }
    } finally { if (mounted.current) setBusy(false); }
  }
  const sourceChanged = error?.code === 'TASK_SOURCE_STALE';
  return <div className="ains-section-stack"><Notice tone="warning" title={sourceChanged ? '분석 당시의 근거가 변경되었습니다' : analysis.status === 'uncertain' ? '분석 실행 결과를 확인해 주세요' : analysis.can_retry ? '리스크 분석을 다시 시도할 수 있습니다' : '리스크 분석 상태를 확인해 주세요'}>{sourceChanged ? '이전 분석의 원문·프로젝트 설정·저장소 정보가 현재 내용과 다릅니다. 최신 근거를 확인한 뒤 현재 내용으로 새 분석을 요청해 주세요.' : analysis.can_retry ? '이전 분석 이력을 보존하고 같은 원문으로 새 분석 시도를 기록합니다. 개발을 시작하거나 기존 결과를 승인하지 않습니다.' : '현재 상태에서는 재시도할 수 없습니다. 최신 분석 상태와 원문 변경 여부를 확인해 주세요.'}</Notice>
    {sourceChanged && canWrite && onFreshAnalysis ? <div><Button type="button" variant="secondary" icon={Sparkles} disabled={busy || disabled} onClick={onFreshAnalysis}>현재 내용으로 새 분석</Button></div> : analysis.can_retry && canWrite ? <>{analysis.status === 'uncertain' ? <label className="checkbox-label"><Input type="checkbox" checked={acknowledged} disabled={busy || disabled || Boolean(pending.current)} onChange={event => setAcknowledged(event.target.checked)} /><span>이전 Nora 실행 결과를 확인했으며, 새 리스크 분석 시도가 필요합니다.</span></label> : null}<div><Button type="button" variant="secondary" icon={RefreshCw} busy={busy} disabled={disabled || analysis.status === 'uncertain' && !acknowledged && !pending.current} onClick={retry}>{pending.current ? '같은 재시도 요청 확인' : '리스크 분석 다시 시도'}</Button></div></> : null}
    <ErrorNotice error={error} />
  </div>;
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
    <Notice tone="warning" title="Nora 데스크톱 앱이 필요합니다">이 방식은 Nora 데스크톱 앱이 설치·실행된 컴퓨터가 필요합니다. 앱이 없으면 웹에서 연결 요청을 보내도 승인하거나 개발을 실행할 수 없습니다.</Notice>
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
      <FormField label="AI 개발 실행 방식"><Select value={draft.execution_mode} disabled={!owner || disabled || busy || sdkBusy} onChange={event => setDraft(current => ({ ...current, execution_mode: event.target.value, sdk_provider: event.target.value === 'nora_sdk' ? current.sdk_provider || 'codex' : current.sdk_provider }))}><option value="connector_api">GitHub 커넥터를 통한 개발</option><option value="nora_sdk">Nora 데스크톱 SDK · Codex / Claude Code</option></Select></FormField>
      {draft.execution_mode === 'nora_sdk' ? <SdkExecutionSettings route={route} request={request} draft={draft} setDraft={setDraft} owner={owner} disabled={!owner || disabled || busy} onBusy={setSdkBusy} /> : null}
      <ErrorNotice error={flowRemote.error} onRetry={flowRemote.load} />{[['risk_flow_slug', '정책 리스크 분석 흐름', '기본 Nora 리스크 분석 흐름 · 자동 준비'], ['development_flow_slug', 'AI 개발 흐름', '연결 필요']].map(([key, label, empty]) => <FormField label={label} key={key}><Select {...field(key)}><option value="">{empty}</option>{draft[key] && !flows?.some(flow => flow.slug === draft[key]) ? <option value={draft[key]} disabled>{draft[key]} · 현재 설정</option> : null}{flows?.map(flow => <option key={flow.slug} value={flow.slug}>{flow.name || flow.slug}</option>)}</Select></FormField>)}
      <FormField label="웹 미리보기 허용 주소" hint="예: https://preview.example.com. 경로 없이 한 줄에 한 도메인, 최대 10개. 미리보기 연결 전에도 코드 변경안과 자동 기록을 확인할 수 있습니다."><Textarea {...field('preview_origins')} rows={3} maxLength={4000} /></FormField>
      <p>CI·웹 미리보기 상태는 개발 결과와 별도로 확인합니다. 실제 PR·검증·미리보기가 준비되면 사람이 검토한 뒤 기준 브랜치 병합을 승인합니다.</p><ErrorNotice error={error} />{owner ? <Button type="submit" variant="secondary" busy={busy} disabled={disabled || sdkBusy || !dirty}>분석·개발 연결 저장</Button> : <p>프로젝트 관리자만 연결을 변경할 수 있습니다.</p>}
    </form></>}
  </section>;
}
