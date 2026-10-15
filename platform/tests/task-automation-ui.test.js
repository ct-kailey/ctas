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
