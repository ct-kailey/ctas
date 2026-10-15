import test from 'node:test';
import assert from 'node:assert/strict';
import { profileDraft, profileChanged, profilePayload, repositoryState, toolState, desktopError } from './state.mjs';
import { executionReadiness, localRunRequest, runActive, runLabel, executionError } from './execution-state.mjs';
const profile = { projectId: 'ctas', workspaceId: '', repositoryUrl: 'https://github.com/example/project', provider: 'codex', workingFolder: '/work/project' };
const state = { profile, selectedFolder: '/work/project', diagnostics: { repository: { status: 'ready', workingFolder: '/work/project', matchesProfile: true, head: 'a'.repeat(40) }, tools: { codex: { installed: true, errorCode: null } } } };
test('local profile accepts optional Nora workspace and never includes a user path in payload', () => {
  assert.deepEqual(profilePayload({ ...profile, projectId: ' ctas ', workingFolder: '/bad' }), { projectId: 'ctas', workspaceId: '', repositoryUrl: profile.repositoryUrl, provider: 'codex' });
  assert.throws(() => profilePayload({ ...profile, projectId: ' ' }), /프로젝트 ID/);
});
test('folder change must be saved before running', () => {
  assert.equal(profileChanged(profileDraft(state), state), false);
  assert.equal(profileChanged(profileDraft(state), { ...state, selectedFolder: '/different' }), true);
  assert.equal(executionReadiness(state, { dirty: true }).ready, false);
});
test('browser, missing profile and unavailable CLI cannot start', () => {
  assert.equal(executionReadiness(state, { native: false }).ready, false);
  assert.equal(executionReadiness({}).ready, false);
  assert.equal(executionReadiness({ ...state, diagnostics: { ...state.diagnostics, tools: { codex: { installed: false } } } }).ready, false);
});
test('Claude selection does not claim direct execution is implemented', () => {
  assert.match(executionReadiness({ ...state, profile: { ...profile, provider: 'claude-code' } }).reason, /준비 중/);
});
test('repository identity requires positive match, matching folder and observed HEAD', () => {
  assert.equal(executionReadiness(state).ready, true);
  for (const patch of [{ matchesProfile: false }, { matchesProfile: null }, { workingFolder: '/wrong' }, { head: null }, { status: 'error' }]) {
    assert.equal(executionReadiness({ ...state, diagnostics: { ...state.diagnostics, repository: { ...state.diagnostics.repository, ...patch } } }).ready, false);
  }
});
test('source dirty state does not silently include uncommitted files or change expected HEAD', () => {
  const dirtyState = { ...state, diagnostics: { ...state.diagnostics, repository: { ...state.diagnostics.repository, clean: false } } };
  assert.deepEqual(localRunRequest('  add a test  ', dirtyState), { prompt: 'add a test', expectedHead: 'a'.repeat(40) });
});
test('empty or overlong prompt rejected without a run payload', () => {
  assert.throws(() => localRunRequest(' ', state), /입력/);
  assert.throws(() => localRunRequest('a'.repeat(12001), state), /12,000/);
  assert.throws(() => localRunRequest('change', {}), /커밋/);
});
test('native diagnostics remain distinct from a connected SDK or account session', () => {
  assert.deepEqual(repositoryState({ status: 'ready', matchesProfile: false }).tone, 'warning');
  assert.equal(toolState({ installed: true, errorCode: 'VERSION_FAILED' }).tone, 'warning');
  assert.equal(toolState({ installed: true }).label, '설치 확인됨');
  assert.equal('connected' in executionReadiness(state), false);
});
test('only preparing and running schedule active refresh', () => {
  for (const status of ['preparing', 'running']) assert.equal(runActive({ status }), true);
  for (const status of ['completed', 'failed', 'cancelled', 'timed_out', 'interrupted', 'unknown']) assert.equal(runActive({ status }), false);
  assert.equal(runLabel({ status: 'unknown' }), '상태 확인 필요');
});
test('authentication and desktop failures give actionable safe text', () => {
  assert.match(executionError({ errorCode: 'CLI_AUTH_REQUIRED' }), /터미널에서 Codex에 로그인/);
  assert.match(desktopError({ code: 'DESKTOP_REQUIRED' }).message, /설치한 CTAS Desktop/);
});
test('preserves a safe native execution error summary when no tailored code exists', () => {
  assert.equal(executionError({errorCode:'LOCAL_OUTPUT_LIMIT',events:[{kind:'error',message:'출력 크기가 제한을 초과해 중단했습니다.'}]}),'출력 크기가 제한을 초과해 중단했습니다.');
});
