'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('dashboard links preserve the exact project and allowlisted workspace destination', async () => {
  const { readWorkspaceLocation, dashboardHref } = await import('../web/src/workspace-navigation.mjs');
  const entry = readWorkspaceLocation('?project=team%3Aone&tab=commercial&action=upload');
  assert.deepEqual(entry, {projectId:'team:one', invalidProject:false, tab:'commercial', action:'upload', workflowStep:'contract'});
  assert.equal(dashboardHref(entry.projectId), '/?tab=home&project=team%3Aone');
  const rejected = readWorkspaceLocation('?project=../private&tab=https://example.com&action=delete');
  assert.equal(rejected.invalidProject, true);
  assert.equal(rejected.tab, 'home');
  assert.equal(rejected.action, null);
  assert.equal(readWorkspaceLocation('?project=').invalidProject, true);
});

test('missing or unauthorized requested project never opens the first available project', async () => {
  const { readWorkspaceLocation, resolveWorkspaceProject } = await import('../web/src/workspace-navigation.mjs');
  const projects = [{id:'allowed'}, {id:'second'}];
  assert.deepEqual(resolveWorkspaceProject(projects, 'forbidden', readWorkspaceLocation('?project=forbidden')), {projectId:'', unavailable:true});
  assert.deepEqual(resolveWorkspaceProject(projects, '', readWorkspaceLocation('?project=forbidden')), {projectId:'', unavailable:true});
  assert.deepEqual(resolveWorkspaceProject(projects, 'second', readWorkspaceLocation('?project=second')), {projectId:'second', unavailable:false});
  assert.deepEqual(resolveWorkspaceProject(projects, '', readWorkspaceLocation('?project=second')), {projectId:'second', unavailable:false});
  assert.deepEqual(resolveWorkspaceProject(projects, '', readWorkspaceLocation('')), {projectId:'allowed', unavailable:false});
});

test('Google login restores only the intended workspace parameters once and expires them', async () => {
  const { readWorkspaceLocation, rememberWorkspaceReturn, restoreWorkspaceReturn } = await import('../web/src/workspace-navigation.mjs');
  const entries = new Map();
  const storage = { setItem: (k,v) => entries.set(k,v), getItem: k => entries.get(k) || null, removeItem: k => entries.delete(k) };
  const entry = readWorkspaceLocation('?project=second&tab=documents&action=upload');
  rememberWorkspaceReturn(storage, entry, 1000);
  assert.deepEqual(restoreWorkspaceReturn('', storage, 2000), entry);
  assert.deepEqual(restoreWorkspaceReturn('', storage, 2000), readWorkspaceLocation(''));
  rememberWorkspaceReturn(storage, entry, 1000);
  assert.deepEqual(restoreWorkspaceReturn('?project=explicit&tab=context', storage, 2000), readWorkspaceLocation('?project=explicit&tab=context'));
  rememberWorkspaceReturn(storage, entry, 1000);
  assert.deepEqual(restoreWorkspaceReturn('', storage, 1000000), readWorkspaceLocation(''));
  const empty = readWorkspaceLocation('?project=&action=upload');
  rememberWorkspaceReturn(storage, empty, 1000);
  assert.deepEqual(restoreWorkspaceReturn('', storage, 2000), empty);
  const invalid = readWorkspaceLocation('?project=../private&action=upload');
  rememberWorkspaceReturn(storage, invalid, 1000);
  assert.deepEqual(restoreWorkspaceReturn('', storage, 2000), invalid);
});


test('workspace remains accessible when browser storage access is blocked', async () => {
  const { workspaceStorage, readWorkspaceLocation, rememberWorkspaceReturn, restoreWorkspaceReturn } = await import('../web/src/workspace-navigation.mjs');
  const blocked = { get sessionStorage() { throw new Error('Storage blocked'); } };
  const storage = workspaceStorage(blocked);
  const entry = readWorkspaceLocation('?project=second&tab=commercial');
  assert.equal(storage, undefined);
  assert.doesNotThrow(() => rememberWorkspaceReturn(storage, entry));
  assert.deepEqual(restoreWorkspaceReturn('?project=second&tab=commercial', storage), entry);
});


test('work areas keep legacy links, member navigation and free access without progress gates', async () => {
  const { readWorkspaceLocation, rememberWorkspaceReturn, restoreWorkspaceReturn } = await import('../web/src/workspace-navigation.mjs');
  const { WORKFLOW_STEPS, resolveWorkflowStep } = await import('../web/src/workspace-flow.mjs');
  assert.ok(WORKFLOW_STEPS.some(area => area.tabs.includes('members')));
  assert.equal(readWorkspaceLocation('').tab, 'home');
  assert.equal(readWorkspaceLocation('?project=second&tab=members').tab, 'members');
  assert.equal(readWorkspaceLocation('?tab=alerts').workflowStep, null);
  assert.equal(readWorkspaceLocation('?tab=context&step=knowledge').workflowStep, 'knowledge');
  assert.equal(readWorkspaceLocation('?tab=documents&step=knowledge').workflowStep, 'collect');
  assert.equal(resolveWorkflowStep('work-governance', 'validate').id, 'plan');
  const entry = readWorkspaceLocation('?project=second&tab=context&step=knowledge');
  const entries = new Map(); const storage = {setItem:(k,v)=>entries.set(k,v), getItem:k=>entries.get(k), removeItem:k=>entries.delete(k)};
  rememberWorkspaceReturn(storage, entry, 1000);
  assert.deepEqual(restoreWorkspaceReturn('', storage, 2000), entry);
  assert.ok(WORKFLOW_STEPS.every(s => !Object.hasOwn(s,'completed') && s.tabs.includes(s.primaryTab)));
});
