'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {provisionUser}=require('../server/auth');
const {createApp}=require('../server/server');
const {assertSourceGrant}=require('../server/customer-connections');

test('customer HTTP endpoints keep auth, CSRF, ownership and project scopes', {skip:!process.env.TEST_DATABASE_URL},async t=>{
  const schema='customer_http_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});let server;
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});await migrate(pool);
  const password='synthetic-customer-password',owner=await provisionUser(pool,{email:'owner@customer-http.test',name:'Owner',password}),outsider=await provisionUser(pool,{email:'outsider@customer-http.test',name:'Outsider',password});
  await pool.query("INSERT INTO projects(id,name) VALUES('customer-http','Customer HTTP')");await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('customer-http',$1,'owner')",[owner.id]);
  const origin='https://customer-http.example.test';server=createApp({pool,appOrigin:origin}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  async function login(user){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password})});assert.equal(r.status,200);return {Cookie:r.headers.get('set-cookie').split(';')[0],Origin:origin,'Content-Type':'application/json','X-CSRF-Token':(await r.json()).csrfToken};}
  const authorized=await login(owner),foreign=await login(outsider);
  async function call(path,body,status=200,headers=authorized,method=body===undefined?'GET':'POST'){const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;}
  await call('/api/customers',undefined,401,{});await call('/api/customers',{name:'Unsafe',kind:'client'},403,{...authorized,'X-CSRF-Token':'bad'});
  const {customer}=await call('/api/customers',{name:'HTTP Client',kind:'client'},201);assert.equal(customer.can_manage,true);assert.equal((await call('/api/customers',undefined,200,foreign)).customers.length,0);
  await call('/api/customers/'+customer.id+'/members',undefined,403,foreign);await call('/api/customers/'+customer.id,{expected_version:1,name:'Hijacked'},403,foreign,'PATCH');
  const {connection}=await call('/api/customers/'+customer.id+'/connections',{name:'Slack account',provider:'slack'},201);assert.equal(connection.customer_id,customer.id);await call('/api/customers/'+customer.id+'/connections/'+connection.id,{expected_version:1,status:'paused'},403,foreign,'PATCH');
  const project='/api/projects/customer-http';await call(project+'/customer',undefined,404,foreign);const linked=await call(project+'/customer',{customer_id:customer.id,expected_version:0},200,authorized,'PATCH');assert.equal(linked.customer.id,customer.id);
  assert.deepEqual((await call(project+'/connection-grants')).grants,[]);const options=await call(project+'/connection-grant-options');assert.equal(options.ready,false);assert.equal(options.connections[0].id,connection.id);
  await call(project+'/customer',{customer_id:customer.id,expected_version:0},409,authorized,'PATCH');
  await call('/api/customers/'+customer.id+'/members',{email:outsider.email,role:'member'},201);
  await call('/api/customers/'+customer.id+'/members/'+outsider.id,{expected_version:1},403,foreign,'DELETE');
  await call('/api/customers/'+customer.id+'/members/'+outsider.id,{expected_version:1},200,authorized,'DELETE');
  await call('/api/customers/'+customer.id+'/members',undefined,403,foreign);
  await t.test('project role downgrade and removal atomically stop managed sources',async()=>{
    await call(project+'/members',{email:outsider.email,role:'reviewer'},201);
    await pool.query("INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name,status,stage,space_id) VALUES('customer-http','t_customer_http_grants',$1,'Customer HTTP','ready','complete','customer-http-space')",[owner.id]);
    const grant=(await pool.query("INSERT INTO project_connection_grants(project_id,connection_id,workspace_id,connector_id,allowed_resources,operator_id,reviewer_id,created_by) VALUES('customer-http',$1,'t_customer_http_grants','customer-http-slack',$2,$3,$4,$3) RETURNING *",[connection.id,JSON.stringify([{id:'C-HTTP',label:'Customer HTTP',kind:'channel'}]),owner.id,outsider.id])).rows[0];
    const sourceId=randomUUID();await pool.query("INSERT INTO channel_sources(id,project_id,provider,name,external_workspace_id,external_channel_id,manual_intake_enabled,created_by) VALUES($1,'customer-http','slack','HTTP source','nora:customer-http','C-HTTP',false,$2)",[sourceId,owner.id]);
    await pool.query("INSERT INTO nora_channel_sources(id,project_id,workspace_id,connector_id,provider,external_channel_id,name,status,schedule_enabled,trigger_enabled,pipeline_id,trigger_pipeline_id,trigger_token_hash,created_by,connection_grant_id) VALUES($1,'customer-http','t_customer_http_grants','customer-http-slack','slack','C-HTTP','HTTP source','ready',true,true,'pipeline-http','trigger-http',$2,$3,$4)",[sourceId,'a'.repeat(64),owner.id,grant.id]);
    const client=await pool.connect();await client.query('BEGIN');const current=(await client.query('SELECT * FROM nora_channel_sources WHERE id=$1 FOR UPDATE',[sourceId])).rows[0];
    let settled=false;const downgrade=call(project+'/members/'+outsider.id,{expected_role:'reviewer',role:'member'},200,authorized,'PATCH').then(r=>{settled=true;return r;});
    await new Promise(resolve=>setTimeout(resolve,30));assert.equal(settled,false);await assertSourceGrant(client,current);
    await client.query("INSERT INTO nora_channel_objects(source_id,external_id,content_hash,event_payload,delivered) VALUES($1,'prior-authorized','preserved-hash',$2,true)",[sourceId,{messages:[{text:'Completed before revocation'}]}]);await client.query('COMMIT');client.release();await downgrade;
    let row=(await pool.query('SELECT * FROM nora_channel_sources WHERE id=$1',[sourceId])).rows[0];assert.equal(row.status,'draft');assert.equal(row.schedule_enabled,false);assert.equal(row.trigger_enabled,false);assert.equal(row.trigger_token_hash,null);assert.equal(row.last_error_code,'CONNECTION_OPERATOR_REVOKED');await assert.rejects(assertSourceGrant(pool,row),{code:'CONNECTION_GRANT_REVOKED'});
    let stop=(await pool.query('SELECT * FROM nora_channel_stop_jobs WHERE source_id=$1',[sourceId])).rows[0];assert.equal(stop.status,'pending');assert.equal(stop.reason,'CONNECTION_OPERATOR_REVOKED');assert.equal(stop.snapshot.scheduleEnabled,true);
    await call(project+'/members/'+outsider.id,{expected_role:'member',role:'reviewer'},200,authorized,'PATCH');assert.equal((await pool.query('SELECT status FROM nora_channel_sources WHERE id=$1',[sourceId])).rows[0].status,'draft');
    await pool.query("UPDATE nora_channel_stop_jobs SET status='completed' WHERE source_id=$1",[sourceId]);await pool.query("UPDATE nora_channel_sources SET status='ready',schedule_enabled=true,trigger_enabled=true WHERE id=$1",[sourceId]);
    await call(project+'/members/'+outsider.id,{expected_role:'reviewer'},200,authorized,'DELETE');row=(await pool.query('SELECT * FROM nora_channel_sources WHERE id=$1',[sourceId])).rows[0];stop=(await pool.query('SELECT * FROM nora_channel_stop_jobs WHERE source_id=$1',[sourceId])).rows[0];assert.equal(row.status,'draft');assert.equal(stop.status,'pending');assert.equal(stop.snapshot.scheduleEnabled,true);await assert.rejects(assertSourceGrant(pool,row),{code:'CONNECTION_GRANT_REVOKED'});
    assert.equal((await pool.query('SELECT event_payload FROM nora_channel_objects WHERE source_id=$1',[sourceId])).rows[0].event_payload.messages[0].text,'Completed before revocation');assert.equal((await pool.query("SELECT detail FROM events WHERE project_id='customer-http' AND kind='member.removed'",[])).rows[0].detail.nora_sources_stopped,1);
  });
});
