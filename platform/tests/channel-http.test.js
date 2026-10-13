'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {provisionUser}=require('../server/auth');
const {createApp}=require('../server/server');
const {createChannelWorker}=require('../server/channel-worker');

test('channel HTTP routes preserve project permissions, CSRF and explicit review before registration',{skip:!process.env.TEST_DATABASE_URL},async t=>{
  const schema='channel_http_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});let server;
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  await migrate(pool);
  const owner=await provisionUser(pool,{email:'channel-owner@example.test',name:'Owner',password:'channel-password-123'});
  const member=await provisionUser(pool,{email:'channel-member@example.test',name:'Member',password:'channel-password-123'});
  await provisionUser(pool,{email:'channel-outsider@example.test',name:'Outsider',password:'channel-password-123'});
  const origin='https://channels.example.test';server=createApp({pool,appOrigin:origin}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function login(email){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password:'channel-password-123'})});assert.equal(r.status,200);const d=await r.json();return {Cookie:r.headers.get('set-cookie').split(';')[0],Origin:origin,'Content-Type':'application/json','X-CSRF-Token':d.csrfToken};}
  const headers=await login(owner.email),memberHeaders=await login(member.email),outside=await login('channel-outsider@example.test');
  async function call(route,body,expected=200,auth=headers,method=body===undefined?'GET':'POST'){const r=await fetch(base+route,{method,headers:auth,body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,expected,d.error?.code);return d;}
  const {project}=await call('/api/projects',{name:'합성 채널 검증'},201);const p='/api/projects/'+project.id;
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'member')",[project.id,member.id]);
  const domain=(await call(p+'/domains')).domains[0];
  const sourceBody={name:'합성 Slack',provider:'slack',external_workspace_id:'TEST',external_channel_id:'TEST-CHANNEL',default_domain_id:domain.id};
  await call(p+'/channel-sources',sourceBody,403,memberHeaders);
  await call(p+'/channel-sources',sourceBody,403,{...headers,'X-CSRF-Token':'invalid'});
  const {source}=await call(p+'/channel-sources',sourceBody,201);assert.equal(source.connection_status,'not_connected');
  const batch={batch_id:'synthetic-1',conversation_key:'thread-1',messages:[{event_id:'event-1',message_id:'message-1',kind:'created',author:'합성 담당자',text:'정산 한도를 50건으로 확정합니다.',sent_at:'2026-09-27T09:00:00+09:00',changed_at:null,url:null}]};
  const first=await call(p+'/channel-sources/'+source.id+'/ingest',batch,202,memberHeaders);
  const again=await call(p+'/channel-sources/'+source.id+'/ingest',batch,202,memberHeaders);assert.equal(again.inbox.id,first.inbox.id);
  assert.equal((await call(p+'/documents')).documents.length,0);
  await call(p+'/channel-inbox/'+first.inbox.id,undefined,404,outside);
  const worker=createChannelWorker({pool});await worker.processOnce();
  assert.equal((await call(p+'/channel-inbox/'+first.inbox.id)).item.status,'needs_review');
  const review={title:'검토한 정산 결정',text:'원문을 확인했고 정산 한도는 50건으로 결정했습니다.',domain_id:domain.id,record_kind:'decision',decided_on:'2026-09-27',reason:'합성 검증',acknowledge_evidence:true};
  await call(p+'/channel-inbox/'+first.inbox.id+'/accept',review,403,memberHeaders);
  const accepted=await call(p+'/channel-inbox/'+first.inbox.id+'/accept',review);assert.equal(accepted.item.status,'accepted');
  assert.equal((await call(p+'/documents')).documents[0].baseline_revision_id,null);
  const repeat=await call(p+'/channel-inbox/'+first.inbox.id+'/accept',review);assert.equal(repeat.item.revision_id,accepted.item.revision_id);
  const {revision}=await call(p+'/revisions/'+accepted.item.revision_id);assert.equal(revision.history.source_type,'slack');assert.match(revision.source_text,/정산 한도를 50건으로 확정합니다/);
});
