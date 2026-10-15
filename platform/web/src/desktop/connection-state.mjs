export function desktopConnectionState(connection) {
  if (!connection?.paired) return { label: '연결 전', tone: undefined, message: '웹의 프로젝트 설정에서 연결 코드를 발급받아 입력하세요.' };
  if (connection.pendingResultCount > 0) return { label: '결과 동기화 대기', tone: 'warning', message: `완료한 작업 ${connection.pendingResultCount}건의 결과를 CTAS에 전달하고 있습니다.` };
  if (connection.status === 'error' || connection.lastError) return { label: '연결 확인 필요', tone: 'warning', message: connection.lastError?.message || '네트워크와 프로젝트 연결을 확인해 주세요.' };
  if (connection.activeJobId || connection.status === 'busy') return { label: '웹 작업 실행 중', tone: undefined, message: '웹에서 요청한 작업을 실행하고 있습니다. 실행 내역에서 결과를 확인하세요.' };
  if (connection.receiving) return { label: '자동 수신 켜짐', tone: 'success', message: '이 프로젝트에서 개발을 요청한 작업을 자동으로 받아 실행합니다.' };
  return { label: '연결됨 · 수신 꺼짐', tone: undefined, message: '자동 수신을 켜면 웹에서 요청한 개발 작업을 이 컴퓨터에서 실행합니다.' };
}
export function desktopCanReceive(state) {
  const connection = state?.desktopConnection, profile = state?.profile, repository = state?.diagnostics?.repository;
  if (!connection?.paired || !profile) return false;
  const tool = state.diagnostics?.tools?.[profile.provider === 'claude-code' ? 'claude' : 'codex'];
  if (!tool?.installed || tool.errorCode) return false;
  return connection.projectId === profile.projectId && connection.provider === profile.provider && repository?.status === 'ready' && repository.matchesProfile === true && repository.workingFolder === profile.workingFolder;
}
export function desktopPairCode(value) {
  const code = String(value || '').trim();
  if (!code || code.length > 512 || /[\r\n\x00]/.test(code)) throw new Error('웹에서 발급한 연결 코드를 입력해 주세요.');
  return code;
}
