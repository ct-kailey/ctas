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

export function noraWorkspaceView(workspace, authorization) {
  const registered = Boolean(workspace?.workspace_id);
  const serviceAvailable = workspace?.capabilities?.verify === true;
  const status = workspace?.status;
  if (!registered) return { registered: false, verified: false, label: '등록 전', tone: 'quiet', description: 'Nora에서 만든 이 프로젝트의 워크스페이스 ID를 등록하세요.', action: null, canListConnectors: false };
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
