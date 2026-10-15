'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/task-automation-state.mjs');
const artifact = () => ({ head_sha: 'a'.repeat(40), preview_url: 'https://preview.example.com/task/one', diff: '+ real change', checks: [{ name: 'Build', status: 'passed' }] });

test('automated tasks retain server QA and merge states instead of optimistic completion', async () => {
  const { automationColumn, automationActive, automationExecutionLabel } = await state();
  for (const execution_status of ['ready', 'merging', 'uncertain', 'failed']) assert.equal(automationColumn({ status: 'qa', execution_status }), 'qa');
  assert.equal(automationColumn({ status: 'done', execution_status: 'ready' }), 'done');
  assert.equal(automationColumn({ status: 'unknown' }), 'blocked');
  assert.match(automationExecutionLabel({ status: 'done', execution_status: 'ready' }), /병합 완료/);
  assert.doesNotMatch(automationExecutionLabel({ status: 'done', execution_status: 'ready' }), /검수 대기/);
  assert.equal(Boolean(automationActive({ tasks: [{ execution_status: 'merging' }] })), true);
  assert.equal(Boolean(automationActive({ tasks: [{ execution_status: 'ready' }] })), false);
  assert.equal(Boolean(automationActive({ intake: [{ status: 'pending' }] })), true);
  assert.equal(Boolean(automationActive({ intake: [{ status: 'awaiting_connection' }] })), false);
});

test('only project writers can start development and only reviewers can approve, with no shared mutations', async () => {
  const { automationPermissions } = await state();
  assert.deepEqual(automationPermissions('owner', null), { canWrite: true, canReview: true, canConfigure: true });
  assert.deepEqual(automationPermissions('reviewer', null), { canWrite: true, canReview: true, canConfigure: false });
  assert.deepEqual(automationPermissions('member', null), { canWrite: true, canReview: false, canConfigure: false });
  for (const role of ['owner', 'reviewer', 'member', 'viewer']) {
    assert.deepEqual(automationPermissions(role, { source_user_id: 'owner' }), { canWrite: false, canReview: false, canConfigure: false });
  }
  assert.deepEqual(automationPermissions('viewer', null), { canWrite: false, canReview: false, canConfigure: false });
});

test('policy analysis entry excludes other documents and execution waits for complete extraction', async () => {
  const { policyAnalysisEligible, policyAnalysisSourceReady } = await state();
  const document = { document_category: 'policy', source_type: 'revision' };
  const revision = { status: 'ready', document_json: { extraction: { complete: true }, segments: [{ extraction_status: 'ok' }] } };
  assert.equal(policyAnalysisEligible(document, revision), true);
  assert.equal(policyAnalysisSourceReady(revision), true);
  for (const category of ['requirements', 'design', 'meeting']) assert.equal(policyAnalysisEligible({ ...document, document_category: category }, revision), false);
  assert.equal(policyAnalysisEligible({ ...document, source_type: 'commercial_revision' }, revision), false);
  assert.equal(policyAnalysisEligible(document, { status: 'extracting' }), false);
  for (const source of [{}, { extraction: { complete: false }, segments: [{ extraction_status: 'ok' }] }, { extraction: { complete: true }, segments: [] }, { extraction: { complete: true }, segments: [{ extraction_status: 'needs_review' }] }]) {
    assert.equal(policyAnalysisSourceReady({ ...revision, document_json: source }), false);
  }
  assert.equal(policyAnalysisSourceReady({ ...revision, document_json: { ...revision.document_json, normalization: { status: 'needs_review' } } }), true);
});

test('preview settings accept only bounded HTTPS origins and normalize duplicates', async () => {
  const { parsePreviewOrigins } = await state();
  assert.deepEqual(parsePreviewOrigins(' https://PREVIEW.example.com/\nhttps://preview.example.com\nhttps://second.example.com\n'), ['https://preview.example.com', 'https://second.example.com']);
  assert.deepEqual(parsePreviewOrigins(''), []);
  for (const value of ['http://preview.example.com', 'https://preview.example.com/path', 'https://user@preview.example.com', 'https://preview.example.com?q=token', 'https://preview.example.com#fragment', 'not a URL']) assert.throws(() => parsePreviewOrigins(value));
  assert.throws(() => parsePreviewOrigins(Array.from({ length: 11 }, (_, i) => `https://preview${i}.example.com`).join('\n')), /10/);
});

test('artifact preview links require the exact configured HTTPS origin', async () => {
  const { automationPreviewUrl } = await state();
  const origins = ['https://preview.example.com'];
  assert.equal(automationPreviewUrl('https://preview.example.com/task/one?mode=review', origins), 'https://preview.example.com/task/one?mode=review');
  for (const value of ['http://preview.example.com/task', 'https://preview.example.com.evil.test/task', 'https://user@preview.example.com/task', 'https://preview.example.com:444/task', '//preview.example.com/task', 'javascript:alert(1)']) assert.equal(automationPreviewUrl(value, origins), null);
  assert.equal(automationPreviewUrl('https://preview.example.com/task', []), null);
});

test('approval requires a real review artifact, all passed checks and server merge capability', async () => {
  const { automationMergeReadiness } = await state();
  const task = { status: 'qa', execution_status: 'ready', artifact: artifact() }, settings = { preview_origins: ['https://preview.example.com'] };
  assert.equal(automationMergeReadiness(task, { merge: true }, settings).allowed, true);
  for (const patch of [{ status: 'in_progress' }, { status: 'done' }, { execution_status: 'uncertain' }, { execution_status: 'merging' }]) assert.equal(automationMergeReadiness({ ...task, ...patch }, { merge: true }, settings).allowed, false);
  for (const patch of [{ diff: '' }, { head_sha: 'short' }, { preview_url: 'https://other.example.com' }, { checks: [] }, { checks: [{ name: 'Build', status: 'pending' }] }, { checks: [{ name: 'Build', status: 'failed' }] }]) assert.equal(automationMergeReadiness({ ...task, artifact: { ...artifact(), ...patch } }, { merge: true }, settings).allowed, false);
  assert.equal(automationMergeReadiness(task, { merge: false }, settings).allowed, false);
  assert.equal(automationMergeReadiness(task, undefined, settings).allowed, false);
  assert.equal(automationMergeReadiness(task, { merge: true }, {}).allowed, false);
});

test('missing connections use server-provided reasons without claiming capability', async () => {
  const { automationBlockerLabel } = await state();
  assert.equal(automationBlockerLabel({ code: 'NORA_GIT_PUSH_UNAVAILABLE', message: '선택한 연결에는 코드 전송 기능이 없습니다.' }), '선택한 연결에는 코드 전송 기능이 없습니다.');
  assert.match(automationBlockerLabel('TASK_CONNECTION_REQUIRED'), /Nora.*확인/);
  assert.match(automationBlockerLabel('TASK_SOURCE_STALE'), /재분석/);
});

test('only idle todo tasks with writer permission and connected development can move to execution', async () => {
  const { automationCanStart } = await state();
  const task = { status: 'todo', execution_status: 'idle' };
  assert.equal(automationCanStart(task, { canWrite: true }, { development: true }), true);
  for (const status of ['blocked', 'qa', 'in_progress', 'done']) assert.equal(automationCanStart({ ...task, status }, { canWrite: true }, { development: true }), false);
  for (const execution_status of ['queued', 'running', 'uncertain', 'failed']) assert.equal(automationCanStart({ ...task, execution_status }, { canWrite: true }, { development: true }), false);
  assert.equal(automationCanStart(task, { canWrite: false }, { development: true }), false);
  assert.equal(automationCanStart(task, { canWrite: true }, { development: false }), false);
});

const startCheck = () => ({ task_id: 'task-1', task_version: 3, review_token: 'a'.repeat(64), requires_confirmation: true, questions: [{ id: 'question-1', question: '승인 전 한도는 얼마인가요?', answer: '임시로 10건까지', status: 'answered' }] });

test('a cancelled provisional start only reads evidence and never writes consent or task state', async () => {
  const { startAutomationTask } = await state(), calls = [];
  const result = await startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async (path, options) => { calls.push({ path, options }); return startCheck(); }, confirm: async check => { assert.equal(check.questions[0].answer, '임시로 10건까지'); return false; } });
  assert.deepEqual(result, { status: 'cancelled' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/tasks/task-1/start-check');
  assert.equal(calls[0].options.method, undefined);
});

test('confirmed start sends only the latest task version and exact reviewed evidence token', async () => {
  const { startAutomationTask } = await state(), calls = [];
  const result = await startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async (path, options) => { calls.push({ path, options }); return calls.length === 1 ? startCheck() : { task: { id: 'task-1', status: 'in_progress' } }; }, confirm: async () => true });
  assert.equal(result.status, 'started');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { path: '/tasks/task-1', options: { method: 'PATCH', body: { status: 'in_progress', expected_version: 3, provisional_consent: { review_token: 'a'.repeat(64) } } } });
});

test('unambiguous tasks begin immediately after server check without provisional consent', async () => {
  const { startAutomationTask } = await state(), calls = [];
  const result = await startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async (path, options) => { calls.push({ path, options }); return calls.length === 1 ? { ...startCheck(), requires_confirmation: false, review_token: null } : { task: {} }; }, confirm: async () => { assert.fail('No extra confirmation for an unambiguous task'); } });
  assert.equal(result.status, 'started');
  assert.deepEqual(calls[1].options.body, { status: 'in_progress', expected_version: 3 });
});

test('changed or unavailable evidence does not retry development using stale consent', async () => {
  const { startAutomationTask } = await state(), calls = [];
  const changed = Object.assign(new Error('고객 질문이 변경되었습니다.'), { status: 409, code: 'TASK_PROVISIONAL_CONTEXT_CHANGED' });
  await assert.rejects(startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async (path, options) => { calls.push({ path, options }); if (calls.length === 1) return startCheck(); throw changed; }, confirm: async () => true }), error => error === changed);
  assert.equal(calls.length, 2);
  let fetched = 0;
  await assert.rejects(startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async () => { fetched += 1; throw new Error('네트워크 오류'); }, confirm: async () => assert.fail('No confirmation without current evidence') }), /네트워크/);
  assert.equal(fetched, 1);
});

test('navigation or unmount while reading or confirming cannot start development', async () => {
  const { startAutomationTask } = await state();
  for (const cancelAt of ['read', 'confirm']) {
    let active = true, writes = 0;
    const result = await startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', isActive: () => active, request: async (path, options) => { if (options?.method === 'PATCH') writes += 1; if (cancelAt === 'read') active = false; return startCheck(); }, confirm: async () => { active = false; return true; } });
    assert.equal(result.status, 'cancelled'); assert.equal(writes, 0);
  }
});

test('invalid or cross-task start checks fail closed instead of bypassing confirmation', async () => {
  const { automationStartCheck } = await state();
  for (const value of [null, { ...startCheck(), task_id: 'other-task' }, { ...startCheck(), task_version: 0 }, { ...startCheck(), requires_confirmation: undefined }, { ...startCheck(), review_token: 'invalid' }]) assert.throws(() => automationStartCheck(value, 'task-1'), /확인 정보/);
  assert.deepEqual(automationStartCheck(startCheck(), 'task-1').work_gaps, []);
});
