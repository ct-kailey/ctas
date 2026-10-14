'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { provisionUser, sha256 } = require('../server/auth');
const { createApp } = require('../server/server');
const { projectSharedJSON } = require('../server/shared-views');

test('anonymous projection removes credential metadata, member emails and inline code patches', () => {
  assert.deepEqual(projectSharedJSON({ members: [{ name: 'K', email: 'private@example.test' }], result: { patch: 'diff', summary: 'done' }, token_hash: 'hash' }), { members: [{ name: 'K' }], result: { summary: 'done' } });
});

test('temporary shared links authorize only selected read projections and preserve normal login isolation', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'shared_' + randomUUID().replaceAll('-', ''), admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  let server;
  t.after(async () => { if (server) await new Promise(r => server.close(r)); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(pool); await migrate(pool);
  const owner = await provisionUser(pool, { email: 'owner@example.test', name: 'Owner', password: 'owner-password-long' });
  const source = await provisionUser(pool, { email: 'kailey@example.test', name: 'Kailey', password: 'kailey-password-long' });
  const other = await provisionUser(pool, { email: 'other@example.test', name: 'Other', password: 'other-password-long' });
  for (const [id, name] of [['selected-one', 'One'], ['selected-two', 'Two'], ['private', 'Private']]) await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)', [id, name]);
  for (const id of ['selected-one', 'selected-two', 'private']) for (const u of [owner, source]) await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')", [id, u.id]);
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('selected-one',$1,'viewer')", [other.id]);
  const origin = 'https://workspace.example.test';
  server = createApp({ pool, appOrigin: origin, production: true }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, options = {}) => fetch(base + path, options);
  const cookie = (res, name) => res.headers.getSetCookie().filter(x => x.startsWith(name + '=')).at(-1)?.split(';')[0];
  async function login(email, password, prior) {
    const res = await call('/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(prior ? { Cookie: prior } : {}) }, body: JSON.stringify({ email, password }) });
    assert.equal(res.status, 200);
    const data = await res.json();
    return { ...data, cookie: cookie(res, 'ains_session'), res };
  }
  const adminLogin = await login('owner@example.test', 'owner-password-long');
  const sourceLogin = await login('kailey@example.test', 'kailey-password-long');
  const otherLogin = await login('other@example.test', 'other-password-long');
  const normal = session => ({ Cookie: session.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken });
  async function create(body = {}, session = adminLogin) {
    const res = await call('/api/shared-views', { method: 'POST', headers: normal(session), body: JSON.stringify({ project_ids: ['selected-one'], label: 'Kailey 프로젝트', expires_in_hours: 24, source_user_id: source.id, ...body }) });
    assert.equal(res.status, 201, await res.clone().text());
    return res.json();
  }
  async function exchange(link, prior) {
    const token = new URL(link.share_url).hash.slice('#share='.length);
    const res = await call('/api/auth/shared-view', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(prior ? { Cookie: prior } : {}) }, body: JSON.stringify({ token }) });
    return { res, token, data: await res.json(), cookie: cookie(res, 'ains_shared_session') };
  }
  const share = await create(), anonymous = await exchange(share, adminLogin.cookie);

  await t.test('token is returned only at creation, hash-only storage and independent viewer identity', async () => {
    assert.equal(anonymous.res.status, 200);
    assert.match(share.share_url, /^https:\/\/workspace\.example\.test\/#share=[a-f0-9]{64}$/);
    assert.match(anonymous.res.headers.get('set-cookie'), /HttpOnly/);
    assert.match(anonymous.res.headers.get('set-cookie'), /Secure/);
    assert.match(anonymous.res.headers.get('set-cookie'), /SameSite=Lax/);
    // Browser must keep the shared-mode selector beyond link expiry, otherwise
    // an underlying private normal cookie could silently become active again.
    assert.match(anonymous.res.headers.get('set-cookie'), /Max-Age=2592000/);
    assert.notEqual(anonymous.data.user.id, source.id);
    assert.notEqual(anonymous.data.user.id, owner.id);
    assert.equal(anonymous.data.user.name, '공유 열람');
    assert.equal(anonymous.data.user.email, null);
    assert.equal(anonymous.data.shared_view.source_user_name, 'Kailey');
    const row = (await pool.query('SELECT * FROM shared_views WHERE id=$1', [share.link.id])).rows[0];
    assert.equal(row.token_hash, sha256(anonymous.token));
    assert.ok(!JSON.stringify(row).includes(anonymous.token));
    assert.equal((await pool.query('SELECT count(*)::int n FROM sessions WHERE user_id=$1', [row.viewer_user_id])).rows[0].n, 0);
    const listed = await (await call('/api/shared-views', { headers: normal(adminLogin) })).json();
    assert.equal(listed.links.length, 1);
    assert.ok(!JSON.stringify(listed).includes(anonymous.token));
    assert.equal(listed.links[0].token_hash, undefined);
    assert.equal(listed.links[0].share_url, undefined);
    // Share source can manage the link if they independently own all projects.
    assert.equal((await (await call('/api/shared-views', { headers: normal(sourceLogin) })).json()).links.length, 1);
    assert.equal((await (await call('/api/shared-views', { headers: normal(otherLogin) })).json()).links.length, 0);
  });

  await t.test('shared session takes priority over existing owner login and cannot escape projects', async () => {
    const headers = { Cookie: adminLogin.cookie + '; ' + anonymous.cookie };
    const session = await (await call('/api/session', { headers })).json();
    assert.equal(session.user.id, anonymous.data.user.id);
    const projects = await (await call('/api/projects', { headers })).json();
    assert.deepEqual(projects.projects.map(p => p.id), ['selected-one']);
    assert.equal(projects.projects[0].role, 'viewer');
    assert.equal((await call('/api/projects/selected-one/dashboard', { headers })).status, 200);
    assert.equal((await call('/api/projects/selected-one/settings', { headers })).status, 200);
    assert.equal((await call('/api/projects/private/overview', { headers })).status, 404);
    assert.equal((await call('/api/projects/selected-two/documents', { headers })).status, 404);
    assert.equal((await call('/api/projects/%70rivate/overview', { headers })).status, 404);
    const members = await (await call('/api/projects/selected-one/members', { headers })).json();
    assert.ok(members.members.every(m => !m.email && m.id !== anonymous.data.user.id));
    const ownerMembers = await (await call('/api/projects/selected-one/members', { headers: normal(adminLogin) })).json();
    assert.ok(ownerMembers.members.every(m => m.id !== anonymous.data.user.id));
    assert.ok(ownerMembers.members.some(m => m.email === 'kailey@example.test'));
  });

  await t.test('mutations, expensive GET, configuration, downloads and not-yet-reviewed routes fail closed', async () => {
    const headers = { Cookie: adminLogin.cookie + '; ' + anonymous.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': anonymous.data.csrfToken };
    const paths = ['/api/projects', '/api/shared-views', '/api/projects/selected-one/documents', '/api/projects/selected-one/reviews/' + randomUUID() + '/decision', '/api/implementation-runner/' + randomUUID() + '/claim'];
    for (const path of paths) assert.equal((await call(path, { method: 'POST', headers, body: '{}' })).status, 403, path);
    for (const path of ['context/semantic/search?q=hello', 'context/daily-brief', 'integrations', 'ai-provider', 'settings/repository-access', 'execution-agents', 'question-outbound', 'implementation-runner-script', 'revisions/' + randomUUID() + '/original', 'transcriptions/' + randomUUID() + '/audio', 'implementation-requests/' + randomUUID() + '/patch', 'commercial/documents/' + randomUUID() + '/revisions/' + randomUUID() + '/export', 'future-endpoint']) {
      assert.equal((await call('/api/projects/selected-one/' + path, { headers })).status, 403, path);
    }
    assert.equal((await call('/api/shared-views', { headers })).status, 404);
    assert.equal((await call('/api/projects/selected-one/context/search?q=hello', { headers })).status, 200);
    assert.equal((await pool.query('SELECT count(*)::int n FROM context_daily_briefs')).rows[0].n, 0);
  });

  await t.test('shared viewers cannot be promoted, assigned additional projects or use password login', async () => {
    const guest = (await pool.query('SELECT * FROM users WHERE id=$1', [anonymous.data.user.id])).rows[0];
    assert.equal(guest.is_shared_view, true);
    assert.equal(guest.password_hash, 'disabled:shared-view');
    const response = await call('/api/projects/selected-one/members/' + guest.id, { method: 'PATCH', headers: normal(adminLogin), body: JSON.stringify({ role: 'owner', expected_role: 'viewer' }) });
    assert.equal(response.status, 403);
    await assert.rejects(pool.query("UPDATE memberships SET role='owner' WHERE user_id=$1", [guest.id]), { code: '23514' });
    await assert.rejects(pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('private',$1,'viewer')", [guest.id]), { code: '23514' });
    assert.equal((await call('/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: guest.email, password: 'disabled:shared-view' }) })).status, 401);
  });

  await t.test('share creation requires owner rights, source membership and bounded expiry', async () => {
    for (const body of [{ expires_in_hours: 169 }, { expires_in_hours: 0 }, { project_ids: [] }, { project_ids: ['selected-one', 'selected-one'] }]) {
      assert.equal((await call('/api/shared-views', { method: 'POST', headers: normal(adminLogin), body: JSON.stringify({ project_ids: ['selected-one'], label: 'test', ...body }) })).status, 400);
    }
    assert.equal((await call('/api/shared-views', { method: 'POST', headers: normal(otherLogin), body: JSON.stringify({ project_ids: ['selected-one'], label: 'test' }) })).status, 403);
    assert.equal((await call('/api/shared-views', { method: 'POST', headers: normal(adminLogin), body: JSON.stringify({ project_ids: ['private'], label: 'test', source_user_id: other.id }) })).status, 403);
  });

  await t.test('partial project owners cannot discover or revoke a wider shared link', async () => {
    const wider = await create({ project_ids: ['selected-one', 'selected-two'] });
    await pool.query("UPDATE memberships SET role='owner' WHERE project_id='selected-one' AND user_id=$1", [other.id]);
    const rows = await (await call('/api/shared-views', { headers: normal(otherLogin) })).json();
    assert.ok(!rows.links.some(link => link.id === wider.link.id));
    assert.equal((await call('/api/shared-views/' + wider.link.id + '/revoke', { method: 'POST', headers: normal(otherLogin), body: '{}' })).status, 404);
    assert.equal((await call('/api/shared-views/' + wider.link.id + '/revoke', { method: 'POST', headers: normal(sourceLogin), body: '{}' })).status, 200);
    await pool.query("UPDATE memberships SET role='viewer' WHERE project_id='selected-one' AND user_id=$1", [other.id]);
  });

  await t.test('link reuse creates distinct sessions; revocation invalidates every viewer immediately', async () => {
    const reused = await exchange(share);
    assert.equal(reused.res.status, 200);
    assert.notEqual(reused.cookie, anonymous.cookie);
    assert.equal((await call('/api/shared-views/' + share.link.id + '/revoke', { method: 'POST', headers: normal(sourceLogin), body: '{}' })).status, 200);
    for (const item of [anonymous, reused]) assert.equal((await call('/api/session', { headers: { Cookie: adminLogin.cookie + '; ' + item.cookie } })).status, 401);
    assert.equal((await exchange(share)).res.status, 401);
    assert.equal((await call('/api/session', { headers: { Cookie: adminLogin.cookie } })).status, 200);
  });

  await t.test('expiry and later creator/source membership loss revoke effective access', async () => {
    for (const reason of ['expiry', 'creator', 'source']) {
      const link = await create(), viewer = await exchange(link);
      if (reason === 'expiry') await pool.query("UPDATE shared_views SET expires_at=now()-interval '1 second' WHERE id=$1", [link.link.id]);
      else await pool.query("UPDATE memberships SET role='viewer' WHERE project_id='selected-one' AND user_id=$1", [owner.id]);
      if (reason === 'source') { await pool.query("UPDATE memberships SET role='owner' WHERE project_id='selected-one' AND user_id=$1", [owner.id]); await pool.query("DELETE FROM memberships WHERE project_id='selected-one' AND user_id=$1", [source.id]); }
      assert.equal((await call('/api/session', { headers: { Cookie: adminLogin.cookie + '; ' + viewer.cookie } })).status, 401, reason);
      assert.equal((await exchange(link)).res.status, 401, reason);
      await pool.query("UPDATE memberships SET role='owner' WHERE project_id='selected-one' AND user_id=$1", [owner.id]);
      await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('selected-one',$1,'owner') ON CONFLICT DO NOTHING", [source.id]);
    }
  });

  await t.test('invalid share stays in unavailable mode until explicit exit; logout preserves private login', async () => {
    const invalid = await call('/api/auth/shared-view', { method: 'POST', headers: { Origin: origin, Cookie: adminLogin.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: '0'.repeat(64) }) });
    assert.equal(invalid.status, 401);
    const selected = cookie(invalid, 'ains_shared_session');
    assert.ok(selected);
    assert.equal((await call('/api/session', { headers: { Cookie: adminLogin.cookie + '; ' + selected } })).status, 401);
    const badExit = await call('/api/auth/shared-view/exit', { method: 'POST', headers: { Origin: 'https://evil.test', Cookie: selected, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(badExit.status, 403);
    const exit = await call('/api/auth/shared-view/exit', { method: 'POST', headers: { Origin: origin, Cookie: adminLogin.cookie + '; ' + selected, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(exit.status, 200);
    assert.ok(cookie(exit, 'ains_shared_session')?.endsWith('='));
    assert.equal(cookie(exit, 'ains_session'), undefined);
    const link = await create(), active = await exchange(link, adminLogin.cookie);
    const logout = await call('/api/auth/logout', { method: 'POST', headers: { Cookie: adminLogin.cookie + '; ' + active.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': active.data.csrfToken }, body: '{}' });
    assert.equal(logout.status, 200);
    assert.equal(cookie(logout, 'ains_session'), undefined);
    const original = await (await call('/api/session', { headers: { Cookie: adminLogin.cookie } })).json();
    assert.equal(original.user.id, owner.id);
    assert.equal(original.shared_view, undefined);
    const fresh = await exchange(link);
    const relogin = await login('owner@example.test', 'owner-password-long', adminLogin.cookie + '; ' + fresh.cookie);
    assert.ok(cookie(relogin.res, 'ains_shared_session')?.endsWith('='));
    assert.equal((await call('/api/session', { headers: { Cookie: fresh.cookie } })).status, 401);
  });

  await t.test('reminders match source-account filtering without changing viewer identity or granting acknowledgements', async () => {
    const inserted=[];
    for(const [project,assigned,title] of [['selected-one',source.id,'Kailey 확인'],['selected-one',owner.id,'다른 담당자 확인'],['private',source.id,'공개되지 않은 프로젝트 확인']]){
      const question=randomUUID();
      await pool.query("INSERT INTO project_questions(id,project_id,title,question,recipient,channel,assigned_to,created_by,status,asked_at,waiting_since,request_sha256) VALUES($1,$2,$3,'질문','고객','email',$4,$5,'waiting',now()-interval '4 days',now()-interval '4 days',$6)",[question,project,title,assigned,owner.id,'a'.repeat(64)]);
      inserted.push((await pool.query("INSERT INTO question_reminders(project_id,question_id,question_version,day_key,assigned_to,detail) VALUES($1,$2,1,current_date,$3,'{}') RETURNING id",[project,question,assigned])).rows[0].id);
    }
    const currentOwner=await login('owner@example.test','owner-password-long');
    const link=await create({},currentOwner),viewer=await exchange(link),headers={Cookie:viewer.cookie};
    const read=async h=>(await (await call('/api/projects/selected-one/question-reminders',{headers:h})).json()).items.map(item=>item.id).sort();
    assert.deepEqual(await read(headers),await read(normal(sourceLogin)));
    assert.deepEqual(await read(headers),inserted.slice(0,2).sort());
    assert.equal((await call('/api/projects/private/question-reminders',{headers})).status,404);
    await pool.query("UPDATE memberships SET role='member' WHERE project_id='selected-one' AND user_id=$1",[source.id]);
    assert.deepEqual(await read(headers),[inserted[0]]);
    assert.deepEqual(await read(headers),await read(normal(sourceLogin)));
    const forged=await (await call('/api/projects/selected-one/question-reminders?source_user_id='+owner.id,{headers})).json();
    assert.deepEqual(forged.items.map(item=>item.id),[inserted[0]]);
    const session=await(await call('/api/session',{headers})).json();
    assert.equal(session.user.id,viewer.data.user.id);
    assert.notEqual(session.user.id,source.id);
    assert.equal((await call('/api/projects/selected-one/question-reminders/'+inserted[0]+'/acknowledge',{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':viewer.data.csrfToken},body:'{}'})).status,403);
    assert.equal((await pool.query('SELECT count(*)::int n FROM question_reminders WHERE acknowledged_at IS NOT NULL')).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM question_reminders')).rows[0].n,3);
    await pool.query("UPDATE memberships SET role='owner' WHERE project_id='selected-one' AND user_id=$1",[source.id]);
  });

  await t.test('exchange rejects cross-site origin and throttles brute force', async () => {
    assert.equal((await call('/api/auth/shared-view', { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ token: anonymous.token }) })).status, 403);
    await pool.query("INSERT INTO auth_attempts(bucket,count,expires_at) VALUES($1,50,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET count=50", ['shared-ip:' + sha256('127.0.0.1')]);
    const response = await call('/api/auth/shared-view', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: anonymous.token }) });
    assert.equal(response.status, 429);
  });
});
