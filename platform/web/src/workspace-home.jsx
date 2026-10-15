import React, { useState } from 'react';
import { ArrowRight, Bell, CheckCheck, FilePlus2, Files, RefreshCw } from 'lucide-react';
import { Badge, Button, Empty, ErrorNotice, Spinner, ControlButton, Notice } from './ui.jsx';
import { Tabs } from './ui.jsx';
import { ProjectJourney } from './project-journey.jsx';
import { attentionInstruction } from './server-ui-copy.mjs';
import './workspace-home.css';
import { List, ListItem } from './ctds-lists';

const GRADES = {
  urgent: { label: '긴급', tone: 'red' },
  check: { label: '확인 필요', tone: 'amber' },
  info: { label: '안내', tone: 'blue' },
};
const FILTERS = ['all', 'urgent', 'check', 'info'];
const GRADE_ORDER = { urgent: 0, check: 1, info: 2 };
const TAB_LABELS = {
  reviews: '변경 검토', documents: '원문·분석 검토', 'source-review': '원문·분석 검토', context: '요구사항·결정 검토',
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
const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function displayDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? DATE_FORMAT.format(date) : '시각 정보 없음';
}
function orderedItems(attention) {
  return (attention?.items || []).slice().sort((a, b) =>
    (GRADE_ORDER[a.grade] ?? 2) - (GRADE_ORDER[b.grade] ?? 2)
    || String(b.created_at || '').localeCompare(String(a.created_at || ''))
    || a.id.localeCompare(b.id));
}
function AttentionRow({ item, onNavigate, documentLoading }) {
  const grade = GRADES[item.grade] || GRADES.info;
  return <ListItem className="workspace-attention-item"><ListItem.Title><Badge tone={grade.tone}>{grade.label}</Badge>{item.title}</ListItem.Title><ListItem.Description>{attentionInstruction(item)}</ListItem.Description><ListItem.Meta><span>{RULE_LABELS[item.rule] || '원본 업무 상태 기준'}</span><time dateTime={item.created_at}>{displayDate(item.created_at)}</time><Button type="button" variant="secondary" rightIcon={<ArrowRight size={15} />} disabled={Boolean(documentLoading && item.target?.revisionId)} onClick={() => onNavigate(item.tab, item.target)}>{TAB_LABELS[item.tab] || '업무 확인'}</Button></ListItem.Meta></ListItem>;
}
function AttentionList({ items, onNavigate, documentLoading = false, emptyTitle = '지금 확인할 알림이 없습니다', emptyDescription = '검토할 기록이나 응답 대기가 생기면 이곳에서 확인할 수 있습니다.' }) {
  return items.length ? <List className="workspace-home-panel workspace-home-flush">{items.map(item => <AttentionRow key={item.id} item={item} onNavigate={onNavigate} documentLoading={documentLoading} />)}</List>
    : <div className="workspace-home-panel"><Empty compact icon={CheckCheck} title={emptyTitle}>{emptyDescription}</Empty></div>;
}
function SectionHead({ title, count, children }) {
  return <div className="workspace-home-section-head"><h2>{title}{typeof count === 'number' ? <span className="workspace-home-heading-count">{count.toLocaleString()}</span> : null}</h2>{children}</div>;
}
/** Prioritize actionable work; navigation and project selection live in the shell. */
export function ProjectHome({ project, overview, onNavigate, onUpload, attention, onRefreshAttention, attentionError, attentionLoading, request, onDirty, notify, onOpenSource }) {
  const documents = overview?.documents || [];
  const recentDocuments = documents.slice().sort((a, b) => String(b.revisions?.[0]?.created_at || b.created_at || '').localeCompare(String(a.revisions?.[0]?.created_at || a.created_at || ''))).slice(0, 4);
  const items = orderedItems(attention).slice(0, 3);
  const canWrite = ['owner', 'reviewer', 'member'].includes(project?.role);
  return <div className="workspace-home">
    <section className="workspace-home-section" aria-label="프로젝트 알림">
      <SectionHead title="지금 할 일" count={!attentionError && attention ? attention.counts.all : undefined}>
        <Button type="button" variant="ghost" rightIcon={<ArrowRight size={15} />} onClick={() => onNavigate('alerts')}>알림 모두 보기</Button>
      </SectionHead>
      {attentionError ? <ErrorNotice error={attentionError} onRetry={onRefreshAttention} /> : attentionLoading && !attention ? <Spinner label="확인할 업무를 불러오고 있습니다" /> : attention ? <AttentionList items={items} onNavigate={onNavigate} emptyTitle="지금 처리할 알림이 없습니다" emptyDescription="새로운 검토 요청이나 지연된 작업이 여기에 표시됩니다." /> : <p className="workspace-home-note" role="status">알림을 준비하고 있습니다.</p>}
      {attentionLoading && attention ? <p className="workspace-home-meta" role="status">알림 갱신 중</p> : null}
      {attention && !attentionError && attention.counts.all > items.length ? <p className="workspace-home-meta">우선순위가 높은 {items.length}건 표시 · 전체 {attention.counts.all.toLocaleString()}건</p> : null}
    </section>
    <ProjectJourney onNavigate={onNavigate} key={project.id} project={project} request={request} canWrite={canWrite} onDirty={onDirty} notify={notify} onOpenSource={onOpenSource} />
    <section className="workspace-home-section" aria-label="최근 문서">
      <SectionHead title="최근 자료"><Button type="button" variant="ghost" onClick={() => onNavigate('documents')}>자료 모두 보기</Button></SectionHead>
      <div className="workspace-home-panel workspace-home-flush">
        {recentDocuments.length ? <List>{recentDocuments.map(document => <ListItem key={document.id} leading={<Files size={17} />}><ListItem.Title><ControlButton type="button" variant="ghost" onClick={() => onNavigate('documents', document.revisions?.[0]?.id ? { revisionId: document.revisions[0].id } : undefined)}>{document.title}</ControlButton></ListItem.Title><ListItem.Meta><span>{document.domain_name || '프로젝트 자료'} · 버전 {document.revisions?.length || 0}</span><Badge status={document.revisions?.[0]?.status || 'draft'}>{document.revisions?.[0]?.status ? undefined : '초안'}</Badge></ListItem.Meta></ListItem>)}</List> : <Empty compact icon={Files} title="첫 자료를 등록하세요" action={canWrite && onUpload ? <Button type="button" icon={FilePlus2} onClick={onUpload}>자료 등록</Button> : null}>기획서·계약서·회의록을 올리면 분석과 검토를 시작할 수 있습니다.</Empty>}
      </div>
    </section>
  </div>;
}

export function AttentionInbox({ documentLoading, attention, attentionError, attentionLoading, onRefreshAttention, onNavigate }) {
  const [filter, setFilter] = useState('all');
  const allItems = orderedItems(attention);
  const items = filter === 'all' ? allItems : allItems.filter(item => item.grade === filter);
  const total = attention?.counts?.[filter];
  return <div className="workspace-home workspace-attention-inbox">
    <div className="workspace-home-section-head"><span className="workspace-home-note">확인할 항목을 열어 처리하세요.</span><Button type="button" variant="secondary" icon={RefreshCw} busy={attentionLoading} onClick={onRefreshAttention}>새로고침</Button></div>
    <Tabs size="sm" variant="underline" value={filter} onValueChange={setFilter}>
      <Tabs.List aria-label="알림 우선순위">{FILTERS.map(value => <Tabs.Trigger key={value} value={value}>{value === 'all' ? '전체' : GRADES[value].label}{attention ? ` ${attention.counts[value].toLocaleString()}` : ''}</Tabs.Trigger>)}</Tabs.List>
      {FILTERS.map(value => <Tabs.Panel key={value} value={value}>
        {attentionError ? <ErrorNotice error={attentionError} onRetry={onRefreshAttention} /> : attentionLoading && !attention ? <Spinner label="알림을 불러오고 있습니다" /> : attention ? <>
          {typeof total === 'number' && total > items.length ? <Notice className="workspace-home-notice" role="status"><Bell size={16} aria-hidden="true" /><p>전체 {total.toLocaleString()}건 중 {items.length.toLocaleString()}건 표시. 나머지는 아래 업무별 목록에서 확인하세요.</p></Notice> : null}
          <AttentionList items={items} onNavigate={onNavigate} documentLoading={documentLoading} emptyTitle={total > 0 ? '현재 목록 밖에 추가 알림이 있습니다' : '이 등급의 알림이 없습니다'} emptyDescription={total > 0 ? '아래 업무별 바로가기에서 나머지 항목을 확인해 주세요.' : '새로운 확인 사항이 생기면 이곳에 표시됩니다.'} />
        </> : <p className="workspace-home-note" role="status">알림을 준비하고 있습니다.</p>}
      </Tabs.Panel>)}
    </Tabs>
    {documentLoading ? <p className="workspace-home-meta" role="status">프로젝트 자료를 불러오고 있습니다.</p> : null}
    {attention?.truncated ? <div className="workspace-home-source-links" aria-label="전체 업무 목록">{Object.entries(TAB_LABELS).map(([tab, label]) => <Button key={tab} type="button" variant="ghost" onClick={() => onNavigate(tab)}>{label}<ArrowRight size={14} aria-hidden="true" /></Button>)}</div> : null}
  </div>;
}
