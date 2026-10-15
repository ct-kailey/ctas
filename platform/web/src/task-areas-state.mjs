export const TASK_AREAS = [
  { key: 'screen', label: '화면', referenceLabel: '화면 경로·컴포넌트', placeholder: '/login · LoginForm', hint: '사용자 화면과 상호작용' },
  { key: 'server', label: '서버', referenceLabel: 'API·서버 규칙', placeholder: 'POST /app/login · 로그인 검증', hint: 'API와 비즈니스 규칙' },
  { key: 'database', label: 'DB', referenceLabel: '테이블·데이터 변경', placeholder: 'member · 조회 / login_history · 생성', hint: '조회·저장할 데이터' },
];
export const TASK_AREA_STATUSES = [
  { key: 'todo', label: '할 일', tone: 'quiet' },
  { key: 'in_progress', label: '진행 중', tone: 'blue' },
  { key: 'blocked', label: '확인 필요', tone: 'amber' },
  { key: 'review', label: '검토 중', tone: 'blue' },
  { key: 'done', label: '완료', tone: 'green' },
  { key: 'not_applicable', label: '작업 없음', tone: 'quiet' },
];
export function taskAreaStatus(status) {
  return TASK_AREA_STATUSES.find(item => item.key === status) || { key: 'unknown', label: '상태 확인 필요', tone: 'amber' };
}
export function taskAreaRows(rows = []) {
  return TASK_AREAS.map(area => {
    const row = rows.find(item => item.area === area.key);
    return { area: area.key, description: '', reference: '', assignee_ids: [], assignees: [], status: 'todo', version: 0, ...row };
  });
}
export function taskAreaProgress(rows) {
  const applicable = taskAreaRows(rows).filter(row => row.status !== 'not_applicable');
  const completed = applicable.filter(row => row.status === 'done').length;
  return { completed, total: applicable.length, percent: applicable.length ? Math.round(completed / applicable.length * 100) : 0 };
}
export function taskAreaProgressLabel(progress) {
  return progress.total ? `${progress.completed}/${progress.total} 영역 완료 · ${progress.percent}%` : '작업 대상 없음';
}
export function taskAreaMembers(members = []) {
  return members.filter(member => typeof member.id === 'string' && ['owner', 'reviewer', 'member'].includes(member.role));
}
export function taskAreaDraft(row) {
  return { description: row.description || '', reference: row.reference || '', assignee_ids: [...(row.assignee_ids || [])], status: row.status };
}
export function taskAreaIsDirty(row, draft) {
  return ['description', 'reference', 'status'].some(key => (draft[key] || '') !== (row[key] || ''))
    || JSON.stringify([...(draft.assignee_ids || [])].sort()) !== JSON.stringify([...(row.assignee_ids || [])].sort());
}
export function taskAreaPayload(row, draft, members) {
  if (!TASK_AREAS.some(item => item.key === row.area) || !Number.isSafeInteger(row.version) || row.version < 0) throw new Error('작업 영역 정보를 다시 불러와 주세요.');
  if (!TASK_AREA_STATUSES.some(item => item.key === draft.status)) throw new Error('진행 상태를 확인해 주세요.');
  if (typeof draft.description !== 'string' || draft.description.length > 10000 || typeof draft.reference !== 'string' || draft.reference.length > 2000) throw new Error('작업 내용과 관련 경로의 길이를 확인해 주세요.');
  const assigneeIds = [...new Set(draft.assignee_ids || [])];
  if (assigneeIds.length > 50) throw new Error('담당자는 영역별로 50명까지 선택할 수 있습니다.');
  const eligible = new Set(taskAreaMembers(members).map(member => member.id));
  const retainedFinished = ['done', 'not_applicable'].includes(draft.status)
    && JSON.stringify([...assigneeIds].sort()) === JSON.stringify([...(row.assignee_ids || [])].sort());
  if (!retainedFinished && assigneeIds.some(id => !eligible.has(id))) throw new Error('담당자는 현재 프로젝트의 관리자·검토자·실무자 중 선택해 주세요.');
  return { expected_version: row.version, description: draft.description.trim(), reference: draft.reference.trim(), assignee_ids: assigneeIds, status: draft.status };
}
export async function saveTaskArea({ request, taskPath, row, draft, members, canWrite, signal, isActive = () => true }) {
  if (!canWrite) throw new Error('영역별 작업을 수정할 권한이 없습니다.');
  const body = taskAreaPayload(row, draft, members);
  if (signal?.aborted || !isActive()) return null;
  // This endpoint only records assignment and status; it never starts AI or merges a PR.
  return request(`${taskPath}/areas/${row.area}`, { method: 'PATCH', body, ...(signal ? { signal } : {}) });
}
export function taskAreaAssigneeNames(row, members = []) {
  const names = new Map(members.map(member => [member.id, member.name || member.email]));
  for (const member of row.assignees || []) if (member?.id && member?.name) names.set(member.id, member.name);
  return (row.assignee_ids || []).map(id => names.get(id) || '이전 담당자');
}
export function taskAreaHistoryChanges(event) {
  const before = event.before_state || event.before || {}, after = event.after_state || event.after || {};
  const labels = [];
  if (before.status !== after.status && after.status) labels.push(`${taskAreaStatus(before.status || 'todo').label} → ${taskAreaStatus(after.status).label}`);
  if ((before.description || '') !== (after.description || '')) labels.push('작업 내용 변경');
  if ((before.reference || '') !== (after.reference || '')) labels.push('관련 경로 변경');
  if (JSON.stringify([...(before.assignee_ids || [])].sort()) !== JSON.stringify([...(after.assignee_ids || [])].sort())) labels.push('담당자 변경');
  return labels.length ? labels.join(' · ') : '작업 정보 저장';
}
