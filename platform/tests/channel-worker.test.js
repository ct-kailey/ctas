'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createPool, migrate } = require('../server/db');
const { createChannelLedger } = require('../server/channel-ledger');
const { classifyFailure, safeErrorCode } = require('../server/channel-worker');
function coded(code) { return Object.assign(Error('private-source-and-token'), { code }); }
function fixture() {
  const filename = path.resolve(__dirname, '../server/channel-worker.js'), actual = createRequire(filename);
  const manifest = { ...actual('../../nora/channel-triage/manifest.json'), publication_status: 'published', published_version_id: 'gv_synthetic_worker', agent_id: 'agent_synthetic_worker' };
  const context = { exports: {}, require: name => name === '../../nora/channel-triage/manifest.json' ? manifest : actual(name), structuredClone, setTimeout, clearTimeout };
  context.module = { exports: context.exports }; vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { ...context.module.exports, manifest };
}
function analysis(request) { return { classification: 'decision', title: '인증 정책 확정', summary: '만료 시간을 10분으로 확정했습니다.', record_kind: 'decision', confidence: 0.9, evidence_event_ids: [request.messages[0].event_id], reason: '원문에 확정 표현이 있습니다.' }; }

test('channel worker sanitizes diagnostics and preserves uncertain completion', () => {
  for (const code of ['TRIAGE_TRANSPORT_UNKNOWN', 'TRIAGE_HTTP_503', 'TRIAGE_HTTP_408', 'TRIAGE_RESPONSE_INVALID', 'TRIAGE_RUN_NOT_SUCCEEDED']) {
    assert.equal(classifyFailure(coded(code), true).status, 'uncertain'); assert.equal(classifyFailure(coded(code), false).status, 'failed');
  }
  for (const code of ['TRIAGE_HTTP_401', 'TRIAGE_HTTP_429', 'TRIAGE_EVIDENCE_MISMATCH', 'PROJECT_MISMATCH']) assert.equal(classifyFailure(coded(code), true).status, 'failed');
  assert.equal(safeErrorCode(coded('SECRET_TOKEN')), 'TRIAGE_INTERNAL'); assert.equal(classifyFailure(Error('secret'), true).status, 'uncertain');
});

test('channel worker durable PostgreSQL integration', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'channel_worker_' + randomUUID().replaceAll('-', ''), admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: '-c search_path=' + schema });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(pool);
  const userId = randomUUID(), projectId = 'channel-worker-project', ledger = createChannelLedger(pool);
  await pool.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [userId, 'channel-worker@example.test', 'Channel Worker', 'not-auth-fixture']);
  await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)', [projectId, 'Channel Worker']);
  await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [projectId, userId, 'owner']);
  const source = await ledger.createSource(projectId, userId, { provider: 'slack', name: '#제품', external_workspace_id: 'T1', external_channel_id: 'C1' });
  async function enqueue({ messageId = randomUUID(), kind = 'created', content = '인증 만료는 10분으로 확정합니다.' } = {}) {
    return ledger.ingest(projectId, source.id, userId, { batch_id: randomUUID(), conversation_key: 'thread-1', messages: [{ event_id: randomUUID(), message_id: messageId,
      kind, author: '담당자', text: content, sent_at: '2026-09-27T12:00:00+09:00', changed_at: kind === 'created' ? null : '2026-09-27T12:30:00+09:00', url: 'https://example.test/thread/1' }] });
  }
  const state = async id => (await pool.query('SELECT * FROM channel_inbox WHERE id=$1', [id])).rows[0];
  function worker(overrides = {}) { return fixture().createChannelWorker({ pool, token: 'synthetic-worker-token', invoke: async request => ({ traceId: 'trc_synthetic_worker', result: analysis(request) }), ...overrides }); }

  await t.test('durable intent precedes outbound and successful analysis awaits human review', async () => {
    const row = await enqueue(); let calls = 0;
    const instance = worker({ invoke: async (request, options) => {
      calls++; assert.equal(options.expectedProjectId, projectId); assert.equal(options.timeoutMs, 45000);
      const claimed = await state(row.id); assert.equal(claimed.status, 'running'); assert.ok(claimed.lease_token);
      const audit = await pool.query("SELECT detail FROM events WHERE entity_id=$1 AND kind='channel.triage_started'", [row.id]);
      assert.equal(audit.rowCount, 1); assert.equal(audit.rows[0].detail.published_version_id, 'gv_synthetic_worker');
      return { traceId: 'trc_success', result: analysis(request) };
    } });
    assert.equal((await instance.processOnce()).status, 'needs_review');
    const done = await state(row.id); assert.equal(done.trace_id, 'trc_success'); assert.equal(done.lease_token, null); assert.equal(done.review, null);
    assert.equal(done.document_id, null); assert.equal((await pool.query('SELECT count(*)::int AS n FROM documents')).rows[0].n, 0);
    assert.equal(await instance.processOnce(), null); assert.equal(calls, 1);
  });
  await t.test('missing token and unpublished flow become manual review without fake results', async () => {
    for (const available of [false, true]) {
      const row = await enqueue(), isolated = fixture(); let calls = 0;
      if (available) isolated.manifest.publication_status = 'not_published';
      const instance = isolated.createChannelWorker({ pool, token: available ? 'synthetic' : undefined, invoke: async () => { calls++; } });
      assert.equal((await instance.processOnce()).code, 'TRIAGE_UNAVAILABLE');
      const done = await state(row.id); assert.equal(done.status, 'needs_review'); assert.equal(done.analysis, null); assert.equal(done.trace_id, null); assert.equal(calls, 0);
    }
  });
  await t.test('expired running lease becomes uncertain and is never reclaimed', async () => {
    const row = await enqueue();
    await pool.query("UPDATE channel_inbox SET status='running',lease_token=$2,lease_expires_at=now()-interval '1 second' WHERE id=$1", [row.id, randomUUID()]);
    let calls = 0; const instance = worker({ invoke: async () => { calls++; } });
    assert.equal(await instance.processOnce(), null); assert.equal((await state(row.id)).status, 'uncertain'); assert.equal((await state(row.id)).error_code, 'TRIAGE_LEASE_EXPIRED');
    assert.equal(await instance.processOnce(), null); assert.equal(calls, 0);
  });
  await t.test('transport uncertainty has no implicit retry', async () => {
    const row = await enqueue(); let calls = 0;
    const instance = worker({ invoke: async () => { calls++; throw coded('TRIAGE_TRANSPORT_UNKNOWN'); } });
    assert.equal((await instance.processOnce()).status, 'uncertain'); assert.equal(await instance.processOnce(), null); assert.equal(calls, 1);
    const done = await state(row.id); assert.equal(done.error_code, 'TRIAGE_TRANSPORT_UNKNOWN'); assert.equal(JSON.stringify(done).includes('private-source-and-token'), false);
  });
  await t.test('foreign evidence cannot be saved even by an injected invoke implementation', async () => {
    const row = await enqueue(); const instance = worker({ invoke: async request => ({ traceId: 'trc_invalid', result: { ...analysis(request), evidence_event_ids: [randomUUID()] } }) });
    assert.equal((await instance.processOnce()).code, 'TRIAGE_EVIDENCE_MISMATCH'); assert.equal((await state(row.id)).analysis, null);
  });
  await t.test('mutating callback input cannot replace the trusted snapshot used for validation', async () => {
    const row = await enqueue(); const instance = worker({ invoke: async request => {
      request.messages[0].event_id = randomUUID(); request.project_id = 'foreign-project';
      return { traceId: 'trc_mutated', result: analysis(request) };
    } });
    assert.equal((await instance.processOnce()).status, 'failed'); assert.equal((await state(row.id)).analysis, null);
  });
  await t.test('evidence changed before dispatch becomes manual review without call', async () => {
    const old = await enqueue(), newer = await enqueue({ messageId: old.input_snapshot.messages[0].message_id, kind: 'updated', content: '아직 확정하지 않았습니다.' });
    let calls = 0; const instance = worker({ invoke: async () => { calls++; } });
    assert.equal((await instance.processOnce()).code, 'EVIDENCE_CHANGED'); assert.equal((await state(old.id)).status, 'needs_review'); assert.equal(calls, 0);
    await worker().processOnce(); assert.equal((await state(newer.id)).status, 'needs_review');
  });
  await t.test('source edits during analysis mark its result stale and keep human gate', async () => {
    const old = await enqueue(); let newId;
    const instance = worker({ invoke: async request => {
      const newer = await enqueue({ messageId: request.messages[0].message_id, kind: 'updated', content: '이 결정을 철회합니다.' }); newId = newer.id;
      return { traceId: 'trc_stale', result: analysis(request) };
    } });
    const outcome = await instance.processOnce(); assert.equal(outcome.status, 'needs_review'); assert.equal(outcome.code, 'EVIDENCE_CHANGED');
    assert.equal((await state(old.id)).evidence_changed, true); assert.equal((await state(old.id)).document_id, null);
    await worker().processOnce(); assert.equal((await state(newId)).status, 'needs_review');
  });
  await t.test('lost lease prevents a late response from overwriting durable uncertainty', async () => {
    const row = await enqueue(); const instance = worker({ invoke: async request => {
      await pool.query("UPDATE channel_inbox SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [row.id]);
      await worker().recoverExpired(); return { traceId: 'trc_late', result: analysis(request) };
    } });
    assert.equal((await instance.processOnce()).code, 'TRIAGE_LEASE_LOST');
    const done = await state(row.id); assert.equal(done.status, 'uncertain'); assert.equal(done.analysis, null); assert.equal(done.trace_id, null);
  });
  await t.test('one process never invokes two requests concurrently', async () => {
    await enqueue(); await enqueue(); let release, calls = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const instance = worker({ invoke: async request => { calls++; await gate; return { traceId: 'trc_serial', result: analysis(request) }; } });
    const first = instance.processOnce(); await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(await instance.processOnce(), null); release(); await first; assert.equal(calls, 1);
    await instance.processOnce(); assert.equal(calls, 2);
  });
});
