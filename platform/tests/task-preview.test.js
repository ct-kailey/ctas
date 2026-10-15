'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { previewTarget, previewHTML } = require('../server/task-preview');
const { READ_PATHS } = require('../server/shared-views');
const { createPool, migrate } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { createApp } = require('../server/server');
const { sha256 } = require('../server/auth');

test('embedded preview only accepts an explicitly allowed HTTPS origin distinct from AINS', () => {
  const allowed = ['https://preview.example.test'];
  assert.equal(previewTarget('https://preview.example.test/login?mode=demo', allowed, 'https://ains.example.test').pathname, '/login');
  for (const value of [undefined, 'javascript:alert(1)', 'data:text/html,x', 'http://preview.example.test', 'https://preview.example.test.evil.test', 'https://me:secret@preview.example.test', '//preview.example.test']) {
    assert.throws(() => previewTarget(value, allowed, 'https://ains.example.test'));
  }
  for (const origin of ['https://ains.example.test', 'https://ains.example.test:444']) {
    assert.throws(() => previewTarget(origin + '/', [origin], 'https://ains.example.test'), { code: 'TASK_PREVIEW_SAME_HOST' });
  }
  assert.equal(READ_PATHS.some(pattern => pattern.test(`/task-automation/tasks/${randomUUID()}/preview-frame`)), false);
  assert.equal(READ_PATHS.some(pattern => pattern.test(`/task-automation/tasks/${randomUUID()}/activity`)), true);
});

test('preview wrapper has no executable source content and escapes URL attributes', () => {
  const html = previewHTML(new URL('https://preview.example.test/?q="&next=%3Cscript%3E'));
  assert.doesNotMatch(html, /<script|srcdoc=|allow-top-navigation|allow-popups|allow-downloads/);
  assert.match(html, /&amp;next=/);
  assert.match(html, /sandbox="allow-scripts allow-forms allow-same-origin"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
});

test('preview frame uses authenticated task evidence and current project origins without weakening the workspace CSP', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema='task_preview_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);
  let pool,server;
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  await admin.query(`CREATE SCHEMA ${schema}`);pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
  const users={},headers={};
  for(const role of ['owner','viewer','outsider']) {
    users[role]=(await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[role,role+'@preview.test'])).rows[0].id;
    const token=randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')",[sha256(token),users[role]]);headers[role]={Cookie:'ains_session='+token};
  }
  const ledger=createLedger(pool),p=(await ledger.createProject(users.owner,{name:'Preview'})).id;
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'viewer')",[p,users.viewer]);
  const revision=await ledger.createRecord(p,users.owner,{title:'정책',document_category:'policy',text:'로그인 화면',history:{source_type:'other',channel:'test'}}),aid=randomUUID(),tid=randomUUID();
  await pool.query('INSERT INTO task_automation_analyses(id,project_id,revision_id,request_sha256,input_snapshot,input_sha256,dedup_sha256,created_by) VALUES($1,$2,$3,$4,$5,$4,$6,$7)',[aid,p,revision.revision_id,'a'.repeat(64),{},aid,users.owner]);
  const artifact={preview_url:'https://preview.example.test/login',verification_policy:{settings_version:1,preview_origins:['https://preview.example.test']},head_sha:'a'.repeat(40)};
  await pool.query('INSERT INTO automation_tasks(id,project_id,analysis_id,title,description,acceptance_criteria,evidence,input_snapshot,input_sha256,created_by,artifact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[tid,p,aid,'로그인','로그인','[]','[]',{},'b'.repeat(64),users.owner,artifact]);
  await pool.query('UPDATE task_automation_settings SET preview_origins=$2 WHERE project_id=$1',[p,JSON.stringify(['https://preview.example.test'])]);
  server=createApp({pool,appOrigin:'https://ains.example.test',production:true}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port,route=`/api/projects/${p}/task-automation/tasks/${tid}/preview-frame`;
  assert.equal((await fetch(base+route)).status,401);
  assert.equal((await fetch(base+route,{headers:headers.outsider})).status,404);
  const res=await fetch(base+route+'?url=https://attacker.example.test',{headers:headers.viewer});
  assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/text\/html/);assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(res.headers.get('x-frame-options'),'SAMEORIGIN');
  const csp=res.headers.get('content-security-policy');assert.match(csp,/frame-src https:\/\/preview.example.test;/);assert.match(csp,/script-src 'none'/);assert.match(csp,/frame-ancestors 'self'/);assert.doesNotMatch(csp,/frame-src \*|frame-src https:;/);
  const html=await res.text();assert.match(html,/https:\/\/preview.example.test\/login/);assert.doesNotMatch(html,/attacker|ains_session|csrf|token/);
  const health=await fetch(base+'/healthz');assert.match(health.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.doesNotMatch(health.headers.get('content-security-policy'),/preview.example.test|frame-src https:/);
  await pool.query("UPDATE task_automation_settings SET preview_origins='[]' WHERE project_id=$1",[p]);
  const revoked=await fetch(base+route,{headers:headers.owner});assert.equal(revoked.status,409);assert.equal((await revoked.json()).error.code,'TASK_PREVIEW_ORIGIN_INVALID');
  assert.equal((await pool.query('SELECT 1 FROM task_automation_jobs')).rowCount,0);
});
