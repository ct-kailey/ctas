export const WORKSPACE_TABS = new Set(['context', 'commercial', 'overview', 'reviews', 'documents', 'channels', 'integrations', 'transcriptions', 'implementation', 'work-governance', 'github-delivery', 'questions', 'work-items', 'settings', 'activity']);

export function readWorkspaceLocation(search) {
  const params = new URLSearchParams(search);
  const project = params.get('project') || '';
  return {
    projectId: project,
    invalidProject: Boolean(project && !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(project)),
    tab: WORKSPACE_TABS.has(params.get('tab')) ? params.get('tab') : 'overview',
    action: ['new-project', 'upload'].includes(params.get('action')) ? params.get('action') : null,
  };
}

// An explicit project must never silently fall back to a different project.
export function resolveWorkspaceProject(projects, currentId, entry) {
  if (currentId && projects.some(project => project.id === currentId)) return { projectId: currentId, unavailable: false };
  if (entry.invalidProject) return { projectId: '', unavailable: true };
  if (entry.projectId && projects.some(project => project.id === entry.projectId)) return { projectId: entry.projectId, unavailable: false };
  if (entry.projectId) return { projectId: '', unavailable: true };
  return { projectId: projects[0]?.id || '', unavailable: false };
}

export function dashboardHref(projectId) {
  return projectId ? `/dashboard/?${new URLSearchParams({ project: projectId })}` : '/dashboard/';
}

export function workspaceStorage(browser) {
  try { return browser.sessionStorage; } catch { return undefined; }
}

const OAUTH_RETURN_KEY = 'ains.workspace.oauth-return';
export function rememberWorkspaceReturn(storage, entry, now = Date.now()) {
  try {
    const query = new URLSearchParams({ tab: entry.tab });
    if (entry.projectId) query.set('project', entry.projectId);
    if (entry.action) query.set('action', entry.action);
    storage.setItem(OAUTH_RETURN_KEY, JSON.stringify({ search: query.toString(), expiresAt: now + 15 * 60 * 1000 }));
  } catch { /* Login remains available when browser storage is disabled. */ }
}

// OAuth returns to /. Restore only allowlisted workspace parameters once, never a URL.
export function restoreWorkspaceReturn(search, storage, now = Date.now()) {
  let saved;
  try { saved = JSON.parse(storage.getItem(OAUTH_RETURN_KEY)); storage.removeItem(OAUTH_RETURN_KEY); } catch { saved = null; }
  const params = new URLSearchParams(search);
  if (['project', 'tab', 'action'].some(key => params.has(key))) return readWorkspaceLocation(search);
  return saved && typeof saved.search === 'string' && Number.isFinite(saved.expiresAt) && saved.expiresAt > now && saved.expiresAt <= now + 15 * 60 * 1000
    ? readWorkspaceLocation(saved.search) : readWorkspaceLocation(search);
}
