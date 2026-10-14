'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/source-review-state.mjs');
const confirmation = () => import('../web/src/source-review-confirm.mjs');

test('review selection preserves a requested historical version and never falls back to another project document', async () => {
  const { sourceReviewDocuments, sourceReviewSelection } = await state();
  const original = [{ id: 'first', baseline_revision_id: 'new', revisions: [{ id: 'old', created_at: '2026-01-01' }, { id: 'new', created_at: '2026-02-01' }] }, { id: 'second', revisions: [{ id: 'other', created_at: '2026-03-01' }] }];
  const docs = sourceReviewDocuments(original);
  assert.equal(sourceReviewSelection(docs, 'old').revision.id, 'old');
  assert.equal(sourceReviewSelection(docs, 'not-in-this-project'), null);
  assert.equal(sourceReviewSelection(docs, '').document.id, 'second');
  assert.equal(original[0].revisions[0].id, 'old');
});

test('source analysis matches both source type and revision, not title or matching ID of another type', async () => {
  const { sourceRunsForRevision, sourceCandidatesForRevision } = await state();
  const runs = [{ id: 'a', source_refs: [{ type: 'revision', id: 'one' }] }, { id: 'b', source_refs: [{ type: 'commercial_revision', id: 'one' }] }, { id: 'c', source_refs: [{ type: 'revision', id: 'two' }] }];
  assert.deepEqual(sourceRunsForRevision(runs, 'one').map((run) => run.id), ['a']);
  assert.deepEqual(sourceCandidatesForRevision(runs, 'one', 'commercial_revision').map((run) => run.id), ['b']);
});

test('pending candidate confirmation retains version, question and policy conflict blockers', async () => {
  const { candidateBlockers } = await state();
  assert.deepEqual(candidateBlockers({ status: 'pending', base_version: 1, questions: [{ blocking: true, answer: ' ' }], conflicts: [{ resolution: 'unresolved' }] }, 2), { stale: true, questions: true, conflicts: true });
});

const payload = { selected_indices: [0, 2], expected_sha256: 'a'.repeat(64), expected_context_version: 3, reason: '원문 확인 완료' };
const run = (status, extra = {}) => ({ id: 'run-1', reviewed_sha256: payload.expected_sha256, status, ...extra });

test('explicit confirmation approves the reviewed snapshot, waits for Nora and confirms exactly the selected items', async () => {
  const { confirmSourceAnalysis } = await confirmation(); const calls = []; let reads = 0;
  const request = async (url, options) => { calls.push({ url, options }); if (url.endsWith('/decision')) return { run: run('finalizing') }; if (url.endsWith('/confirm')) return { record_ids: ['first', 'third'] }; return { run: ++reads === 1 ? run('waiting_approval') : run('ready', { decision: { decision: 'approved' } }) }; };
  const response = await confirmSourceAnalysis({ request, route: '/context', runId: 'run-1', payload, wait: async () => {} });
  assert.deepEqual(response.record_ids, ['first', 'third']);
  assert.equal(calls.filter((call) => call.url.endsWith('/decision')).length, 1);
  assert.deepEqual(calls.at(-1).options.body, payload);
});

test('an incomplete Nora finalization returns pending after bounded polling without confirming', async () => {
  const { confirmSourceAnalysis } = await confirmation(); const calls = [];
  const request = async (url, options) => { calls.push({ url, options }); return { run: run('finalizing') }; };
  const result = await confirmSourceAnalysis({ request, route: '/context', runId: 'run-1', payload, wait: async () => {}, attempts: 2 });
  assert.equal(result.pending, true); assert.equal(calls.length, 3); assert.equal(calls.some((call) => call.options), false);
});

test('retry of an already approved run preserves the original context version and never approves twice', async () => {
  const { confirmSourceAnalysis } = await confirmation(); const calls = [];
  const request = async (url, options) => { calls.push({ url, options }); return url.endsWith('/confirm') ? { record_ids: ['one'], replayed: true, version: 9 } : { run: run('ready', { context_version: 3, decision: { decision: 'approved' } }) }; };
  const result = await confirmSourceAnalysis({ request, route: '/context', runId: 'run-1', payload });
  assert.equal(result.replayed, true); assert.equal(calls.length, 2); assert.equal(calls[1].options.body.expected_context_version, 3);
});

test('a newer result or uncertain execution is never implicitly approved', async () => {
  const { confirmSourceAnalysis } = await confirmation();
  for (const value of [run('waiting_approval', { reviewed_sha256: 'b'.repeat(64) }), run('uncertain'), run('failed'), run('rejected')]) {
    const writes = [];
    await assert.rejects(confirmSourceAnalysis({ request: async (_url, options) => { if (options) writes.push(options); return { run: value }; }, route: '/context', runId: 'run-1', payload }), { status: 409 });
    assert.equal(writes.length, 0);
  }
});

test('source conflicts from the server stay failures and do not trigger fallback approval or retries', async () => {
  const { confirmSourceAnalysis } = await confirmation(); let writes = 0;
  const request = async (_url, options) => { if (options) { writes += 1; throw Object.assign(new Error('원문 변경'), { status: 409, code: 'CONTEXT_SOURCE_STALE' }); } return { run: run('ready', { decision: { decision: 'approved' } }) }; };
  await assert.rejects(confirmSourceAnalysis({ request, route: '/context', runId: 'run-1', payload }), { code: 'CONTEXT_SOURCE_STALE' });
  assert.equal(writes, 1);
});
