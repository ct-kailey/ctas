'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { assertLegacyNoraDispatch } = require('../server/project-nora');
const { createImplementationWorker } = require('../server/implementation-worker');
const { createCommercialWorker } = require('../server/commercial-worker');
const { createChannelWorker } = require('../server/channel-worker');
const { createContextAIWorker } = require('../server/context-ai-worker');
const { createWorkAIWorker } = require('../server/work-ai-worker');
const { createRegistrationAssistant } = require('../server/registration-assistant');
const { createImplementationRunner } = require('../server/implementation-runner');

// Model only queue persistence. Any additional read past the binding guard is a
// test failure, making this prove that foreign publications are never invoked.
function queuePool(table) {
  const row = { id: randomUUID(), project_id: 'bound-project', created_by: randomUUID(), status: 'queued', lease_token: randomUUID(), input_snapshot: {} };
  if (table === 'channel_inbox') {
    row.source_id = randomUUID(); row.conversation_key = 'synthetic-isolation-thread';
    // Request validation precedes workspace dispatch. Use valid synthetic
    // evidence so this test reaches, and specifically verifies, the binding gate.
    row.input_snapshot = {
      schema_version: '1.0', request_id: row.id, project_id: row.project_id,
      source: { id: row.source_id, provider: 'slack', name: '합성 격리 검증', external_workspace_id: 'synthetic-workspace', external_channel_id: 'synthetic-channel' },
      conversation_key: row.conversation_key,
      messages: [{ event_id: randomUUID(), message_id: 'synthetic-message', kind: 'created', author: '합성 담당자', text: '이 프로젝트의 논의입니다.', sent_at: null, changed_at: null, url: null }],
    };
  }
  const result = rows => ({ rows, rowCount: rows.length });
  const query = async (sql, args = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) || sql.includes('INSERT INTO events') || sql.includes('pg_advisory_xact_lock')) return result([]);
    if (sql.includes('FROM project_nora_workspaces')) return result([{ project_id: row.project_id }]);
    if (sql.includes('SELECT role FROM memberships') || sql.includes('SELECT 1 FROM memberships')) return result([{ role: 'owner' }]);
    if (sql.includes('FROM implementation_runner_tokens')) return result([{ project_id: row.project_id, created_by: row.created_by }]);
    if (sql.startsWith('SELECT') && sql.includes(`FROM ${table}`) && sql.includes("status='running'")) return result([]);
    if (sql.startsWith('SELECT') && sql.includes(`FROM ${table}`) && sql.includes("status='queued'")) return result(row.status === 'queued' ? [row] : []);
    if (sql.startsWith(`UPDATE ${table}`) && sql.includes("SET status='running'")) { row.status = 'running'; row.worker_id = args[1]; return result([row]); }
    if (sql.startsWith(`UPDATE ${table}`) && sql.includes('SET status=$3')) { row.status = args[2]; row.error_code = args[3]; return result([row]); }
    if (sql.startsWith(`UPDATE ${table}`) && sql.includes("SET status='uncertain'")) return result([]);
    throw new Error('Unexpected query after isolation gate: ' + sql.slice(0,120));
  };
  return { row, query, async connect() { return { query, release() {} }; } };
}

test('dispatch guard preserves legacy projects and fails closed for every bound workspace state', async () => {
  const seen = [];
  await assertLegacyNoraDispatch({ query: async (sql, args) => { seen.push(args[0]); return { rows: [], rowCount: 0 }; } }, 'legacy');
  assert.deepEqual(seen, ['legacy']);
  for (const state of ['pending','awaiting_service','awaiting_auth','ready','uncertain','failed']) {
    await assert.rejects(assertLegacyNoraDispatch({ query: async () => ({ rows: [{ status: state }], rowCount: 1 }) }, 'bound'), { code: 'NORA_PROJECT_FLOW_SETUP_REQUIRED' });
  }
});

for (const [name, table, create] of [
  ['implementation', 'implementation_plans', createImplementationWorker],
  ['commercial', 'commercial_rewrites', createCommercialWorker],
  ['channel', 'channel_inbox', createChannelWorker],
]) test(`${name} worker blocks bound projects before any shared flow invocation`, async () => {
  const pool = queuePool(table); let calls = 0;
  const worker = create({ pool, token: 'synthetic-token', invoke: async () => { calls++; throw new Error('Must not dispatch'); } });
  const result = await worker.processOnce();
  assert.equal(result.status, name === 'channel' ? 'needs_review' : 'failed'); assert.equal(result.code, 'NORA_PROJECT_FLOW_SETUP_REQUIRED'); assert.equal(calls, 0);
});

for (const [name, table, create] of [
  ['context', 'context_ai_runs', createContextAIWorker],
  ['work', 'work_ai_runs', createWorkAIWorker],
]) test(`${name} approval worker blocks bound projects before invoking or looking up approvals`, async () => {
  const pool = queuePool(table); let calls = 0;
  const denied = async () => { calls++; throw new Error('Must not dispatch'); };
  const worker = create({ pool, token: 'synthetic-token', client: { startContextReview: denied, startWorkReview: denied, getApproval: denied }, onError: error => { throw error; } });
  // Context scheduling has its own DB queue; no scheduled document is needed.
  const original = pool.query;
  pool.query = async (sql, args) => sql.includes('document_analysis_queue') ? { rows: [], rowCount: 0 } : original(sql, args);
  pool.connect = async () => ({ query: pool.query, release() {} });
  await worker.tick(); await worker.stop();
  assert.equal(pool.row.status, 'failed'); assert.equal(pool.row.error_code, 'NORA_PROJECT_FLOW_SETUP_REQUIRED'); assert.equal(calls, 0);
});

test('classification and legacy Git runner refuse a bound project before sending data or issuing a ticket', async () => {
  const pool = queuePool('registration_requests'); let calls = 0;
  const assistant = createRegistrationAssistant({ pool, token: 'synthetic-token', invoke: async () => { calls++; } });
  await assert.rejects(assistant.suggest(pool.row.project_id, pool.row.created_by, { title: 'Private source', text: 'Must remain in matching workspace' }), { code: 'NORA_PROJECT_FLOW_SETUP_REQUIRED' });
  const runner = createImplementationRunner({ pool, appOrigin: 'https://ains.test', requireGovernance: false });
  await assert.rejects(runner.issue(pool.row.project_id, randomUUID(), pool.row.created_by), { code: 'NORA_PROJECT_FLOW_SETUP_REQUIRED' });
  await assert.rejects(runner.claim(randomUUID(), 'Bearer ains_run_' + 'a'.repeat(64)), { code: 'NORA_PROJECT_FLOW_SETUP_REQUIRED' });
  assert.equal(calls, 0);
});
