import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpRight, CheckCheck, Code2, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, FilePlus2, Files, FolderKanban, Inbox, LayoutDashboard, LogOut, Menu, Plus, Settings2, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { api, ApiError } from './api.js';
import { SharedViewContext, SharedViewBanner, SharedViewManager } from './shared-view.jsx';
import { consumeSharedViewLocation, hasSharedViewIntent, setSharedViewIntent, sharedViewTab, watchSharedViewLocation } from './shared-view-state.mjs';
import { workspaceStorage, rememberWorkspaceReturn, restoreWorkspaceReturn, resolveWorkspaceProject } from './workspace-navigation.mjs';
import { WorkspaceShell } from './workspace-shell.jsx';
import { ProjectHome, AttentionInbox } from './workspace-home.jsx';
import { journeySourceTarget } from './project-journey-navigation.mjs';
import { JourneySourceDetail } from './project-journey.jsx';
import { ProjectMembers } from './project-members.jsx';
import { WORKSPACE_VIEWS, resolveWorkflowStep } from './workspace-flow.mjs';
import { Badge, Button, Empty, ErrorNotice, Modal, ROLES, SectionHeading, Spinner, TextLink, Toast, dateTime, projectPath, shortId, ControlButton, Tabs, Notice } from './ui.jsx';
import { ProjectModal, RevisionModal, RetryModal } from './operations.jsx';
import { DocumentList, DomainModal, UploadModal } from './records.jsx';
import { UnifiedRecordLibrary } from './record-library.jsx';
import { SourceReviewWorkspace } from './source-review.jsx';
import { ReviewDetail } from './review.jsx';
import { Login } from './Login.jsx';
import { AppearanceSettings } from './appearance.jsx';
import { changeUiLanguage, getLocale } from './ui-language-state.mjs';
import { ChannelInbox } from './channels.jsx';
import { ImplementationWorkspace, ProjectSettings } from './implementation.jsx';
import { applySavedProjectSettings } from './project-settings-state.mjs';
import { WorkItems } from './work-items.jsx';
import { CommercialWorkspace } from './commercial.jsx';
import { MainContextWorkspace, ContextSourceDetail } from './context.jsx';
import { IntegrationsWorkspace } from './integrations.jsx';
import { CustomerConnectionsWorkspace } from './customer-connections.jsx';
import { TranscriptionWorkspace } from './transcription.jsx';
import { WorkGovernancePanel } from './work-governance.jsx';
import { QuestionsPanel } from './questions.jsx';
import { GitHubDeliveryPanel } from './github-delivery.jsx';
import { ExecutionQueueSettings } from './execution-queue.jsx';
import { AIProviderSettings } from './provider-settings.jsx';
import { noraConnectionReturn } from './nora-workspace-state.mjs';
import { DomainGuide } from './domain-guide.jsx';

const ACTIVE = new Set(['queued', 'running']);
const REVIEWABLE = new Set(['needs_review', 'no_change', 'approved']);
const EVENT_LABELS = {
  'member.added': '구성원 추가', 'member.role_changed': '구성원 권한 변경', 'member.removed': '구성원 해제',
  'implementation.repository_access_updated': '저장소 읽기 연결 변경',
  'commercial.profile_updated': '프로젝트·기업 정보 변경', 'commercial.template_created': '계약 문서 양식 등록', 'commercial.revision_created': '계약 문서 버전 저장', 'commercial.revision_approved': '계약 문서 내부 승인', 'commercial.revision_rejected': '계약 문서 반려', 'commercial.rewrite_requested': 'Nora 문서 보정 요청', 'commercial.rewrite_started': 'Nora 문서 보정 시작', 'commercial.rewrite_needs_review': 'Nora 문서 보정 완료', 'commercial.rewrite_failed': 'Nora 문서 보정 실패', 'commercial.rewrite_uncertain': 'Nora 보정 결과 확인 필요', 'commercial.rewrite_applied': 'Nora 보정안 적용', 'commercial.feedback_recorded': '고객 협의 요청 기록', 'commercial.feedback_answered': '고객 답변 기록', 'commercial.stage_changed': '계약 진행 단계 변경', 'commercial.confirmation_invalidated': '계약 재협의 전환',
  'project.created': '프로젝트 생성', 'domain.created': '업무 영역 생성', 'revision.uploaded': '문서 버전 등록', 'revision.recorded': '텍스트 기록 등록',
  'baseline.initial_published': '첫 확정본 지정', 'review.requested': '변경 검토 요청',
  'review.question_answered': '질문에 답변', 'review.approved': '변경 승인', 'review.rejected': '변경 반려',
  'baseline.published': '새 확정본 지정', 'job.retry_requested': '작업 재시도 요청',
  'job.started': '분석 작업 시작', 'job.succeeded': '분석 작업 완료', 'job.failed': '분석 작업 실패',
  'job.uncertain': '분석 결과 확인 필요',
  'channel.source_created': '대화 출처 준비', 'channel.source_updated': '대화 출처 설정 변경',
  'implementation.settings_updated': '프로젝트 구현 설정 변경', 'implementation.repository_checked': '저장소 확인',
  'implementation.source_reviewed': '문서 적용 대상 검토', 'implementation.plan_requested': 'AI 작업 계획 요청', 'implementation.plan_approved': 'AI 작업 계획 승인', 'implementation.plan_rejected': 'AI 작업 계획 반려', 'implementation.execution_requested': '코드 변경안 실행 요청',
  'work_item.imported': '기능별 작업 등록', 'work_item.updated': '기능별 작업 변경',
  'channel.collected': '대화 수집', 'channel.accepted': '검토한 대화 기록 등록', 'channel.dismissed': '대화 보관 제외',
};
const STAGE_LABELS = { queued: '실행 대기', extracting: '원문 추출', review_preparing: '검토 준비', pipeline_intent: 'Nora 문서 처리', review_intent: 'Nora 변경 검토', completed: '처리 완료' };


// Read the one-use OAuth return outside React's development double initialization.
let initialSharedToken = consumeSharedViewLocation(window);
let sharedExchange = null;
const initialWorkspaceEntry = restoreWorkspaceReturn(window.location.search, workspaceStorage(window));

export default function App() {
  useEffect(() => watchSharedViewLocation(window), []);
  const [entry] = useState(initialWorkspaceEntry);
  const noraReturn = useRef(noraConnectionReturn(window.location));
  const [preferredStep, setPreferredStep] = useState(entry.workflowStep);
  const [guideOpen, setGuideOpen] = useState(false);
  const [attentionState, setAttentionState] = useState(null), [attentionEpoch, setAttentionEpoch] = useState(0);
  const refreshAttention = useCallback(() => setAttentionEpoch(value => value + 1), []);
  const [projectsReady, setProjectsReady] = useState(false), [unavailableProject, setUnavailableProject] = useState(false);
  const entryActionHandled = useRef(false);
  const [appearanceOpen, setAppearanceOpen] = useState(() => window.location.pathname === '/ctds');
  const [sharedLinkEntry, setSharedLinkEntry] = useState(initialSharedToken !== null || hasSharedViewIntent(window));
  const [session, setSession] = useState(null), [booting, setBooting] = useState(true), [bootError, setBootError] = useState(null);
  const sharedView = session?.shared_view || null;
  const [projects, setProjects] = useState([]), [projectId, setProjectId] = useState(entry.projectId);
  const projectSelection = useRef(entry.projectId);
  projectSelection.current = projectId;
  const [overview, setOverview] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(null);
  const [tab, setTab] = useState(entry.tab), [reviewId, setReviewId] = useState(null), [modal, setModal] = useState(null), [toast, setToast] = useState('');
  const [navigationTarget, setNavigationTarget] = useState(null);
  const [commercialDirty, setCommercialDirty] = useState(false), [pendingNavigation, setPendingNavigation] = useState(null);
  const [repositoryDirty, setRepositoryDirty] = useState(false), [providerDirty, setProviderDirty] = useState(false);
  const hasUnsavedChanges = commercialDirty || repositoryDirty || providerDirty;
  function clearDirty() { setCommercialDirty(false); setRepositoryDirty(false); setProviderDirty(false); }
  function guardNavigation(action) { if (hasUnsavedChanges) setPendingNavigation(() => action); else action(); }
  useEffect(() => { if (!hasUnsavedChanges) return; const warn = (event) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [hasUnsavedChanges]);
  const requestSeq = useRef(0), bootRequest = useRef({ sequence: 0, controller: null });
  const projectRequest = useRef({ sequence: 0, controller: null });
  const authIdentity = useRef({ userId: null, csrfToken: null });
  const invalidateProjectRequest = useCallback(() => {
    projectRequest.current.sequence += 1;
    projectRequest.current.controller?.abort();
    projectRequest.current.controller = null;
  }, []);
  const applySession = useCallback((value) => {
    // Update the identity synchronously; a previous account's pending response
    // must not win the gap before React renders the next authenticated session.
    invalidateProjectRequest();
    requestSeq.current += 1;
    authIdentity.current = { userId: value?.user?.id || null, csrfToken: value?.csrfToken || null };
    setProjectsReady(false); setProjects([]); setProjectId(''); setOverview(null);
    if (value?.shared_view) setSharedViewIntent(window, true);
    setSession(value);
  }, [invalidateProjectRequest]);
  const notify = useCallback((message) => setToast(message), []);
  const closeToast = useCallback(() => setToast(''), []);
  useEffect(() => {
    if (booting || !session?.user || !noraReturn.current) return;
    const result = noraReturn.current; noraReturn.current = null;
    const current = noraConnectionReturn(window.location);
    if (current) window.history.replaceState(window.history.state, '', current.href);
    if (result.message) notify(result.message);
  }, [booting, session?.user?.id, notify]);
  const request = useCallback(async (path, options = {}) => {
    try {
      if (session?.shared_view && (options.method || 'GET') !== 'GET' && !['/api/auth/logout', '/api/auth/shared-view/exit'].includes(path)) throw new ApiError('공유 링크는 조회만 가능합니다.', 'SHARED_VIEW_READ_ONLY', 403);
      return await api(path, { ...options, csrfToken: session?.csrfToken });
    }
    catch (err) {
      const current = authIdentity.current;
      if (err.status === 401 && !options.signal?.aborted && current.userId === session?.user?.id && current.csrfToken === session?.csrfToken) {
        applySession(null); setModal(null); setReviewId(null);
        if (session?.shared_view) { setSharedLinkEntry(true); setBootError(err); }
      }
      throw err;
    }
  }, [session?.user?.id, session?.csrfToken, session?.shared_view, applySession]);
  const bootstrap = useCallback(async () => {
    bootRequest.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++bootRequest.current.sequence;
    bootRequest.current.controller = controller;
    setBootError(null); setBooting(true);
    try {
      let data;
      if (initialSharedToken !== null) {
        // Share exchange survives React StrictMode cleanup; only the current
        // bootstrap applies its response. The raw secret is never persisted.
        sharedExchange ||= api('/api/auth/shared-view', { method: 'POST', body: { token: initialSharedToken } });
        try { data = await sharedExchange; initialSharedToken = null; sharedExchange = null; }
        catch (error) { sharedExchange = null; throw error; }
      } else data = await api('/api/session', { signal: controller.signal });
      if (sharedLinkEntry && !data.shared_view) throw new ApiError('공유 열람이 종료되었습니다. 새 공유 링크를 요청해 주세요.', 'SHARED_VIEW_UNAVAILABLE', 401);
      if (sequence === bootRequest.current.sequence) applySession(data);
    } catch (err) {
      if (sequence === bootRequest.current.sequence && err.name !== 'AbortError') {
        if (err.code === 'SHARED_VIEW_UNAVAILABLE') {
          setSharedViewIntent(window, true); setSharedLinkEntry(true); setBootError(err);
        } else if (err.status === 401 && !sharedLinkEntry) applySession(null); else setBootError(err);
      }
    } finally {
      if (sequence === bootRequest.current.sequence) setBooting(false);
    }
  }, [applySession, sharedLinkEntry]);
  useEffect(() => {
    bootstrap();
    return () => { bootRequest.current.sequence += 1; bootRequest.current.controller?.abort(); };
  }, [bootstrap]);
  const loadProjects = useCallback(async () => {
    const identity = authIdentity.current;
    if (!identity.userId || identity.userId !== session?.user?.id || identity.csrfToken !== session?.csrfToken) throw new DOMException('Project loading was superseded.', 'AbortError');
    invalidateProjectRequest();
    const controller = new AbortController();
    const sequence = projectRequest.current.sequence;
    projectRequest.current.controller = controller;
    const stale = () => controller.signal.aborted || sequence !== projectRequest.current.sequence || authIdentity.current !== identity;
    let result;
    try { result = await request('/api/projects', { signal: controller.signal }); }
    catch (error) { if (stale()) throw new DOMException('Project loading was superseded.', 'AbortError'); throw error; }
    if (stale()) throw new DOMException('Project loading was superseded.', 'AbortError');
    setProjects(result.projects);
    const next = resolveWorkspaceProject(result.projects, projectSelection.current, entry);
    setProjectId(next.projectId); setUnavailableProject(next.unavailable); setProjectsReady(true);
    return result.projects;
  }, [request, entry, session?.user?.id, session?.csrfToken, invalidateProjectRequest]);
  const projectSettingsChanged = useCallback(async (settings) => {
    if (settings) setProjects(current => applySavedProjectSettings(current, settings));
    return loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    loadProjects().catch((err) => { if (active && err.name !== 'AbortError') setError(err); });
    return () => { active = false; invalidateProjectRequest(); };
  }, [session?.user?.id, loadProjects, invalidateProjectRequest]);
  const hasSelectedProject = projects.some(project => project.id === projectId);
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!projectId || !session?.user || !projectsReady || !hasSelectedProject) return;
    const sequence = ++requestSeq.current;
    if (!quiet) setLoading(true);
    try { const data = await request(`${projectPath(projectId)}/overview`); if (requestSeq.current === sequence) { setOverview(data); setError(null); } }
    catch (err) { if (requestSeq.current === sequence) setError(err); }
    finally { if (requestSeq.current === sequence) setLoading(false); }
  }, [projectId, request, session?.user?.id, projectsReady, hasSelectedProject]);
  useEffect(() => { setNavigationTarget(null); setOverview(null); setReviewId(null); setModal(null); setError(null); refresh(); return () => { requestSeq.current += 1; }; }, [refresh]);
  const hasActiveJobs = (overview?.jobs || []).some((job) => ACTIVE.has(job.status));
  useEffect(() => { if (!projectId || !hasActiveJobs) return; const timer = setInterval(() => { if (!document.hidden) refresh({ quiet: true }); }, 5000); return () => clearInterval(timer); }, [hasActiveJobs, projectId, refresh]);
  useEffect(() => { if (sharedView && sharedViewTab(tab, true) !== tab) { setTab('home'); setPreferredStep(null); setReviewId(null); } }, [sharedView, tab]);
  const visibleTab = sharedViewTab(tab, sharedView);
  const activeStep = resolveWorkflowStep(visibleTab, preferredStep);
  const project = projects.find((p) => p.id === projectId), role = project?.role;
  const canWrite = !sharedView && ['owner', 'reviewer', 'member'].includes(role), canReview = !sharedView && ['owner', 'reviewer'].includes(role);
  useEffect(() => {
    if (!project || !session?.user || !projectsReady) return;
    const controller = new AbortController();
    setAttentionState(old => ({projectId, data: old?.projectId === projectId ? old.data : null, error: null, loading: true}));
    request(`${projectPath(projectId)}/attention`, {signal: controller.signal})
      .then(data => { if (!controller.signal.aborted) setAttentionState({projectId, data, error: null, loading: false}); })
      .catch(error => { if (!controller.signal.aborted) setAttentionState({projectId, data: null, error, loading: false}); });
    return () => controller.abort();
  }, [projectId, Boolean(project), session?.user?.id, projectsReady, request, attentionEpoch, tab, overview]);
  useEffect(() => {
    if (!project || !session?.user) return;
    const refreshVisible = () => { if (!document.hidden) refreshAttention(); };
    const timer = setInterval(refreshVisible, 60000);
    window.addEventListener('focus', refreshVisible);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshVisible); };
  }, [projectId, Boolean(project), session?.user?.id, refreshAttention]);
  const attention = attentionState?.projectId === projectId ? attentionState.data : null;
  const attentionError = attentionState?.projectId === projectId ? attentionState.error : null;
  const attentionLoading = attentionState?.projectId !== projectId || attentionState?.loading;
  useEffect(() => {
    if (!session?.user || !projectsReady || entryActionHandled.current) return;
    if (unavailableProject) { entryActionHandled.current = true; return; }
    if (entry.action === 'upload' && (!project || !overview)) return;
    entryActionHandled.current = true;
    if (entry.action === 'new-project' && !sharedView) setModal({ type: 'project' });
    if (entry.action === 'upload') {
      if (canWrite) setModal({ type: 'upload', returnTab: 'documents' });
      else setError(new Error('문서 등록에는 실무자 이상의 프로젝트 권한이 필요합니다.'));
    }
  }, [session?.user, projectsReady, unavailableProject, entry.action, project, overview, canWrite, sharedView]);
  useEffect(() => { window.scrollTo(0, 0); }, [projectId, tab]);

  useEffect(() => {
    if (!session?.user || !projectsReady || (tab !== 'customers' && (!projectId || unavailableProject))) return;
    const query = new URLSearchParams({ ...(tab !== 'customers' && projectId ? {project: projectId} : {}), tab });
    query.set('ui_lang', getLocale());
    if (activeStep) query.set('step', activeStep.id);
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
  }, [session?.user, projectsReady, projectId, unavailableProject, tab, activeStep?.id]);

  const domains = overview?.domains || [], documents = overview?.documents || [], reviews = overview?.reviews || [], jobs = overview?.jobs || [], feed = overview?.feed || [];
  const pending = reviews.filter((review) => REVIEWABLE.has(review.status));
  const failedJobCount = overview?.counts?.failed_jobs ?? jobs.filter((job) => ['failed', 'uncertain'].includes(job.status)).length;
  function navigate(next, target = null) { if (target?.revisionId && next === 'documents') next = 'source-review'; if (sharedView && sharedViewTab(next, true) !== next) { notify('공유 링크에서 제공하지 않는 관리 화면입니다.'); return; } guardNavigation(() => { setNavigationTarget(target); setPreferredStep(resolveWorkflowStep(next, target?.workflowStep)?.id || null); setTab(next); setReviewId(next === 'reviews' ? target?.reviewId || null : null);
      const doc = target?.revisionId ? documents.find(item => item.revisions?.some(revision => revision.id === target.revisionId)) : null;
      setModal(doc && next !== 'source-review' ? {type:'revision', doc, revision:{id:target.revisionId}} : null); }); }
  function selectProject(id, nextTab = 'home', nextStep = null) {
    if (id && !projects.some(item => item.id === id)) return;
    guardNavigation(() => {
      if (id !== projectId) { requestSeq.current += 1; setOverview(null); setLoading(Boolean(id)); }
      setUnavailableProject(false); setProjectId(id); setTab(WORKSPACE_VIEWS[nextTab] && (!sharedView || sharedViewTab(nextTab, true) === nextTab) ? nextTab : 'home');
      setPreferredStep(resolveWorkflowStep(nextTab, nextStep)?.id || null); setNavigationTarget(null); setReviewId(null); setModal(null);
    });
  }
  function openReview(id) { navigate('reviews', {reviewId:id}); }
  function openJourneySource(ref) {
    const destination = journeySourceTarget(ref);
    if (!destination) { notify('이 기록의 상세 내용은 타임라인에서 확인할 수 있습니다.'); return; }
    if (destination.journeySource) guardNavigation(() => setModal({ type: 'journey-source', source: destination.journeySource }));
    else if (destination.source) guardNavigation(() => setModal({ type: 'source', source: destination.source }));
    else navigate(destination.tab, destination.target);
  }
  async function logout() {
    clearDirty(); invalidateProjectRequest();
    try { await request(sharedView ? '/api/auth/shared-view/exit' : '/api/auth/logout', { method: 'POST', body: {} }); applySession(null); setModal(null); setReviewId(null); if (sharedView) { setSharedViewIntent(window, false); initialSharedToken = null; window.location.assign('/'); } }
    catch (err) {
      // A failed logout keeps the current session; resume a cancelled list load.
      if (authIdentity.current.userId) await loadProjects().catch(() => {});
      setError(err);
    }
  }
  async function changed(message) { setModal(null); notify(message); await refresh(); }
  if (booting) return <div className="boot-screen"><span className="wordmark">ains<span>●</span></span><Spinner label="작업실을 준비하고 있습니다" /></div>;
  if (bootError) return <div className="boot-screen"><Empty title={sharedLinkEntry ? '공유 링크를 열 수 없습니다' : '작업실을 열 수 없습니다'}>{sharedLinkEntry ? '링크가 만료되었거나 종료되었을 수 있습니다. 공유한 담당자에게 새 링크를 요청해 주세요.' : null}</Empty><ErrorNotice error={bootError} onRetry={bootstrap} />{sharedLinkEntry ? <Button type="button" variant="secondary" onClick={async () => { initialSharedToken = null; sharedExchange = null; await api('/api/auth/shared-view/exit', { method: 'POST', body: {} }).catch(() => {}); setSharedViewIntent(window, false); setSharedLinkEntry(false); setBootError(null); window.location.assign('/'); }}>일반 로그인으로</Button> : null}</div>;
  if (!session?.user) return <Login onGoogleStart={() => rememberWorkspaceReturn(workspaceStorage(window), entry)} onLogin={(data) => { setError(null); applySession(data); }} />;

  return <SharedViewContext.Provider value={sharedView}><WorkspaceShell sharedView={sharedView} onShare={() => guardNavigation(() => setModal({type:'share'}))} user={session.user} project={project} projects={projects} tab={tab} activeStep={activeStep} alertCount={attention?.counts?.all} onNavigate={navigate} onProjectSelect={selectProject} onNewProject={() => guardNavigation(() => setModal({type:'project'}))} onUpload={() => guardNavigation(() => setModal({type:'upload',returnTab:tab}))} canWrite={canWrite} onLogout={() => guardNavigation(logout)} onAppearance={() => setAppearanceOpen(true)} onGuide={() => setGuideOpen(true)}><main id="workspace" tabIndex={-1} className="workspace">{sharedView ? <SharedViewBanner sharedView={sharedView} onExit={logout} /> : null}<ErrorNotice error={error} onRetry={() => project && projectsReady ? refresh() : loadProjects().catch(setError)} />
      {tab === 'customers' && !sharedView ? <><div className="page-heading"><div><h1>{WORKSPACE_VIEWS.customers.label}</h1><p>{WORKSPACE_VIEWS.customers.description}</p></div></div><CustomerConnectionsWorkspace request={request} notify={notify} projects={projects} project={project} onNavigate={navigate} onProjectOpen={id => selectProject(id, 'integrations')} onDirty={setCommercialDirty} onChanged={refresh} /></> : !project ? unavailableProject ? <Empty title="요청한 프로젝트를 열 수 없습니다" action={<Button variant="secondary" onClick={() => selectProject(projects[0]?.id || '')}>접근 가능한 프로젝트 확인</Button>}>프로젝트가 없거나 접근 권한이 없습니다. 프로젝트 목록에서 다시 선택해 주세요.</Empty> : !projectsReady && error ? <Empty title="프로젝트 목록을 확인할 수 없습니다">위의 다시 시도 버튼으로 목록을 불러와 주세요.</Empty> : !projectsReady || projects.length || loading ? <Spinner /> : sharedView ? <Empty title="공유된 프로젝트가 없습니다">공유한 담당자에게 접근 범위를 확인해 주세요.</Empty> : <div className="onboarding"><h1>첫 프로젝트를 시작하세요.</h1><p>기획 자료와 작업을 관리할 프로젝트를 만드세요.</p><p>기존 프로젝트에 참여하려면 관리자에게 구성원 추가를 요청하세요.</p><Button icon={Plus} onClick={() => guardNavigation(() => setModal({ type: 'project' }))}>프로젝트 만들기</Button></div> : <>
        {!reviewId ? <div className="page-heading"><div>{activeStep?.id === 'collect' && tab !== 'documents' ? <Button type="button" variant="ghost" onClick={() => navigate('documents')}>자료·기록으로 돌아가기</Button> : null}<h1>{tab === 'home' ? project.name : activeStep?.id === 'knowledge' && tab === 'context' ? '재사용 자료' : WORKSPACE_VIEWS[tab]?.label}</h1><p>{activeStep?.id === 'knowledge' ? activeStep.description : WORKSPACE_VIEWS[tab]?.description}</p></div></div> : null}
        {loading && !overview && tab !== 'alerts' ? <Spinner /> : overview || tab === 'alerts' ? sharedView && visibleTab !== tab ? <Spinner /> : reviewId ? <ReviewDetail key={`${projectId}:${reviewId}`} project={project} id={reviewId} request={request} canWrite={canWrite} canReview={canReview} onBack={() => setReviewId(null)} onChanged={refresh} notify={notify} onRetry={(job) => setModal({ type: 'retry', job })} /> : tab === 'home' ? <ProjectHome request={request} onDirty={setCommercialDirty} notify={notify} onOpenSource={openJourneySource} project={project} projects={projects} overview={overview} onNavigate={navigate} onProjectSelect={selectProject} onUpload={canWrite ? () => setModal({type:'upload',returnTab:tab}) : undefined} onNewProject={sharedView ? undefined : () => setModal({type:'project'})} attention={attention} attentionError={attentionError} attentionLoading={attentionLoading} onRefreshAttention={refreshAttention} /> : tab === 'alerts' ? <AttentionInbox project={project} projects={projects} onProjectSelect={id => selectProject(id, 'alerts')} documentLoading={!overview} attention={attention} attentionError={attentionError} attentionLoading={attentionLoading} onRefreshAttention={refreshAttention} onNavigate={navigate} /> : tab === 'overview' ? <><div className="workspace-summary"><div className="summary-intro"><p>지금 확인할 일</p></div><ControlButton onClick={() => navigate('reviews')}><span>검토 대기</span><strong>{pending.length.toString().padStart(2, '0')}</strong><ArrowUpRight size={18} /></ControlButton><ControlButton onClick={() => navigate('documents')}><span>문서·기록</span><strong>{documents.length.toString().padStart(2, '0')}</strong><ArrowUpRight size={18} /></ControlButton><ControlButton onClick={() => navigate('documents')}><span>확정한 문서</span><strong>{documents.filter((doc) => doc.baseline_revision_id).length.toString().padStart(2, '0')}</strong><ArrowUpRight size={18} /></ControlButton><div className="summary-running"><span className={hasActiveJobs ? 'pulse-dot' : 'status-dot'} /><span>{hasActiveJobs ? `${jobs.filter((job) => ACTIVE.has(job.status)).length}개 작업 처리 중` : '진행 중인 분석이 없습니다'}</span></div></div>{failedJobCount > 0 ? <Notice className="notice warning processing-alert" role="status"><AlertTriangle size={18} /><div><strong>확인이 필요한 분석 {failedJobCount}건</strong><p>실행 이력과 오류를 확인한 뒤 검토를 이어가 주세요.</p></div><Button asChild variant="ghost"><a href="#analysis-jobs">분석 작업 확인<ArrowRight size={14} /></a></Button></Notice> : null}<div className="dashboard-columns"><section className="main-column"><SectionHeading eyebrow="REVIEW INBOX" title="결정을 기다리는 변경"><TextLink onClick={() => navigate('reviews')}>모든 검토</TextLink></SectionHeading><ReviewList reviews={pending.slice(0, 5)} failedJobCount={failedJobCount} documents={documents} onOpen={openReview} emptyAction={canWrite ? <Button variant="secondary" icon={FilePlus2} onClick={() => setModal({ type: 'upload', returnTab: tab })}>첫 기록 등록하기</Button> : null} /><div className="section-spacer" /><SectionHeading eyebrow="DOCUMENT LIBRARY" title="프로젝트 문서·기록"><TextLink onClick={() => navigate('documents')}>보관함으로</TextLink></SectionHeading><DocumentList documents={documents.slice(0, 4)} onRevision={revision => navigate('source-review', {revisionId:revision.id})} onUpload={(doc) => setModal({ type: 'upload', doc })} canWrite={canWrite} compact /></section><aside className="context-column"><div className="workflow-note"><h3>근거가 있는 변경,<br />명확한 다음 기준.</h3><ol><li><span>01</span><div><strong>원문 등록</strong><p>문서와 위치 정보를 함께 보존</p></div></li><li><span>02</span><div><strong>AI 분석 · 사람의 검토</strong><p>차이와 영향, 확인할 질문 정리</p></div></li><li><span>03</span><div><strong>결정 후 확정본 지정</strong><p>승인된 버전을 새 기준으로 반영</p></div></li></ol><p className="workflow-footnote"><ShieldCheck size={15} />AI 결과는 자동으로 승인되지 않습니다.</p></div><SectionHeading eyebrow="RECENT ACTIVITY" title="최근 기록" /><Feed feed={feed.slice(0, 5)} compact /></aside></div><JobList jobs={jobs.filter((job) => ['failed', 'uncertain', 'running', 'queued'].includes(job.status))} role={role} onRetry={(job) => setModal({ type: 'retry', job })} /></> : tab === 'reviews' ? <ReviewsPage reviews={reviews} documents={documents} onOpen={openReview} /> : tab === 'documents' ? <UnifiedRecordLibrary key={project.id} project={project} documents={documents} domains={domains} request={request} canWrite={canWrite} canReview={canReview} onUpload={(doc) => setModal({type:'upload',doc})} onReviewRevision={revisionId => navigate('source-review', {revisionId})} onReviewCommercial={({documentId,revisionId}) => navigate('source-review', {commercialRevisionId:revisionId,commercialDocumentId:documentId})} onDomainCreate={() => setModal({type:'domain'})} onOpenCommercial={documentId => navigate('commercial', {commercialDocumentId:documentId})} onOpenTool={next => navigate(next)} /> : tab === 'source-review' ? <SourceReviewWorkspace key={`${project.id}:${navigationTarget?.revisionId || navigationTarget?.commercialRevisionId || ''}`} project={project} documents={documents} reviews={reviews} jobs={jobs} request={request} canWrite={canWrite} canReview={canReview} onChanged={refresh} notify={notify} onDirty={setCommercialDirty} guardNavigation={guardNavigation} onOpenContext={ref => { if (ref?.type === 'candidate') navigate('context',{candidateId:ref.id}); else if (ref?.type === 'ai_run') navigate('context',{contextView:'ai',aiRunId:ref.id}); else if (ref) setModal({type:'source',source:ref}); else navigate('context'); }} onOpenRecords={() => navigate('documents')} onOpenCommercial={documentId => navigate('commercial', {commercialDocumentId:documentId})} initialRevisionId={navigationTarget?.revisionId} initialCommercialRevisionId={navigationTarget?.commercialRevisionId} initialCommercialDocumentId={navigationTarget?.commercialDocumentId} onRetry={job => setModal({type:'retry',job})} onOpenWorkItems={() => navigate('work-items')} onOpenQuestions={() => navigate('questions')} /> : tab === 'domain-guide' ? <DomainGuide key={project.id} project={project} request={request} notify={notify} onDirty={setCommercialDirty} onSourceRevision={revisionId => navigate('source-review', {revisionId})} onOpenSettings={() => navigate('settings')} /> : tab === 'context' ? <MainContextWorkspace key={`${project.id}:${activeStep?.id}:${navigationTarget?.candidateId || navigationTarget?.aiRunId || ''}`} initialView={activeStep?.id === 'knowledge' ? 'knowledge' : navigationTarget?.candidateId ? 'review' : navigationTarget?.contextView || 'context'} initialCandidateId={navigationTarget?.candidateId} initialAIRunId={navigationTarget?.aiRunId} project={project} domains={domains} request={request} canWrite={canWrite} canReview={canReview} onChanged={refresh} notify={notify} onDirty={setCommercialDirty} onOpenRecord={(ref) => { if (ref.type === 'revision' && ref.document_id) { const doc=documents.find(d => d.id === ref.document_id); if(doc) setModal({type:'revision',revision:{id:ref.id},doc}); } else if(ref.type === 'commercial_revision') navigate('commercial'); else if(ref.type === 'channel_inbox') navigate('channels', { inboxId: ref.id }); else if(ref.type === 'work_item') navigate('work-items'); else if(ref.type === 'transcription') navigate('transcriptions'); else if(ref.type === 'question') navigate('questions', { questionId: ref.id }); else if(ref.type === 'work_artifact') navigate('work-governance'); }} onOpenWorkItem={() => navigate('work-items')} /> : tab === 'integrations' ? <IntegrationsWorkspace key={project.id} project={project} onNavigate={navigate} request={request} canReview={canReview} notify={notify} onChanged={refresh} onDirty={setCommercialDirty} /> : tab === 'transcriptions' ? <TranscriptionWorkspace key={project.id} project={project} request={request} canWrite={canWrite} canReview={canReview} notify={notify} onChanged={refresh} onDirty={setCommercialDirty} /> : tab === 'channels' ? <ChannelInbox key={project.id} project={project} domains={domains} request={request} canWrite={canWrite} canReview={canReview} onChanged={refresh} notify={notify} onDirty={setCommercialDirty} guardNavigation={guardNavigation} initialItemId={navigationTarget?.inboxId} onOpenClassification={id => navigate('work-governance', { classificationId: id })} onOpenQuestion={id => navigate('questions', { questionId: id })} onOpenSource={source => setModal({ type: 'source', source })} /> : tab === 'commercial' ? <CommercialWorkspace key={`${project.id}:${navigationTarget?.commercialDocumentId || ''}`} initialDocumentId={navigationTarget?.commercialDocumentId} onDirty={setCommercialDirty} dirty={commercialDirty} guardNavigation={guardNavigation} project={project} documents={documents} request={request} canWrite={canWrite} canReview={canReview} notify={notify} onUpload={() => setModal({ type: 'upload', returnTab: tab })} onSettings={() => navigate('settings')} onChanged={refresh} /> : tab === 'implementation' ? <ImplementationWorkspace key={project.id} project={project} documents={documents} request={request} canWrite={canWrite} canReview={canReview} onSettings={() => navigate('settings')} onWorkItems={target => navigate('work-items', target)} onGovernance={() => navigate('work-governance')} onDelivery={() => navigate('github-delivery')} notify={notify} /> : tab === 'work-items' ? <WorkItems key={`${project.id}:${navigationTarget?.workItemId || navigationTarget?.automationTaskId || navigationTarget?.taskDraftId || navigationTarget?.implementationNoteId || ''}`} initialItemId={navigationTarget?.workItemId} initialAutomationTarget={navigationTarget?.automationTaskId ? {type:'automation_task',id:navigationTarget.automationTaskId} : navigationTarget?.taskDraftId ? {type:'task_draft',id:navigationTarget.taskDraftId} : navigationTarget?.implementationNoteId ? {type:'implementation_note',id:navigationTarget.implementationNoteId} : null} onOpenSourceRevision={revisionId => navigate('source-review', {revisionId})} projectId={project.id} request={request} role={role} userId={sharedView?.source_user_id || session.user.id} notify={notify} onChanged={refresh} onDirty={setCommercialDirty} onOpenSettings={() => navigate('settings')} onOpenQuestions={() => navigate('questions')} onOpenImplementation={() => navigate('implementation')} onOpenGovernance={() => navigate('work-governance')} /> : tab === 'work-governance' ? <WorkGovernancePanel key={project.id} initialClassificationId={navigationTarget?.classificationId} project={project} request={request} canWrite={canWrite} canReview={canReview} onDirtyChange={setCommercialDirty} notify={notify} onOpenQuestions={() => navigate('questions')} onOpenImplementation={() => navigate('implementation')} onOpenWorkItems={() => navigate('work-items')} onOpenSource={source => setModal({type:'source',source})} /> : tab === 'github-delivery' ? <GitHubDeliveryPanel key={project.id} project={project} request={request} canReview={canReview} notify={notify} onDirty={setCommercialDirty} onSettings={() => navigate('settings')} /> : tab === 'questions' ? <QuestionsPanel key={project.id} initialQuestionId={navigationTarget?.questionId} project={project} request={request} canWrite={canWrite} canReview={canReview} notify={notify} onChanged={refresh} onDirty={setCommercialDirty} /> : tab === 'members' ? <ProjectMembers key={project.id} projectId={project.id} userId={session.user.id} request={request} onDirty={setCommercialDirty} onOpenWorkItems={() => navigate('work-items')} /> : tab === 'settings' ? <React.Fragment key={project.id}><ProjectSettings project={project} request={request} onChanged={projectSettingsChanged} onDirty={setRepositoryDirty} onImplementation={() => navigate('implementation')} notify={notify} />{role === 'owner' ? <ExecutionQueueSettings project={project} request={request}/> : null}<AIProviderSettings project={project} request={request} notify={notify} onDirty={setProviderDirty}/></React.Fragment> : <section className="activity-panel"><Feed feed={feed} /></section> : null}
        {role === 'viewer' ? <div className="role-note"><ShieldCheck size={15} />현재 열람 권한으로 접속했습니다. 등록·답변·결정은 프로젝트 담당자에게 요청해 주세요.</div> : null}
      </>}
    </main></WorkspaceShell>
    {pendingNavigation ? <Modal title="저장하지 않은 내용이 있습니다" onClose={() => setPendingNavigation(null)}><div className="modal-body"><p className="form-intro">이동하면 현재 편집 내용이 사라집니다. 계속 작성하여 저장하거나, 변경을 버리고 이동하세요.</p></div><footer className="modal-actions"><Button variant="secondary" onClick={() => setPendingNavigation(null)}>계속 작성</Button><Button onClick={() => { const action = pendingNavigation; setPendingNavigation(null); clearDirty(); action(); }}>변경 버리고 이동</Button></footer></Modal> : null}
    {modal?.type === 'source' && project ? <ContextSourceDetail route={`${projectPath(project.id)}/context`} request={request} sourceRef={modal.source} onClose={() => setModal(null)} /> : null}
    {modal?.type === 'journey-source' && project ? <JourneySourceDetail key={`${project.id}:${modal.source.type}:${modal.source.id}`} projectId={project.id} request={request} sourceRef={modal.source} onClose={() => setModal(null)} onOpenSource={openJourneySource} /> : null}
    {modal?.type === 'share' && !sharedView && role === 'owner' ? <SharedViewManager projects={projects} currentProject={project} request={request} notify={notify} onClose={() => setModal(null)} /> : null}
    {modal?.type === 'project' && !sharedView ? <ProjectModal request={request} onClose={() => setModal(null)} onCreated={async (newProject) => { await loadProjects(); setUnavailableProject(false); setProjectId(newProject.id); setTab('documents'); setModal(null); notify('프로젝트와 Nora 워크스페이스 ID를 등록했습니다. 프로젝트 설정에서 연결 상태를 확인하세요.'); }} /> : null}
    {modal?.type === 'domain' && project && canReview ? <DomainModal project={project} request={request} onClose={() => setModal(null)} onCreated={() => changed('업무 영역을 추가했습니다.')} /> : null}
    {modal?.type === 'upload' && project && canWrite ? <UploadModal key={modal.initialRevision?.id || modal.doc?.id || 'new'} project={project} doc={modal.doc} documents={documents} domains={domains} initialRevision={modal.initialRevision} request={request} onClose={() => setModal(null)} onDone={async (saved) => { setModal(null); setTab('source-review'); setPreferredStep('context'); setNavigationTarget({revisionId:saved.revision_id}); notify('자료를 등록했습니다. 원문 추출 후 Nora 분석을 진행합니다.'); await refresh({quiet:true}); }} /> : null}
    {modal?.type === 'revision' && project ? <RevisionModal project={project} doc={modal.doc} revisionId={modal.revision.id} request={request} canWrite={canWrite} canReview={canReview} onClose={() => setModal(null)} onChanged={changed} onEdit={(revision) => setModal({ type: 'upload', doc: modal.doc, initialRevision: revision })} onImplementation={() => { setModal(null); navigate('implementation'); }} onReview={(id) => { setModal(null); openReview(id); refresh(); }} /> : null}
    {modal?.type === 'retry' && project && canWrite ? <RetryModal project={project} job={modal.job} request={request} onClose={() => setModal(null)} onDone={() => changed('작업을 다시 대기열에 넣었습니다.')} /> : null}
    {appearanceOpen ? <AppearanceSettings onLanguageChange={language => {
      setAppearanceOpen(false);
      guardNavigation(() => {
        rememberWorkspaceReturn(workspaceStorage(window), { projectId, tab, workflowStep: activeStep?.id });
        changeUiLanguage(language, window);
      });
    }} onClose={() => { setAppearanceOpen(false); if (window.location.pathname === '/ctds') window.history.replaceState(null, '', `/?ui_lang=${getLocale()}`); }} /> : null}
    {toast ? <Toast message={toast} onClose={closeToast} /> : null}
    {guideOpen ? <Modal title="AINS 사용 안내" onClose={() => setGuideOpen(false)}><div className="unified-help"><p>자료 등록 → 내용 검토·확정 → 작업 배정 → 실행·결과 검토</p><ul><li><strong>자료·기록:</strong> 파일을 올리거나 문서·회의록을 직접 작성합니다.</li><li><strong>요구사항·결정:</strong> 원문과 Nora 분석을 비교하고 반영할 내용을 확정합니다.</li><li><strong>작업·고객 질문:</strong> 담당자·기한·진행 상태와 고객 답변을 관리합니다.</li><li><strong>AI 개발:</strong> AI 작업을 실행하고 코드·테스트 결과를 검토합니다.</li><li><strong>도메인 가이드:</strong> 프로젝트의 용어·업무 흐름·확정 정책을 학습합니다.</li><li><strong>재사용 자료:</strong> 검토한 해결 사례를 현재 프로젝트에 활용합니다.</li></ul><p>AI 분석은 초안입니다. 검토 후 확정한 내용이 프로젝트 기준에 반영됩니다.</p></div></Modal> : null}
  </SharedViewContext.Provider>;
}

function ReviewList({ reviews, documents, onOpen, emptyAction, failedJobCount = 0 }) {
  if (!reviews.length) return <Empty icon={failedJobCount ? AlertTriangle : CheckCheck} title={failedJobCount ? '분석 확인 후 검토를 이어갈 수 있습니다' : '검토할 변경이 없습니다'} action={failedJobCount ? <Button asChild variant="secondary"><a href="#analysis-jobs">분석 작업 확인</a></Button> : emptyAction}>{failedJobCount ? '확인이 필요한 분석 작업이 있어 검토 결과가 아직 준비되지 않았습니다.' : <>확정본이 있는 문서의 새 버전을 등록하면<br />변경 검토를 시작할 수 있습니다.</>}</Empty>;
  const names = new Map(documents.map((doc) => [doc.id, doc.title]));
  return <div className="review-list">{reviews.map((review, index) => <ControlButton key={review.id} className="review-row" onClick={() => onOpen(review.id)}><span className="row-number">{String(index + 1).padStart(2, '0')}</span><div className="review-row-main"><div className="row-title"><strong>{names.get(review.document_id) || review.title || review.document_title || '문서 변경 검토'}</strong><Badge status={review.status} /></div><p><span>{shortId(review.baseline_revision_id)}</span><ArrowRight size={12} /><span>{shortId(review.current_revision_id)}</span><i />{dateTime(review.created_at)}</p></div><ChevronRight size={19} /></ControlButton>)}</div>;
}

function ReviewsPage({ reviews, documents, onOpen }) {
  const [filter, setFilter] = useState('pending');
  const filtered = reviews.filter((review) => filter === 'all' || (filter === 'pending' ? REVIEWABLE.has(review.status) : filter === 'processing' ? ['queued', 'running', 'failed', 'blocked', 'uncertain'].includes(review.status) : ['published', 'rejected'].includes(review.status)));
  return <section><Tabs value={filter} onValueChange={setFilter} size="sm" variant="underline"><Tabs.List aria-label="검토 상태 필터">{[['pending', '검토 대기'], ['processing', '처리 중 · 확인 필요'], ['completed', '결정 완료'], ['all', '전체']].map(([id, name]) => <Tabs.Trigger key={id} value={id}>{name}{filter === id ? <span> {filtered.length}</span> : null}</Tabs.Trigger>)}</Tabs.List><Tabs.Panel value={filter}><ReviewList reviews={filtered} documents={documents} onOpen={onOpen} /></Tabs.Panel></Tabs></section>;
}

function JobList({ jobs, role, onRetry }) {
  if (!jobs.length) return null;
  return <section className="jobs-panel" id="analysis-jobs" tabIndex={-1}><SectionHeading eyebrow="PROCESSING" title="분석 작업" /><div className="jobs-table">{jobs.map((job) => <div className="job-row" key={job.id}><div className="job-type"><span className="mono">{shortId(job.id)}</span><strong>{job.kind === 'intake' ? '문서 추출 · 내용 정리' : '요구사항 변경 검토'}</strong></div><div className="job-state"><Badge status={job.status} />{job.error_code ? <code>{job.error_code}</code> : job.stage ? <small>{STAGE_LABELS[job.stage] || '상태 확인 중'}</small> : null}</div><span className="muted">{dateTime(job.updated_at || job.created_at)}</span>{['failed', 'uncertain'].includes(job.status) ? <Button variant="secondary" disabled={role === 'viewer' || (job.status === 'uncertain' && role !== 'owner')} onClick={() => onRetry(job)}>재시도 검토</Button> : null}{job.status === 'uncertain' ? <p className="job-explanation">Nora에서 완료되었을 수 있습니다. 관리자가 실행 이력을 확인한 후 재시도를 결정해야 합니다.</p> : null}</div>)}</div></section>;
}

function Feed({ feed, compact = false }) {
  if (!feed.length) return <div className="feed-empty"><Activity size={18} /><p>첫 활동부터 이곳에 기록됩니다.</p></div>;
  return <ol className={`feed ${compact ? 'compact' : ''}`}>{feed.map((event) => <li key={event.id}><span className="feed-dot" /><div><div className="feed-title"><strong>{EVENT_LABELS[event.kind] || '프로젝트 활동'}</strong><time>{dateTime(event.created_at)}</time></div><p>{event.detail?.title || event.detail?.filename || event.detail?.name || event.detail?.review?.reason || event.detail?.reason || event.detail?.answer || `기록 ${shortId(event.entity_id)}`}</p>{!compact ? <span className="feed-meta">{event.actor_name || event.actor_email || (event.actor_id ? `구성원 ${shortId(event.actor_id)}` : '시스템')} · {shortId(event.entity_id)}</span> : null}</div></li>)}</ol>;
}
