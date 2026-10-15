export const NORA_WORKSPACE_PATTERN = 't_[A-Za-z0-9_-]{8,128}';

export function createProjectRequest(values, requestId) {
  return {
    request_id: requestId,
    name: String(values.name || '').trim(),
    project_kind: values.project_kind,
    nora_workspace_id: String(values.nora_workspace_id || '').trim(),
  };
}

export function retainProjectRequest(error) {
  return !error?.status || error.status === 408 || error.status >= 500;
}

const LEGACY_RUN_KINDS = {
  jobs: '문서 분석·변경 검토', registration_requests: '자료 분류 추천', channel_inbox: '대화 분석',
  implementation_plans: '구현 계획', implementation_requests: '코드 변경안 실행', commercial_rewrites: '사내 양식 문서 수정',
  context_ai_runs: '프로젝트 정보 분석', work_ai_runs: '작업·결과 검토', github_deliveries: 'GitHub PR 발행',
};
const LEGACY_RUN_STATES = {
  queued: ['처리 대기', 'quiet'], running: ['처리 중', 'blue'], awaiting_runner: ['실행기 대기', 'quiet'],
  waiting_approval: ['검토 대기', 'amber'], finalizing: ['결과 반영 중', 'blue'],
  publishing: ['발행 중', 'blue'], uncertain: ['결과 확인 필요', 'amber'],
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const positiveCount = value => Number.isSafeInteger(value) && value > 0 ? value : 0;

export function noraLegacyRunsView(workspace, { owner = false } = {}) {
  const runs = workspace?.workspace_id ? null : workspace?.legacy_runs;
  const rows = Array.isArray(runs?.items) ? runs.items.filter(item => item && typeof item === 'object') : [];
  const items = rows.map((item, index) => {
    const kindLabel = own(LEGACY_RUN_KINDS, item.kind) ? LEGACY_RUN_KINDS[item.kind] : '기존 작업';
    const [statusLabel, tone] = own(LEGACY_RUN_STATES, item.status) ? LEGACY_RUN_STATES[item.status] : ['상태 확인 필요', 'amber'];
    const timestamp = [item.updated_at, item.created_at].find(value => typeof value === 'string' && Number.isFinite(Date.parse(value))) || null;
    return { key: `legacy-run-${index}`, title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : kindLabel, kindLabel, statusLabel, tone, timestamp };
  });
  const counts = Object.entries(runs?.counts || {}).filter(([, value]) => positiveCount(value)).map(([status, count]) => ({
    label: own(LEGACY_RUN_STATES, status) ? LEGACY_RUN_STATES[status][0] : '상태 확인 필요', count,
  }));
  const total = Math.max(positiveCount(runs?.total), items.length, counts.reduce((sum, item) => sum + item.count, 0));
  const blocked = Boolean(runs && (runs.blocked === true || total > 0));
  return { blocked, total, items, counts, hasMore: Boolean(runs?.has_more || total > items.length), canReconcile: Boolean(owner && blocked && runs?.reconcilable === true) };
}

export function canRegisterNoraWorkspace(workspace, value, { owner = false, disabled = false, busy = false } = {}) {
  return Boolean(workspace && !workspace.workspace_id && owner && !disabled && !busy && !noraLegacyRunsView(workspace).blocked && new RegExp(`^${NORA_WORKSPACE_PATTERN}$`).test(String(value || '').trim()));
}

export function noraWorkspaceView(workspace, authorization) {
  const registered = Boolean(workspace?.workspace_id);
  const serviceAvailable = workspace?.capabilities?.verify === true;
  const status = workspace?.status;
  if (!registered) {
    const legacy = noraLegacyRunsView(workspace);
    return { registered: false, verified: false, label: legacy.blocked ? '기존 작업 확인 필요' : '등록 전', tone: legacy.blocked ? 'amber' : 'quiet', description: legacy.blocked ? '기존 분석·실행의 상태를 확인한 뒤 워크스페이스를 등록할 수 있습니다.' : 'Nora에서 만든 이 프로젝트의 워크스페이스 ID를 등록하세요.', action: null, canListConnectors: false };
  }
  if (!serviceAvailable || status === 'awaiting_service') return { registered: true, verified: false, label: '서비스 연결 필요', tone: 'amber', description: 'Nora 서비스 연결 필요. 워크스페이스 ID는 등록되었으며, 서버 연결 후 접근을 확인할 수 있습니다.', action: serviceAvailable ? 'retry' : null, canListConnectors: false };
  if (status === 'awaiting_auth' || authorization?.connected === false) return { registered: true, verified: false, label: '로그인 연결 필요', tone: 'amber', description: '등록한 워크스페이스에 접근할 수 있는 Nora 계정으로 연결해 주세요.', action: authorization?.connected === true ? 'retry' : null, canListConnectors: false };
  const states = {
    pending: ['확인 대기', 'quiet', '워크스페이스 ID가 등록되었습니다. 접근 확인을 기다리고 있습니다.'],
    verifying: ['확인 중', 'blue', '등록한 워크스페이스의 접근 권한을 확인하고 있습니다.'],
    ready: ['접근 확인됨', 'green', '등록한 Nora 워크스페이스에 접근할 수 있습니다.'],
    failed: ['확인 필요', 'amber', '워크스페이스 접근을 확인하지 못했습니다. Nora 권한과 서버 연결을 확인한 뒤 다시 시도하세요.'],
    uncertain: ['결과 확인 필요', 'amber', '이전 연결 요청의 결과를 확인하지 못했습니다. 같은 워크스페이스의 상태를 다시 확인하세요.'],
  };
  const [label, tone, description] = states[status] || ['ID 등록됨', 'quiet', '워크스페이스 ID가 등록되었습니다. 접근 상태를 확인해 주세요.'];
  return { registered: true, verified: status === 'ready', label, tone, description, action: status === 'failed' ? 'retry' : status === 'uncertain' ? 'reconcile' : null, canListConnectors: status === 'ready' && workspace.capabilities?.connectors === true };
}

export function selectableNoraConnectors(connectors) {
  return (Array.isArray(connectors) ? connectors : []).filter(connector => connector.provider === 'github' && typeof connector.id === 'string' && connector.id);
}

export function canSaveNoraConnector(workspace, connectors, selectedId, authorization) {
  return noraWorkspaceView(workspace, authorization).canListConnectors && selectedId !== workspace.connector_id && selectableNoraConnectors(connectors).some(connector => connector.id === selectedId && connector.enabled === true);
}

export function noraAuthorizeUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://platform.nora.my' && url.pathname === '/api/v1/oauth/authorize' && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

export function noraConnectionReturn(location) {
  const params = new URLSearchParams(location.search);
  if (!params.has('nora_connection')) return null;
  const result = params.get('nora_connection');
  params.delete('nora_connection');
  const message = result === 'connected' ? 'Nora 로그인 연결을 완료했습니다. 워크스페이스 접근 상태를 확인해 주세요.' : result === 'failed' ? 'Nora 로그인 연결을 완료하지 못했습니다. 프로젝트 설정에서 다시 연결해 주세요.' : null;
  return { message, href: `${location.pathname}${params.size ? `?${params}` : ''}${location.hash || ''}` };
}
