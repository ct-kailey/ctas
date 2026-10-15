'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { provisionUser } = require('../server/auth');
const { createApp } = require('../server/server');
const { identity } = require('../../nora/channel-ingestion/pipeline');

test('Nora channel HTTP separates session/CSRF management from scoped bearer triggers', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'nora_channel_http_' + randomUUID().replaceAll('-', ''), admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: '-c search_path=' + schema }); let server;
  t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(pool);
  const password = 'synthetic-channel-password-123';
  const owner = await provisionUser(pool, { email: 'source-http-owner@example.test', name: 'Owner', password });
  const member = await provisionUser(pool, { email: 'source-http-member@example.test', name: 'Member', password });
  const outsider = await provisionUser(pool, { email: 'source-http-outsider@example.test', name: 'Outsider', password });
  const projectId = 'nora-channel-http', workspaceId = 't_nora_channel_http';
  await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)', [projectId, 'Synthetic Nora source HTTP']);
  for (const [user, role] of [[owner, 'owner'], [member, 'member']]) await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [projectId, user.id, role]);
  await pool.query("INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name,status,stage,space_id) VALUES($1,$2,$3,$4,'ready','complete','http-source-space')", [projectId, workspaceId, owner.id, 'Synthetic Nora source HTTP']);
  let connectorReads = 0;
  const provider = {
    async listConnectors(input) { connectorReads++; assert.equal(input.projectId, projectId); assert.equal(input.workspaceId, workspaceId); return [{ id: 'conn_http_slack_test', provider: 'slack', name: 'Synthetic Slack', enabled: true }]; },
    async provision(input) { return identity(input); },
  };
  const origin = 'https://nora-channel-http.example.test';
  server = createApp({ pool, appOrigin: origin, nora: { channelSources: provider } }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function login(email) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(response.status, 200); const value = await response.json();
    return { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': value.csrfToken };
  }
  const ownerHeaders = await login(owner.email), memberHeaders = await login(member.email), outsideHeaders = await login(outsider.email);
  async function call(route, body, status = 200, headers = ownerHeaders, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json(); assert.equal(response.status, status, JSON.stringify(value)); return value;
  }
  const prefix = '/api/projects/' + projectId, sourceBody = { name: 'Synthetic source', connector_id: 'conn_http_slack_test', external_channel_id: 'C-SYNTHETIC', schedule_enabled: true, trigger_enabled: true, interval_minutes: 15 };
  await call(prefix + '/nora-channel-sources', undefined, 401, {});
  await call(prefix + '/nora-channel-connectors', undefined, 403, memberHeaders);
  await call(prefix + '/nora-channel-connectors', undefined, 404, outsideHeaders);
  assert.equal(connectorReads, 0);
  await call(prefix + '/nora-channel-sources', sourceBody, 403, memberHeaders);
  await call(prefix + '/nora-channel-sources', sourceBody, 403, { ...ownerHeaders, 'X-CSRF-Token': 'invalid' });
  const { source } = await call(prefix + '/nora-channel-sources', sourceBody, 201);
  const { source: ready } = await call(prefix + '/nora-channel-sources/' + source.id + '/provision', { expected_version: source.version });
  const key = await call(prefix + '/nora-channel-sources/' + source.id + '/trigger-key', {});
  assert.equal(key.token.length, 43);
  const visible = (await call(prefix + '/nora-channel-sources', undefined, 200, memberHeaders)).sources[0];
  assert.equal(visible.has_trigger_key, true); assert.equal(Object.hasOwn(visible, 'trigger_token_hash'), false); assert.equal(Object.hasOwn(visible, 'token'), false);
  await call(prefix + '/nora-channel-sources/' + source.id + '/deliveries', undefined, 404, outsideHeaders);
  await call(prefix + '/nora-channel-sources/' + source.id + '/trigger-key', {}, 403, memberHeaders);
  const endpoint = '/api/nora-channel-trigger/' + source.id;
  // A session cookie cannot substitute for the channel-specific event key.
  await call(endpoint, { event_id: 'http-event' }, 403, ownerHeaders);
  await call(endpoint, { event_id: 'http-event' }, 403, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + 'x'.repeat(43) });
  const external = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key.token };
  const first = await call(endpoint, { event_id: 'http-event' }, 202, external);
  const repeated = await call(endpoint, { event_id: 'http-event' }, 202, external);
  assert.equal(first.delivery_id, repeated.delivery_id); assert.equal(repeated.replayed, true);
  await call(endpoint, { event_id: 'injected-event', messages: [{ text: 'Injected body' }], channel_id: 'another-channel' }, 400, external);
  await call(endpoint, { event_id: 'a'.repeat(5000) }, 413, external);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM channel_inbox')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM nora_channel_deliveries')).rows[0].n, 1);
  const paused = (await call(prefix + '/nora-channel-sources/' + source.id, { expected_version: ready.version, trigger_enabled: false }, 200, ownerHeaders, 'PATCH')).source;
  assert.equal(paused.status, 'draft'); await call(endpoint, { event_id: 'paused-event' }, 409, external);
  await call(prefix + '/nora-channel-sources/' + source.id, { expected_version: ready.version, trigger_enabled: true }, 409, ownerHeaders, 'PATCH');
});
