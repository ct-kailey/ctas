export const JOURNEY_STAGES = {
  planning: '기획', contract: '계약', requirements: '요구사항', implementation: '개발',
  review: '검증', delivery: '전달', closure: '종료',
};

export const JOURNEY_MILESTONES = {
  planning_started: { label: '기획 시작', stage: 'planning' },
  contract_signed: { label: '계약 체결', stage: 'contract' },
  final_delivery: { label: '최종 전달', stage: 'delivery' },
  contract_closed: { label: '계약 종료', stage: 'closure' },
  custom: { label: '직접 기록', stage: null },
};

export const JOURNEY_SOURCE_LABELS = {
  revision: '문서·기록', commercial_revision: '계약 문서', work_item: '작업',
  automation_task: 'AI 작업', task_draft: '작업 초안', implementation_note: '임시 구현·작업 공백',
  context_record: '확정된 기록', question: '질문·답변', review: '변경 검토',
  channel_inbox: '수집한 대화', context_candidate: '검토할 기록',
  implementation_plan: '구현 계획', implementation_request: '구현 요청', work_preflight: '작업 사전 확인',
  work_validation: '작업 검증', analysis: 'Nora 요구사항 분석',
};

export const JOURNEY_EVENT_TYPES = {
  revision: '문서·기록 등록', commercial_revision: '계약 문서', commercial_decision: '계약 협의',
  context_record: '요구사항·결정', task_draft: '작업 초안', work_item_event: '작업 변경',
  automation_task: 'AI 작업', analysis: 'Nora 분석', implementation_note_event: '임시 구현·작업 공백',
  question_event: '질문·답변', audit: '프로젝트 활동', milestone: '주요 일정',
};

export const JOURNEY_MILESTONE_SOURCE_TYPES = new Set(['revision', 'commercial_revision', 'work_item', 'automation_task', 'task_draft', 'implementation_note', 'context_record', 'question']);
export const EMPTY_JOURNEY_FILTERS = Object.freeze({ stage: '', type: '', from: '', to: '' });
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KST_OFFSET = 9 * 60 * 60 * 1000;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const count = value => Number.isSafeInteger(value) && value >= 0;

function dateStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('날짜를 연·월·일로 입력해 주세요.');
  const utc = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) throw new Error('존재하는 날짜를 입력해 주세요.');
  return utc.getTime() - KST_OFFSET;
}

// Date controls describe inclusive Korean calendar days; the API uses [from, to).
export function journeyDateRange(from = '', to = '') {
  const start = from ? dateStart(from) : null, end = to ? dateStart(to) + 86400000 : null;
  if (start !== null && end !== null && start >= end) throw new Error('종료일은 시작일보다 빠를 수 없습니다.');
  return { ...(start !== null ? { from: new Date(start).toISOString() } : {}), ...(end !== null ? { to: new Date(end).toISOString() } : {}) };
}

export function journeyEventQuery(filters, cursor = '') {
  const params = new URLSearchParams({ limit: '12', ...journeyDateRange(filters.from, filters.to) });
  if (filters.stage) {
    if (!Object.hasOwn(JOURNEY_STAGES, filters.stage)) throw new Error('프로젝트 단계 필터를 확인해 주세요.');
    params.set('stage', filters.stage);
  }
  if (filters.type) {
    if (!Object.hasOwn(JOURNEY_EVENT_TYPES, filters.type)) throw new Error('기록 유형 필터를 확인해 주세요.');
    params.set('type', filters.type);
  }
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function journeyDay(value) {
  return validDate(value) ? new Date(Date.parse(value) + KST_OFFSET).toISOString().slice(0, 10) : 'unknown';
}

export function journeyDateTime(value, dateOnly = false) {
  if (!validDate(value)) return '시각 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) }).format(new Date(value));
}

export function journeyTimeLabel(event) {
  return event.occurred_time_source === 'occurred' ? '발생 시각' : event.occurred_time_source === 'recorded_fallback' ? '등록 시각 기준 · 발생일 미확인' : event.occurred_time_source === 'recorded' ? '기록 시각' : '타임라인 기준 시각';
}

export function journeyLocalDateTime(value) {
  return validDate(value) ? new Date(Date.parse(value) + KST_OFFSET).toISOString().slice(0, 16) : '';
}

export function journeyOccurrence(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('실제 발생한 날짜와 시간을 입력해 주세요.');
  dateStart(value.slice(0, 10));
  const [hour, minute] = value.slice(11).split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('발생 시간을 확인해 주세요.');
  return new Date(dateStart(value.slice(0, 10)) + (hour * 60 + minute) * 60000).toISOString();
}

export function journeySourceRefs(refs, milestoneOnly = false) {
  const seen = new Set();
  return (Array.isArray(refs) ? refs : []).filter(ref => {
    if (!ref || !UUID.test(ref.id || '') || !(milestoneOnly ? JOURNEY_MILESTONE_SOURCE_TYPES.has(ref.type) : Object.hasOwn(JOURNEY_SOURCE_LABELS, ref.type))) return false;
    const key = `${ref.type}:${ref.id.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function journeyProgress(progress) {
  const keys = ['total', 'done', 'todo', 'in_progress', 'qa', 'blocked', 'unvalidated_drafts'];
  if (!progress || progress.scope !== 'execution_tasks' || keys.some(key => !count(progress[key])) || progress.done + progress.todo + progress.in_progress + progress.qa + progress.blocked !== progress.total) throw new Error('작업 진행률 집계를 확인할 수 없습니다. 다시 불러와 주세요.');
  if (progress.total === 0) return { ...progress, percent: null };
  if (!Number.isFinite(progress.percent) || progress.percent < 0 || progress.percent > 100 || Math.abs(progress.percent - progress.done / progress.total * 100) > 0.11) throw new Error('작업 완료율을 확인할 수 없습니다. 다시 불러와 주세요.');
  return progress;
}

export function journeyCanRecord(canWrite, sharedView, permissions) {
  return canWrite === true && !sharedView && permissions?.record_milestone === true;
}

export function journeyEventKey(event) {
  if (!event || !Object.hasOwn(JOURNEY_EVENT_TYPES, event.type) || !UUID.test(event.id || '')) throw new Error('타임라인 기록을 확인할 수 없습니다. 다시 불러와 주세요.');
  return `${event.type}:${event.id.toLowerCase()}`;
}

// Cursor pages belong to one immutable server snapshot and filter selection.
export function mergeJourneyPage(previous, page, cursor = '') {
  if (!page || !Array.isArray(page.events) || !count(page.total) || typeof page.has_more !== 'boolean' || !validDate(page.snapshot_at) || page.has_more && (typeof page.next_cursor !== 'string' || !page.next_cursor || !page.events.length) || !page.has_more && page.next_cursor !== null) throw new Error('타임라인 목록을 확인할 수 없습니다. 새로고침해 주세요.');
  if (cursor && (!previous || previous.next_cursor !== cursor || previous.snapshot_at !== page.snapshot_at || previous.total !== page.total)) throw new Error('타임라인 조회 기준이 바뀌었습니다. 처음부터 새로고침해 주세요.');
  if (page.has_more && (page.next_cursor === cursor || previous?.seen_cursors?.includes(page.next_cursor))) throw new Error('다음 타임라인 기록으로 이동하지 못했습니다. 새로고침해 주세요.');
  const events = cursor ? [...previous.events] : [], seen = new Set(events.map(journeyEventKey));
  let added = 0;
  for (const event of page.events) {
    const key = journeyEventKey(event);
    if (!validDate(event.occurred_at)) throw new Error('발생 시각을 확인할 수 없는 타임라인 기록입니다.');
    if (!seen.has(key)) { seen.add(key); events.push(event); added += 1; }
  }
  if (page.has_more && added === 0 || events.length > page.total) throw new Error('타임라인 목록이 반복되었습니다. 새로고침해 주세요.');
  return { ...page, events, seen_cursors: [...(cursor ? previous.seen_cursors || [] : []), ...(cursor ? [cursor] : [])] };
}

export function journeyMilestonePayload(draft, refs, requestId, now = Date.now()) {
  const kind = Object.hasOwn(JOURNEY_MILESTONES, draft.kind) && JOURNEY_MILESTONES[draft.kind];
  if (!kind) throw new Error('기록할 일정 종류를 선택해 주세요.');
  const title = draft.title.trim(), description = draft.description.trim();
  if (!title || title.length > 300) throw new Error('일정 제목을 300자 이내로 입력해 주세요.');
  if (description.length > 10000) throw new Error('일정 설명은 10,000자 이내로 입력해 주세요.');
  if (draft.kind === 'custom' && !Object.hasOwn(JOURNEY_STAGES, draft.stage)) throw new Error('이 일정의 프로젝트 단계를 선택해 주세요.');
  const occurred_at = journeyOccurrence(draft.occurred_at);
  if (Date.parse(occurred_at) > now + 300000) throw new Error('미래 예약 일정은 기록할 수 없습니다. 실제 발생한 시각을 입력해 주세요.');
  const sourceRefs = journeySourceRefs(refs, true);
  if (sourceRefs.length !== refs.length || sourceRefs.length > 20) throw new Error('연결할 자료는 현재 프로젝트의 자료 20개 이내로 선택해 주세요.');
  if (!UUID.test(requestId || '')) throw new Error('일정 기록 요청을 다시 시작해 주세요.');
  return { request_id: requestId, kind: draft.kind, title, description, occurred_at, source_refs: sourceRefs.map(({ type, id }) => ({ type, id })), ...(draft.kind === 'custom' ? { stage: draft.stage } : {}) };
}

export function groupJourneyEvents(events) {
  const groups = new Map();
  for (const event of events || []) {
    const day = journeyDay(event.occurred_at);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(event);
  }
  return Array.from(groups, ([day, items]) => ({ day, events: items }));
}
