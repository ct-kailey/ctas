'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createWorker, classifyFailure, safeErrorCode, verifyNormalization } = require('../server/worker');
const { prepareReview } = require('../../nora/flow/review-core');
const pipelineManifest = require('../../nora/pipeline/manifest.json');

function coded(code, extra) { return Object.assign(new Error('Private source text or credential'), { code, ...extra }); }
function rawDocument(revision) {
  return { schema_version: '1.0', project_id: revision.project_id, document_id: revision.document_id,
    revision_id: revision.id, source: { filename: revision.filename, mime_type: revision.mime_type, sha256: revision.sha256 },
    segments: [{ segment_id: 's1', requirement_key: 'REQ-001', text: revision.content.toString(),
      locator: { kind: 'text', label: 'full text' }, extraction_status: 'ok' }], extraction: { complete: true, warnings: [] } };
}
function normalized(document) {
  return { ...structuredClone(document), segments: document.segments.map(segment => ({ ...segment,
    normalized_text: segment.text.replace(/\s+/g, ' ').trim() })),
  normalization: { status: 'ready', warnings: [], segment_count: document.segments.length } };
}
function result(request) {
  return { schema_version: '1.0', request_id: request.request_id, project_id: request.project_id,
    status: 'needs_review', changes: prepareReview(request).candidates.map(candidate => ({
      change_id: candidate.change_id, requirement_key: candidate.requirement_key, change_type: candidate.change_type,
      risk: candidate.risk, before: candidate.before, after: candidate.after, summary: '처리 시간 변경',
      reason: '원문 수치가 달라졌습니다.', impacts: [],
    })), questions: [], warnings: [], approval: { status: 'not_requested', baseline_publication_allowed: false } };
}

test('only potentially executed requests become uncertain; unknown diagnostic values are hidden', () => {
  for (const code of ['FLOW_TRANSPORT_UNKNOWN', 'PIPELINE_HTTP_503', 'FLOW_HTTP_408', 'FLOW_RESPONSE_INVALID']) {
    assert.equal(classifyFailure(coded(code), true).status, 'uncertain');
  }
  for (const code of ['FLOW_HTTP_401', 'PIPELINE_HTTP_429', 'EVIDENCE_MISMATCH', 'FILE_LIMIT']) {
    assert.equal(classifyFailure(coded(code), true).status, 'failed');
  }
  assert.equal(classifyFailure(new Error('secret'), false).status, 'failed');
  assert.equal(classifyFailure(new Error('secret'), true).status, 'uncertain');
  assert.equal(safeErrorCode(coded('MY_PRIVATE_SECRET')), 'WORKER_INTERNAL');
});

test('normalization cannot alter source evidence, metadata or drop segment count', () => {
  const document = rawDocument({ id: 'revision-1', project_id: 'project-1', document_id: 'document-1',
    filename: 'input.txt', mime_type: 'text/plain', sha256: 'a'.repeat(64), content: Buffer.from('5초') });
  assert.deepEqual(verifyNormalization(document, normalized(document)), normalized(document));
  const corrupt = normalized(document); corrupt.segments[0].text = '50초';
  assert.throws(() => verifyNormalization(document, corrupt), { code: 'PIPELINE_SOURCE_CHANGED' });
  const missing = normalized(document); delete missing.normalization;
  assert.throws(() => verifyNormalization(document, missing), { code: 'PIPELINE_NORMALIZATION_INVALID' });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test('durable worker PostgreSQL integration', { skip: !databaseUrl }, async t => {
  const schema = 'worker_test_' + randomUUID().replaceAll('-', '');
  const admin = createPool(databaseUrl);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool({ connectionString: databaseUrl, options: '-c search_path=' + schema });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(pool);
  const userId = randomUUID(), projectId = 'project-worker';
  await pool.query('INSERT INTO users (id,email,name,password_hash) VALUES ($1,$2,$3,$4)',
    [userId, 'worker@example.test', 'Worker test', 'not-an-auth-fixture']);
  await pool.query('INSERT INTO projects (id,name) VALUES ($1,$2)', [projectId, 'Worker']);
  async function makeRevision({ documentId, status = 'queued', text = '5초 이내', hash } = {}) {
    if (!documentId) {
      documentId = randomUUID();
      await pool.query('INSERT INTO documents (id,project_id,title) VALUES ($1,$2,$3)', [documentId, projectId, '요구사항']);
    }
    const revision = { id: randomUUID(), project_id: projectId, document_id: documentId,
      filename: 'input.txt', mime_type: 'text/plain', content: Buffer.from(text) };
    revision.sha256 = hash || createHash('sha256').update(revision.content).digest('hex');
    await pool.query(`INSERT INTO revisions (id,project_id,document_id,filename,mime_type,sha256,content,status,document_json,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`, [revision.id, projectId, documentId, revision.filename,
      revision.mime_type, revision.sha256, revision.content, status,
      status === 'ready' ? JSON.stringify(normalized(rawDocument(revision))) : null, userId]);
    return revision;
  }
  async function intake(options) {
    const revision = await makeRevision(options), id = randomUUID();
    await pool.query(`INSERT INTO jobs (id,project_id,kind,revision_id) VALUES ($1,$2,'intake',$3)`, [id, projectId, revision.id]);
    return { id, revision };
  }
  async function reviewJob() {
    const baseline = await makeRevision({ status: 'ready' });
    const current = await makeRevision({ status: 'ready', documentId: baseline.document_id, text: '50초 이내' });
    const id = randomUUID(), reviewId = randomUUID();
    const request = { schema_version: '1.0', request_id: reviewId, project_id: projectId,
      baseline: normalized(rawDocument(baseline)), current: normalized(rawDocument(current)),
      domain_pack: { id: 'sism', version: '1.0', glossary: [] }, impact_map: [] };
    await pool.query(`INSERT INTO reviews (id,project_id,document_id,baseline_revision_id,current_revision_id,request,created_by)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [reviewId, projectId, baseline.document_id, baseline.id, current.id, JSON.stringify(request), userId]);
    await pool.query(`INSERT INTO jobs (id,project_id,kind,review_id) VALUES ($1,$2,'review',$3)`, [id, projectId, reviewId]);
    return { id, reviewId, request };
  }
  const jobState = async id => (await pool.query('SELECT * FROM jobs WHERE id=$1', [id])).rows[0];
  const revisionState = async id => (await pool.query('SELECT * FROM revisions WHERE id=$1', [id])).rows[0];
  function worker(overrides = {}) {
    return createWorker({ pool, pipelineToken: 'test-pipeline-token', flowToken: 'test-flow-token',
      extract: async revision => rawDocument(revision),
      normalize: async document => ({ runId: 'pipeline-run-1', document: normalized(document), idempotencyKey: 'fixture-key' }),
      review: async request => ({ traceId: 'trace-review-1', review: result(request) }), ...overrides });
  }

  await t.test('intake commits intent before external call and atomically publishes ready revision', async () => {
    const queued = await intake(); let calls = 0;
    const instance = worker({ normalize: async document => {
      calls++;
      const running = await jobState(queued.id);
      assert.equal(running.status, 'running'); assert.equal(running.stage, 'pipeline_intent');
      assert.equal(running.stage_data.extracted_document.source.sha256, queued.revision.sha256);
      assert.equal(running.stage_data.idempotency_key, createHash('sha256').update(JSON.stringify([
        pipelineManifest.workspace_id, pipelineManifest.pipeline_id, pipelineManifest.publication_version, document,
      ])).digest('hex'));
      const reconstructedKey = createHash('sha256').update(JSON.stringify([
        pipelineManifest.workspace_id, pipelineManifest.pipeline_id, pipelineManifest.publication_version,
        running.stage_data.extracted_document,
      ])).digest('hex');
      assert.notEqual(reconstructedKey, running.stage_data.idempotency_key,
        'JSONB reorders keys: persist the actual dispatch identity, never reconstruct it after reading JSONB');
      return { runId: 'pipeline-intent-test', document: normalized(document), idempotencyKey: 'key' };
    } });
    assert.equal((await instance.processOne()).status, 'succeeded');
    const done = await jobState(queued.id), revision = await revisionState(queued.revision.id);
    assert.equal(done.stage, 'completed'); assert.equal(done.lease_token, null); assert.equal(done.attempt, 1);
    assert.equal(revision.status, 'ready'); assert.equal(done.stage_data.run_id, 'pipeline-intent-test');
    assert.deepEqual(revision.content, queued.revision.content);
    assert.equal(await instance.processOne(), null); assert.equal(calls, 1);
  });

  await t.test('corrupt source is failed without Nora execution', async () => {
    const queued = await intake({ hash: '0'.repeat(64) }); let calls = 0;
    const outcome = await worker({ normalize: async () => { calls++; } }).processOne();
    assert.equal(outcome.code, 'SOURCE_HASH_MISMATCH'); assert.equal(outcome.status, 'failed'); assert.equal(calls, 0);
    assert.equal((await revisionState(queued.revision.id)).error_code, 'SOURCE_HASH_MISMATCH');
  });

  await t.test('authentication failure is terminal and is never retried automatically', async () => {
    const queued = await intake(); let calls = 0;
    const instance = worker({ normalize: async () => { calls++; throw coded('PIPELINE_HTTP_401'); } });
    assert.equal((await instance.processOne()).status, 'failed');
    assert.equal(await instance.processOne(), null); assert.equal(calls, 1);
    assert.equal((await jobState(queued.id)).error_code, 'PIPELINE_HTTP_401');
  });

  await t.test('5xx with possible remote completion is uncertain with retained intent', async () => {
    const queued = await intake();
    const outcome = await worker({ normalize: async () => { throw coded('PIPELINE_HTTP_503', { runId: 'possible-run' }); } }).processOne();
    assert.equal(outcome.status, 'uncertain');
    const state = await jobState(queued.id);
    assert.equal(state.stage, 'pipeline_intent'); assert.equal(state.stage_data.run_id, 'possible-run');
    assert.match(state.stage_data.idempotency_key, /^[a-f0-9]{64}$/);
    assert.equal((await revisionState(queued.revision.id)).status, 'uncertain');
  });

  await t.test('restart recovers expired work as uncertain without replaying the call', async () => {
    const queued = await intake(); let calls = 0;
    await pool.query(`UPDATE revisions SET status='running' WHERE id=$1`, [queued.revision.id]);
    await pool.query(`UPDATE jobs SET status='running',stage='pipeline_intent',attempt=1,lease_token=$2,
      lease_expires_at=now()-interval '1 second' WHERE id=$1`, [queued.id, randomUUID()]);
    const instance = worker({ normalize: async () => { calls++; } });
    assert.equal(await instance.recoverExpired(), 1);
    assert.equal(await instance.processOne(), null); assert.equal(calls, 0);
    assert.equal((await jobState(queued.id)).error_code, 'WORKER_LEASE_EXPIRED');
  });

  await t.test('late success after expiry is discarded and cannot make a revision ready', async () => {
    const queued = await intake();
    const instance = worker({ normalize: async document => {
      await pool.query(`UPDATE jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1`, [queued.id]);
      return { runId: 'late-run', document: normalized(document) };
    } });
    assert.equal((await instance.processOne()).status, 'discarded');
    assert.equal((await jobState(queued.id)).status, 'uncertain');
    const revision = await revisionState(queued.revision.id);
    assert.equal(revision.status, 'uncertain'); assert.equal(revision.document_json, null);
  });

  await t.test('replaced lease cannot be overwritten by stale completion', async () => {
    const queued = await intake(), replacement = randomUUID();
    const instance = worker({ normalize: async document => {
      await pool.query(`UPDATE jobs SET lease_token=$2 WHERE id=$1`, [queued.id, replacement]);
      return { runId: 'stale-run', document: normalized(document) };
    } });
    assert.equal((await instance.processOne()).status, 'discarded');
    const state = await jobState(queued.id);
    assert.equal(state.lease_token, replacement); assert.equal(state.status, 'running');
    assert.equal((await revisionState(queued.revision.id)).document_json, null);
    await pool.query(`UPDATE jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1`, [queued.id]);
    await instance.recoverExpired();
  });

  await t.test('two worker processes cannot claim the same job', async () => {
    const queued = await intake(); let unblock, signalStarted, calls = 0;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const pending = new Promise(resolve => { unblock = resolve; });
    const first = worker({ normalize: async document => {
      calls++; signalStarted(); await pending;
      return { runId: 'single-claim', document: normalized(document) };
    } });
    const active = first.processOne(); await started;
    assert.equal(await worker().processOne(), null);
    unblock(); await active;
    assert.equal(calls, 1); assert.equal((await jobState(queued.id)).attempt, 1);
  });

  await t.test('heartbeat extends lease while an upstream request is running', async () => {
    const queued = await intake();
    const instance = worker({ leaseMs: 1000, heartbeatMs: 20, normalize: async document => {
      await pool.query(`UPDATE jobs SET lease_expires_at=now()+interval '100 milliseconds' WHERE id=$1`, [queued.id]);
      await new Promise(resolve => setTimeout(resolve, 200));
      const state = await jobState(queued.id);
      assert.ok(new Date(state.lease_expires_at).getTime() > Date.now());
      return { runId: 'heartbeat-run', document: normalized(document) };
    } });
    assert.equal((await instance.processOne()).status, 'succeeded');
  });

  await t.test('review succeeds with original immutable request and without approval', async () => {
    const queued = await reviewJob();
    const instance = worker({ review: async request => {
      const state = await jobState(queued.id);
      assert.equal(state.stage, 'review_intent');
      assert.deepEqual(request, queued.request);
      return { traceId: 'validated-trace', review: result(request) };
    } });
    assert.equal((await instance.processOne()).status, 'succeeded');
    const review = (await pool.query('SELECT * FROM reviews WHERE id=$1', [queued.reviewId])).rows[0];
    assert.equal(review.status, 'needs_review'); assert.equal(review.decision, null);
    assert.deepEqual(review.request, queued.request);
    assert.equal(review.result.approval.baseline_publication_allowed, false);
    assert.equal((await jobState(queued.id)).stage_data.trace_id, 'validated-trace');
  });

  await t.test('fabricated evidence fails closed and retains the trace for investigation', async () => {
    const queued = await reviewJob();
    const instance = worker({ review: async request => {
      const wrong = result(request); wrong.changes[0].before.text = 'fabricated';
      return { traceId: 'rejected-trace', review: wrong };
    } });
    const outcome = await instance.processOne();
    assert.equal(outcome.code, 'EVIDENCE_MISMATCH');
    const review = (await pool.query('SELECT * FROM reviews WHERE id=$1', [queued.reviewId])).rows[0];
    assert.equal(review.status, 'failed'); assert.equal(review.result, null);
    assert.equal((await jobState(queued.id)).stage_data.trace_id, 'rejected-trace');
  });

  await t.test('unknown review transport is not replayed and never invents a result', async () => {
    const queued = await reviewJob(); let calls = 0;
    const instance = worker({ review: async () => { calls++; throw coded('FLOW_TRANSPORT_UNKNOWN'); } });
    assert.equal((await instance.processOne()).status, 'uncertain');
    assert.equal(await instance.processOne(), null); assert.equal(calls, 1);
    const review = (await pool.query('SELECT * FROM reviews WHERE id=$1', [queued.reviewId])).rows[0];
    assert.equal(review.status, 'uncertain'); assert.equal(review.result, null); assert.equal(review.decision, null);
  });
});
