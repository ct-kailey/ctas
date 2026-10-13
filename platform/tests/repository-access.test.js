'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { createImplementationLedger } = require('../server/implementation-ledger');
const { createRepositoryAccess } = require('../server/repository-access');
const { createGitHubDeliveryService } = require('../server/github-delivery');
const { createApp } = require('../server/server');
const { sha256 } = require('../server/auth');
const TOKEN = 'github_pat_synthetic_read_only_0123456789';
const OTHER = 'github_pat_synthetic_second_0123456789';
const SHA = 'a'.repeat(40);

test('project repository access stays encrypted, scoped, role-controlled and read-only', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'repo_access_' + randomUUID().replaceAll('-', ''), admin = createPool(process.env.TEST_DATABASE_URL);
  let pool, server;
  t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (pool) await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  await migrate(pool);
  const users = {};
  for (const role of ['owner','reviewer','viewer','outsider']) users[role] = (await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id', [`${role}@repository.test`, role, 'unused'])).rows[0].id;
  const ledger = createLedger(pool), implementation = createImplementationLedger(pool), key = randomBytes(32).toString('base64'), calls = [];
  let interception = null;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options }); assert.equal(new URL(url).origin, 'https://api.github.com'); assert.equal(options.redirect, 'error'); assert.ok(!options.method || options.method === 'GET');
    if (interception) await interception(url);
    return Response.json(url.includes('/branches/') ? { commit: { sha: SHA } } : { archived: false });
  };
  const access = createRepositoryAccess(pool, { implementation, encryptionKey: key, deliveryEncryptionKey: key, serverToken: null, fetchImpl });
  const fixture = async () => {
    const project = await ledger.createProject(users.owner, { name: '비공개 저장소 합성 검증' });
    await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'reviewer'),($1,$3,'viewer')", [project.id, users.reviewer, users.viewer]);
    await implementation.saveSettings(project.id, users.owner, { expected_version: 1, goal: '합성 검증', repository_url: 'https://github.com/acme/private', base_branch: 'main' });
    return project.id;
  };
  const save = (p, token = TOKEN, version = 0) => access.save(p, users.owner, { expected_version: version, expected_settings_version: 2, token });
  await t.test('tokens are write-only and tied to the project and exact repository', async () => {
    const p = await fixture();
    assert.equal((await access.status(p, users.viewer)).credential_source, 'anonymous');
    await assert.rejects(access.save(p, users.reviewer, { expected_version: 0, expected_settings_version: 2, token: TOKEN }), { code: 'FORBIDDEN' });
    await assert.rejects(access.status(p, users.outsider), { code: 'FORBIDDEN' });
    await assert.rejects(access.verify(p, users.viewer), { code: 'FORBIDDEN' });
    const saved = await save(p); assert.equal(saved.credential_source, 'project');
    const check = await access.verify(p, users.owner); assert.equal(check.repository_check.status, 'ready'); assert.equal(check.repository_check.credential_source, 'project');
    assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer ' + TOKEN);
    const serialized = JSON.stringify({ access: await access.status(p, users.viewer), settings: await implementation.getSettings(p, users.viewer), events: (await pool.query('SELECT detail FROM events WHERE project_id=$1', [p])).rows, stored: (await pool.query('SELECT * FROM project_repository_access WHERE project_id=$1', [p])).rows });
    assert.ok(!serialized.includes(TOKEN)); assert.ok(!JSON.stringify(saved).includes('secret_ciphertext'));
    await implementation.saveSettings(p, users.owner, { expected_version: 2, goal: '합성 검증', repository_url: 'https://github.com/acme/other', base_branch: 'main' });
    assert.equal((await access.status(p, users.owner)).repository_matches, false);
    await access.verify(p, users.owner); assert.equal(calls.at(-1).options.headers.Authorization, undefined);
    await assert.rejects(save(p, OTHER, 1), { code: 'SETTINGS_VERSION_CONFLICT' });
  });
  await t.test('active same-project same-repository PR credentials are reused without enabling publication', async () => {
    const p = await fixture(), delivery = createGitHubDeliveryService(pool, { encryptionKey: key });
    await delivery.saveSettings(p, users.owner, { expected_version: 0, enabled: true, token: TOKEN });
    assert.equal((await access.status(p, users.owner)).credential_source, 'github_delivery');
    await access.verify(p, users.owner); assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer ' + TOKEN);
    await save(p, OTHER); await access.verify(p, users.owner); assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer ' + OTHER);
    await delivery.saveSettings(p, users.owner, { expected_version: 1, enabled: true, token: TOKEN });
    assert.equal((await implementation.getSettings(p, users.owner)).repository_check.credential_source, 'project');
    await access.save(p, users.owner, { expected_version: 1, expected_settings_version: 2, remove_token: true });
    assert.equal((await access.status(p, users.owner)).credential_source, 'github_delivery');
    await access.verify(p, users.owner);
    await delivery.saveSettings(p, users.owner, { expected_version: 2, enabled: false });
    assert.equal((await access.status(p, users.owner)).credential_source, 'anonymous');
    assert.equal((await implementation.getSettings(p, users.owner)).repository_check, null);
    assert.equal((await pool.query('SELECT * FROM github_deliveries WHERE project_id=$1', [p])).rowCount, 0);
  });
  await t.test('credential replacement during network verification cannot publish stale readiness', async () => {
    const p = await fixture(); await save(p);
    let started, resume;
    const waiting = new Promise(resolve => { started = resolve; }), paused = new Promise(resolve => { resume = resolve; });
    interception = async url => { if (!url.includes('/branches/')) { started(); await paused; } };
    const pending = access.verify(p, users.owner); await waiting;
    await save(p, OTHER, 1); resume();
    await assert.rejects(pending, { code: 'REPOSITORY_ACCESS_CHANGED' }); interception = null;
    assert.equal((await implementation.getSettings(p, users.owner)).repository_check, null);
    await access.verify(p, users.owner); assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer ' + OTHER);
  });
  await t.test('ciphertext copied across projects cannot authenticate and missing encryption key fails safely', async () => {
    const p = await fixture(), other = await fixture(); await save(p); await save(other);
    await pool.query('UPDATE project_repository_access SET secret_ciphertext=(SELECT secret_ciphertext FROM project_repository_access WHERE project_id=$1) WHERE project_id=$2', [p, other]);
    assert.equal((await access.status(other, users.owner)).credential_error, 'INTEGRATION_CREDENTIAL_INVALID');
    const before = calls.length; await assert.rejects(access.verify(other, users.owner), { code: 'INTEGRATION_CREDENTIAL_INVALID' }); assert.equal(calls.length, before);
    const unavailable = createRepositoryAccess(pool, { implementation, encryptionKey: null, deliveryEncryptionKey: null, serverToken: null });
    assert.equal((await unavailable.status(p, users.owner)).can_store_credentials, false);
    await assert.rejects(unavailable.save(p, users.owner, { expected_version: 1, expected_settings_version: 2, token: TOKEN }), { code: 'REPOSITORY_VAULT_UNAVAILABLE' });
  });
  await t.test('owner permission is rechecked after the external request', async () => {
    const p = await fixture(); await save(p);
    let started, resume;
    const waiting = new Promise(resolve => { started = resolve; }), paused = new Promise(resolve => { resume = resolve; });
    interception = async url => { if (!url.includes('/branches/')) { started(); await paused; } };
    const pending = access.verify(p, users.owner); await waiting;
    await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2", [p, users.owner]); resume();
    await assert.rejects(pending, { code: 'FORBIDDEN' }); interception = null;
    assert.equal((await implementation.getSettings(p, users.owner)).repository_check, null);
  });
  await t.test('HTTP routes enforce cookie auth, project membership, owner and CSRF without leaking credentials', async () => {
    const p = await fixture(), cookies = {};
    for (const role of Object.keys(users)) { const token = randomBytes(32).toString('hex'); await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,'repository-csrf',now()+interval '1 hour')", [sha256(token), users[role]]); cookies[role] = 'ains_session=' + token; }
    server = createApp({ pool, repositoryAccess: { encryptionKey: key, deliveryEncryptionKey: key, serverToken: null, fetchImpl } }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`, path = `/api/projects/${p}/settings/repository-access`;
    const request = (suffix, role = 'owner', method = 'GET', body, csrf = true) => fetch(origin + suffix, { method, headers: { ...(role ? { Cookie: cookies[role] } : {}), ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3100', ...(csrf ? { 'X-CSRF-Token': 'repository-csrf' } : {}) }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await request(path, null)).status, 401); assert.equal((await request(path, 'outsider')).status, 404);
    const body = { expected_version: 0, expected_settings_version: 2, token: TOKEN };
    assert.equal((await request(path, 'reviewer', 'PUT', body)).status, 403);
    assert.equal((await request(path, 'owner', 'PUT', body, false)).status, 403);
    const saved = await request(path, 'owner', 'PUT', body); assert.equal(saved.status, 200); assert.ok(!(await saved.text()).includes(TOKEN));
    const checked = await request(`/api/projects/${p}/settings/verify-repository`, 'owner', 'POST', {}); assert.equal(checked.status, 200); assert.equal((await checked.json()).settings.repository_check.status, 'ready');
    const status = await request(path, 'viewer'); assert.equal(status.headers.get('cache-control'), 'no-store'); assert.ok(!(await status.text()).includes(TOKEN));
  });
});
