import { desktopTaskMode } from './desktop-connection-state.mjs';
const ACTIVE_AUTOMATION = new Set(['queued', 'running', 'merging']);
const ACTIVE_LEGACY = new Set(['queued', 'claimed', 'running']);
const STATUS = {
  queued: ['실행 대기', 'quiet'], running: ['AI 개발 중', 'blue'], merging: ['병합 확인 중', 'blue'],
  failed: ['실행 실패', 'red'], uncertain: ['실행 결과 확인 필요', 'amber'],
  awaiting_runner: ['실행기 연결 대기', 'quiet'], claimed: ['실행 준비', 'blue'],
  succeeded: ['변경안 준비됨', 'green'], completed: ['변경안 준비됨', 'green'], patch_ready: ['변경안 준비됨', 'green'], cancelled: ['취소됨', 'quiet'],
};
export function developmentTaskActive(task) { return ACTIVE_AUTOMATION.has(task?.execution_status); }
export function developmentTaskRefreshing(task) { return developmentTaskActive(task) || task?.execution_status === 'awaiting_connection'; }
export function developmentOverviewActive(data) {
  return data?.tasks?.some(developmentTaskRefreshing) || data?.analyses?.some(item => ['queued', 'running', 'awaiting_connection'].includes(item.status)) || data?.intake?.some(item => ['pending', 'awaiting_connection'].includes(item.status));
}
export function developmentLegacyActive(data) { return data?.requests?.some(item => ACTIVE_LEGACY.has(item.status) || item.status === 'awaiting_runner'); }
export function developmentState(task) {
  if (desktopTaskMode(task)) { if (task?.execution_status === 'queued') return { label: '데스크톱 수신 대기', tone: 'quiet' }; if (task?.execution_status === 'running') return { label: '데스크톱 개발 중', tone: 'blue' }; }
  if (task?.execution_status === 'awaiting_connection') return { label: '연결 대기', tone: 'amber' };
  if (task?.status === 'done') return { label: '병합 완료', tone: 'green' };
  if (ACTIVE_AUTOMATION.has(task?.execution_status) || ['failed', 'uncertain'].includes(task?.execution_status)) {
    const [label, tone] = STATUS[task.execution_status]; return { label, tone };
  }
  if (task?.artifact?.evidence_status === 'unverified') return { label: '변경안 근거 확인 필요', tone: 'amber' };
  if (task?.status === 'qa') return { label: '개발 결과 검토', tone: 'blue' };
  if (task?.status === 'blocked') return { label: '확인 필요', tone: 'amber' };
  if (task?.execution_status === 'ready') return { label: '개발 결과 준비됨', tone: 'blue' };
  return { label: task?.requires_provisional_confirmation ? '검토 후 시작' : '시작 전', tone: 'quiet' };
}
function validTime(value) { const time = Date.parse(value || ''); return Number.isFinite(time) ? time : 0; }
export function developmentGroups(tasks = [], requests = []) {
  const items = tasks.filter(item => item && typeof item.id === 'string').map(task => ({
    id: task.id, key: `task:${task.id}`, kind: 'task', title: task.title || 'AI 개발 작업', raw: task,
    at: task.updated_at || task.created_at, state: developmentState(task),
    group: developmentTaskActive(task) ? 'active' : task.status === 'done' || task.artifact || ['ready', 'failed', 'uncertain', 'awaiting_connection'].includes(task.execution_status) ? 'history' : 'prepared',
  }));
  for (const item of requests.filter(item => item && typeof item.id === 'string')) {
    const status = item.error_code === 'EXECUTION_CANCELLED' ? 'cancelled' : item.status, [label, tone] = STATUS[status] || ['상태 확인 필요', 'amber'];
    items.push({ id: item.id, key: `legacy:${item.id}`, kind: 'legacy', title: item.input_snapshot?.plan_result?.title || `계획 기반 실행 ${item.id.slice(0, 8)}`, raw: item, at: item.completed_at || item.updated_at || item.created_at, state: { label, tone }, group: ACTIVE_LEGACY.has(status) ? 'active' : status === 'awaiting_runner' ? 'prepared' : 'history' });
  }
  items.sort((a, b) => validTime(b.at) - validTime(a.at) || a.key.localeCompare(b.key));
  return { active: items.filter(item => item.group === 'active'), history: items.filter(item => item.group === 'history'), prepared: items.filter(item => item.group === 'prepared'), all: items };
}
export function developmentSelection(groups, selectedId) {
  const selected = groups.all.find(item => item.kind === 'task' && item.id === selectedId);
  return selected || [...groups.active, ...groups.history, ...groups.prepared].find(item => item.kind === 'task') || null;
}
export function developmentNextAction(task, { canWrite, canReview, sharedView, capabilities } = {}) {
  if (sharedView || !canWrite && !canReview) return { target: 'work', label: '작업 상세 보기' };
  if (task?.execution_status === 'awaiting_connection') return { target: 'settings', label: 'Nora 실행 환경 연결' };
  if (developmentTaskActive(task)) return { target: 'work', label: '작업 상세 보기' };
  if (task?.status === 'done') return { target: 'work', label: '완료한 작업 보기' };
  if (['failed', 'uncertain'].includes(task?.execution_status) || task?.status === 'blocked') return { target: 'work', label: '확인 사항 검토' };
  if (task?.status === 'qa' || task?.artifact) return { target: 'work', label: canReview ? '결과 검토·승인' : '작업 결과 확인' };
  if (capabilities?.development === false) return { target: 'settings', label: '개발 연결 확인' };
  return { target: 'work', label: '작업 확인·개발 시작' };
}
export function developmentNextStep(task) {
  if (task?.execution_status === 'awaiting_connection') return '이미 접수한 작업입니다. Nora 실행 환경과 프로젝트 작업 폴더의 연결을 확인하세요.';
  if (task?.execution_status === 'merging') return '승인한 변경의 병합 결과를 확인하고 있습니다.';
  if (task?.execution_status === 'queued') return desktopTaskMode(task) ? '개발 요청을 접수했습니다. CTAS Desktop을 열고 자동 수신을 켜 주세요.' : '개발 실행을 기다리고 있습니다. 결과가 준비되면 변경 내용을 확인하세요.';
  if (task?.execution_status === 'running') return '개발 결과를 기다린 뒤 코드 변경과 테스트 결과를 확인하세요.';
  if (task?.status === 'done') return '승인한 변경의 병합 결과와 남은 기록을 확인하세요.';
  if (['failed', 'uncertain'].includes(task?.execution_status)) return '실행 기록과 실제 변경 결과를 먼저 확인하세요. 재실행 여부는 결과 확인 뒤 결정합니다.';
  if (task?.artifact?.evidence_status === 'unverified') return 'AI가 보고한 변경안의 실제 파일·커밋 근거를 확인하세요.';
  if (task?.status === 'blocked') return '확인이 필요한 질문과 작업 공백을 검토하세요.';
  if (task?.status === 'qa' || task?.artifact) return '코드 변경·테스트·웹 미리보기를 확인하고 검토자가 결과를 승인합니다.';
  return task?.requires_provisional_confirmation ? '고객 확인 사항과 임시 구현 범위를 확인한 뒤 개발을 시작하세요.' : '작업 내용과 완료 기준을 확인한 뒤 개발을 시작하세요.';
}
export function developmentBlockers(capabilities) {
  return (Array.isArray(capabilities?.blockers) ? capabilities.blockers : []).map(item => typeof item === 'string' ? ({ code: item, message: '프로젝트의 Nora 개발 연결을 확인해 주세요.' }) : ({ code: item.code || 'CONNECTION_REQUIRED', message: typeof item.message === 'string' ? item.message : '프로젝트의 Nora 개발 연결을 확인해 주세요.' }));
}
export function developmentActivity(value) {
  return (Array.isArray(value?.items) ? value.items : []).filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.at === 'string' && Number.isFinite(Date.parse(item.at))).map(item => ({ ...item, summary: typeof item.summary === 'string' ? item.summary : '' }));
}
export function developmentNotesPath(projectPath, taskId) {
  return `${projectPath}/implementation-notes?${new URLSearchParams({ related_task_id: taskId, limit: '10' })}`;
}
// One read session per resource. Replacing a request invalidates stale responses,
// even if the transport ignores AbortSignal during a project or task switch.
export function createDevelopmentReadSession() {
  let sequence = 0, controller = null, disposed = false, pending = false;
  return {
    open() { disposed = false; },
    close() { disposed = true; sequence++; controller?.abort(); pending = false; },
    async read(request, path, { skipIfPending = false } = {}) {
      if (disposed || skipIfPending && pending) return { ignored: true };
      pending = true; controller?.abort(); const own = new AbortController(), version = ++sequence; controller = own;
      const current = () => !disposed && version === sequence && !own.signal.aborted;
      try { const data = await request(path, { signal: own.signal }); return current() ? { data } : { ignored: true }; }
      catch (error) { return current() && error.name !== 'AbortError' ? { error } : { ignored: true }; }
      finally { if (version === sequence) pending = false; }
    },
  };
}
