'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate, transaction } = require('../server/db');
const { createProjectNora, queueBinding, publicBinding, workspaceId } = require('../server/project-nora');
const { createProjectNoraWorker } = require('../server/project-nora-worker');
const { createContextLedger } = require('../server/context-ledger');
const { createLedger } = require('../server/ledger');
const { createContextAI } = require('../server/context-ai-ledger');
const { confirmContextAnalysis } = require('../server/context-confirmation');
const { hash } = require('../server/context-contract');

test('manual workspace identity rejects URLs and status only exposes approved fields', () => {
  assert.equal(workspaceId('t_project_workspace_123'), 't_project_workspace_123');
  for (const value of ['https://platform.nora.my/t_project_workspace_123', 't_short', '../tenant', 't_valid_id\n', ' t_project_workspace_123', null, 't_' + 'a'.repeat(129)]) assert.throws(() => workspaceId(value), { code: 'NORA_WORKSPACE_ID_INVALID' });
  const legacy = publicBinding(null); assert.equal(legacy.status, 'legacy'); assert.equal(legacy.version, 0);
  const projection = publicBinding({ workspace_id: 't_project_workspace_123', status: 'pending', version: 1, secret: 'do-not-expose', request_id: 'private-request', lease_token: 'private-lease' });
  assert.equal(projection.space_id, null); assert.equal(projection.status, 'pending'); assert.ok(!JSON.stringify(projection).includes('private')); assert.ok(!JSON.stringify(projection).includes('do-not-expose'));
});

test('Nora project bindings and Context outbox preserve project scope and uncertain outcomes', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'nora_binding_' + randomUUID().replaceAll('-', ''), admin = createPool(process.env.TEST_DATABASE_URL);
  let pool;
  t.after(async () => { if (pool) await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public`, application_name: schema }); await migrate(pool);
  const users = {};
  for (const role of ['owner','reviewer','viewer','outsider']) users[role] = (await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id', [role + '@nora.test', role, 'unused'])).rows[0].id;
  async function project(name = 'Synthetic Nora project') {
    return transaction(pool, async db => {
      const p = (await db.query('INSERT INTO projects(name) VALUES($1) RETURNING id', [name])).rows[0].id;
      for (const role of ['owner','reviewer','viewer']) await db.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [p, users[role], role]);
      return p;
    });
  }
  const selected = () => 't_' + randomUUID().replaceAll('-', '');
  const current = p => pool.query('SELECT * FROM project_nora_workspaces WHERE project_id=$1', [p]).then(r => r.rows[0]);
  const outbox = p => pool.query('SELECT * FROM project_nora_context_outbox WHERE project_id=$1 ORDER BY sequence', [p]).then(r => r.rows);
  const context = createContextLedger(pool);
  async function note(p, title, extra = {}) {
    const version = Number((await pool.query('SELECT version FROM context_heads WHERE project_id=$1', [p])).rows[0]?.version || 0);
    const c = await context.createCandidate(p, users.owner, { request_id: randomUUID(), expected_context_version: version, kind: 'note', title, body: title, occurred_at: '2026-10-14T09:00:00+09:00', rationale: 'Reviewed context', ...extra });
    return (await context.decideCandidate(p, c.id, users.owner, { decision: 'merged', reason: 'Confirmed source', expected_context_version: version, expected_candidate_sha256: c.content_sha256 })).record;
  }
  async function outsideTransaction() {
    assert.equal(Number((await pool.query("SELECT count(*) n FROM pg_stat_activity WHERE application_name=$1 AND state='idle in transaction'", [schema])).rows[0].n), 0, 'provider runs outside a DB transaction');
  }
  const calls = [];
  function provider(overrides = {}) {
    return {
      async inspectWorkspace(args) { await outsideTransaction(); calls.push(['inspect', args]); return { workspaceId: args.workspaceId }; },
      async ensureContextSpace(args) { await outsideTransaction(); calls.push(['ensure', args]); return { workspaceId: args.workspaceId, spaceId: 'space_' + args.projectId }; },
      async reconcileContextSpace(args) { await outsideTransaction(); calls.push(['reconcile', args]); return { workspaceId: args.workspaceId, spaceId: 'space_' + args.projectId }; },
      async listConnectors(args) { await outsideTransaction(); return [{ id: 'github_connector', workspaceId: args.workspaceId, provider: 'github', name: 'GitHub', enabled: true }]; },
      async syncContext(args) { await outsideTransaction(); calls.push(['sync', args]); return { workspaceId: args.workspaceId, spaceId: args.spaceId, eventId: args.event.id }; },
      ...overrides,
    };
  }
  async function ready(p, connector = provider()) {
    const service = createProjectNora({ pool, provider: connector });
    await service.attach(p, users.owner, { workspace_id: selected(), expected_version: 0 });
    const worker = createProjectNoraWorker({ pool, provider: connector });
    // Earlier test rows deliberately remain failed/awaiting_service, never ready by fallback.
    const result = await worker.runOnce(); assert.equal(result.project_id, p); assert.equal(result.status, 'ready');
    return { service, worker };
  }

  await t.test('historical projects remain legacy and all registration is local and owner-only', async () => {
    const p = await project(), other = await project(), service = createProjectNora({ pool }), id = selected();
    assert.equal((await service.status(p, users.viewer)).status, 'legacy');
    await assert.rejects(service.status(p, users.outsider), { code: 'FORBIDDEN' });
    await assert.rejects(service.attach(p, users.reviewer, { workspace_id: id, expected_version: 0 }), { code: 'FORBIDDEN' });
    const first = await service.attach(p, users.owner, { workspace_id: id, expected_version: 0 }); assert.equal(first.status, 'pending');
    const row = await current(p);
    await service.attach(p, users.owner, { workspace_id: id, expected_version: 0 }); assert.equal((await current(p)).request_id, row.request_id);
    await assert.rejects(service.attach(other, users.owner, { workspace_id: id, expected_version: 0 }), { code: 'NORA_WORKSPACE_ALREADY_BOUND' });
    await assert.rejects(service.attach(p, users.owner, { workspace_id: selected(), expected_version: 1 }), { code: 'NORA_BINDING_IMMUTABLE' });
    await assert.rejects(pool.query('UPDATE project_nora_workspaces SET workspace_id=$2 WHERE project_id=$1', [p, selected()]), { code: '23514' });
    const worker = createProjectNoraWorker({ pool }); assert.equal((await worker.runOnce()).status, 'awaiting_service');
    const waiting = await service.status(p, users.owner); assert.equal(waiting.space_id, null); assert.equal(waiting.error_code, 'NORA_SERVICE_UNAVAILABLE');
    assert.equal((await service.status(other, users.owner)).status, 'legacy');
  });

  await t.test('registration rollback and concurrent workspace claims cannot leave an orphan binding', async () => {
    const p = await project(), other = await project(), id = selected();
    await assert.rejects(transaction(pool, async db => { await queueBinding(db, p, users.owner, id); throw new Error('Rollback'); }), /Rollback/);
    assert.equal(await current(p), undefined);
    const service = createProjectNora({ pool });
    const results = await Promise.allSettled([p,other].map(projectId => service.attach(projectId, users.owner, { workspace_id: id, expected_version: 0 })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'NORA_WORKSPACE_ALREADY_BOUND');
    await createProjectNoraWorker({ pool }).runOnce();
  });

  await t.test('a legacy project cannot attach while a dispatch or uncertain operation may still be active', async () => {
    const p = await project(), service = createProjectNora({ pool });
    const runId = randomUUID();
    await pool.query('INSERT INTO registration_requests(id,project_id,actor_id,input_sha256) VALUES($1,$2,$3,$4)', [runId, p, users.owner, 'a'.repeat(64)]);
    await assert.rejects(service.attach(p, users.owner, { workspace_id: selected(), expected_version: 0 }), { code: 'NORA_LEGACY_RUNS_ACTIVE' });
    const running = (await service.status(p, users.owner)).legacy_runs;
    assert.equal(running.blocked, true); assert.equal(running.total, 1);
    assert.deepEqual(running.counts, { running: 1 }); assert.equal(running.reconcilable, false);
    assert.equal(running.items[0].kind, 'registration_requests');
    assert.equal(running.items[0].id, runId); assert.equal(running.items[0].title, '자료 분류 추천');
    assert.ok(!JSON.stringify(running).includes('input_sha256'));
    await pool.query("UPDATE registration_requests SET status='uncertain' WHERE id=$1", [runId]);
    await assert.rejects(service.attach(p, users.owner, { workspace_id: selected(), expected_version: 0 }), { code: 'NORA_LEGACY_RUNS_ACTIVE' });
    assert.equal((await service.status(p, users.owner)).status, 'legacy');
    const refreshed = (await service.status(p, users.owner)).legacy_runs;
    assert.equal(refreshed.blocked, true); assert.deepEqual(refreshed.counts, { uncertain: 1 });
    const other = await project();
    assert.equal((await service.status(other, users.owner)).legacy_runs.total, 0);
    await assert.rejects(service.status(p, users.outsider), { code: 'FORBIDDEN' });
    await assert.rejects(service.reconcileLegacy(p, users.viewer, {}), { code: 'FORBIDDEN' });
  });

  await t.test('bound document intake extracts locally but never calls the global Nora pipeline', async () => {
    const p = await project(), service = createProjectNora({ pool });
    await service.attach(p, users.owner, { workspace_id: selected(), expected_version: 0 });
    await createProjectNoraWorker({ pool }).runOnce();
    const source = await createLedger(pool).createRecord(p, users.owner, { title: 'Bound project document', text: 'Project source remains isolated' });
    let extracted = 0, dispatched = 0;
    const worker = require('../server/worker').createWorker({ pool, pipelineToken: 'shared-pipeline-token', flowToken: 'shared-flow-token',
      extract: async r => { extracted++; return { schema_version: '1.0', project_id: r.project_id, document_id: r.document_id, revision_id: r.id,
        source: { filename: r.filename, mime_type: r.mime_type, sha256: r.sha256 }, segments: [{ segment_id: 's1', requirement_key: 'REQ-001', text: r.content.toString(), locator: { kind: 'text', label: '본문' }, extraction_status: 'ok' }], extraction: { complete: true, warnings: [] } }; },
      normalize: async () => { dispatched++; }, review: async () => { dispatched++; } });
    const result = await worker.processOne(); assert.equal(result.status, 'succeeded');
    assert.equal(extracted, 1); assert.equal(dispatched, 0);
    const job = (await pool.query('SELECT * FROM jobs WHERE id=$1', [source.job_id])).rows[0];
    assert.equal(job.stage, 'completed'); assert.equal(job.stage_data.normalization, 'local_lossless'); assert.equal(job.stage_data.extracted_document.project_id, p); assert.ok(!job.stage_data.external_call);
  });

  await t.test('verified binding snapshots only its own current confirmed records then syncs exact scope', async () => {
    const p = await project(), other = await project();
    const old = await note(p, 'Original decision');
    const replacement = await note(p, 'Updated decision', { supersedes_id: old.id });
    await note(other, 'Other project secret context');
    assert.equal((await outbox(p)).length, 0);
    const { service, worker } = await ready(p);
    const queued = await outbox(p); assert.equal(queued.length, 1); assert.equal(queued[0].payload.record.id, replacement.id);
    assert.equal((await outbox(other)).length, 0);
    const run = await worker.runOnce(); assert.equal(run.status, 'succeeded');
    const sync = calls.filter(c => c[0] === 'sync').at(-1)[1];
    assert.equal(sync.workspaceId, (await current(p)).workspace_id); assert.equal(sync.event.project_id, p); assert.equal(sync.event.payload.record.title, 'Updated decision');
    const view = await service.status(p, users.viewer); assert.equal(view.context_sync.succeeded, 1); assert.ok(view.context_sync.last_synced_at);
    await assert.rejects(pool.query('UPDATE project_nora_workspaces SET space_id=$2 WHERE project_id=$1', [p, 'space_other']), { code: '23514' });
  });

  await t.test('single confirmation and supersession enqueue immutable ordered events atomically', async () => {
    const p = await project(), { worker } = await ready(p);
    const one = await note(p, 'First confirmed context');
    const two = await note(p, 'Replacement confirmed context', { supersedes_id: one.id });
    const rows = await outbox(p); assert.deepEqual(rows.map(r => r.kind), ['context_record','context_record','context_supersession']);
    assert.equal(rows[2].payload.previous_id, one.id); assert.equal(rows[2].payload.replacement_id, two.id);
    await assert.rejects(pool.query("UPDATE project_nora_context_outbox SET payload='{}'::jsonb WHERE id=$1", [rows[0].id]), { code: '23514' });
    for (const row of rows) assert.equal((await worker.runOnce()).event_id, row.id);
    assert.equal((await outbox(p)).filter(r => r.status === 'succeeded').length, 3);
  });

  await t.test('batch AI confirmation uses the same outbox and retry does not duplicate events', async () => {
    const p = await project(), ledger = createLedger(pool), ai = createContextAI({ pool, enabled: true });
    const sourceText = '두 가지 요구사항을 확인한다.';
    const source = await ledger.createRecord(p, users.owner, { title: '합성 문서', text: sourceText });
    await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1", [source.revision_id, { segments: [{ text: sourceText }] }]);
    await pool.query("UPDATE jobs SET status='succeeded' WHERE project_id=$1", [p]);
    const run = await ai.create(p, users.owner, { request_id: randomUUID(), expected_context_version: 0, source_refs: [{ type: 'revision', id: source.revision_id }] });
    const result = { schema_version: '1.0', request_id: run.id, project_id: p, context_version: 0, summary: '두 요구사항', warnings: [], items: ['첫째','둘째'].map(title => ({ kind: 'requirement', title, content: title, rationale: '원문 검토', alternatives: [], evidence: [{ source_id: 'revision:' + source.revision_id, quote: sourceText }], conflicts_with: [], certainty: 'agreed', scope: 'in_scope' })) };
    const sha = hash(result);
    await pool.query("UPDATE context_ai_runs SET status='ready',reviewed_candidate=$2,reviewed_sha256=$3,result=$2,decision=$4 WHERE id=$1", [run.id, result, sha, { actor_id: users.owner, decision: 'approved', reason: '검토 완료' }]);
    const { worker } = await ready(p);
    const decision = { selected_indices: [0,1], expected_sha256: sha, expected_context_version: 0, reason: '원문 확인' };
    await confirmContextAnalysis(pool, p, run.id, users.owner, decision);
    await confirmContextAnalysis(pool, p, run.id, users.owner, decision);
    assert.equal((await outbox(p)).length, 2);
    assert.deepEqual((await outbox(p)).map(e => Number(e.context_version)), [1,2]);
    await worker.runOnce(); await worker.runOnce();
  });

  await t.test('unknown bootstrap cannot be blindly retried and reconciliation retains the same request', async () => {
    const p = await project(), ensureCalls = [];
    const remote = provider({ async ensureContextSpace(args) { ensureCalls.push(args); throw new Error('Remote response lost'); } });
    const service = createProjectNora({ pool, provider: remote }); await service.attach(p, users.owner, { workspace_id: selected(), expected_version: 0 });
    const worker = createProjectNoraWorker({ pool, provider: remote }); assert.equal((await worker.runOnce()).status, 'uncertain');
    const uncertain = await service.status(p, users.owner);
    await assert.rejects(service.retry(p, users.owner, { expected_version: uncertain.version }), { code: 'NORA_RECONCILE_REQUIRED' });
    assert.equal(await worker.runOnce(), null); assert.equal(ensureCalls.length, 1);
    await service.reconcile(p, users.owner, { expected_version: uncertain.version }); assert.equal((await worker.runOnce()).status, 'ready');
    const reconciled = calls.filter(c => c[0] === 'reconcile').at(-1)[1]; assert.equal(reconciled.requestId, ensureCalls[0].requestId); assert.equal(reconciled.workspaceId, ensureCalls[0].workspaceId);
    assert.equal(ensureCalls.length, 1);
  });

  await t.test('inspection mismatch never initializes a foreign workspace and expired bootstrap is uncertain', async () => {
    const p = await project(), remote = provider({ async inspectWorkspace() { return { workspaceId: selected() }; } });
    const service = createProjectNora({ pool, provider: remote }); await service.attach(p, users.owner, { workspace_id: selected(), expected_version: 0 });
    const before = calls.filter(c => c[0] === 'ensure').length;
    assert.equal((await createProjectNoraWorker({ pool, provider: remote }).runOnce()).error_code, 'NORA_WORKSPACE_SCOPE_MISMATCH');
    assert.equal(calls.filter(c => c[0] === 'ensure').length, before);
    await pool.query("UPDATE project_nora_workspaces SET status='verifying',stage='context_space',lease_token=$2,lease_expires_at=now()-interval '1 second' WHERE project_id=$1", [p, randomUUID()]);
    await createProjectNoraWorker({ pool, provider: remote }).recover(); assert.equal((await current(p)).status, 'uncertain');
  });

  await t.test('missing project OAuth is awaiting_auth and a read-only absence permits a safe explicit retry', async () => {
    const p = await project(), remote = provider({ async inspectWorkspace() { throw Object.assign(new Error('Authentication required'), { code: 'NORA_AUTH_REQUIRED', noSideEffects: true }); } });
    const service = createProjectNora({ pool, provider: remote }); await service.attach(p, users.owner, { workspace_id: selected(), expected_version: 0 });
    assert.equal((await createProjectNoraWorker({ pool, provider: remote }).runOnce()).status, 'awaiting_auth');
    const waiting = await service.status(p, users.owner); await service.retry(p, users.owner, { expected_version: waiting.version });
    const failing = provider({ async ensureContextSpace() { throw new Error('Unknown result'); }, async reconcileContextSpace({ workspaceId }) { return { workspaceId, status: 'absent' }; } });
    const worker = createProjectNoraWorker({ pool, provider: failing }); assert.equal((await worker.runOnce()).status, 'uncertain');
    const recovery = createProjectNora({ pool, provider: failing }); await recovery.reconcile(p, users.owner, { expected_version: (await current(p)).version });
    assert.equal((await worker.runOnce()).error_code, 'NORA_CONTEXT_SPACE_NOT_FOUND');
    await recovery.retry(p, users.owner, { expected_version: (await current(p)).version });
    assert.equal((await createProjectNoraWorker({ pool, provider: provider() }).runOnce()).status, 'ready');
  });

  await t.test('GitHub selection validates workspace and owner again after remote lookup', async () => {
    const p = await project(), remote = provider(), { service } = await ready(p, remote);
    const initial = await service.status(p, users.owner); assert.equal((await service.connectors(p, users.viewer)).connectors[0].id, 'github_connector');
    await assert.rejects(service.selectConnector(p, users.reviewer, { expected_version: initial.version, connector_id: 'github_connector' }), { code: 'FORBIDDEN' });
    const saved = await service.selectConnector(p, users.owner, { expected_version: initial.version, connector_id: 'github_connector' }); assert.equal(saved.connector_id, 'github_connector');
    const foreign = createProjectNora({ pool, provider: provider({ async listConnectors() { return [{ id: 'evil', workspaceId: selected(), provider: 'github', enabled: true }]; } }) });
    await assert.rejects(foreign.connectors(p, users.owner), { code: 'NORA_CONNECTOR_SCOPE_MISMATCH' });
    const race = createProjectNora({ pool, provider: provider({ async listConnectors({ workspaceId }) { await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2", [p, users.owner]); return [{ id: 'next_connector', workspaceId, provider: 'github', enabled: true }]; } }) });
    await assert.rejects(race.selectConnector(p, users.owner, { expected_version: saved.version, connector_id: 'next_connector' }), { code: 'FORBIDDEN' });
    assert.equal((await current(p)).connector_id, 'github_connector');
  });

  await t.test('sync failures retain exact event identity and block later events until owner retries', async () => {
    const p = await project(), remote = provider({ async syncContext() { throw new Error('Secret failure must not leak'); } }), { service, worker } = await ready(p, remote);
    await note(p, 'First event'); await note(p, 'Second event');
    const initial = await outbox(p), failed = await worker.runOnce(); assert.equal(failed.status, 'failed'); assert.equal(failed.error_code, 'NORA_CONTEXT_SYNC_FAILED');
    assert.equal(await worker.runOnce(), null); assert.equal((await service.status(p, users.owner)).context_sync.failed, 1);
    const view = await service.status(p, users.owner); await service.retrySync(p, users.owner, { expected_version: view.version });
    const succeeding = createProjectNoraWorker({ pool, provider: provider() });
    assert.equal((await succeeding.runOnce()).event_id, initial[0].id); assert.equal((await succeeding.runOnce()).event_id, initial[1].id);
    assert.equal((await outbox(p))[0].attempt, 2);
  });
});
