const FIELDS = ['name', 'project_kind', 'goal', 'repository_url', 'base_branch'];

export function projectSettingsDraft(settings, project = {}) {
  return {
    name: settings?.name ?? project.name ?? '',
    project_kind: settings?.project_kind || 'unspecified',
    goal: settings?.goal || '',
    repository_url: settings?.repository_url || '',
    base_branch: settings?.base_branch || '',
  };
}

export function projectSettingsDirty(draft, settings, project) {
  if (!draft || !settings) return false;
  const initial = projectSettingsDraft(settings, project);
  return FIELDS.some(field => draft[field] !== initial[field]);
}

export function projectSettingsPatch(draft, settings, project) {
  const initial = projectSettingsDraft(settings, project), patch = { expected_version: settings.version };
  for (const field of FIELDS) {
    const value = draft[field].trim();
    if (value !== initial[field]) patch[field] = value;
  }
  if (!draft.name.trim()) throw new Error('프로젝트 이름을 입력해 주세요.');
  return patch;
}

// A profile update cannot select another project or replace access/binding metadata.
export function applySavedProjectSettings(projects, settings) {
  if (!settings?.project_id || typeof settings.name !== 'string') return projects;
  return projects.map(project => project.id === settings.project_id
    ? { ...project, name: settings.name, ...(settings.project_kind ? { project_kind: settings.project_kind } : {}) }
    : project);
}
