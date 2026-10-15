'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createNoraChannelSources } = require('../server/nora-channel-sources');
const { createNoraChannelSourceWorker, normalizeRecord, recordPayload } = require('../server/nora-channel-source-worker');
const { identity } = require('../../nora/channel-ingestion/pipeline');
const sourceText = message => message.text.replace(/^\[Nora 원문 문서:[^\n]*\]\n(?:\[본문 \d+\/\d+\]\n)?/, '');

test('Nora channel sources enforce permissions, event identity and safe collection', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'nora_sources_' + randomUUID().replaceAll('-', ''), admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: '-c search_path=' + schema });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(pool);
  const projectId = 'source-project', workspaceId = 't_source_project_workspace', owner = randomUUID(), reviewer = randomUUID(), member = randomUUID(), outsider = randomUUID();
  for (const [id, label] of [[owner, 'owner'], [reviewer, 'reviewer'], [member, 'member'], [outsider, 'outsider']]) {
    await pool.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [id, label + '@sources.example.test', label, 'not-auth-fixture']);
  }
  await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)', [projectId, 'Synthetic source project']);
  for (const [id, role] of [[owner, 'owner'], [reviewer, 'reviewer'], [member, 'member']]) await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [projectId, id, role]);
  await pool.query("INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name,status,stage,space_id) VALUES($1,$2,$3,$4,'ready','complete','source-space')", [projectId, workspaceId, owner, 'Synthetic source project']);
  let records = [], readError, onRead, runCalls = 0, reads = 0;
  const provider = {
    async listConnectors(input) { assert.equal(input.projectId, projectId); assert.equal(input.workspaceId, workspaceId); return [{ id: 'conn_channel_slack_test', provider: 'slack', name: 'Synthetic Slack', enabled: true }]; },
    async provision(input) { assert.equal(input.projectId, projectId); assert.equal(input.workspaceId, workspaceId); return identity(input); },
    async run(input) { runCalls++; return { runId: 'run-' + input.requestId }; },
    async readRecords(input) { reads++; if (readError) throw readError; await onRead?.(input); return { records: structuredClone(records), cursor: {}, hasMore: false }; },
  };
  const service = createNoraChannelSources({ pool, provider, appOrigin: 'https://ains.example.test' });
  const body = (channel = randomUUID()) => ({ name: 'Synthetic Slack', connector_id: 'conn_channel_slack_test', external_channel_id: channel, schedule_enabled: true, trigger_enabled: true, interval_minutes: 15 });
  const create = async (extra = {}) => service.create(projectId, owner, { ...body(), ...extra });
  const prepare = async (extra = {}) => { const source = await create(extra); return service.provision(projectId, source.id, owner, { expected_version: source.version }); };
  const row = async id => (await pool.query('SELECT * FROM nora_channel_sources WHERE id=$1', [id])).rows[0];

  await t.test('members can view but only owner/reviewer can configure', async () => {
    for (const user of [member, outsider]) {
      await assert.rejects(service.connectors(projectId, user), { code: 'FORBIDDEN' });
      await assert.rejects(service.create(projectId, user, body()), { code: 'FORBIDDEN' });
    }
    assert.equal((await service.connectors(projectId, reviewer)).connectors[0].id, 'conn_channel_slack_test');
    await assert.rejects(service.list(projectId, outsider), { code: 'FORBIDDEN' });
    const source = await create();
    await assert.rejects(service.update(projectId, source.id, member, { expected_version: source.version, schedule_enabled: false }), { code: 'FORBIDDEN' });
    await assert.rejects(service.rotateTriggerKey(projectId, source.id, member), { code: 'FORBIDDEN' });
    const visible = (await service.list(projectId, member)).sources.find(s => s.id === source.id);
    for (const key of ['trigger_token_hash', 'cursor', 'lease_token', 'lease_expires_at', 'provision_token']) assert.equal(Object.hasOwn(visible, key), false);
  });
  await t.test('duplicate and cross-project targets cannot be registered or read', async () => {
    const input = body(); await service.create(projectId, owner, input);
    await assert.rejects(service.create(projectId, owner, input), { code: 'NORA_CHANNEL_EXISTS' });
    await assert.rejects(create({ connector_id: 'foreign-connector' }), { code: 'NORA_CHANNEL_CONNECTOR_REQUIRED' });
    const source = await create();
    await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)', ['other-source-project', 'Other']);
    await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')", ['other-source-project', owner]);
    await assert.rejects(service.deliveries('other-source-project', source.id, owner), { code: 'NOT_FOUND' });
  });
  await t.test('provision and edits enforce optimistic versions', async () => {
    const source = await create(), ready = await service.provision(projectId, source.id, owner, { expected_version: source.version });
    assert.equal(ready.status, 'ready'); assert.equal(ready.version, source.version + 1); assert.ok(ready.pipeline_id); assert.ok(ready.trigger_pipeline_id);
    await assert.rejects(service.update(projectId, ready.id, owner, { expected_version: source.version, schedule_enabled: false }), { code: 'NORA_CHANNEL_VERSION_CONFLICT' });
    const changed = await service.update(projectId, ready.id, reviewer, { expected_version: ready.version, schedule_enabled: false });
    assert.equal(changed.status, 'draft'); assert.equal(changed.schedule_enabled, false);
    await assert.rejects(service.run(projectId, ready.id, owner, { request_id: 'draft-manual' }), { code: 'NORA_CHANNEL_NOT_READY' });
  });
  await t.test('rotated trigger keys revoke prior access and concurrent repeats enqueue once', async () => {
    const source = await prepare(), first = await service.rotateTriggerKey(projectId, source.id, owner);
    assert.match(first.trigger_url, /^https:\/\/ains.example.test\/api\/nora-channel-trigger\//);
    assert.equal((await row(source.id)).trigger_token_hash.includes(first.token), false);
    await assert.rejects(service.trigger(source.id, 'wrong-key', { event_id: 'event-1' }), { code: 'FORBIDDEN' });
    const next = await service.rotateTriggerKey(projectId, source.id, owner);
    await assert.rejects(service.trigger(source.id, first.token, { event_id: 'event-1' }), { code: 'FORBIDDEN' });
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => service.trigger(source.id, next.token, { event_id: 'event-1' })));
    assert.equal(new Set(outcomes.map(v => v.delivery_id)).size, 1); assert.equal(outcomes.filter(v => !v.replayed).length, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM nora_channel_deliveries WHERE source_id=$1', [source.id])).rows[0].n, 1);
    const paused = await service.update(projectId, source.id, owner, { expected_version: source.version, trigger_enabled: false });
    await assert.rejects(service.trigger(source.id, next.token, { event_id: 'event-2' }), { code: 'NORA_CHANNEL_TRIGGER_PAUSED' });
    await service.provision(projectId, source.id, owner, { expected_version: paused.version });
    await assert.rejects(service.trigger(source.id, next.token, { event_id: 'event-2' }), { code: 'NORA_CHANNEL_TRIGGER_PAUSED' });
  });
  await t.test('manual retry identity is stable and source owner revocation blocks triggers', async () => {
    const source = await prepare();
    const a = await service.run(projectId, source.id, reviewer, { request_id: 'same-manual-id' }), b = await service.run(projectId, source.id, reviewer, { request_id: 'same-manual-id' });
    assert.equal(a.delivery_id, b.delivery_id); assert.equal(b.replayed, true);
    const key = await service.rotateTriggerKey(projectId, source.id, owner);
    await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2", [projectId, owner]);
    await assert.rejects(service.trigger(source.id, key.token, { event_id: 'revoked-user-event' }), { code: 'FORBIDDEN' });
    await pool.query("UPDATE memberships SET role='owner' WHERE project_id=$1 AND user_id=$2", [projectId, owner]);
  });

  // Keep the worker scenario independent of management rows from prior cases.
  await pool.query("UPDATE nora_channel_sources SET status='draft'");
  const source = await prepare(), worker = createNoraChannelSourceWorker({ pool, provider });
  const due = async () => pool.query('UPDATE nora_channel_sources SET next_sync_at=now() WHERE id=$1', [source.id]);
  const raw = (extra = {}) => ({ id: 'external-message-1', text: '고객 피드백: 승인 후 적용해 주세요.', author: 'Synthetic Author', sent_at: '2026-10-15T01:00:00Z', changed_at: '2026-10-15T02:00:00Z', url: 'https://example.test/slack/message/1', conversation_key: 'source-thread', ...extra });
  await t.test('scheduled reconciliation preserves source text and deduplicates unchanged records', async () => {
    records = [raw()]; assert.equal((await worker.runOnce()).message_count, 1);
    const first = (await pool.query('SELECT * FROM channel_inbox WHERE source_id=$1', [source.id])).rows[0];
    assert.equal(first.status, 'queued'); assert.equal(sourceText(first.input_snapshot.messages[0]), raw().text); assert.equal(first.input_snapshot.source.provider, 'slack');
    await due(); assert.equal((await worker.runOnce()).message_count, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM channel_inbox WHERE source_id=$1', [source.id])).rows[0].n, 1);
    assert.equal(runCalls, 0); assert.ok(reads >= 2);
  });
  await t.test('changed records invalidate earlier evidence without replacing originals', async () => {
    records = [raw({ text: '고객 피드백: 기존 결정을 철회합니다.', changed_at: '2026-10-15T03:00:00Z' })];
    await due(); assert.equal((await worker.runOnce()).message_count, 1);
    const messages = (await pool.query('SELECT * FROM channel_events WHERE source_id=$1 ORDER BY sequence', [source.id])).rows;
    assert.equal(messages.length, 2); assert.equal(sourceText(messages[0]), raw().text); assert.equal(messages[1].kind, 'updated'); assert.equal(messages[1].message_id, messages[0].message_id);
    const inboxes = (await pool.query('SELECT * FROM channel_inbox WHERE source_id=$1 ORDER BY created_at,id', [source.id])).rows;
    assert.equal(inboxes[0].evidence_changed, true); assert.equal(inboxes[1].evidence_changed, false);
  });
  await t.test('failed reads retain cursor and can recover without duplicating evidence', async () => {
    readError = Object.assign(new Error('private response text'), { code: 'NORA_CHANNEL_TEST_READ_FAILED' });
    const before = await row(source.id); await due(); assert.equal((await worker.runOnce()).error_code, 'NORA_CHANNEL_TEST_READ_FAILED');
    assert.deepEqual((await row(source.id)).cursor, before.cursor); assert.equal(JSON.stringify(await row(source.id)).includes('private response text'), false);
    readError = null; await due(); assert.equal((await worker.runOnce()).message_count, 0);
  });
  await t.test('pause during source fetch cannot ingest the late result', async () => {
    records = [raw({ id: 'late-record', text: '수집 중단 이후 도착한 기록' })];
    onRead = async () => { const current = await row(source.id); await service.update(projectId, source.id, owner, { expected_version: current.version, schedule_enabled: false, trigger_enabled: false }); };
    await due(); assert.equal((await worker.runOnce()).error_code, 'NORA_CHANNEL_LEASE_LOST'); onRead = null;
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM nora_channel_objects WHERE source_id=$1 AND external_id='late-record'", [source.id])).rows[0].n, 0);
    const current = await row(source.id); await service.provision(projectId, source.id, owner, { expected_version: current.version });
  });
  await t.test('already queued triggers are not dispatched after trigger is disabled', async () => {
    await pool.query("INSERT INTO nora_channel_deliveries(source_id,project_id,entry_point,event_key) VALUES($1,$2,'trigger','previously-queued')", [source.id, projectId]);
    records = []; const before = runCalls; await due(); await worker.runOnce(); assert.equal(runCalls, before);
    const delivery = (await pool.query("SELECT * FROM nora_channel_deliveries WHERE source_id=$1 AND event_key='previously-queued'", [source.id])).rows[0];
    assert.equal(delivery.status, 'failed'); assert.equal(delivery.error_code, 'NORA_CHANNEL_TRIGGER_PAUSED');
  });
  await t.test('long source records are preserved in ordered parts and each part is idempotent', async () => {
    const text = '가'.repeat(17999) + '😀' + '나'.repeat(24000); records = [raw({ id: 'long-record', text })];
    await due(); assert.equal((await worker.runOnce()).message_count, 3);
    const object = (await pool.query("SELECT * FROM nora_channel_objects WHERE source_id=$1 AND external_id='long-record'", [source.id])).rows[0];
    assert.equal(object.event_payload.messages.map(sourceText).join(''), text); assert.ok(object.event_payload.messages.every(m => m.text.isWellFormed()));
    await due(); assert.equal((await worker.runOnce()).message_count, 0);
    records = [raw({ id: 'long-record', text: '요약본으로 변경', changed_at: '2026-10-15T05:00:00Z' })];
    await due(); assert.equal((await worker.runOnce()).message_count, 3);
    const revised = (await pool.query("SELECT event_payload FROM nora_channel_objects WHERE source_id=$1 AND external_id='long-record'", [source.id])).rows[0].event_payload;
    assert.equal(revised.messages[0].kind, 'updated'); assert.deepEqual(revised.messages.slice(1).map(m => m.kind), ['deleted', 'deleted']);
  });
});

test('Nora records reject unsafe source URLs and retain surrogate pairs while chunking', () => {
  for (const url of ['javascript:alert(1)', 'https://user:password@example.test', 'file:///tmp/source']) assert.throws(() => normalizeRecord({ id: 'x', text: 'body', url }), { code: 'NORA_CHANNEL_RECORD_INVALID' });
  const normalized = normalizeRecord({ id: 'x', text: 'a'.repeat(17999) + '😀tail' }), payload = recordPayload({ id: 'source' }, normalized);
  assert.equal(payload.messages.map(sourceText).join(''), normalized.text); assert.ok(payload.messages.every(m => m.text.isWellFormed()));
});
