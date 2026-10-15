import { invoke, isTauri } from '@tauri-apps/api/core';

export const browserState = () => ({
  schemaVersion: 1, appVersion: '0.1.0', runtime: 'browser',
  connection: { status: 'protocol_required', connected: false, protocolRequired: true, message: 'Nora 작업 자동 수신은 아직 연결되지 않았습니다.' },
  profile: null, selectedFolder: null,
  diagnostics: { checkedAt: null, tools: { git: null, codex: null, claude: null }, repository: { status: 'not_selected', workingFolder: null, branch: null, head: null, clean: null, origin: null, matchesProfile: null, errorCode: null } },
  lastError: null,
});

export function createDesktopBridge({ call = invoke, isNative = isTauri } = {}) {
  const required = async (command, args) => {
    if (!isNative()) throw Object.assign(new Error('설치한 CTAS Desktop에서 사용할 수 있습니다.'), { code: 'DESKTOP_REQUIRED' });
    return call(command, args);
  };
  return {
    isDesktopRuntime: () => Boolean(isNative()),
    getDesktopState: async () => isNative() ? { ...await call('desktop_state'), runtime: 'desktop' } : browserState(),
    chooseWorkspace: () => required('choose_workspace'),
    saveProfile: value => required('save_profile', { profile: { project_id: value.projectId, workspace_id: value.workspaceId, repository_url: value.repositoryUrl, provider: value.provider } }),
    refreshDiagnostics: () => required('refresh_diagnostics'),
    openWorkspace: () => required('open_workspace'),
    startLocalRun: ({ prompt, expectedHead }) => required('start_local_run', { prompt, expectedHead }),
    listLocalRuns: () => isNative() ? required('list_local_runs') : Promise.resolve([]),
    getLocalRun: runId => required('get_local_run', { runId }),
    cancelLocalRun: runId => required('cancel_local_run', { runId }),
  };
}

const bridge = createDesktopBridge();
export const { isDesktopRuntime, getDesktopState, chooseWorkspace, saveProfile, refreshDiagnostics, openWorkspace, startLocalRun, listLocalRuns, getLocalRun, cancelLocalRun } = bridge;
