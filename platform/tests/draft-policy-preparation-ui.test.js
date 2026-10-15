'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/draft-policy-preparation-state.mjs');

test('draft preparation waits for actual complete source extraction', async () => {
  const { draftPolicySourceState } = await state();
  assert.equal(draftPolicySourceState(null).ready, false);
  assert.deepEqual(draftPolicySourceState({ status: 'extracting' }).pending, true);
  assert.equal(draftPolicySourceState({ status: 'ready' }).ready, false);
  const revision = { status: 'ready', document_json: { extraction: { complete: true }, segments: [{ extraction_status: 'ok' }] } };
  assert.equal(draftPolicySourceState(revision).ready, true);
  for (const document_json of [{ extraction: { complete: false }, segments: revision.document_json.segments }, { extraction: { complete: true }, segments: [] }, { extraction: { complete: true }, segments: [{ extraction_status: 'needs_review' }] }]) assert.equal(draftPolicySourceState({ ...revision, document_json }).ready, false);
});

test('draft results show only analyses and real tasks from the selected policy revision', async () => {
  const { draftPolicyResults, draftPolicyResultKey } = await state();
  const data = { analyses: [{ id: 'a', revision_id: 'current', status: 'running' }, { id: 'b', revision_id: 'other', status: 'completed' }], tasks: [{ id: 'one', analysis_id: 'a', status: 'todo' }, { id: 'other', analysis_id: 'b' }, { id: 'unlinked' }] };
  assert.deepEqual(draftPolicyResults(data, 'current'), { analyses: [data.analyses[0]], tasks: [data.tasks[0]], active: true });
  const key = draftPolicyResultKey(data, 'current');
  data.analyses[1].status = 'failed';
  assert.equal(draftPolicyResultKey(data, 'current'), key);
  data.analyses[0].status = 'completed';
  assert.notEqual(draftPolicyResultKey(data, 'current'), key);
  assert.equal(draftPolicyResults(data, 'current').active, false);
});

test('analysis retry binds the observed failed job and requires explicit uncertain-result acknowledgement', async () => {
  const { policyAnalysisRetryPayload } = await state();
  const failed = { status: 'failed', can_retry: true, execution: { id: 'job-1', status: 'failed' } };
  assert.deepEqual(policyAnalysisRetryPayload(failed, 'request-1'), { request_id: 'request-1', expected_job_id: 'job-1' });
  const uncertain = { ...failed, status: 'uncertain', execution: { id: 'job-2', status: 'uncertain' } };
  assert.throws(() => policyAnalysisRetryPayload(uncertain, 'request-2'));
  assert.deepEqual(policyAnalysisRetryPayload(uncertain, 'request-2', true), { request_id: 'request-2', expected_job_id: 'job-2', acknowledge_uncertain: true });
  for (const analysis of [{ ...failed, can_retry: false }, { ...failed, status: 'completed' }, { ...failed, execution: { id: 'job-1', status: 'running' } }, { ...failed, execution: null }]) assert.throws(() => policyAnalysisRetryPayload(analysis, 'request-3', true));
});
