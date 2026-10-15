'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createNoraChannelSources } = require('../server/nora-channel-sources');
const { createNoraChannelSourceWorker, normalizeRecord, recordPayload } = require('../server/nora-channel-source-worker');
const { createChannelLedger } = require('../server/channel-ledger');
const { createCustomerConnections } = require('../server/customer-connections');
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
  const customerId=randomUUID(),connectionId=randomUUID(),grantId=randomUUID(),resources=Array.from({length:100},()=>({id:randomUUID(),label:'Approved channel',kind:'channel'}));let resourceIndex=0;
  await pool.query("INSERT INTO customers(id,name,kind,created_by) VALUES($1,'Source customer','client',$2)",[customerId,owner]);
  await pool.query("INSERT INTO customer_memberships(customer_id,user_id,role) VALUES($1,$2,'owner')",[customerId,owner]);
  await pool.query("INSERT INTO customer_connections(id,customer_id,name,provider,manager_user_id,created_by) VALUES($1,$2,'Approved Slack','slack',$3,$3)",[connectionId,customerId,owner]);
  await pool.query('INSERT INTO project_customer_links(project_id,customer_id,assigned_by) VALUES($1,$2,$3)',[projectId,customerId,owner]);
  await pool.query('INSERT INTO project_connection_grants(id,project_id,connection_id,workspace_id,connector_id,allowed_resources,operator_id,reviewer_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$7)',[grantId,projectId,connectionId,workspaceId,'conn_channel_slack_test',JSON.stringify(resources),owner,reviewer]);
  let records = [], readError, onRead, onProvision, onPause, pauseError, pauseCalls=0, runCalls = 0, reads = 0;
  const provider = {
    async listConnectors(input) { assert.equal(input.projectId, projectId); assert.equal(input.workspaceId, workspaceId); return [{ id: 'conn_channel_slack_test', provider: 'slack', name: 'Synthetic Slack', enabled: true }]; },
    async provision(input) { assert.equal(input.projectId, projectId); assert.equal(input.workspaceId, workspaceId); await onProvision?.(input);return identity(input); },
    async pause(input) { pauseCalls++;await onPause?.(input);if(pauseError)throw pauseError;return {status:'stopped',schedulePaused:true,triggerKeyRotated:true}; },
    async run(input) { runCalls++; return { runId: 'run-' + input.requestId }; },
    async readRecords(input) { reads++; if (readError) throw readError; await onRead?.(input); return { records: structuredClone(records), cursor: {}, hasMore: false }; },
  };
  const service = createNoraChannelSources({ pool, provider, appOrigin: 'https://ains.example.test' });
  const body = (channel = resources[resourceIndex++].id) => ({ name: 'Synthetic Slack', grant_id: grantId, external_channel_id: channel, schedule_enabled: true, trigger_enabled: true, interval_minutes: 15 });
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
  await t.test('generic source APIs cannot enable or inject manual evidence into a managed Nora source',async()=>{
    const target=await create(),channels=createChannelLedger(pool),stored=(await pool.query('SELECT * FROM channel_sources WHERE id=$1',[target.id])).rows[0];assert.equal(stored.manual_intake_enabled,false);
    await assert.rejects(channels.updateSource(projectId,target.id,owner,{manual_intake_enabled:true}),{code:'NORA_CHANNEL_MANAGED_INTAKE'});
    const batch={batch_id:'manual-injection',conversation_key:'manual-conversation',messages:[{event_id:'manual-event',message_id:'manual-message',kind:'created',author:'actor',text:'unapproved evidence'}]};
    await assert.rejects(channels.ingest(projectId,target.id,owner,batch),{code:'NORA_CHANNEL_MANAGED_INTAKE'});
    await pool.query('UPDATE channel_sources SET manual_intake_enabled=true WHERE id=$1',[target.id]);
    await assert.rejects(channels.ingest(projectId,target.id,owner,batch),{code:'NORA_CHANNEL_MANAGED_INTAKE'});
    assert.equal((await pool.query('SELECT count(*)::int n FROM channel_events WHERE source_id=$1',[target.id])).rows[0].n,0);
    await pool.query('UPDATE channel_sources SET manual_intake_enabled=false WHERE id=$1',[target.id]);
  });
  await t.test('duplicate and cross-project targets cannot be registered or read', async () => {
    const input = body(); await service.create(projectId, owner, input);
    await assert.rejects(service.create(projectId, owner, input), { code: 'NORA_CHANNEL_EXISTS' });
    await assert.rejects(create({ connector_id: 'foreign-connector' }), { code: 'INVALID_INTEGRATION' });
    await assert.rejects(create({external_channel_id:'unapproved-channel'}),{code:'CONNECTION_RESOURCE_FORBIDDEN'});
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
  await t.test('manual retry identity is stable and designated operator revocation blocks triggers', async () => {
    const source = await prepare();
    const a = await service.run(projectId, source.id, reviewer, { request_id: 'same-manual-id' }), b = await service.run(projectId, source.id, reviewer, { request_id: 'same-manual-id' });
    assert.equal(a.delivery_id, b.delivery_id); assert.equal(b.replayed, true);
    const key = await service.rotateTriggerKey(projectId, source.id, owner);
    await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2", [projectId, owner]);
    await assert.rejects(service.trigger(source.id, key.token, { event_id: 'revoked-user-event' }), { code: 'CONNECTION_GRANT_REVOKED' });
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
  const accounts=createCustomerConnections({pool,provider});
  const account=async()=> (await pool.query('SELECT * FROM customer_connections WHERE id=$1',[connectionId])).rows[0];
  const grant=async()=> (await pool.query('SELECT * FROM project_connection_grants WHERE id=$1',[grantId])).rows[0];
  const drainStops=async()=>{for(let i=0;i<100;i++){const count=(await pool.query("SELECT count(*)::int n FROM nora_channel_stop_jobs WHERE status<>'completed'")).rows[0].n;if(!count)return;await pool.query("UPDATE nora_channel_stop_jobs SET next_attempt_at=now() WHERE status<>'completed'");const result=await worker.stopOnce();assert.equal(result.remote_stop_status,'completed');}throw new Error('stop jobs did not drain');};
  await t.test('legacy collection requires owner reauthorization and verified remote stop before provision',async()=>{
    const legacy=await prepare();await pool.query("UPDATE nora_channel_sources SET connection_grant_id=NULL,status='draft' WHERE id=$1",[legacy.id]);
    await assert.rejects(service.run(projectId,legacy.id,owner),{code:'CONNECTION_GRANT_REQUIRED'});
    await assert.rejects(service.provision(projectId,legacy.id,owner,{expected_version:legacy.version}),{code:'CONNECTION_GRANT_REQUIRED'});
    await assert.rejects(service.reauthorize(projectId,legacy.id,reviewer,{expected_version:legacy.version,grant_id:grantId}),{code:'FORBIDDEN'});
    const restored=await service.reauthorize(projectId,legacy.id,owner,{expected_version:legacy.version,grant_id:grantId});
    assert.equal(restored.id,legacy.id);assert.equal(restored.external_channel_id,legacy.external_channel_id);assert.equal(restored.created_by,owner);
    await assert.rejects(service.provision(projectId,legacy.id,owner,{expected_version:restored.version}),{code:'NORA_CHANNEL_STOP_PENDING'});
    pauseError=Object.assign(new Error('upstream unavailable'),{code:'NORA_CHANNEL_TEST_STOP_FAILED'});
    assert.equal((await worker.stopOnce()).remote_stop_status,'failed');
    const visible=(await service.list(projectId,owner)).sources.find(r=>r.id===legacy.id);assert.equal(visible.remote_stop_status,'failed');assert.equal(visible.can_operate,false);
    await assert.rejects(service.provision(projectId,legacy.id,owner,{expected_version:restored.version}),{code:'NORA_CHANNEL_STOP_PENDING'});
    pauseError=null;await drainStops();assert.equal((await service.provision(projectId,legacy.id,owner,{expected_version:restored.version})).id,legacy.id);
  });
  await t.test('reauthorization coalesces into the active stop lease without overlapping remote calls',async()=>{
    const target=await prepare();await service.reauthorize(projectId,target.id,owner,{expected_version:target.version,grant_id:grantId});
    onPause=async()=>{
      const running=(await pool.query('SELECT * FROM nora_channel_stop_jobs WHERE source_id=$1',[target.id])).rows[0],current=await row(target.id);
      const attached=await service.reauthorize(projectId,target.id,owner,{expected_version:current.version,grant_id:grantId});
      const latest=(await pool.query('SELECT * FROM nora_channel_stop_jobs WHERE source_id=$1',[target.id])).rows[0];assert.equal(latest.status,'running');assert.equal(latest.lease_token,running.lease_token);
      assert.equal(await worker.stopOnce(),null);
      await assert.rejects(service.provision(projectId,target.id,owner,{expected_version:attached.version}),{code:'NORA_CHANNEL_STOP_PENDING'});
    };
    const stopped=await worker.stopOnce();onPause=null;assert.equal(stopped.remote_stop_status,'completed');
    const current=await row(target.id);assert.equal((await service.provision(projectId,target.id,owner,{expected_version:current.version})).status,'ready');
  });
  await t.test('account pause during fetch cancels commit, disables local access and durably stops Nora',async()=>{
    await pool.query("UPDATE nora_channel_sources SET status='draft'");const target=await prepare();records=[raw({id:'after-account-pause'})];
    onRead=async()=>accounts.updateConnection(customerId,connectionId,owner,{expected_version:(await account()).version,status:'paused'});
    const result=await worker.runOnce();onRead=null;assert.equal(result.error_code,'NORA_CHANNEL_LEASE_LOST');
    assert.equal((await pool.query("SELECT count(*)::int n FROM nora_channel_objects WHERE source_id=$1",[target.id])).rows[0].n,0);
    const disabled=await row(target.id);assert.equal(disabled.status,'draft');assert.equal(disabled.schedule_enabled,false);assert.equal(disabled.trigger_enabled,false);assert.equal(disabled.trigger_token_hash,null);
    await assert.rejects(service.run(projectId,target.id,owner),{code:'CONNECTION_GRANT_REVOKED'});
    assert.equal((await service.connectors(projectId,owner)).connectors.length,0);
    await drainStops();assert.ok(pauseCalls>0);
    await accounts.updateConnection(customerId,connectionId,owner,{expected_version:(await account()).version,status:'active'});
  });
  await t.test('revocation during provision never marks late pipelines ready and requeues cleanup',async()=>{
    const target=await create();onProvision=async()=>{await accounts.updateGrant(projectId,grantId,owner,{expected_version:(await grant()).version,status:'revoked'});while(await worker.stopOnce()){};assert.equal((await pool.query('SELECT status FROM nora_channel_stop_jobs WHERE source_id=$1',[target.id])).rows[0].status,'pending');const waiting=await row(target.id);assert.ok(waiting.remote_provision_token);};
    await assert.rejects(service.provision(projectId,target.id,owner,{expected_version:target.version}),{code:'CONNECTION_GRANT_REVOKED'});onProvision=null;
    const current=await row(target.id);assert.equal(current.status,'draft');assert.equal(current.pipeline_id,null);assert.equal(current.schedule_enabled,false);
    const job=(await pool.query('SELECT * FROM nora_channel_stop_jobs WHERE source_id=$1',[target.id])).rows[0];assert.equal(job.status,'pending');assert.equal(job.snapshot.sourceId,target.id);
    await drainStops();await accounts.updateGrant(projectId,grantId,owner,{expected_version:(await grant()).version,status:'active'});await drainStops();
  });
  await t.test('lost reviewer permission pauses the source and creates a retryable remote stop',async()=>{
    await pool.query("UPDATE nora_channel_sources SET status='draft'");const target=await prepare();await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2",[projectId,reviewer]);
    assert.equal((await worker.runOnce()).error_code,'CONNECTION_GRANT_REVOKED');const current=await row(target.id);assert.equal(current.status,'draft');assert.equal(current.schedule_enabled,false);
    assert.equal((await pool.query('SELECT status FROM nora_channel_stop_jobs WHERE source_id=$1',[target.id])).rows[0].status,'pending');
    await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2",[projectId,reviewer]);await drainStops();
  });
  await t.test('authorization sweep also stops native schedules whose local source is draft',async()=>{
    const target=await prepare();await service.update(projectId,target.id,owner,{expected_version:target.version,schedule_enabled:false,trigger_enabled:false});
    await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2",[projectId,reviewer]);
    const auditWorker=createNoraChannelSourceWorker({pool,provider});await auditWorker.sweepAuthorizations();
    assert.equal((await pool.query('SELECT status FROM nora_channel_stop_jobs WHERE source_id=$1',[target.id])).rows[0].status,'pending');
    assert.equal((await row(target.id)).last_error_code,'CONNECTION_GRANT_REVOKED');
    await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2",[projectId,reviewer]);await drainStops();
  });
  await t.test('abandoned provisioning leases require durable cleanup before another apply',async()=>{
    const target=await prepare();await pool.query("UPDATE nora_channel_sources SET status='provisioning',remote_provision_token=$2,remote_provision_expires_at=now()+interval '5 minutes' WHERE id=$1",[target.id,randomUUID()]);
    await assert.rejects(service.provision(projectId,target.id,owner,{expected_version:target.version}),{code:'NORA_CHANNEL_STOP_PENDING'});
    await pool.query("UPDATE nora_channel_sources SET remote_provision_expires_at=now()-interval '1 second' WHERE id=$1",[target.id]);
    assert.equal((await worker.runOnce()).error_code,'NORA_CHANNEL_PROVISION_EXPIRED');assert.equal((await row(target.id)).remote_provision_token,null);
    await drainStops();
  });
  await t.test('operator handover preserves creator and source history while ingest uses the new operator',async()=>{
    await pool.query("UPDATE nora_channel_sources SET status='draft'");const target=await prepare();
    await accounts.updateGrant(projectId,grantId,owner,{expected_version:(await grant()).version,operator_id:reviewer});await drainStops();
    await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2",[projectId,owner]);
    const current=await row(target.id);assert.equal(current.created_by,owner);assert.equal(current.id,target.id);
    await service.provision(projectId,target.id,reviewer,{expected_version:current.version});records=[raw({id:'handover-record'})];
    assert.equal((await worker.runOnce()).message_count,1);const inbox=(await pool.query('SELECT * FROM channel_inbox WHERE source_id=$1',[target.id])).rows[0];assert.equal(inbox.created_by,reviewer);
    assert.equal((await row(target.id)).created_by,owner);const visible=(await service.list(projectId,reviewer)).sources.find(r=>r.id===target.id);assert.equal(visible.operator_id,reviewer);assert.equal(visible.can_operate,true);
    await pool.query("UPDATE memberships SET role='owner' WHERE project_id=$1 AND user_id=$2",[projectId,owner]);
  });

});

test('Nora records reject unsafe source URLs and retain surrogate pairs while chunking', () => {
  for (const url of ['javascript:alert(1)', 'https://user:password@example.test', 'file:///tmp/source']) assert.throws(() => normalizeRecord({ id: 'x', text: 'body', url }), { code: 'NORA_CHANNEL_RECORD_INVALID' });
  const normalized = normalizeRecord({ id: 'x', text: 'a'.repeat(17999) + '😀tail' }), payload = recordPayload({ id: 'source' }, normalized);
  assert.equal(payload.messages.map(sourceText).join(''), normalized.text); assert.ok(payload.messages.every(m => m.text.isWellFormed()));
});
