export const AUTOMATION_COLUMNS = [
  ['todo', '할 일', 'quiet'], ['in_progress', '진행 중', 'blue'], ['blocked', '확인 필요', 'red'], ['qa', '검수 대기', 'amber'], ['done', '병합 완료', 'green'],
];
export const AUTOMATION_EXECUTION = { idle: '개발 시작 전', queued: '개발 대기', running: 'AI 개발 중', ready: '개발 완료 · 검수 대기', merging: '승인한 변경 병합 중', uncertain: '실행 결과 확인 필요', failed: '실행 실패', awaiting_connection: '연결 준비 필요' };
export const RISK_STATES = { queued: '분석 대기', running: '리스크 분석 중', completed: '분석 완료', blocked: '고객 확인 필요', awaiting_connection: '분석 연결 필요', failed: '분석 실패', uncertain: '분석 결과 확인 필요' };
export function automationUncertaintyMode(value) { return value === 'provisional' ? 'provisional' : 'strict'; }
const BLOCKERS = {
  NORA_SDK_SETTINGS_REQUIRED: 'SDK 실행 도구와 프로젝트 저장소 작업 폴더 설정', NORA_SDK_CONNECTION_REQUIRED: 'Nora 데스크톱에서 SDK 연결 승인 후 연결 상태 확인', NORA_SDK_BUSY: 'SDK 실행 환경의 기존 작업 완료 대기',
  NORA_SDK_CONNECTION_CHANGED: '개발 도중 SDK 연결이 변경되어 결과 확인 필요', NORA_SDK_FLOW_SCOPE_REQUIRED: 'SDK 실행 도구·작업 폴더와 일치하는 개발 흐름 선택', NORA_SDK_RESPONSE_INVALID: 'Nora SDK 연결 응답 확인 필요', TASK_ARTIFACT_UNVERIFIED: 'AI 변경안과 실제 코드 근거 대조 필요',
  TASK_PROVISIONAL_CONTEXT_CHANGED: '질문·답변이 변경되어 최신 내용으로 다시 확인 필요', TASK_PROVISIONAL_CONFIRMATION_REQUIRED: '고객 확인 사항을 보고 임시 구현 진행 여부 확인',
  NORA_DEVELOPMENT_HISTORY_FLOW_REQUIRED: '개발 다음에 자동 이력을 기록하는 Nora 흐름 연결', NORA_DEVELOPMENT_NOTES_CONTRACT_REQUIRED: '임시 구현·작업 공백을 기록하는 개발 흐름 연결',
  NORA_DEVELOPMENT_HISTORY_TRACE_INVALID: '개발·이력 에이전트의 실행 순서와 결과 확인 필요', NORA_DEVELOPMENT_HISTORY_CHANGED: '실제 개발 결과와 이력 내용이 달라 실행 이력 검토 필요',
  NORA_DEVELOPMENT_QUESTION_MISMATCH: '고객 질문과 개발 기록의 연결 확인 필요', NORA_DEVELOPMENT_QUESTION_MISSING: '개발 기록에서 빠진 고객 질문 처리 결과 확인 필요',
  NORA_TASK_RUN_INCOMPLETE: 'Nora 실행이 완료되지 않아 실행 이력 확인 필요',
  NORA_WORKSPACE_REQUIRED: 'Nora 워크스페이스 ID 등록', NORA_WORKSPACE_NOT_READY: 'Nora 워크스페이스 접근 확인', NORA_AUTH_REQUIRED: 'Nora 계정 연결',
  NORA_SERVICE_UNAVAILABLE: 'Nora 서비스 연결', NORA_RISK_ANALYSIS_UNAVAILABLE: 'Nora 리스크 분석 연결', NORA_RISK_FLOW_REQUIRED: '프로젝트 리스크 분석 흐름 준비',
  NORA_DEVELOPMENT_FLOW_REQUIRED: '게시된 AI 개발 흐름 선택', NORA_DEVELOPMENT_UNAVAILABLE: 'AI 개발 실행 연결', NORA_PREVIEW_ORIGIN_REQUIRED: '웹 미리보기 주소 허용',
  NORA_GITHUB_CONNECTOR_REQUIRED: 'Nora GitHub 연결 선택', NORA_GIT_PUSH_UNAVAILABLE: 'Nora Git 코드 전송 기능', NORA_GIT_MERGE_UNAVAILABLE: 'Nora Git 병합 기능',
  NORA_GITHUB_OPERATIONS_UNAVAILABLE: 'Nora Git 작업 지원 확인', NORA_REPOSITORY_REQUIRED: '대상 저장소와 기준 브랜치 설정', TASK_AUTOMATION_DISABLED: '정책 분석·AI 개발 활성화',
  TASK_CONNECTION_REQUIRED: 'Nora 워크스페이스 등록·접근 확인', TASK_DEVELOPMENT_UNAVAILABLE: 'AI 개발 흐름·GitHub 연결·코드 실행 환경', TASK_MERGE_UNAVAILABLE: 'Nora Git 병합 기능 연결',
  TASK_SOURCE_NOT_READY: '불완전한 문서 추출·확인 필요 구간 검토', TASK_SOURCE_STALE: '정책·기록·저장소가 변경되어 최신 문서로 재분석 필요', TASK_REPOSITORY_REQUIRED: 'Nora GitHub 연결에서 기준 브랜치 확인 후 재분석',
  TASK_ARTIFACT_INVALID: '실제 PR·커밋·코드 변경 확인', TASK_PREVIEW_REQUIRED: '검토 가능한 웹 미리보기 준비', TASK_PREVIEW_ORIGIN_INVALID: '프로젝트에서 허용한 웹 미리보기 주소 확인',
  TASK_CHECKS_REQUIRED: '개발 검증 결과 확인', TASK_CHECKS_NOT_PASSED: '실패하거나 진행 중인 검증 확인', TASK_MERGE_NOT_CONFIRMED: '승인한 커밋의 실제 병합 결과 확인', TASK_RECONCILE_UNAVAILABLE: '병합 결과 조회 연결 준비',
  TASK_DEVELOPMENT_FLOW_REQUIRED: '게시된 AI 개발 흐름 선택', TASK_GIT_CONNECTOR_REQUIRED: 'Nora GitHub 연결 선택', TASK_PREVIEW_ORIGIN_REQUIRED: '웹 미리보기 허용 주소 등록',
  NORA_DEVELOPMENT_CAPABILITIES_REQUIRED: 'Nora SDK 실행 환경 또는 작업 브랜치 코드 전송 기능', NORA_MERGE_CAPABILITY_REQUIRED: '검토한 커밋을 확인하는 Nora Git 병합 기능',
};
export function automationBlockerLabel(value) {
  if (value && typeof value === 'object') return value.message || BLOCKERS[value.code] || value.code || '연결 상태 확인';
  return BLOCKERS[value] || String(value || '연결 상태 확인');
}
export function automationPermissions(role, sharedView) {
  return { canWrite: !sharedView && ['owner', 'reviewer', 'member'].includes(role), canReview: !sharedView && ['owner', 'reviewer'].includes(role), canConfigure: !sharedView && role === 'owner' };
}
export function automationCanStart(task, permissions, capabilities) {
  return automationCanRequestStart(task, permissions) && capabilities?.development === true;
}

// Keep the move affordance available when execution is disconnected so the user
// gets an explanation. This never grants execution: start-check still gates it.
export function automationCanRequestStart(task, permissions) {
  return Boolean(task?.status === 'todo' && task?.execution_status === 'idle' && permissions?.canWrite === true);
}
export function automationBoardAction({ kind, item, target, permissions, busy }) {
  if (busy || permissions?.canWrite !== true || !item || !['task', 'draft'].includes(kind) || !target) return 'none';
  const source = kind === 'draft' ? 'todo' : automationColumn(item);
  if (target === source) return 'none';
  if (target !== 'in_progress') return 'unavailable';
  if (kind === 'draft') return 'prepare_draft';
  return automationCanRequestStart(item, permissions) ? 'start' : 'unavailable';
}
export function automationKeyboardCoordinates(event, { currentCoordinates, context }) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.code) || !context.collisionRect) return;
  event.preventDefault();
  const current = context.over?.id || 'lane:todo';
  const index = AUTOMATION_COLUMNS.findIndex(([status]) => `lane:${status}` === current);
  const next = AUTOMATION_COLUMNS[index + (event.code === 'ArrowRight' ? 1 : -1)];
  if (!next) return;
  const rect = context.droppableRects.get(`lane:${next[0]}`);
  if (!rect) return;
  const dragged = context.collisionRect;
  return { x: currentCoordinates.x + rect.left + rect.width / 2 - dragged.left - dragged.width / 2, y: currentCoordinates.y + rect.top + Math.min(rect.height, dragged.height) / 2 - dragged.top - dragged.height / 2 };
}

export function automationStartCheck(value, taskId) {
  if (!value || value.task_id !== taskId || !Number.isSafeInteger(value.task_version) || value.task_version < 1 || typeof value.requires_confirmation !== 'boolean' ||
      (value.requires_confirmation && !/^[a-f0-9]{64}$/i.test(value.review_token || ''))) {
    throw new Error('개발 시작 전 확인 정보를 읽지 못했습니다. 작업 목록을 새로고침한 뒤 다시 시도해 주세요.');
  }
  return { ...value, questions: Array.isArray(value.questions) ? value.questions : [], temporary_decisions: Array.isArray(value.temporary_decisions) ? value.temporary_decisions : [], work_gaps: Array.isArray(value.work_gaps) ? value.work_gaps : [] };
}

// Both the board move and detail action use this sequence. A read or a cancelled
// confirmation never mutates the task; changed evidence must be confirmed anew.
export async function startAutomationTask({ request, taskPath, taskId, confirm, isActive = () => true, signal }) {
  const check = automationStartCheck(await request(`${taskPath}/start-check`, { signal }), taskId);
  if (!isActive()) return { status: 'cancelled' };
  if (check.requires_confirmation && !await confirm(check)) return { status: 'cancelled' };
  if (!isActive()) return { status: 'cancelled' };
  const body = { status: 'in_progress', expected_version: check.task_version };
  if (check.requires_confirmation) body.provisional_consent = { review_token: check.review_token };
  const result = await request(taskPath, { method: 'PATCH', body });
  return { status: 'started', result };
}
export function automationColumn(task) {
  return AUTOMATION_COLUMNS.some(([id]) => id === task.status) ? task.status : 'blocked';
}
export function automationExecutionLabel(task) {
  if (task?.execution_status === 'ready' && task?.artifact?.evidence_status === 'unverified') return 'AI 변경안 · 근거 확인 필요';
  if (task?.status === 'qa' && task?.execution_status === 'ready' && ['pending', 'failed', 'unavailable'].includes(task?.artifact?.verification_status)) return task?.artifact?.implementation_report?.completion === 'partial' ? '부분 구현 · 검증 확인 필요' : '개발 결과 준비 · 검증 확인 필요';
  if (task?.status === 'blocked' && task?.execution_status === 'ready') return '보완 필요 · 결과·이력 확인';
  if (task?.status === 'qa' && task?.execution_status === 'ready' && task?.artifact?.implementation_report?.completion === 'partial') return '부분 구현 · 검수 대기';
  return task?.status === 'done' ? '승인한 변경 병합 완료' : AUTOMATION_EXECUTION[task?.execution_status] || '상태 확인 필요';
}
export function automationActive(data) {
  return data?.intake?.some(item => item.status === 'pending') || data?.analyses?.some(item => ['queued', 'running'].includes(item.status)) || data?.tasks?.some(item => ['queued', 'running', 'merging'].includes(item.execution_status));
}
export function policyAnalysisEligible(document, revision) {
  return document?.source_type !== 'commercial_revision' && document?.document_category === 'policy' && revision?.status === 'ready';
}
export function policyAnalysisSourceReady(revision) {
  const source = revision?.document_json;
  return revision?.status === 'ready' && source?.extraction?.complete === true && Array.isArray(source.segments) && source.segments.length > 0 && source.segments.every(segment => segment.extraction_status === 'ok');
}
export function parsePreviewOrigins(value) {
  const origins = [...new Set(String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    let url; try { url = new URL(line); } catch { throw new Error('웹 미리보기 주소를 https://도메인 형식으로 입력해 주세요.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('웹 미리보기는 경로·계정 정보가 없는 HTTPS 도메인만 등록할 수 있습니다.');
    return url.origin;
  }))];
  if (origins.length > 10) throw new Error('웹 미리보기 주소는 최대 10개까지 등록할 수 있습니다.');
  return origins;
}
export function automationPreviewUrl(value, origins = []) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && origins.includes(url.origin) ? url.href : null; } catch { return null; }
}
export function automationPrUrl(artifact) {
  if (!Number.isSafeInteger(artifact?.pr_number) || artifact.pr_number < 1) return null;
  const match = /^https:\/\/github\.com\/[^/?#]+\/[^/?#]+\/pull\/([1-9]\d*)$/.exec(artifact.pr_url || '');
  return match && Number(match[1]) === artifact.pr_number ? artifact.pr_url : null;
}
export function automationMergeReadiness(task, capabilities, settings) {
  const artifact = task?.artifact, reasons = [];
  if (task?.status !== 'qa' || task?.execution_status !== 'ready') reasons.push('검수할 개발 결과가 준비되어야 합니다.');
  if (capabilities?.merge !== true) reasons.push('Nora Git 병합 기능의 연결이 필요합니다.');
  if (artifact?.evidence_status === 'unverified') reasons.push('AI가 전달한 변경안의 실제 코드 근거를 확인해야 합니다.');
  if (artifact?.kind === 'local_patch' || artifact?.artifact_type === 'local_patch' || !automationPrUrl(artifact)) reasons.push('대상 저장소에 실제 PR이 생성되어야 합니다.');
  if (artifact?.verification_status && artifact.verification_status !== 'passed') reasons.push('개발 결과의 CI·웹 미리보기 검증이 완료되어야 합니다.');
  if (!automationPreviewUrl(artifact?.preview_url, settings?.preview_origins)) reasons.push('허용된 주소의 웹 미리보기가 필요합니다.');
  if (!artifact?.diff?.trim()) reasons.push('검토할 코드 변경 내역이 필요합니다.');
  if (!/^[a-f0-9]{40}$/i.test(artifact?.head_sha || '')) reasons.push('검토할 변경 커밋을 확인해야 합니다.');
  if (!artifact?.checks?.length || artifact.checks.some(check => check.status !== 'passed')) reasons.push('모든 검증 결과가 통과해야 합니다.');
  return { allowed: reasons.length === 0, reasons };
}

const VERIFICATION_LABELS = { passed: ['확인됨', 'green'], pending: ['대기 중', 'amber'], failed: ['실패', 'red'], unavailable: ['미연결', 'quiet'], unverified: ['근거 확인 필요', 'amber'] };
export function automationArtifactStages(artifact, settings) {
  if (!artifact) return [];
  const checks = (artifact.checks || []).filter(check => check.name !== '웹 프리뷰 배포');
  const ci = artifact.ci_status || (checks.some(check => check.status === 'failed') ? 'failed' : !checks.length || checks.some(check => check.status === 'unavailable') ? 'unavailable' : checks.every(check => check.status === 'passed') ? 'passed' : 'pending');
  const preview = artifact.preview_status || (automationPreviewUrl(artifact.preview_url, settings?.preview_origins) ? 'passed' : 'unavailable');
  return [['코드 변경', artifact.evidence_status === 'unverified' ? 'unverified' : artifact.diff?.trim() ? 'passed' : 'pending'], ['PR', automationPrUrl(artifact) ? 'passed' : 'pending'], ['CI', ci], ['웹 미리보기', preview]].map(([label, status]) => ({ label, status, stateLabel: (VERIFICATION_LABELS[status] || VERIFICATION_LABELS.unverified)[0], tone: (VERIFICATION_LABELS[status] || VERIFICATION_LABELS.unverified)[1] }));
}

export function automationHasCodeArtifact(artifact) {
  return typeof artifact?.diff === 'string' && artifact.diff.trim().length > 0;
}

export function automationReportedChecks(artifact, sharedView = false) {
  if (sharedView || !Array.isArray(artifact?.reported_checks)) return [];
  return artifact.reported_checks.filter(check => check && typeof check.command === 'string' && check.command.trim() && typeof check.output === 'string').map(check => ({
    command: check.command, output: check.output,
    exitCodeLabel: Number.isInteger(check.exit_code) && check.exit_code >= 0 && check.exit_code <= 255 ? String(check.exit_code) : '보고되지 않음',
  }));
}

export function automationCanRefreshArtifact(task, permissions) {
  return Boolean(permissions?.canWrite && ['qa', 'blocked'].includes(task?.status) && task?.execution_status === 'ready' && !task?.review && automationHasCodeArtifact(task?.artifact));
}

export async function refreshAutomationArtifact({ request, taskPath, task, permissions }) {
  if (!automationCanRefreshArtifact(task, permissions) || !Number.isSafeInteger(task.version)) throw new Error('갱신할 개발 결과와 작업 상태를 확인해 주세요.');
  return request(`${taskPath}/refresh-artifact`, { method: 'POST', body: { expected_version: task.version } });
}

export function automationSettingsDraft(settings) {
  return { enabled: settings.enabled, uncertainty_mode: automationUncertaintyMode(settings.uncertainty_mode), risk_flow_slug: settings.risk_flow_slug === 'ains-policy-risk-v1' ? '' : settings.risk_flow_slug || '', development_flow_slug: settings.development_flow_slug || '', preview_origins: (settings.preview_origins || []).join('\n'), execution_mode: settings.execution_mode === 'nora_sdk' ? 'nora_sdk' : 'connector_api', sdk_provider: settings.sdk_provider || '', sdk_connection_id: settings.sdk_connection_id || '', sdk_working_folder: settings.sdk_working_folder || '' };
}

export function automationSdkConnections(data, provider) {
  const seen = new Set();
  return (Array.isArray(data?.connections) ? data.connections : []).filter(connection => {
    if (!connection || !['codex', 'claude-code'].includes(connection.provider) || connection.provider !== provider || connection.connected !== true || typeof connection.workingFolder !== 'string' || !connection.workingFolder.startsWith('/')) return false;
    const key = automationSdkConnectionKey(connection);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// Nora may identify a connected runtime by provider + folder without an ID.
// This key belongs only to the select control and is never persisted as an ID.
export function automationSdkConnectionKey(connection) {
  return JSON.stringify([connection.provider, connection.workingFolder, connection.id || null]);
}

export function automationSdkSelectedConnection(connections, draft) {
  return connections.find(connection => connection.provider === draft.sdk_provider && connection.workingFolder === draft.sdk_working_folder && (!draft.sdk_connection_id || connection.id === draft.sdk_connection_id)) || null;
}

export function automationSdkConnectionRequest(draft) {
  const folder = draft.sdk_working_folder?.trim();
  if (!['codex', 'claude-code'].includes(draft.sdk_provider) || !folder?.startsWith('/') || folder === '/' || folder.endsWith('/') || /[\x00-\x1f]/.test(folder) || folder.split('/').slice(1).some(part => ['', '.', '..'].includes(part))) throw new Error('개발 실행 도구와 프로젝트 저장소의 절대 경로를 입력해 주세요.');
  return { provider: draft.sdk_provider, working_folder: folder };
}

export function automationSettingsPayload(draft, version) {
  if (!['connector_api', 'nora_sdk'].includes(draft.execution_mode)) throw new Error('AI 개발 실행 방식을 선택해 주세요.');
  if (draft.execution_mode === 'nora_sdk') automationSdkConnectionRequest(draft);
  return { expected_version: version, enabled: draft.enabled, uncertainty_mode: draft.uncertainty_mode, risk_flow_slug: draft.risk_flow_slug, development_flow_slug: draft.development_flow_slug || null, preview_origins: parsePreviewOrigins(draft.preview_origins), execution_mode: draft.execution_mode,
    sdk_provider: draft.sdk_provider || null, sdk_connection_id: draft.sdk_connection_id || null, sdk_working_folder: draft.sdk_working_folder?.trim() || null };
}
