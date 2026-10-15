'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/project-settings-state.mjs');

test('project name edits submit the current version and leave unrelated project information out', async () => {
  const { projectSettingsDraft, projectSettingsPatch } = await state();
  const settings = { project_id: 'ains-id', version: 7, name: 'AINS', goal: '기존 목표', project_kind: 'product_development', repository_url: 'https://github.com/example/project.git', base_branch: 'main' };
  const draft = { ...projectSettingsDraft(settings), name: ' CTAS ' };
  assert.deepEqual(projectSettingsPatch(draft, settings), { expected_version: 7, name: 'CTAS' });
  assert.equal(settings.name, 'AINS');
  assert.equal(draft.name, ' CTAS ');
});

test('profile edits preserve empty values explicitly and reject blank names', async () => {
  const { projectSettingsDraft, projectSettingsPatch } = await state();
  const settings = { version: 3, name: 'CTAS', goal: '기존 목표', project_kind: 'client_project', repository_url: 'https://github.com/example/project.git', base_branch: 'main' };
  const draft = { ...projectSettingsDraft(settings), goal: '', repository_url: '', base_branch: '' };
  assert.deepEqual(projectSettingsPatch(draft, settings), { expected_version: 3, goal: '', repository_url: '', base_branch: '' });
  assert.throws(() => projectSettingsPatch({ ...draft, name: '  ' }, settings), /프로젝트 이름/);
});

test('settings defaults and draft tracking remain stable until a canonical response arrives', async () => {
  const { projectSettingsDraft, projectSettingsDirty, projectSettingsPatch } = await state();
  const settings = { version: 1, name: 'AINS', project_kind: 'unspecified', goal: null, repository_url: null, base_branch: null };
  const draft = projectSettingsDraft(settings);
  assert.equal(projectSettingsDirty(draft, settings), false);
  const edit = { ...draft, name: 'CTAS' };
  assert.equal(projectSettingsDirty(edit, settings), true);
  assert.deepEqual(projectSettingsPatch(edit, settings), { expected_version: 1, name: 'CTAS' });
  assert.equal(projectSettingsDirty(edit, { ...settings, name: 'CTAS', version: 2 }), false);
});

test('renaming the selected project updates its display without changing IDs, permissions, bindings or order', async () => {
  const { applySavedProjectSettings } = await state();
  const { resolveWorkspaceProject } = await import('../web/src/workspace-navigation.mjs');
  const projects = [{ id: 'other', name: '다른 프로젝트', role: 'owner' }, { id: 'ains-id', name: 'AINS', role: 'owner', nora_workspace_id: 't_existing123', project_kind: 'product_development' }];
  const result = applySavedProjectSettings(projects, { project_id: 'ains-id', name: 'CTAS', project_kind: 'product_development', id: 'new-id', role: 'viewer', nora_workspace_id: 't_other123' });
  assert.deepEqual(result.map(project => project.id), ['other', 'ains-id']);
  assert.strictEqual(result[0], projects[0]);
  assert.deepEqual(result[1], { ...projects[1], name: 'CTAS' });
  assert.equal(projects[1].name, 'AINS');
  assert.equal(resolveWorkspaceProject(result, 'ains-id', {}).projectId, 'ains-id');
  assert.deepEqual(applySavedProjectSettings(projects, { project_id: 'unknown', name: 'CTAS' }), projects);
});
