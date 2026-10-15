export const EMPTY_PROFILE = Object.freeze({ projectId: '', workspaceId: '', repositoryUrl: '', provider: 'codex' });

export function profileDraft(state) {
  const profile = state?.profile;
  return profile ? { projectId: profile.projectId || '', workspaceId: profile.workspaceId || '', repositoryUrl: profile.repositoryUrl || '', provider: profile.provider === 'claude-code' ? 'claude-code' : 'codex' } : { ...EMPTY_PROFILE };
}

export function profileChanged(draft, state) {
  const saved = profileDraft(state);
  return Object.keys(EMPTY_PROFILE).some(key => draft[key] !== saved[key]) || Boolean(state?.selectedFolder && state.selectedFolder !== state.profile?.workingFolder);
}

export function profilePayload(draft) {
  const value = { projectId: draft.projectId.trim(), workspaceId: draft.workspaceId.trim(), repositoryUrl: draft.repositoryUrl.trim(), provider: draft.provider };
  if (!value.projectId || !value.repositoryUrl) throw new Error('프로젝트 ID와 대상 저장소 주소를 입력해 주세요.');
  if (!['codex', 'claude-code'].includes(value.provider)) throw new Error('사용할 개발 도구를 선택해 주세요.');
  return value;
}

export function repositoryState(repository) {
  if (!repository || repository.status === 'not_selected') return { label: '폴더 선택 필요', tone: undefined, detail: '작업할 로컬 Git 저장소를 선택해 주세요.' };
  if (repository.status !== 'ready') return { label: '확인 필요', tone: 'warning', detail: '선택한 폴더의 Git 저장소 정보를 읽지 못했습니다.' };
  if (repository.matchesProfile === false) return { label: '대상 저장소 불일치', tone: 'warning', detail: '로컬 origin과 저장한 대상 저장소가 다릅니다. 폴더 또는 저장소 주소를 확인해 주세요.' };
  return { label: 'Git 저장소 확인됨', tone: 'success', detail: repository.matchesProfile === true ? '로컬 origin이 저장한 대상 저장소와 일치합니다.' : 'Git 저장소를 읽었습니다. 프로젝트 정보를 저장하면 대상 저장소와 비교할 수 있습니다.' };
}

export function toolState(tool) {
  if (!tool) return { label: '확인 전', tone: undefined };
  if (tool.installed === true && !tool.errorCode) return { label: tool.version ? '버전 확인됨' : '설치 확인됨', tone: 'success' };
  return { label: tool.errorCode ? '확인 필요' : '찾지 못함', tone: 'warning' };
}

export function desktopError(error) {
  if (!error) return null;
  if (error.code === 'DESKTOP_REQUIRED') return { code: error.code, message: '작업 폴더 선택과 환경 진단은 설치한 CTAS Desktop에서 사용할 수 있습니다.' };
  return { code: error.code || null, message: typeof error.message === 'string' ? error.message : typeof error === 'string' ? error : '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
}
