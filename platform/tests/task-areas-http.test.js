'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { createApp } = require('../server/server');
const { sha256 } = require('../server/auth');

test('task area HTTP endpoints enforce authentication, CSRF, project and write permissions', {skip:!process.env.TEST_DATABASE_URL}, async t => {
  const schema='task_areas_http_'+randomUUID().replaceAll('-',''), admin=createPool(process.env.TEST_DATABASE_URL);
  let pool, server;
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
  const users={},sessions={},origin='https://task-areas-http.test';
  for(const role of ['owner','member','viewer','outsider']) {
    users[role]=(await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,'PRIVATE_PASSWORD') RETURNING id",[role,role+'@task-areas-http.test'])).rows[0].id;
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
    await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sha256(token),users[role],csrf]);
    sessions[role]={Cookie:'ains_session='+token,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};
  }
  const ledger=createLedger(pool),p=(await ledger.createProject(users.owner,{name:'Task HTTP'})).id;
  for(const role of ['member','viewer']) await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,users[role],role]);
  const record=await ledger.createRecord(p,users.owner,{title:'정책',document_category:'policy',text:'로그인한다.',history:{source_type:'other',channel:'테스트'}});
  const aid=randomUUID(),tid=randomUUID();
  await pool.query('INSERT INTO task_automation_analyses(id,project_id,revision_id,request_sha256,input_snapshot,input_sha256,dedup_sha256,created_by) VALUES($1,$2,$3,$4,$5,$4,$6,$7)',[aid,p,record.revision_id,'a'.repeat(64),{},aid,users.owner]);
  await pool.query('INSERT INTO automation_tasks(id,project_id,analysis_id,title,description,acceptance_criteria,evidence,input_snapshot,input_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[tid,p,aid,'로그인','로그인','[]','[]',{},'b'.repeat(64),users.owner]);
  server=createApp({pool,appOrigin:origin}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/projects/'+p+'/task-automation';
  async function request(path,{method='GET',body,as='owner',headers,status=200,code}={}) {
    const response=await fetch(base+path,{method,headers:headers||sessions[as],body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));assert.equal(response.headers.get('cache-control'),'no-store');if(code)assert.equal(data.error.code,code);return data;
  }
  const path='/tasks/'+tid+'/areas';
  await t.test('read routes expose bounded task areas but require project membership',async()=>{
    assert.equal((await request('/areas',{as:'viewer'})).items[0].task_id,tid);
    assert.equal((await request(path,{as:'viewer'})).areas.length,3);
    await request(path,{headers:{},status:401});
    await request('/areas',{as:'outsider',status:404});
    await request('/tasks/'+randomUUID()+'/areas',{status:404,code:'TASK_AREA_TASK_NOT_FOUND'});
    await request('/tasks/not-a-task/areas',{status:400,code:'TASK_AREA_ID_INVALID'});
  });
  await t.test('write routes validate the patch, stale versions and CSRF without task side effects',async()=>{
    const body={expected_version:0,status:'in_progress',assignee_ids:[users.member],reference:'/login'};
    await request(path+'/screen',{method:'PATCH',body,as:'viewer',status:403,code:'FORBIDDEN'});
    await request(path+'/screen',{method:'PATCH',body,headers:{...sessions.member,'X-CSRF-Token':''},status:403,code:'CSRF_REJECTED'});
    await request(path+'/screen',{method:'PATCH',body:{...body,status:'qa'},status:400,code:'TASK_AREA_STATUS_INVALID'});
    await request(path+'/screen',{method:'PATCH',body:{...body,assignee_ids:[users.viewer]},status:409,code:'TASK_AREA_ASSIGNEES_INVALID'});
    const updated=await request(path+'/screen',{method:'PATCH',body,as:'member'});
    assert.equal(updated.areas[0].version,1);assert.equal(updated.history[0].actor_name,'member');
    assert.deepEqual(updated.areas[0].assignees,[{id:users.member,name:'member'}]);
    assert.doesNotMatch(JSON.stringify(updated),/PRIVATE_PASSWORD|@task-areas-http|csrf/);
    await request(path+'/screen',{method:'PATCH',body,status:409,code:'TASK_AREA_VERSION_CONFLICT'});
    const persisted=await request(path,{as:'viewer'});assert.equal(persisted.areas[0].status,'in_progress');
    assert.deepEqual((await pool.query('SELECT status,execution_status,version,artifact,review FROM automation_tasks WHERE id=$1',[tid])).rows[0],{status:'todo',execution_status:'idle',version:1,artifact:null,review:null});
    assert.equal((await pool.query('SELECT 1 FROM task_automation_jobs')).rowCount,0);
  });
});
