'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createChannelLedger } = require('../server/channel-ledger');
const { createChannelWorker } = require('../server/channel-worker');

test('project-bound channel analysis preserves tenant and human review boundaries', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'channel_project_' + randomUUID().replaceAll('-', ''), admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: '-c search_path=' + schema });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(pool);
  const userId = randomUUID(), projectId = 'channel-project-worker', workspaceId = 't_channel_project_worker';
  const ledger = createChannelLedger(pool);
  await pool.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [userId, 'channel-project@example.test', 'Channel Project', 'not-auth-fixture']);
  await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)', [projectId, 'Channel Project']);
  await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [projectId, userId, 'owner']);
  await pool.query("INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name,status,stage,space_id) VALUES($1,$2,$3,$4,'ready','complete','space-test')", [projectId, workspaceId, userId, 'Channel Project']);
  const source = await ledger.createSource(projectId, userId, { provider: 'slack', name: '#프로젝트', external_workspace_id: 'T1', external_channel_id: 'C1' });
  const metadata = { workspaceId, flowSlug: 'ains-channel-project-test', publishedVersionId: 'gv_project_test', agentId: 'agent_project_test' };
  function analysis(request) { return { classification: 'decision', title: '인증 정책 논의', summary: '인증 만료를 10분으로 확정한다는 대화입니다.', record_kind: 'decision', confidence: 0.9, evidence_event_ids: [request.messages[0].event_id], reason: '원문에 확정 표현이 있습니다.' }; }
  async function enqueue({ messageId = randomUUID(), kind = 'created', content = '인증 만료는 10분으로 확정합니다.' } = {}) {
    return ledger.ingest(projectId, source.id, userId, { batch_id: randomUUID(), conversation_key: 'thread-1', messages: [{ event_id: randomUUID(), message_id: messageId, kind,
      author: '담당자', text: content, sent_at: '2026-10-15T01:00:00Z', changed_at: kind === 'created' ? null : '2026-10-15T01:30:00Z', url: 'https://example.test/thread/1' }] });
  }
  const state = async id => (await pool.query('SELECT * FROM channel_inbox WHERE id=$1', [id])).rows[0];
  const reply = input => ({ ...metadata, traceId: 'trc_project_test', result: analysis(input.request) });
  function worker(generate = async input => { await input.beforeDispatch(metadata); return reply(input); }) {
    return createChannelWorker({ pool, token: 'must-not-use-legacy-token', invoke: async () => { throw new Error('Legacy fallback is forbidden'); }, projectProvider: { generate } });
  }

  await t.test('project flow uses durable dispatch evidence and stops at review', async () => {
    const row = await enqueue();
    const outcome = await worker(async input => {
      assert.equal(input.projectId, projectId); assert.equal(input.workspaceId, workspaceId); assert.equal(input.requestId, row.id);
      await input.beforeDispatch(metadata);
      const events = await pool.query("SELECT detail FROM events WHERE entity_id=$1 AND kind='channel.triage_started'", [row.id]);
      assert.equal(events.rowCount, 1); assert.equal(events.rows[0].detail.workspace_id, workspaceId); assert.equal(events.rows[0].detail.published_version_id, metadata.publishedVersionId);
      return reply(input);
    }).processOnce();
    assert.equal(outcome.status, 'needs_review'); assert.equal(outcome.code, null);
    const done = await state(row.id); assert.equal(done.document_id, null); assert.equal(done.review, null); assert.equal(done.trace_id, 'trc_project_test'); assert.ok(done.analysis);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM documents')).rows[0].n, 0);
  });
  await t.test('missing project provider never falls back to legacy credentials', async () => {
    const row = await enqueue(); let calls = 0;
    const outcome = await createChannelWorker({ pool, token: 'legacy', invoke: async () => { calls++; } }).processOnce();
    assert.equal(outcome.code, 'NORA_PROJECT_FLOW_SETUP_REQUIRED'); assert.equal((await state(row.id)).status, 'needs_review'); assert.equal(calls, 0);
  });
  await t.test('foreign dispatch or response provenance cannot be stored', async () => {
    for (const type of ['dispatch', 'response']) {
      const row = await enqueue();
      const outcome = await worker(async input => {
        await input.beforeDispatch(type === 'dispatch' ? { ...metadata, workspaceId: 't_foreign_workspace' } : metadata);
        return { ...reply(input), ...(type === 'response' ? { publishedVersionId: 'gv_other' } : {}) };
      }).processOnce();
      assert.equal(outcome.code, 'TRIAGE_RECORD_MISMATCH'); assert.equal((await state(row.id)).analysis, null);
    }
  });
  await t.test('provider cannot mutate the trusted request evidence', async () => {
    const row = await enqueue(); const outcome = await worker(async input => {
      await input.beforeDispatch(metadata); input.request.messages[0].event_id = randomUUID(); return reply(input);
    }).processOnce();
    assert.equal(outcome.code, 'TRIAGE_EVIDENCE_MISMATCH'); assert.equal((await state(row.id)).analysis, null);
  });
  await t.test('source changes while preparing the flow prevent dispatch', async () => {
    const row = await enqueue(); let newer, dispatched = false;
    const outcome = await worker(async input => {
      newer = await enqueue({ messageId: input.request.messages[0].message_id, kind: 'updated', content: '결정은 아직 보류합니다.' });
      await input.beforeDispatch(metadata); dispatched = true; return reply(input);
    }).processOnce();
    assert.equal(outcome.code, 'EVIDENCE_CHANGED'); assert.equal(outcome.status, 'needs_review'); assert.equal(dispatched, false); assert.equal((await state(row.id)).analysis, null);
    await worker().processOnce(); assert.equal((await state(newer.id)).status, 'needs_review');
  });
  await t.test('source edits after dispatch retain the stale marker and require review', async () => {
    const row = await enqueue(); let newer;
    const outcome = await worker(async input => {
      await input.beforeDispatch(metadata);
      newer = await enqueue({ messageId: input.request.messages[0].message_id, kind: 'updated', content: '이 결정을 철회합니다.' });
      return reply(input);
    }).processOnce();
    assert.equal(outcome.code, 'EVIDENCE_CHANGED'); assert.equal(outcome.status, 'needs_review'); assert.equal((await state(row.id)).document_id, null);
    await worker().processOnce(); assert.equal((await state(newer.id)).status, 'needs_review');
  });
  await t.test('unknown transport outcome has no automatic retry', async () => {
    const row = await enqueue(); let calls = 0;
    const instance = worker(async input => { await input.beforeDispatch(metadata); calls++; throw Object.assign(new Error('private-token-source'), { code: 'NORA_MCP_UNAVAILABLE', noSideEffects: false }); });
    assert.equal((await instance.processOnce()).status, 'uncertain'); assert.equal(await instance.processOnce(), null); assert.equal(calls, 1);
    const done = await state(row.id); assert.equal(done.analysis, null); assert.equal(JSON.stringify(done).includes('private-token-source'), false);
  });
  await t.test('lease loss prevents late results from becoming review candidates', async () => {
    const row = await enqueue(); const outcome = await worker(async input => {
      await input.beforeDispatch(metadata);
      await pool.query("UPDATE channel_inbox SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [row.id]);
      await worker().recoverExpired(); return reply(input);
    }).processOnce();
    assert.equal(outcome.code, 'TRIAGE_LEASE_LOST'); assert.equal((await state(row.id)).status, 'uncertain'); assert.equal((await state(row.id)).analysis, null);
  });
});
