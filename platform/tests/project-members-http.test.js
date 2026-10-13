'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createApp } = require('../server/server');
const { createProjectMembers } = require('../server/project-members');
const { sha256 } = require('../server/auth');

test('project members preserve owner authority, assignment history, and project boundaries', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'project_members_' + randomUUID().replaceAll('-', '');
  const admin = createPool(process.env.TEST_DATABASE_URL); let pool, server;
  t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (pool) await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` }); await migrate(pool);
  const users = {}, sessions = {}, origin = 'https://members.example.test';
  for (const name of ['owner', 'reviewer', 'member', 'viewer', 'candidate', 'outsider', 'history', 'scope']) {
    users[name] = (await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,'SECRET_PASSWORD_MARKER') RETURNING id", [name, `${name}@members.example.test`])).rows[0].id;
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [sha256(token), users[name], csrf]);
    sessions[name] = { Cookie: `ains_session=${token}`, Origin: origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
  }
  await pool.query("INSERT INTO projects(id,name) VALUES('team','Project team'),('private','Private project')");
  for (const name of ['owner', 'reviewer', 'member', 'viewer', 'history', 'scope']) await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('team',$1,$2)", [users[name], ['history', 'scope'].includes(name) ? 'member' : name]);
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('private',$1,'owner'),('private',$2,'viewer')", [users.outsider, users.candidate]);
  server = createApp({ pool, appOrigin: origin }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(path = '', { method = 'GET', body, as = 'owner', headers, status = 200, code } = {}) {
    const response = await fetch(`${base}/api/projects/team/members${path}`, { method, headers: headers || sessions[as], body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data));
    assert.equal(response.headers.get('cache-control'), 'no-store'); if (code) assert.equal(data.error.code, code); return data;
  }
  const change = (who, body, options = {}) => req(`/${users[who]}`, { method: 'PATCH', body, ...options });

  await t.test('members may read only their project and owner privileges are not inferred from write roles', async () => {
    const data = await req('', { as: 'viewer' });
    assert.equal(data.current_role, 'viewer'); assert.equal(data.members.length, 6);
    assert.equal(data.assignment_model, 'one_primary_assignee_per_task');
    assert.ok(data.members.every(member => Object.keys(member).sort().join(',') === 'assignments,email,has_assignment_history,id,name,role'));
    assert.doesNotMatch(JSON.stringify(data), /SECRET_PASSWORD_MARKER|candidate@|outsider@|csrf/);
    await req('', { headers: {}, status: 401 });
    await req('', { as: 'outsider', status: 404 });
    for (const as of ['reviewer', 'member', 'viewer']) {
      await req('', { method: 'POST', body: { email: 'candidate@members.example.test', role: 'member' }, as, status: 403, code: 'FORBIDDEN' });
      await change('member', { expected_role: 'member', role: 'owner' }, { as, status: 403, code: 'FORBIDDEN' });
      await req(`/${users.viewer}`, { method: 'DELETE', body: { expected_role: 'viewer' }, as, status: 403, code: 'FORBIDDEN' });
    }
    await req('', { method: 'POST', body: { email: 'candidate@members.example.test', role: 'member' }, headers: { ...sessions.owner, 'X-CSRF-Token': '' }, status: 403, code: 'CSRF_REJECTED' });
    await change('owner', { expected_role: 'owner', role: 'member' }, { status: 409, code: 'LAST_PROJECT_OWNER' });
    await req(`/${users.owner}`, { method: 'DELETE', body: { expected_role: 'owner' }, status: 409, code: 'LAST_PROJECT_OWNER' });
  });
  await t.test('owner adds an existing account only and duplicate membership never changes its role', async () => {
    await req('', { method: 'POST', body: { email: 'new-user@members.example.test', role: 'member' }, status: 404, code: 'ACCOUNT_NOT_REGISTERED' });
    await req('', { method: 'POST', body: { email: 'candidate@members.example.test', role: 'superadmin' }, status: 400, code: 'INVALID_MEMBER_ROLE' });
    const added = await req('', { method: 'POST', body: { email: 'CANDIDATE@members.example.test', role: 'member' }, status: 201 });
    assert.equal(added.member.id, users.candidate); assert.equal(added.member.role, 'member');
    await req('', { method: 'POST', body: { email: 'candidate@members.example.test', role: 'owner' }, status: 409, code: 'MEMBER_EXISTS' });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 8);
    assert.equal((await pool.query("SELECT role FROM memberships WHERE project_id='private' AND user_id=$1", [users.candidate])).rows[0].role, 'viewer');
    assert.equal((await req('', { as: 'candidate' })).current_role, 'member');
  });
  await t.test('explicit expected role, last owner, and self changes are protected', async () => {
    await change('candidate', { expected_role: 'viewer', role: 'owner' }, { status: 409, code: 'MEMBERSHIP_CHANGED' });
    await change('candidate', { role: 'reviewer' }, { status: 400, code: 'INVALID_MEMBER_ROLE' });
    await change('candidate', { expected_role: 'member', role: 'owner' });
    await change('owner', { expected_role: 'owner', role: 'reviewer' }, { status: 409, code: 'SELF_MEMBERSHIP_CHANGE' });
    await req(`/${users.owner}`, { method: 'DELETE', body: { expected_role: 'owner' }, status: 409, code: 'SELF_MEMBERSHIP_CHANGE' });
    await change('candidate', { expected_role: 'owner', role: 'member' });
    await change('outsider', { expected_role: 'owner', role: 'viewer' }, { status: 404, code: 'NOT_FOUND' });
    await req('/not-a-user-id', { method: 'PATCH', body: { expected_role: 'member', role: 'viewer' }, status: 400, code: 'INVALID_MEMBER_ID' });
  });

  const plan = randomUUID();
  await pool.query(`INSERT INTO implementation_plans(id,project_id,requested_revision_ids,request_sha256,input_snapshot,input_sha256,created_by)
    VALUES($1,'team',$2,$3,'{}',$3,$4)`, [plan, [randomUUID()], 'a'.repeat(64), users.owner]);
  for (const [index, name] of ['member', 'history'].entries()) await pool.query(`INSERT INTO work_items(project_id,plan_id,source_task_id,source_task,status,assignee_id,created_by)
    VALUES('team',$1,$2,$3,$4,$5,$6)`, [plan, `TASK-${index + 1}`, JSON.stringify({ id: `TASK-${index + 1}`, title: 'Assigned work' }), name === 'history' ? 'done' : 'todo', users[name], users.owner]);
  await pool.query(`INSERT INTO project_questions(id,project_id,title,question,recipient,channel,assigned_to,created_by,request_sha256)
    VALUES($1,'team','Assigned question','Question body','client','email',$2,$3,$4)`, [randomUUID(), users.reviewer, users.owner, 'b'.repeat(64)]);
  const preflight = randomUUID();
  await pool.query(`INSERT INTO work_preflights(id,project_id,request_sha256,input_snapshot,input_sha256,report,created_by)
    VALUES($1,'team',$2,'{}',$2,'{}',$3)`, [preflight, 'c'.repeat(64), users.owner]);
  await pool.query("INSERT INTO work_scope_locks(project_id,preflight_id,resources,assignee_id) VALUES('team',$1,'[]',$2)", [preflight, users.scope]);
  await t.test('assignment counts are scoped, active responsibilities prevent read-only demotion, and history is preserved', async () => {
    const data = await req(); const byName = name => data.members.find(member => member.id === users[name]);
    assert.deepEqual(byName('member').assignments, { open_tasks: 1, open_questions: 0, active_scopes: 0 });
    assert.deepEqual(byName('reviewer').assignments, { open_tasks: 0, open_questions: 1, active_scopes: 0 });
    assert.deepEqual(byName('scope').assignments, { open_tasks: 0, open_questions: 0, active_scopes: 1 });
    assert.equal(byName('history').has_assignment_history, true); assert.equal(byName('history').assignments.open_tasks, 0);
    for (const name of ['member', 'reviewer', 'scope']) await change(name, { expected_role: byName(name).role, role: 'viewer' }, { status: 409, code: 'MEMBER_HAS_ACTIVE_ASSIGNMENTS' });
    await change('history', { expected_role: 'member', role: 'viewer' });
    for (const name of ['member', 'reviewer', 'scope', 'history']) await req(`/${users[name]}`, { method: 'DELETE', body: { expected_role: name === 'history' ? 'viewer' : byName(name).role }, status: 409, code: 'MEMBER_HAS_ASSIGNMENT_HISTORY' });
  });
  await t.test('concurrent stale role updates apply exactly once and changes are audited', async () => {
    const service = createProjectMembers(pool);
    const results = await Promise.allSettled([
      service.change('team', users.owner, users.candidate, { expected_role: 'member', role: 'reviewer' }),
      service.change('team', users.owner, users.candidate, { expected_role: 'member', role: 'viewer' }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'MEMBERSHIP_CHANGED');
    const events = (await pool.query("SELECT kind,actor_id,entity_id,detail FROM events WHERE project_id='team' ORDER BY created_at,id")).rows;
    assert.equal(events.filter(event => event.kind === 'member.added').length, 1);
    assert.equal(events.filter(event => event.kind === 'member.role_changed').length, 4);
    assert.ok(events.every(event => event.actor_id === users.owner && [users.candidate, users.history].includes(event.entity_id)));
    assert.doesNotMatch(JSON.stringify(events), /SECRET_PASSWORD_MARKER|@members|csrf/);
  });
  await t.test('unassigned removal revokes only this project and the ledger rechecks authority', async () => {
    const before = await req(); const member = before.members.find(item => item.id === users.candidate);
    await req(`/${users.candidate}`, { method: 'DELETE', body: { expected_role: member.role } });
    await req('', { as: 'candidate', status: 404 });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users WHERE id=$1', [users.candidate])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT role FROM memberships WHERE project_id='private' AND user_id=$1", [users.candidate])).rows[0].role, 'viewer');
    const service = createProjectMembers(pool);
    await assert.rejects(() => service.add('team', users.candidate, { email: 'outsider@members.example.test', role: 'owner' }), { code: 'NOT_FOUND' });
    const client = await pool.connect();
    try { await client.query('BEGIN READ ONLY'); assert.equal((await createProjectMembers(client).list('team', users.viewer)).members.length, 6); }
    finally { await client.query('ROLLBACK'); client.release(); }
    const removal = (await pool.query("SELECT detail FROM events WHERE project_id='team' AND kind='member.removed'")).rows;
    assert.equal(removal.length, 1); assert.equal(removal[0].detail.role, member.role);
  });
});
