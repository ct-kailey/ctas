import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpRight, CheckCheck, Code2, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, FilePlus2, Files, FolderKanban, Inbox, LayoutDashboard, LogOut, Menu, Plus, Settings2, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { api } from './api.js';
import { Badge, Button, Empty, ErrorNotice, Modal, ROLES, SectionHeading, Spinner, TextLink, Toast, dateTime, projectPath, shortId } from './ui.jsx';
import { ProjectModal, RevisionModal, RetryModal } from './operations.jsx';
import { DocumentLibrary, DocumentList, DomainModal, UploadModal } from './records.jsx';
import { ReviewDetail } from './review.jsx';
import { Login } from './Login.jsx';
import { AppearanceSettings } from './appearance.jsx';
import { ChannelInbox } from './channels.jsx';
import { ImplementationWorkspace, ProjectSettings } from './implementation.jsx';
import { WorkItems } from './work-items.jsx';
import { CommercialWorkspace } from './commercial.jsx';
import { MainContextWorkspace, ContextSourceDetail } from './context.jsx';
import { IntegrationsWorkspace } from './integrations.jsx';
import { TranscriptionWorkspace } from './transcription.jsx';
import { WorkGovernancePanel } from './work-governance.jsx';
import { QuestionsPanel } from './questions.jsx';
import { GitHubDeliveryPanel } from './github-delivery.jsx';
import { ExecutionQueueSettings } from './execution-queue.jsx';
import { AIProviderSettings } from './provider-settings.jsx';

const NAV = [{ id: 'context', label: 'Main Context', icon: Sparkles }, { id: 'commercial', label: '계약·기획', icon: FilePlus2 }, { id: 'overview', label: '작업 현황', icon: LayoutDashboard }, { id: 'reviews', label: '변경 검토', icon: ClipboardCheck }, { id: 'documents', label: '문서·기록 보관함', icon: Files }, { id: 'channels', label: '수집·검토함', icon: Inbox }, { id: 'integrations', label: '외부 채널 연결', icon: Activity }, { id: 'transcriptions', label: '회의 전사', icon: FilePlus2 }, { id: 'implementation', label: 'AI 구현 작업', icon: Code2 }, { id: 'work-governance', label: '업무 실행 검토', icon: ShieldCheck }, { id: 'github-delivery', label: 'GitHub PR 발행', icon: Code2 }, { id: 'questions', label: '질문·응답 대기', icon: CircleHelp }, { id: 'work-items', label: '기능별 작업', icon: FolderKanban }, { id: 'settings', label: '프로젝트 설정', icon: Settings2 }, { id: 'activity', label: '활동 기록', icon: Activity }];
const ACTIVE = new Set(['queued', 'running']);
const REVIEWABLE = new Set(['needs_review', 'no_change', 'approved']);
const EVENT_LABELS = {
  'commercial.profile_updated': '프로젝트·기업 정보 변경', 'commercial.template_created': '계약 문서 양식 등록', 'commercial.revision_created': '계약 문서 버전 저장', 'commercial.revision_approved': '계약 문서 내부 승인', 'commercial.revision_rejected': '계약 문서 반려', 'commercial.rewrite_requested': 'Nora 문서 보정 요청', 'commercial.rewrite_started': 'Nora 문서 보정 시작', 'commercial.rewrite_needs_review': 'Nora 문서 보정 완료', 'commercial.rewrite_failed': 'Nora 문서 보정 실패', 'commercial.rewrite_uncertain': 'Nora 보정 결과 확인 필요', 'commercial.rewrite_applied': 'Nora 보정안 적용', 'commercial.feedback_recorded': '고객 협의 요청 기록', 'commercial.feedback_answered': '고객 답변 기록', 'commercial.stage_changed': '계약 진행 단계 변경', 'commercial.confirmation_invalidated': '계약 재협의 전환',
  'project.created': '프로젝트 생성', 'domain.created': '업무 영역 생성', 'revision.uploaded': '문서 리비전 등록', 'revision.recorded': '텍스트 기록 등록',
  'baseline.initial_published': '첫 기준선 발행', 'review.requested': '변경 검토 요청',
  'review.question_answered': '질문에 답변', 'review.approved': '변경 승인', 'review.rejected': '변경 반려',
  'baseline.published': '새 기준선 발행', 'job.retry_requested': '작업 재시도 요청',
  'job.started': '분석 작업 시작', 'job.succeeded': '분석 작업 완료', 'job.failed': '분석 작업 실패',
  'job.uncertain': '분석 결과 확인 필요',
  'channel.source_created': '대화 출처 준비', 'channel.source_updated': '대화 출처 설정 변경',
  'implementation.settings_updated': '프로젝트 구현 설정 변경', 'implementation.repository_checked': '저장소 확인',
  'implementation.plan_requested': 'AI 작업 계획 요청', 'implementation.plan_approved': 'AI 작업 계획 승인', 'implementation.plan_rejected': 'AI 작업 계획 반려', 'implementation.execution_requested': '코드 변경안 실행 요청',
  'work_item.imported': '기능별 작업 등록', 'work_item.updated': '기능별 작업 변경',
  'channel.collected': '대화 수집', 'channel.accepted': '검토한 대화 기록 등록', 'channel.dismissed': '대화 보관 제외',
};
const STAGE_LABELS = { queued: '실행 대기', extracting: '원문 추출', review_preparing: '검토 준비', pipeline_intent: 'Nora 문서 처리', review_intent: 'Nora 변경 검토', completed: '처리 완료' };


export default function App() {
  const [appearanceOpen, setAppearanceOpen] = useState(() => window.location.pathname === '/ctds');
  const [session, setSession] = useState(null), [booting, setBooting] = useState(true), [bootError, setBootError] = useState(null);
  const [projects, setProjects] = useState([]), [projectId, setProjectId] = useState('');
  const [overview, setOverview] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(null);
  const [tab, setTab] = useState('overview'), [reviewId, setReviewId] = useState(null), [modal, setModal] = useState(null), [toast, setToast] = useState(''), [mobileMenu, setMobileMenu] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState(null);
  const [commercialDirty, setCommercialDirty] = useState(false), [pendingNavigation, setPendingNavigation] = useState(null);
  function guardNavigation(action) { if (commercialDirty) setPendingNavigation(() => action); else action(); }
  useEffect(() => { if (!commercialDirty) return; const warn = (event) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [commercialDirty]);
  const requestSeq = useRef(0), bootRequest = useRef({ sequence: 0, controller: null });
  const notify = useCallback((message) => setToast(message), []);
  const closeToast = useCallback(() => setToast(''), []);
  const request = useCallback(async (path, options = {}) => {
    try { return await api(path, { ...options, csrfToken: session?.csrfToken }); }
    catch (err) { if (err.status === 401) { setSession(null); setProjects([]); setProjectId(''); setOverview(null); setModal(null); setReviewId(null); } throw err; }
  }, [session?.csrfToken]);
  const bootstrap = useCallback(async () => {
    bootRequest.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++bootRequest.current.sequence;
    bootRequest.current.controller = controller;
    setBootError(null); setBooting(true);
    try {
      const data = await api('/api/session', { signal: controller.signal });
      if (sequence === bootRequest.current.sequence) setSession(data);
    } catch (err) {
      if (sequence === bootRequest.current.sequence && err.name !== 'AbortError') {
        if (err.status === 401) setSession(null); else setBootError(err);
      }
    } finally {
      if (sequence === bootRequest.current.sequence) setBooting(false);
    }
  }, []);
  useEffect(() => {
    bootstrap();
    return () => { bootRequest.current.sequence += 1; bootRequest.current.controller?.abort(); };
  }, [bootstrap]);
  const loadProjects = useCallback(async () => {
    const result = await request('/api/projects'); setProjects(result.projects);
    setProjectId((id) => result.projects.some((p) => p.id === id) ? id : result.projects[0]?.id || '');
    return result.projects;
  }, [request]);
  useEffect(() => { if (!session?.user) return; let active = true; loadProjects().catch((err) => { if (active) setError(err); }); return () => { active = false; }; }, [session?.user?.id, loadProjects]);
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!projectId) return;
    const sequence = ++requestSeq.current;
    if (!quiet) setLoading(true);
    try { const data = await request(`${projectPath(projectId)}/overview`); if (requestSeq.current === sequence) { setOverview(data); setError(null); } }
    catch (err) { if (requestSeq.current === sequence) setError(err); }
    finally { if (requestSeq.current === sequence) setLoading(false); }
  }, [projectId, request]);
  useEffect(() => { setNavigationTarget(null); setOverview(null); setReviewId(null); setModal(null); setError(null); refresh(); return () => { requestSeq.current += 1; }; }, [refresh]);
  const hasActiveJobs = (overview?.jobs || []).some((job) => ACTIVE.has(job.status));
  useEffect(() => { if (!projectId || !hasActiveJobs) return; const timer = setInterval(() => { if (!document.hidden) refresh({ quiet: true }); }, 5000); return () => clearInterval(timer); }, [hasActiveJobs, projectId, refresh]);
  const project = projects.find((p) => p.id === projectId), role = project?.role;
  const canWrite = ['owner', 'reviewer', 'member'].includes(role), canReview = ['owner', 'reviewer'].includes(role);
  const domains = overview?.domains || [], documents = overview?.documents || [], reviews = overview?.reviews || [], jobs = overview?.jobs || [], feed = overview?.feed || [];
  const pending = reviews.filter((review) => REVIEWABLE.has(review.status));
  const failedJobCount = overview?.counts?.failed_jobs ?? jobs.filter((job) => ['failed', 'uncertain'].includes(job.status)).length;
  function navigate(next, target = null) { guardNavigation(() => { setNavigationTarget(target); setTab(next); setReviewId(null); setMobileMenu(false); }); }
  function openReview(id) { guardNavigation(() => { setTab('reviews'); setReviewId(id); setMobileMenu(false); }); }
  async function logout() { setCommercialDirty(false); try { await request('/api/auth/logout', { method: 'POST', body: {} }); setSession(null); setOverview(null); setProjectId(''); setProjects([]); setModal(null); setReviewId(null); } catch (err) { setError(err); } }
  async function changed(message) { setModal(null); notify(message); await refresh(); }
  if (booting) return <div className="boot-screen"><span className="wordmark">ains<span>●</span></span><Spinner label="작업실을 준비하고 있습니다" /></div>;
  if (bootError) return <div className="boot-screen"><ErrorNotice error={bootError} onRetry={bootstrap} /></div>;
  if (!session?.user) return <Login onLogin={(data) => { setError(null); setSession(data); }} />;

  return <div className="app-shell"><a href="#workspace" className="skip-link">본문으로 바로가기</a>{mobileMenu ? <button className="sidebar-scrim" onClick={() => setMobileMenu(false)} aria-label="탐색 메뉴 닫기" /> : null}<aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`}><div className="sidebar-brand"><span className="wordmark">ains<span>●</span></span><span className="workspace-label">SI·SM 작업실</span><button className="icon-button mobile-only" onClick={() => setMobileMenu(false)} aria-label="메뉴 닫기"><X size={20} /></button></div><div className="project-switch"><label htmlFor="project-selector">프로젝트</label><div className="select-wrap"><FolderKanban size={17} /><select id="project-selector" value={projectId} onChange={(event) => { const next = event.target.value; guardNavigation(() => setProjectId(next)); }} aria-label="프로젝트 선택">{projects.length ? projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>) : <option value="">프로젝트 없음</option>}</select><ChevronDown size={14} /></div><button className="new-project" onClick={() => guardNavigation(() => setModal({ type: 'project' }))}><Plus size={14} />새 프로젝트</button></div><nav className="main-nav" aria-label="작업실 탐색">{NAV.map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} strokeWidth={1.7} /><span>{label}</span>{id === 'reviews' && pending.length ? <b>{pending.length}</b> : null}</button>)}</nav><div className="sidebar-bottom"><div className="nora-note"><span className="nora-symbol">n</span><div><strong>Connected with Nora</strong><span>분석은 AI가, 결정은 사람이.</span></div></div><div className="account"><span className="avatar">{(session.user.name || session.user.email || 'A').slice(0, 1).toUpperCase()}</span><div><strong>{session.user.name || session.user.email}</strong><span>{ROLES[role] || '워크스페이스 구성원'}</span></div><button className="icon-button" onClick={() => guardNavigation(logout)} aria-label="로그아웃" title="로그아웃"><LogOut size={17} /></button></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" aria-label="탐색 메뉴 열기" onClick={() => setMobileMenu(true)}><Menu size={21} /></button><span>AINS Workspace</span><ChevronRight size={13} /><strong>{NAV.find((item) => item.id === tab)?.label}</strong>{reviewId ? <><ChevronRight size={13} /><span>검토 상세</span></> : null}</div><div className="topbar-meta"><Button type="button" variant="secondary" onClick={() => guardNavigation(() => window.location.assign('/dashboard/'))}>대시보드 프리뷰</Button><Button type="button" variant="secondary" icon={Sparkles} onClick={() => guardNavigation(() => window.location.assign('/preview'))}>전체 흐름 프리뷰</Button><Button type="button" variant="secondary" className="appearance-trigger" icon={Settings2} onClick={() => setAppearanceOpen(true)}>화면 설정</Button></div></header><main id="workspace" tabIndex={-1} className="workspace"><ErrorNotice error={error} onRetry={() => projectId ? refresh() : loadProjects().catch(setError)} />
      {!project ? projects.length || loading ? <Spinner /> : <div className="onboarding"><span className="eyebrow">A NEW PLACE TO WORK</span><h1>첫 프로젝트를 시작하세요.</h1><p>문서를 모으고, 변경을 검토하고, 팀이 합의한 기준을 남깁니다.<br />프로젝트별로 접근 권한과 업무 기록을 관리합니다.</p><Button icon={Plus} onClick={() => guardNavigation(() => setModal({ type: 'project' }))}>프로젝트 만들기</Button><div className="onboarding-steps">{[['01', '문서 등록', '원문을 보존하고 내용을 추출합니다.'], ['02', '변경 검토', '이전 기준선과 비교하고 근거를 확인합니다.'], ['03', '기준선 발행', '사람의 결정으로 다음 기준을 확정합니다.']].map(([number, title, body]) => <div key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></div>)}</div></div> : <>
        {!reviewId ? <div className="page-heading"><div><div className="page-overline"><span className="eyebrow">PROJECT WORKSPACE</span><span className="domain-tag">{domains.length || 1}개 업무 영역</span></div><h1>{tab === 'overview' ? project.name : NAV.find((item) => item.id === tab)?.label}<span className="title-dot">.</span></h1><p>{({ context: '프로젝트의 근거와 결정, 질문과 변화를 연결하고 검토한 내용을 확정합니다.', commercial: '프로젝트 정보를 정리하고, 제안서·견적서·계약서를 작성해 검토와 고객 합의로 이어갑니다.', overview: '문서의 변화와 팀의 결정을 한곳에서 이어갑니다.', reviews: '바뀐 내용의 근거를 확인하고, 다음 기준을 결정합니다.', documents: '파일과 대화, 업무 결정을 영역별로 보관하고 시간의 흐름을 이어갑니다.', channels: '대화의 원문을 모으고, 사람이 확인한 결정과 맥락을 업무 기록으로 남깁니다.', integrations: '프로젝트별 수집 범위를 지정하고 외부 자료의 변화를 검토함으로 연결합니다.', transcriptions: '회의 녹음을 텍스트로 바꾸고 원문·시간 구간을 대조하여 맥락을 남깁니다.', implementation: '기획 기준선으로 작업을 계획하고, 사람이 승인한 범위의 코드 변경안을 요청합니다.', 'work-items': '승인한 계획을 담당자·기한·진행 상태로 이어가고, QA 결과와 결정 근거를 남깁니다.', settings: '프로젝트의 목표와 구현할 저장소, 기준 브랜치를 관리합니다.', activity: '등록부터 발행까지, 프로젝트의 결정 과정을 기록합니다.' })[tab]}</p></div><Button icon={Upload} onClick={() => setModal({ type: 'upload', returnTab: tab })} disabled={!canWrite} title={!canWrite ? '실무자 이상의 권한이 필요합니다.' : undefined}>문서·기록 등록</Button></div> : null}
        {loading && !overview ? <Spinner /> : overview ? reviewId ? <ReviewDetail key={`${projectId}:${reviewId}`} project={project} id={reviewId} request={request} canWrite={canWrite} canReview={canReview} onBack={() => setReviewId(null)} onChanged={refresh} notify={notify} onRetry={(job) => setModal({ type: 'retry', job })} /> : tab === 'overview' ? <><div className="workspace-summary"><div className="summary-intro"><span className="eyebrow">AT A GLANCE</span><p>지금 확인할 일</p></div><button onClick={() => navigate('reviews')}><span>검토 대기</span><strong>{pending.length.toString().padStart(2, '0')}</strong><ArrowUpRight size={18} /></button><button onClick={() => navigate('documents')}><span>문서·기록</span><strong>{documents.length.toString().padStart(2, '0')}</strong><ArrowUpRight size={18} /></button><button onClick={() => navigate('documents')}><span>발행된 기준선</span><strong>{documents.filter((doc) => doc.baseline_revision_id).length.toString().padStart(2, '0')}</strong><ArrowUpRight size={18} /></button><div className="summary-running"><span className={hasActiveJobs ? 'pulse-dot' : 'status-dot'} /><span>{hasActiveJobs ? `${jobs.filter((job) => ACTIVE.has(job.status)).length}개 작업 처리 중` : '진행 중인 분석이 없습니다'}</span></div></div>{failedJobCount > 0 ? <div className="notice warning processing-alert" role="status"><AlertTriangle size={18} /><div><strong>확인이 필요한 분석 {failedJobCount}건</strong><p>실행 이력과 오류를 확인한 뒤 검토를 이어가 주세요.</p></div><a href="#analysis-jobs" className="text-button">분석 작업 확인<ArrowRight size={14} /></a></div> : null}<div className="dashboard-columns"><section className="main-column"><SectionHeading eyebrow="REVIEW INBOX" title="결정을 기다리는 변경"><TextLink onClick={() => navigate('reviews')}>모든 검토</TextLink></SectionHeading><ReviewList reviews={pending.slice(0, 5)} failedJobCount={failedJobCount} documents={documents} onOpen={openReview} emptyAction={canWrite ? <Button variant="secondary" icon={FilePlus2} onClick={() => setModal({ type: 'upload', returnTab: tab })}>첫 기록 등록하기</Button> : null} /><div className="section-spacer" /><SectionHeading eyebrow="DOCUMENT LIBRARY" title="프로젝트 문서·기록"><TextLink onClick={() => navigate('documents')}>보관함으로</TextLink></SectionHeading><DocumentList documents={documents.slice(0, 4)} onRevision={(revision, doc) => setModal({ type: 'revision', revision, doc })} onUpload={(doc) => setModal({ type: 'upload', doc })} canWrite={canWrite} compact /></section><aside className="context-column"><div className="workflow-note"><span className="eyebrow">FROM SOURCE TO STANDARD</span><h3>근거가 있는 변경,<br />명확한 다음 기준.</h3><ol><li><span>01</span><div><strong>원문 등록</strong><p>문서와 위치 정보를 함께 보존</p></div></li><li><span>02</span><div><strong>AI 분석 · 사람의 검토</strong><p>차이와 영향, 확인할 질문 정리</p></div></li><li><span>03</span><div><strong>결정 후 기준선 발행</strong><p>승인된 버전을 새 기준으로 반영</p></div></li></ol><p className="workflow-footnote"><ShieldCheck size={15} />AI 결과는 자동으로 승인되지 않습니다.</p></div><SectionHeading eyebrow="RECENT ACTIVITY" title="최근 기록" /><Feed feed={feed.slice(0, 5)} compact /></aside></div><JobList jobs={jobs.filter((job) => ['failed', 'uncertain', 'running', 'queued'].includes(job.status))} role={role} onRetry={(job) => setModal({ type: 'retry', job })} /></> : tab === 'reviews' ? <ReviewsPage reviews={reviews} documents={documents} onOpen={openReview} /> : tab === 'documents' ? <><DocumentLibrary projectId={project.id} documents={documents} domains={domains} onRevision={(revision, doc) => setModal({ type: 'revision', revision, doc })} onUpload={(doc) => setModal({ type: 'upload', doc })} canWrite={canWrite} canReview={canReview} onDomainCreate={() => setModal({ type: 'domain' })} /><JobList jobs={jobs} role={role} onRetry={(job) => setModal({ type: 'retry', job })} /></> : tab === 'context' ? <MainContextWorkspace key={project.id} project={project} domains={domains} request={request} canWrite={canWrite} canReview={canReview} onChanged={refresh} notify={notify} onDirty={setCommercialDirty} onOpenRecord={(ref) => { if (ref.type === 'revision' && ref.document_id) { const doc=documents.find(d => d.id === ref.document_id); if(doc) setModal({type:'revision',revision:{id:ref.id},doc}); } else if(ref.type === 'commercial_revision') navigate('commercial'); else if(ref.type === 'channel_inbox') navigate('channels', { inboxId: ref.id }); else if(ref.type === 'work_item') navigate('work-items'); else if(ref.type === 'transcription') navigate('transcriptions'); else if(ref.type === 'question') navigate('questions', { questionId: ref.id }); else if(ref.type === 'work_artifact') navigate('work-governance'); }} onOpenWorkItem={() => navigate('work-items')} /> : tab === 'integrations' ? <IntegrationsWorkspace key={project.id} project={project} request={request} canReview={canReview} notify={notify} onChanged={refresh} onDirty={setCommercialDirty} /> : tab === 'transcriptions' ? <TranscriptionWorkspace key={project.id} project={project} request={request} canWrite={canWrite} canReview={canReview} notify={notify} onChanged={refresh} onDirty={setCommercialDirty} /> : tab === 'channels' ? <ChannelInbox key={project.id} project={project} domains={domains} request={request} canWrite={canWrite} canReview={canReview} onChanged={refresh} notify={notify} onDirty={setCommercialDirty} guardNavigation={guardNavigation} initialItemId={navigationTarget?.inboxId} onOpenClassification={id => navigate('work-governance', { classificationId: id })} onOpenQuestion={id => navigate('questions', { questionId: id })} onOpenSource={source => setModal({ type: 'source', source })} /> : tab === 'commercial' ? <CommercialWorkspace key={project.id} onDirty={setCommercialDirty} dirty={commercialDirty} guardNavigation={guardNavigation} project={project} documents={documents} request={request} canWrite={canWrite} canReview={canReview} notify={notify} onUpload={() => setModal({ type: 'upload', returnTab: tab })} onSettings={() => navigate('settings')} onChanged={refresh} /> : tab === 'implementation' ? <ImplementationWorkspace key={project.id} project={project} documents={documents} request={request} canWrite={canWrite} canReview={canReview} onSettings={() => navigate('settings')} onWorkItems={() => navigate('work-items')} onGovernance={() => navigate('work-governance')} onDelivery={() => navigate('github-delivery')} notify={notify} /> : tab === 'work-items' ? <WorkItems key={project.id} projectId={project.id} request={request} role={role} userId={session.user.id} notify={notify} onChanged={refresh} onOpenImplementation={() => navigate('implementation')} onOpenGovernance={() => navigate('work-governance')} /> : tab === 'work-governance' ? <WorkGovernancePanel key={project.id} initialClassificationId={navigationTarget?.classificationId} project={project} request={request} canWrite={canWrite} canReview={canReview} onDirtyChange={setCommercialDirty} notify={notify} onOpenQuestions={() => navigate('questions')} onOpenImplementation={() => navigate('implementation')} onOpenWorkItems={() => navigate('work-items')} onOpenSource={source => setModal({type:'source',source})} /> : tab === 'github-delivery' ? <GitHubDeliveryPanel key={project.id} project={project} request={request} canReview={canReview} notify={notify} onDirty={setCommercialDirty} /> : tab === 'questions' ? <QuestionsPanel key={project.id} initialQuestionId={navigationTarget?.questionId} project={project} request={request} canWrite={canWrite} canReview={canReview} notify={notify} onChanged={refresh} onDirty={setCommercialDirty} /> : tab === 'settings' ? <React.Fragment key={project.id}><ProjectSettings project={project} request={request} onImplementation={() => navigate('implementation')} notify={notify} />{role === 'owner' ? <ExecutionQueueSettings project={project} request={request}/> : null}<AIProviderSettings project={project} request={request} notify={notify} onDirty={setCommercialDirty}/></React.Fragment> : <section className="activity-panel"><Feed feed={feed} /></section> : null}
        {role === 'viewer' ? <div className="role-note"><ShieldCheck size={15} />현재 열람 권한으로 접속했습니다. 등록·답변·결정은 프로젝트 담당자에게 요청해 주세요.</div> : null}
      </>}
      <footer className="workspace-footer"><span>AINS SI·SM WORKSPACE</span><span>원문에서 결정까지, 모든 맥락을 함께.</span></footer>
    </main></div>
    {pendingNavigation ? <Modal title="저장하지 않은 내용이 있습니다" onClose={() => setPendingNavigation(null)}><div className="modal-body"><p className="form-intro">이동하면 현재 편집 내용이 사라집니다. 계속 작성하여 저장하거나, 변경을 버리고 이동하세요.</p></div><footer className="modal-actions"><Button variant="secondary" onClick={() => setPendingNavigation(null)}>계속 작성</Button><Button onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setCommercialDirty(false); action(); }}>변경 버리고 이동</Button></footer></Modal> : null}
    {modal?.type === 'source' && project ? <ContextSourceDetail route={`${projectPath(project.id)}/context`} request={request} sourceRef={modal.source} onClose={() => setModal(null)} /> : null}
    {modal?.type === 'project' ? <ProjectModal request={request} onClose={() => setModal(null)} onCreated={async (newProject) => { await loadProjects(); setProjectId(newProject.id); setTab('commercial'); setModal(null); notify('새 프로젝트가 준비되었습니다.'); }} /> : null}
    {modal?.type === 'domain' && project ? <DomainModal project={project} request={request} onClose={() => setModal(null)} onCreated={() => changed('업무 영역을 추가했습니다.')} /> : null}
    {modal?.type === 'upload' && project ? <UploadModal key={modal.initialRevision?.id || modal.doc?.id || 'new'} project={project} doc={modal.doc} documents={documents} domains={domains} initialRevision={modal.initialRevision} request={request} onClose={() => setModal(null)} onDone={async (saved) => { const registered = documents.find((item) => item.id === saved.document_id) || { id: saved.document_id, title: saved.title, domain_id: saved.domain_id, domain_name: domains.find((item) => item.id === saved.domain_id)?.name, record_kind: saved.record_kind, baseline_revision_id: null }; setTab(['commercial', 'context'].includes(tab) ? tab : 'documents'); setModal({ type: 'revision', doc: registered, revision: { id: saved.revision_id } }); notify('문서·기록을 등록했습니다. 추출·정리가 자동으로 시작됩니다.'); await refresh({ quiet: true }); }} /> : null}
    {modal?.type === 'revision' && project ? <RevisionModal project={project} doc={modal.doc} revisionId={modal.revision.id} request={request} canWrite={canWrite} canReview={canReview} onClose={() => setModal(null)} onChanged={changed} onEdit={(revision) => setModal({ type: 'upload', doc: modal.doc, initialRevision: revision })} onImplementation={() => { setModal(null); navigate('implementation'); }} onReview={(id) => { setModal(null); openReview(id); refresh(); }} /> : null}
    {modal?.type === 'retry' && project ? <RetryModal project={project} job={modal.job} request={request} onClose={() => setModal(null)} onDone={() => changed('작업을 다시 대기열에 넣었습니다.')} /> : null}
    {appearanceOpen ? <AppearanceSettings onClose={() => { setAppearanceOpen(false); if (window.location.pathname === '/ctds') window.history.replaceState(null, '', '/'); }} /> : null}
    {toast ? <Toast message={toast} onClose={closeToast} /> : null}
  </div>;
}

function ReviewList({ reviews, documents, onOpen, emptyAction, failedJobCount = 0 }) {
  if (!reviews.length) return <Empty icon={failedJobCount ? AlertTriangle : CheckCheck} title={failedJobCount ? '분석 확인 후 검토를 이어갈 수 있습니다' : '검토할 변경이 없습니다'} action={failedJobCount ? <a className="button secondary" href="#analysis-jobs">분석 작업 확인</a> : emptyAction}>{failedJobCount ? '확인이 필요한 분석 작업이 있어 검토 결과가 아직 준비되지 않았습니다.' : <>기준선이 있는 문서의 새 리비전을 등록하면<br />변경 검토를 시작할 수 있습니다.</>}</Empty>;
  const names = new Map(documents.map((doc) => [doc.id, doc.title]));
  return <div className="review-list">{reviews.map((review, index) => <button key={review.id} className="review-row" onClick={() => onOpen(review.id)}><span className="row-number">{String(index + 1).padStart(2, '0')}</span><div className="review-row-main"><div className="row-title"><strong>{names.get(review.document_id) || review.title || review.document_title || '문서 변경 검토'}</strong><Badge status={review.status} /></div><p><span>{shortId(review.baseline_revision_id)}</span><ArrowRight size={12} /><span>{shortId(review.current_revision_id)}</span><i />{dateTime(review.created_at)}</p></div><ChevronRight size={19} /></button>)}</div>;
}

function ReviewsPage({ reviews, documents, onOpen }) {
  const [filter, setFilter] = useState('pending');
  const filtered = reviews.filter((review) => filter === 'all' || (filter === 'pending' ? REVIEWABLE.has(review.status) : filter === 'processing' ? ['queued', 'running', 'failed', 'blocked', 'uncertain'].includes(review.status) : ['published', 'rejected'].includes(review.status)));
  return <section><div className="filter-tabs" role="tablist" aria-label="검토 상태 필터">{[['pending', '검토 대기'], ['processing', '처리 중 · 확인 필요'], ['completed', '결정 완료'], ['all', '전체']].map(([id, name]) => <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>{name}{filter === id ? <span>{filtered.length}</span> : null}</button>)}</div><ReviewList reviews={filtered} documents={documents} onOpen={onOpen} /></section>;
}

function JobList({ jobs, role, onRetry }) {
  if (!jobs.length) return null;
  return <section className="jobs-panel" id="analysis-jobs" tabIndex={-1}><SectionHeading eyebrow="PROCESSING" title="분석 작업" /><div className="jobs-table">{jobs.map((job) => <div className="job-row" key={job.id}><div className="job-type"><span className="mono">{shortId(job.id)}</span><strong>{job.kind === 'intake' ? '문서 추출 · 정규화' : '요구사항 변경 검토'}</strong></div><div className="job-state"><Badge status={job.status} />{job.error_code ? <code>{job.error_code}</code> : job.stage ? <small>{STAGE_LABELS[job.stage] || '상태 확인 중'}</small> : null}</div><span className="muted">{dateTime(job.updated_at || job.created_at)}</span>{['failed', 'uncertain'].includes(job.status) ? <Button variant="secondary" disabled={role === 'viewer' || (job.status === 'uncertain' && role !== 'owner')} onClick={() => onRetry(job)}>재시도 검토</Button> : null}{job.status === 'uncertain' ? <p className="job-explanation">Nora에서 완료되었을 수 있습니다. 관리자가 실행 이력을 확인한 후 재시도를 결정해야 합니다.</p> : null}</div>)}</div></section>;
}

function Feed({ feed, compact = false }) {
  if (!feed.length) return <div className="feed-empty"><Activity size={18} /><p>첫 활동부터 이곳에 기록됩니다.</p></div>;
  return <ol className={`feed ${compact ? 'compact' : ''}`}>{feed.map((event) => <li key={event.id}><span className="feed-dot" /><div><div className="feed-title"><strong>{EVENT_LABELS[event.kind] || '프로젝트 활동'}</strong><time>{dateTime(event.created_at)}</time></div><p>{event.detail?.title || event.detail?.filename || event.detail?.name || event.detail?.review?.reason || event.detail?.reason || event.detail?.answer || `기록 ${shortId(event.entity_id)}`}</p>{!compact ? <span className="feed-meta">{event.actor_name || event.actor_email || (event.actor_id ? `구성원 ${shortId(event.actor_id)}` : '시스템')} · {shortId(event.entity_id)}</span> : null}</div></li>)}</ol>;
}
