import React, { useId, useState } from 'react';
import { Activity, ArrowRight, Bell, CheckCheck, FilePlus2, Files, FolderKanban, RefreshCw } from 'lucide-react';
import { Badge, Button, Empty, ErrorNotice, ROLES, Spinner, Select, ControlButton } from './ui.jsx';
import { Tabs } from './ui.jsx';
import { MetricCard } from './components/ctds/MetricCard/MetricCard';
import { ListItem } from './components/ctds/ListItem/ListItem';
import { WORKFLOW_STEPS } from './workspace-flow.mjs';
import './workspace-home.css';

const GRADES = {
  urgent: { label: '긴급', tone: 'red' },
  check: { label: '확인 필요', tone: 'amber' },
  info: { label: '안내', tone: 'blue' },
};
const pageHref = (projectId, tab, step) => `/?${new URLSearchParams({project:projectId, tab, ...(step ? {step} : {})})}`;
function followInWorkspace(event, action) { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); action(); } }
const FILTERS = ['all', 'urgent', 'check', 'info'];
const GRADE_ORDER = { urgent: 0, check: 1, info: 2 };
const TAB_LABELS = {
  reviews: '변경 검토', documents: '문서·분석 확인', context: '요구사항·결정 검토',
  questions: '질문 확인', 'work-items': '작업 확인', channels: '수집 기록 검토',
};
const RULE_LABELS = {
  review_pending: '요구사항 검토 대기', review_no_change: '변경 없음 결과 검토',
  job_failed: '문서 분석 실패', job_uncertain: '문서 분석 결과 확인 필요',
  context_pending: '프로젝트 맥락 반영 대기', question_draft: '질문 전달 전 검토',
  question_answer_review: '고객 답변 검토 대기', question_overdue: '답변 기한 초과',
  question_waiting_long: '3일 이상 응답 대기', question_waiting: '고객 응답 대기',
  task_blocked_overdue: '보류 작업 마감 초과', task_blocked: '작업 보류', task_overdue: '작업 마감 초과',
  channel_evidence_changed: '수집 원문 변경', channel_failed: '대화 분석 실패',
  channel_uncertain: '대화 분석 결과 확인 필요', channel_review: '수집 기록 검토 대기',
};
const EVENT_LABELS = {
  'member.added': '구성원 추가', 'member.role_changed': '구성원 권한 변경', 'member.removed': '구성원 해제',
  'implementation.repository_access_updated': '저장소 읽기 연결 변경',
  'project.created': '프로젝트 생성', 'domain.created': '업무 영역 등록',
  'revision.uploaded': '문서 등록', 'revision.recorded': '기록 작성',
  'baseline.initial_published': '첫 확정본 지정', 'baseline.published': '확정본 갱신',
  'review.requested': '변경 검토 요청', 'review.approved': '변경 승인', 'review.rejected': '변경 반려',
  'review.question_answered': '검토 질문 답변', 'job.started': '문서 분석 시작',
  'job.succeeded': '문서 분석 완료', 'job.failed': '문서 분석 실패', 'job.uncertain': '분석 결과 확인 필요',
  'commercial.profile_updated': '프로젝트 정보 변경', 'commercial.revision_created': '계약 문서 작성',
  'commercial.revision_approved': '계약 문서 승인', 'commercial.feedback_recorded': '고객 협의 기록',
  'commercial.feedback_answered': '고객 답변 기록', 'commercial.stage_changed': '계약 단계 변경',
  'commercial.rewrite_applied': '문서 보정안 반영', 'commercial.rewrite_needs_review': '문서 보정 검토 요청',
  'implementation.plan_requested': 'AI 작업 계획 요청', 'implementation.plan_approved': 'AI 작업 계획 승인',
  'implementation.execution_requested': 'AI 구현 요청', 'work_item.imported': '기능별 작업 등록',
  'work_item.updated': '기능별 작업 변경', 'channel.collected': '대화 수집',
  'channel.accepted': '대화 기록 반영', 'channel.dismissed': '대화 보관 제외',
};
const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function displayDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? DATE_FORMAT.format(date) : '시각 정보 없음';
}
function textValue(...values) { return values.find(value => typeof value === 'string' && value.trim()) || ''; }
function orderedItems(attention) {
  return (attention?.items || []).slice().sort((a, b) =>
    (GRADE_ORDER[a.grade] ?? 2) - (GRADE_ORDER[b.grade] ?? 2)
    || String(b.created_at || '').localeCompare(String(a.created_at || ''))
    || a.id.localeCompare(b.id));
}
function AttentionRow({ item, onNavigate, documentLoading }) {
  const grade = GRADES[item.grade] || GRADES.info;
  return <article className="workspace-attention-row">
    <div className="workspace-attention-grade"><Badge tone={grade.tone}>{grade.label}</Badge></div>
    <div className="workspace-attention-main">
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <div className="workspace-home-meta">
        <span>{RULE_LABELS[item.rule] || '원본 업무 상태 기준'}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={item.created_at}>{displayDate(item.created_at)}</time>
      </div>
    </div>
    <div className="workspace-attention-action"><Button type="button" variant="secondary" rightIcon={<ArrowRight size={15} />} disabled={Boolean(documentLoading && item.target?.revisionId)} onClick={() => onNavigate(item.tab, item.target)}>{TAB_LABELS[item.tab] || '업무 확인'}</Button></div>
  </article>;
}
function AttentionList({ items, onNavigate, documentLoading = false, emptyTitle = '지금 확인할 알림이 없습니다', emptyDescription = '검토할 기록이나 응답 대기가 생기면 이곳에서 확인할 수 있습니다.' }) {
  return items.length ? <div className="workspace-home-panel workspace-home-flush">{items.map(item => <AttentionRow key={item.id} item={item} onNavigate={onNavigate} documentLoading={documentLoading} />)}</div>
    : <div className="workspace-home-panel"><Empty compact icon={CheckCheck} title={emptyTitle}>{emptyDescription}</Empty></div>;
}
function SectionHead({ title, count, children }) {
  return <div className="workspace-home-section-head"><h2>{title}{typeof count === 'number' ? <span className="workspace-home-heading-count">{count.toLocaleString()}</span> : null}</h2>{children}</div>;
}
function AttentionProjectSelect({ project, projects, onProjectSelect }) {
  const id = useId();
  return <div className="workspace-attention-project"><label htmlFor={id}>프로젝트</label><Select id={id} aria-label="알림 프로젝트 선택" value={project.id} onChange={event => onProjectSelect(event.target.value)}>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>;
}

/** One project, one workflow. This view links to existing source actions without approving or dismissing records. */
export function ProjectHome({ project, projects = [], overview, onNavigate, onProjectSelect, onUpload, onNewProject, attention, onRefreshAttention, attentionError, attentionLoading }) {
  const documents = overview?.documents || [];
  const recentDocuments = documents.slice().sort((a, b) => String(b.revisions?.[0]?.created_at || b.created_at || '').localeCompare(String(a.revisions?.[0]?.created_at || a.created_at || ''))).slice(0, 4);
  const counts = overview?.counts || {};
  const feed = overview?.feed || [];
  const items = orderedItems(attention).slice(0, 5);
  const canWrite = ['owner', 'reviewer', 'member'].includes(project?.role);
  const stats = [
    { label: '문서·기록', value: counts.documents ?? documents.length, tab: 'documents' },
    { label: '변경 검토 대기', value: counts.pending_reviews ?? (overview?.reviews || []).filter(item => ['needs_review', 'no_change'].includes(item.status)).length, tab: 'reviews' },
    { label: '확정한 문서', value: counts.baselines ?? documents.filter(item => item.baseline_revision_id).length, tab: 'documents' },
    { label: '진행 중인 분석', value: counts.active_jobs ?? (overview?.jobs || []).filter(item => ['queued', 'running'].includes(item.status)).length, tab: 'documents' },
  ];
  return <div className="workspace-home">
    <section className="workspace-home-section" aria-label="프로젝트 알림">
      <SectionHead title="지금 확인할 것" count={!attentionError && attention ? attention.counts.all : undefined}>
        <div className="workspace-attention-controls"><AttentionProjectSelect project={project} projects={projects} onProjectSelect={onProjectSelect} /><Button type="button" variant="ghost" rightIcon={<ArrowRight size={15} />} onClick={() => onNavigate('alerts')}>알림함 전체 보기</Button></div>
      </SectionHead>
      {attentionError ? <ErrorNotice error={attentionError} onRetry={onRefreshAttention} /> : attentionLoading && !attention ? <Spinner label="확인할 업무를 불러오고 있습니다" /> : attention ? <AttentionList items={items} onNavigate={onNavigate} /> : <p className="workspace-home-note" role="status">알림을 준비하고 있습니다.</p>}
      {attentionLoading && attention ? <p className="workspace-home-meta" role="status">알림을 갱신하고 있습니다.</p> : null}
      {attention && !attentionError && attention.counts.all > items.length ? <p className="workspace-home-meta">전체 {attention.counts.all.toLocaleString()}건 중 우선 확인할 {items.length}건입니다.</p> : null}
    </section>

    <section className="workspace-home-stats" aria-label="프로젝트 기록 현황">
      {stats.map(stat => <MetricCard key={stat.label} label={stat.label} value={stat.value.toLocaleString()} href={pageHref(project.id, stat.tab)} onClick={event => followInWorkspace(event, () => onNavigate(stat.tab))} variant="line" data-ctds="metric-card" />)}
    </section>

    <section className="workspace-home-section" aria-labelledby="workspace-flow-heading">
      <div className="workspace-home-section-head"><h2 id="workspace-flow-heading">업무 바로가기</h2></div>
      <ul className="workspace-home-flow">{WORKFLOW_STEPS.filter(area => !area.management).map(area => <li key={area.id}><ListItem className="workspace-home-flow-item" layout="stacked" from={area.label} body={area.description} trailing={<ArrowRight size={15} aria-hidden="true" />} href={pageHref(project.id, area.primaryTab, area.id)} onClick={event => followInWorkspace(event, () => onNavigate(area.primaryTab, { workflowStep: area.id }))} data-ctds="list-item" /></li>)}</ul>
      <p className="workspace-home-note">정해진 순서는 없습니다. 작업 중에도 자료·요구사항·계약을 추가하거나 수정할 수 있습니다.</p>
    </section>

    <div className="workspace-home-columns">
      <section className="workspace-home-section" aria-label="최근 문서">
        <SectionHead title="최근 문서·기록"><Button type="button" variant="ghost" onClick={() => onNavigate('documents')}>전체 보기</Button></SectionHead>
        <div className="workspace-home-panel workspace-home-flush">
          {recentDocuments.length ? recentDocuments.map(document => <ControlButton type="button" key={document.id} className="workspace-home-record" onClick={() => onNavigate('documents', document.revisions?.[0]?.id ? { revisionId: document.revisions[0].id } : undefined)}><Files size={17} aria-hidden="true" /><span><strong>{document.title}</strong><small>{document.domain_name || '프로젝트 자료'} · 버전 {document.revisions?.length || 0}</small></span><Badge status={document.revisions?.[0]?.status || 'draft'}>{document.revisions?.[0]?.status ? undefined : '초안'}</Badge></ControlButton>) : <Empty compact icon={Files} title="등록된 자료가 없습니다" action={canWrite && onUpload ? <Button type="button" variant="secondary" icon={FilePlus2} onClick={onUpload}>첫 자료 등록</Button> : null}>기획 문서, 계약서, 대화 기록을 모아 검토를 시작하세요.</Empty>}
        </div>
      </section>
      <section className="workspace-home-section" aria-label="최근 활동">
        <SectionHead title="최근 활동"><Button type="button" variant="ghost" onClick={() => onNavigate('activity')}>전체 보기</Button></SectionHead>
        <div className="workspace-home-panel workspace-home-flush">
          {feed.length ? <ol className="workspace-home-events">{feed.slice(0, 4).map(event => <li key={event.id}><Activity size={15} aria-hidden="true" /><div><strong>{EVENT_LABELS[event.kind] || '프로젝트 기록 갱신'}</strong><p>{textValue(event.detail?.title, event.detail?.filename, event.detail?.name, event.detail?.reason) || '활동 기록에서 상세 내용을 확인하세요.'}</p><time dateTime={event.created_at}>{displayDate(event.created_at)}</time></div></li>)}</ol> : <Empty compact icon={Activity} title="아직 활동 기록이 없습니다">자료 등록과 검토 결과가 시간순으로 쌓입니다.</Empty>}
        </div>
      </section>
    </div>

    {projects.length > 1 && onProjectSelect ? <section className="workspace-home-section"><SectionHead title="내 프로젝트" count={projects.length}>{onNewProject ? <Button type="button" variant="ghost" icon={FolderKanban} onClick={onNewProject}>새 프로젝트</Button> : null}</SectionHead><div className="workspace-home-projects">{projects.map(item => <ControlButton key={item.id} type="button" className="workspace-home-project" aria-current={item.id === project?.id ? 'true' : undefined} variant={item.id === project?.id ? 'outline' : 'ghost'} onClick={() => onProjectSelect(item.id)}><span><strong>{item.name}</strong><small>{ROLES[item.role] || '프로젝트 구성원'}</small></span>{item.id === project?.id ? <Badge tone="quiet">선택됨</Badge> : <ArrowRight size={16} aria-hidden="true" />}</ControlButton>)}</div></section> : null}
  </div>;
}

export function AttentionInbox({ project, projects, onProjectSelect, documentLoading, attention, attentionError, attentionLoading, onRefreshAttention, onNavigate }) {
  const [filter, setFilter] = useState('all');
  const allItems = orderedItems(attention);
  const items = filter === 'all' ? allItems : allItems.filter(item => item.grade === filter);
  const total = attention?.counts?.[filter];
  return <div className="workspace-home workspace-attention-inbox">
    <div className="workspace-home-section-head"><AttentionProjectSelect project={project} projects={projects} onProjectSelect={onProjectSelect} /><Button type="button" variant="secondary" icon={RefreshCw} busy={attentionLoading} onClick={onRefreshAttention}>새로고침</Button></div>
    <Tabs size="sm" variant="underline" value={filter} onValueChange={setFilter}>
      <Tabs.List aria-label="알림 우선순위">{FILTERS.map(value => <Tabs.Trigger key={value} value={value}>{value === 'all' ? '전체' : GRADES[value].label}{attention ? ` ${attention.counts[value].toLocaleString()}` : ''}</Tabs.Trigger>)}</Tabs.List>
      {FILTERS.map(value => <Tabs.Panel key={value} value={value}>
        {attentionError ? <ErrorNotice error={attentionError} onRetry={onRefreshAttention} /> : attentionLoading && !attention ? <Spinner label="알림을 불러오고 있습니다" /> : attention ? <>
          {typeof total === 'number' && total > items.length ? <div className="workspace-home-notice" role="status"><Bell size={16} aria-hidden="true" /><p>전체 {total.toLocaleString()}건 중 현재 {items.length.toLocaleString()}건을 표시합니다. 우선순위가 높은 알림부터 최대 100건을 가져옵니다. 나머지는 해당 업무 화면에서 확인할 수 있습니다.</p></div> : null}
          <AttentionList items={items} onNavigate={onNavigate} documentLoading={documentLoading} emptyTitle={total > 0 ? '현재 목록 밖에 추가 알림이 있습니다' : '이 등급의 알림이 없습니다'} emptyDescription={total > 0 ? '아래 업무별 바로가기에서 나머지 항목을 확인해 주세요.' : '새로운 확인 사항이 생기면 이곳에 표시됩니다.'} />
        </> : <p className="workspace-home-note" role="status">알림을 준비하고 있습니다.</p>}
      </Tabs.Panel>)}
    </Tabs>
    {documentLoading ? <p className="workspace-home-meta" role="status">프로젝트 자료를 불러오고 있습니다.</p> : null}
    {attention?.truncated ? <div className="workspace-home-source-links" aria-label="전체 업무 목록">{Object.entries(TAB_LABELS).map(([tab, label]) => <Button key={tab} type="button" variant="ghost" onClick={() => onNavigate(tab)}>{label}<ArrowRight size={14} aria-hidden="true" /></Button>)}</div> : null}
    <p className="workspace-home-note">알림의 등급은 원본 업무 상태와 기한으로 정해집니다. 해당 업무에서 검토·답변·처리를 마치면 알림도 함께 갱신됩니다.</p>
  </div>;
}
