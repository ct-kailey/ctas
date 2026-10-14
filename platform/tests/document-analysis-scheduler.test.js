'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { createContextAI } = require('../server/context-ai-ledger');
const { createDocumentAnalysisScheduler } = require('../server/document-analysis-scheduler');
const dbUrl = process.env.TEST_DATABASE_URL, suite = dbUrl ? test : test.skip;
let admin, pool, schema, owner, ledger;
before(async () => {
  if (!dbUrl) return;
  schema = 'document_analysis_' + randomUUID().replaceAll('-', '');
  admin = createPool(dbUrl); await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: dbUrl, options: `-c search_path=${schema}` });
  await migrate(pool);
  owner = (await pool.query("INSERT INTO users(email,name,password_hash) VALUES('owner@auto-analysis.test','Owner','unused') RETURNING id")).rows[0].id;
  ledger = createLedger(pool, { automaticDocumentAnalysis: true });
});
after(async () => { if (pool) await pool.end(); if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); } });
async function fixture({ ready = true, text = '요청 등록 시 담당자를 지정한다.' } = {}) {
  const p = await ledger.createProject(owner, { name: '자동 분석 검증' });
  const upload = await ledger.createRecord(p.id, owner, { title: '요구사항', document_category: 'requirements', text });
  if (ready) await makeReady(upload.revision_id, text);
  return { p, upload };
}
async function makeReady(id, text = '요청 등록 시 담당자를 지정한다.') {
  await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1", [id, { segments: [{ text }] }]);
}
async function queued(id) { return (await pool.query('SELECT * FROM document_analysis_queue WHERE revision_id=$1', [id])).rows[0]; }
async function onlyCurrent(id) {
  // Prevent a previous test's intentionally pending work from occupying this test's claim.
  await pool.query("UPDATE document_analysis_queue SET next_attempt_at=now()+interval '1 day' WHERE revision_id<>$1 AND status='pending'", [id]);
}
suite('registration queues only new requests and waits for extraction and enabled Nora without confirming anything', async () => {
  const { p, upload } = await fixture({ ready: false }); await onlyCurrent(upload.revision_id);
  assert.equal((await queued(upload.revision_id)).status, 'pending');
  let calls = 0;
  const disabled = createDocumentAnalysisScheduler({ pool, enabled: false, create: async () => { calls++; } });
  assert.equal(await disabled.tick(), null);
  const active = createDocumentAnalysisScheduler({ pool, enabled: true });
  assert.equal(await active.tick(), null);
  assert.equal(calls, 0);
  const old = await createLedger(pool).createRecord(p.id, owner, { title: '기존 기록', text: '기존 자료' });
  await makeReady(old.revision_id); await migrate(pool);
  assert.equal(await queued(old.revision_id), undefined, 'migrations never backfill historical records');
  await makeReady(upload.revision_id);
  const result = await active.tick();
  assert.equal(result.status, 'submitted');
  const run = (await pool.query('SELECT * FROM context_ai_runs WHERE id=$1', [result.run_id])).rows[0];
  assert.equal(run.status, 'queued'); assert.equal(run.created_by, owner); assert.equal(run.project_id, p.id);
  assert.equal(run.request.sources[0].source_id, 'revision:' + upload.revision_id);
  assert.equal(run.decision, null);
  const r = await ledger.getRevision(p.id, upload.revision_id);
  assert.equal(r.analysis.run_id, run.id); assert.equal(r.analysis.status, 'queued');
  assert.equal((await ledger.listDocuments(p.id)).find(d => d.id === upload.document_id).baseline_revision_id, null);
  assert.equal((await pool.query('SELECT count(*)::int n FROM context_records WHERE project_id=$1', [p.id])).rows[0].n, 0);
});
suite('concurrent workers lease a source once and lost local acknowledgement reuses the same persisted request', async () => {
  const { p, upload } = await fixture(); await onlyCurrent(upload.revision_id);
  const ai = createContextAI({ pool, enabled: true }); let calls = 0, request;
  const create = async (projectId, userId, body) => { calls++; request = body; return ai.create(projectId, userId, body); };
  const a = createDocumentAnalysisScheduler({ pool, enabled: true, create });
  const b = createDocumentAnalysisScheduler({ pool, enabled: true, create });
  await Promise.all([a.tick(), b.tick()]);
  assert.equal(calls, 1);
  const original = await queued(upload.revision_id);
  assert.deepEqual(original.request, request);
  assert.equal(original.status, 'submitted');
  // Simulate a crash between durable run insertion and queue acknowledgement.
  await pool.query("UPDATE document_analysis_queue SET status='pending',lease_token=$2,lease_expires_at=now()-interval '1 second',next_attempt_at=now() WHERE revision_id=$1", [upload.revision_id, randomUUID()]);
  await b.tick();
  const runs = (await pool.query('SELECT * FROM context_ai_runs WHERE project_id=$1', [p.id])).rows;
  assert.equal(runs.length, 1); assert.equal(runs[0].id, original.request_id);
  assert.deepEqual((await queued(upload.revision_id)).request, original.request);
});
suite('project quota retries a local submission without changing its idempotent input', async () => {
  const { p, upload } = await fixture(); await onlyCurrent(upload.revision_id);
  const ai = createContextAI({ pool, enabled: true });
  for (let i = 0; i < 3; i++) await ai.create(p.id, owner, { request_id: randomUUID(), expected_context_version: 0, source_refs: [{ type: 'revision', id: upload.revision_id }] });
  const scheduler = createDocumentAnalysisScheduler({ pool, enabled: true });
  const held = await scheduler.tick();
  assert.equal(held.status, 'pending'); assert.equal(held.error_code, 'CONTEXT_AI_BUSY');
  const first = await queued(upload.revision_id);
  await pool.query("UPDATE context_ai_runs SET status='rejected' WHERE project_id=$1", [p.id]);
  await pool.query('UPDATE document_analysis_queue SET next_attempt_at=now() WHERE revision_id=$1', [upload.revision_id]);
  assert.equal((await scheduler.tick()).status, 'submitted');
  assert.deepEqual((await queued(upload.revision_id)).request, first.request);
});
suite('failed extraction is actionable and only a user extraction retry reopens scheduling', async () => {
  const { p, upload } = await fixture({ ready: false }); await onlyCurrent(upload.revision_id);
  await pool.query("UPDATE revisions SET status='failed',error_code='EXTRACTION_FAILED' WHERE id=$1", [upload.revision_id]);
  const scheduler = createDocumentAnalysisScheduler({ pool, enabled: true });
  await scheduler.tick();
  assert.equal((await queued(upload.revision_id)).status, 'blocked');
  assert.equal((await ledger.getRevision(p.id, upload.revision_id)).analysis.error_code, 'DOCUMENT_INTAKE_FAILED');
  assert.equal((await pool.query('SELECT count(*)::int n FROM context_ai_runs WHERE project_id=$1', [p.id])).rows[0].n, 0);
  await pool.query("UPDATE revisions SET status='queued' WHERE id=$1", [upload.revision_id]);
  await scheduler.tick();
  assert.equal((await queued(upload.revision_id)).status, 'pending');
  await makeReady(upload.revision_id);
  assert.equal((await scheduler.tick()).status, 'submitted');
});
suite('source size and revoked membership stop automatic analysis with visible errors', async () => {
  const long = await fixture({ text: 'x'.repeat(60001) }); await onlyCurrent(long.upload.revision_id);
  const scheduler = createDocumentAnalysisScheduler({ pool, enabled: true });
  assert.equal((await scheduler.tick()).error_code, 'CONTEXT_SOURCE_SIZE');
  assert.equal((await queued(long.upload.revision_id)).status, 'blocked');
  const revoked = await fixture(); await onlyCurrent(revoked.upload.revision_id);
  await pool.query('DELETE FROM memberships WHERE project_id=$1 AND user_id=$2', [revoked.p.id, owner]);
  assert.equal((await scheduler.tick()).error_code, 'FORBIDDEN');
  assert.equal((await queued(revoked.upload.revision_id)).status, 'blocked');
});
