export const RUN_LABELS = Object.freeze({ preparing: '작업 폴더 준비 중', running: '개발 진행 중', completed: '실행 완료', failed: '실행 실패', cancelled: '취소됨', timed_out: '시간 초과', interrupted: '중단됨' });
export function runActive(run) { return ['preparing', 'running'].includes(run?.status); }
export function runLabel(run) { return RUN_LABELS[run?.status] || '상태 확인 필요'; }
export function runTone(run) { return run?.status === 'completed' ? 'success' : ['failed', 'timed_out', 'interrupted'].includes(run?.status) ? 'warning' : undefined; }
export function executionReadiness(state, { native = true, dirty = false } = {}) {
  if (!native) return { ready: false, reason: '설치한 CTAS Desktop에서 실행할 수 있습니다.' };
  if (!state?.profile) return { ready: false, reason: '프로젝트 정보와 작업 폴더를 먼저 저장해 주세요.' };
  if (dirty) return { ready: false, reason: '변경한 프로젝트 정보를 저장한 뒤 시작해 주세요.' };
  if (!['codex', 'claude-code'].includes(state.profile.provider)) return { ready: false, reason: '개발 도구를 선택해 주세요.' };
  const repository = state.diagnostics?.repository;
  if (repository?.status !== 'ready' || !repository.head) return { ready: false, reason: '로컬 환경을 다시 확인해 Git 저장소와 기준 커밋을 읽어 주세요.' };
  if (repository.matchesProfile !== true || repository.workingFolder !== state.profile.workingFolder) return { ready: false, reason: '선택한 작업 폴더의 origin이 저장한 대상 저장소와 일치해야 합니다.' };
  const tool = state.diagnostics?.tools?.[state.profile.provider === 'claude-code' ? 'claude' : 'codex'];
  if (!tool?.installed || tool.errorCode) return { ready: false, reason: `${state.profile.provider === 'claude-code' ? 'Claude Code' : 'Codex CLI'}를 설치하고 로컬 환경을 다시 확인해 주세요.` };
  return { ready: true, reason: '저장한 폴더의 현재 커밋으로 별도 작업 폴더를 만들어 실행합니다.' };
}
export function localRunRequest(prompt, state) {
  const value = String(prompt || '').trim();
  if (!value) throw new Error('개발할 내용을 입력해 주세요.');
  if (value.length > 12000) throw new Error('개발 요청은 12,000자 이내로 작성해 주세요.');
  const expectedHead = state?.diagnostics?.repository?.head;
  if (!expectedHead) throw new Error('로컬 환경을 다시 확인해 기준 커밋을 읽어 주세요.');
  return { prompt: value, expectedHead };
}
export function executionError(error) {
  const messages = {
    LOCAL_REPOSITORY_MISMATCH: '대상 저장소가 일치하지 않습니다. 작업 폴더와 저장소 주소를 확인해 주세요.',
    CLI_VERSION_UNSUPPORTED: '설치된 CLI 버전이 지원되지 않습니다. CLI를 업데이트한 뒤 환경을 다시 확인해 주세요.',
    LOCAL_DIFF_LIMIT: '변경 내용이 표시 한도를 초과했습니다. 실행 폴더에서 전체 변경사항을 확인해 주세요.',
    LOCAL_RUN_TIMEOUT: '실행 시간이 제한을 초과했습니다. 생성된 변경사항을 검토한 뒤 다음 작업을 결정해 주세요.',
    CLI_RESULT_UNCONFIRMED: 'CLI 실행 결과를 확인하지 못했습니다. 변경사항과 실행 기록을 먼저 검토해 주세요.',
    CLI_AUTH_REQUIRED: '터미널에서 선택한 CLI에 로그인한 뒤 새 실행을 시작해 주세요.',
    CLAUDE_EXECUTION_NOT_READY: 'Claude Code 직접 실행은 준비 중입니다. 개발 도구를 Codex로 변경해 주세요.',
    LOCAL_RUN_BUSY: '이미 진행 중인 로컬 작업이 있습니다. 완료되거나 취소된 뒤 시작해 주세요.',
    LOCAL_HEAD_CHANGED: '기준 커밋이 바뀌었습니다. 로컬 환경을 다시 확인한 뒤 시작해 주세요.',
  };
  const recorded = Array.isArray(error?.events) ? [...error.events].reverse().find(event => event.kind === 'error')?.message : null;
  return messages[error?.code || error?.errorCode] || error?.message || recorded || '작업을 처리하지 못했습니다. 로컬 환경과 실행 기록을 확인해 주세요.';
}
