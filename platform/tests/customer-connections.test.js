'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createPool,migrate}=require('../server/db');
const {createCustomerConnections,assertSourceGrant,resources}=require('../server/customer-connections');

test('connection resources require exact typed allowlists',()=>{
  assert.deepEqual(resources([{id:'C1',label:'고객 문의',kind:'channel'}],'slack'),[{id:'C1',label:'고객 문의',kind:'channel'}]);
  for(const value of [[],[{id:'*',label:'All',kind:'channel'}],[{id:'C1',label:'One',kind:'folder'}],[{id:'C1',label:'One',kind:'channel'},{id:'C1',label:'Two',kind:'channel'}]])assert.throws(()=>resources(value,'slack'),{code:'CONNECTION_RESOURCES_INVALID'});
  assert.throws(()=>resources([{id:'C1',label:'One',kind:'channel',secret:'x'}],'slack'),{code:'CUSTOMER_INPUT_INVALID'});
});

test('legacy Nora sources retain evidence while migration requires explicit reapproval', {skip:!process.env.TEST_DATABASE_URL},async t=>{
  const schema='customer_legacy_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  const directory=path.join(__dirname,'../server/migrations');for(const file of (await fs.readdir(directory)).filter(f=>/^\d+.*\.sql$/.test(f)&&f<'045_customer_connections.sql').sort())await pool.query(await fs.readFile(path.join(directory,file),'utf8'));
  const user=randomUUID(),source=randomUUID(),project='legacy-customer';await pool.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,'legacy@customer.test','Legacy owner','synthetic')",[user]);await pool.query('INSERT INTO projects(id,name) VALUES($1,$1)',[project]);await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')",[project,user]);
  await pool.query("INSERT INTO channel_sources(id,project_id,provider,name,external_workspace_id,external_channel_id,created_by) VALUES($1,$2,'slack','Legacy evidence','nora:legacy','C-LEGACY',$3)",[source,project,user]);
  await pool.query("INSERT INTO nora_channel_sources(id,project_id,workspace_id,connector_id,provider,external_channel_id,name,schedule_enabled,trigger_enabled,status,pipeline_id,trigger_pipeline_id,created_by) VALUES($1,$2,'t_legacy_customer','legacy-connector','slack','C-LEGACY','Legacy evidence',true,true,'ready','legacy-pipeline','legacy-trigger',$3)",[source,project,user]);
  await pool.query("INSERT INTO nora_channel_objects(source_id,external_id,content_hash,event_payload,delivered) VALUES($1,'historic-message','immutable-hash',$2,true)",[source,{messages:[{id:'historic-message',text:'원문 보존'}]}]);await pool.query("INSERT INTO nora_channel_deliveries(source_id,project_id,entry_point,event_key,status) VALUES($1,$2,'manual','complete','completed'),($1,$2,'trigger','queued','queued'),($1,$2,'manual','submitted','submitted')",[source,project]);
  await pool.query(await fs.readFile(path.join(directory,'045_customer_connections.sql'),'utf8'));
  const row=(await pool.query('SELECT * FROM nora_channel_sources WHERE id=$1',[source])).rows[0];assert.equal(row.connection_grant_id,null);assert.equal(row.status,'draft');assert.equal(row.schedule_enabled,false);assert.equal(row.trigger_enabled,false);assert.equal(row.last_error_code,'CONNECTION_GRANT_REQUIRED');assert.equal(row.version,2);
  assert.equal((await pool.query('SELECT manual_intake_enabled FROM channel_sources WHERE id=$1',[source])).rows[0].manual_intake_enabled,false);
  const stop=(await pool.query('SELECT * FROM nora_channel_stop_jobs WHERE source_id=$1',[source])).rows[0];assert.equal(stop.status,'pending');assert.equal(stop.snapshot.scheduleEnabled,true);assert.equal(stop.snapshot.pipelineId,'legacy-pipeline');assert.equal(stop.source_version,1);
  const preserved=(await pool.query('SELECT * FROM nora_channel_objects WHERE source_id=$1',[source])).rows[0];assert.equal(preserved.content_hash,'immutable-hash');assert.equal(preserved.event_payload.messages[0].text,'원문 보존');assert.equal(preserved.delivered,true);
  const deliveries=(await pool.query('SELECT event_key,status FROM nora_channel_deliveries WHERE source_id=$1 ORDER BY event_key',[source])).rows;assert.deepEqual(deliveries,[{event_key:'complete',status:'completed'},{event_key:'queued',status:'failed'},{event_key:'submitted',status:'uncertain'}]);
});

test('customer ownership and project grants isolate tenants and fence collection', {skip:!process.env.TEST_DATABASE_URL},async t=>{
  const schema='customer_connections_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);const pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});
  t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});await migrate(pool);
  const owner=randomUUID(),reviewer=randomUUID(),member=randomUUID(),outsider=randomUUID(),shared=randomUUID();
  for(const [u,label] of [[owner,'owner'],[reviewer,'reviewer'],[member,'member'],[outsider,'outsider'],[shared,'shared']])await pool.query('INSERT INTO users(id,email,name,password_hash,is_shared_view) VALUES($1,$2,$3,$4,$5)',[u,label+'@customer.test',label,'synthetic',u===shared]);
  const p='customer-project',q='other-project',workspace='t_customer_connections_test';
  for(const project of [p,q]){await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)',[project,project]);for(const [u,role] of [[owner,'owner'],[reviewer,'reviewer'],[member,'member']])await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,u,role]);await pool.query("INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name,status,stage,space_id) VALUES($1,$2,$3,$4,'ready','complete','synthetic-space')",[project,project===p?workspace:'t_customer_other_project',owner,project]);}
  let reads=0;const provider={async listConnectors({projectId,workspaceId}){reads++;assert.ok([p,q].includes(projectId));assert.equal(workspaceId,projectId===p?workspace:'t_customer_other_project');return [{id:'slack-customer',name:'Slack',provider:'slack',enabled:true},{id:'drive-customer',name:'Drive',provider:'gdrive',enabled:true},{id:'slack-disabled',name:'Disabled',provider:'slack',enabled:false}];}};
  const service=createCustomerConnections({pool,provider});
  const customer=await service.createCustomer(owner,{name:'Client A',kind:'client'}),other=await service.createCustomer(owner,{name:'Client B',kind:'client'}),internal=await service.createCustomer(owner,{name:'Our company',kind:'internal'});
  const account=await service.createConnection(customer.id,owner,{name:'Client Slack',provider:'slack',external_workspace_id:'external-client-tenant'}),foreign=await service.createConnection(other.id,owner,{name:'Other Slack',provider:'slack'}),common=await service.createConnection(internal.id,owner,{name:'Shared Drive',provider:'google_drive'});
  await service.assignCustomer(p,owner,{customer_id:customer.id,expected_version:0});await service.assignCustomer(q,owner,{customer_id:customer.id,expected_version:0});
  const grantBody=(extra={})=>({connection_id:account.id,connector_id:'slack-customer',allowed_resources:[{id:'C-ALLOWED',label:'Approved support',kind:'channel'}],operator_id:owner,reviewer_id:reviewer,...extra});
  let grant;
  await t.test('customer memberships and capabilities never imply other tenant or project access',async()=>{
    assert.deepEqual(await service.listCustomers(outsider),{customers:[]});await assert.rejects(service.connections(customer.id,outsider),{code:'FORBIDDEN'});await assert.rejects(service.updateCustomer(customer.id,outsider,{expected_version:1,name:'Hijack'}),{code:'FORBIDDEN'});
    await service.addMember(customer.id,owner,{email:'member@customer.test',role:'member'});assert.equal((await service.listCustomers(member)).customers[0].can_manage,false);assert.equal((await service.connections(customer.id,member)).can_manage,false);
    await pool.query("UPDATE memberships SET role='owner' WHERE project_id=$1 AND user_id=$2",[p,member]);await assert.rejects(service.assignCustomer(p,member,{customer_id:customer.id,expected_version:1}),{code:'FORBIDDEN'});await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2",[p,member]);
    await assert.rejects(service.createConnection(customer.id,member,{name:'Bad',provider:'slack'}),{code:'FORBIDDEN'});await assert.rejects(service.createCustomer(shared,{name:'Shared viewer escalation',kind:'internal'}),{code:'FORBIDDEN'});await assert.rejects(service.addMember(customer.id,owner,{email:'shared@customer.test',role:'owner'}),{code:'CUSTOMER_USER_NOT_FOUND'});
    await assert.rejects(service.updateMember(customer.id,owner,owner,{expected_version:1,role:'member'}),{code:'CUSTOMER_LAST_OWNER'});
    await assert.rejects(service.updateCustomer(customer.id,owner,{expected_version:0,name:'Stale'}),{code:'CUSTOMER_VERSION_CONFLICT'});await assert.rejects(service.updateCustomer(customer.id,owner,{expected_version:1,kind:'internal'}),{code:'CUSTOMER_INPUT_INVALID'});
    assert.equal((await service.projectCustomer(p,member)).customer.name,'Client A');await assert.rejects(service.projectCustomer(p,outsider),{code:'FORBIDDEN'});
  });
  await t.test('grant creation requires both owners and the correct connector, customer and assignees',async()=>{
    const before=reads;await assert.rejects(service.grantOptions(p,reviewer),{code:'FORBIDDEN'});assert.equal(reads,before);
    const options=await service.grantOptions(p,owner);assert.deepEqual(new Set(options.connections.map(r=>r.id)),new Set([account.id,common.id]));assert.equal(options.connectors.find(r=>r.id==='drive-customer').provider,'google_drive');
    await assert.rejects(service.createGrant(p,owner,grantBody({connection_id:foreign.id})),{code:'CONNECTION_CUSTOMER_MISMATCH'});await assert.rejects(service.createGrant(p,owner,grantBody({connector_id:'drive-customer'})),{code:'CONNECTION_CONNECTOR_MISMATCH'});await assert.rejects(service.createGrant(p,owner,grantBody({connector_id:'slack-disabled'})),{code:'CONNECTION_CONNECTOR_MISMATCH'});await assert.rejects(service.createGrant(p,owner,grantBody({reviewer_id:member})),{code:'CONNECTION_REVIEWER_REQUIRED'});await assert.rejects(service.createGrant(p,reviewer,grantBody()),{code:'FORBIDDEN'});
    grant=await service.createGrant(p,owner,grantBody());await assert.rejects(service.createGrant(p,owner,grantBody()),{code:'CONNECTION_GRANT_EXISTS'});
    const sharedGrant=await service.createGrant(p,owner,grantBody({connection_id:common.id,connector_id:'drive-customer',allowed_resources:[{id:'F-ALLOWED',label:'Approved folder',kind:'folder'}]}));assert.equal(sharedGrant.workspace_id,workspace);
    const reused=await service.createGrant(q,owner,grantBody());assert.equal(reused.connection_id,account.id);assert.notEqual(reused.workspace_id,grant.workspace_id);
    await assert.rejects(service.assignCustomer(p,owner,{customer_id:other.id,expected_version:1}),{code:'PROJECT_CUSTOMER_LOCKED'});
    await pool.query("UPDATE memberships SET role='owner' WHERE project_id=$1 AND user_id=$2",[p,reviewer]);await assert.rejects(service.updateGrant(p,grant.id,reviewer,{expected_version:1,allowed_resources:grant.allowed_resources}),{code:'FORBIDDEN'});await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2",[p,reviewer]);
  });
  const sourceId=randomUUID();
  const source=async()=>{const row=(await pool.query('SELECT * FROM nora_channel_sources WHERE id=$1',[sourceId])).rows[0];return row;};
  await t.test('source resolution rejects foreign projects, resources, connectors and revoked assignees',async()=>{
    const target={project_id:p,connection_grant_id:grant.id,external_channel_id:'C-ALLOWED'};
    assert.equal((await assertSourceGrant(pool,target)).operator_id,owner);await assert.rejects(assertSourceGrant(pool,{...target,project_id:q}),{code:'CONNECTION_GRANT_REVOKED'});await assert.rejects(assertSourceGrant(pool,{...target,external_channel_id:'C-SECRET'}),{code:'CONNECTION_RESOURCE_FORBIDDEN'});await assert.rejects(assertSourceGrant(pool,{...target,connector_id:'other-connector'}),{code:'CONNECTION_GRANT_SCOPE_MISMATCH'});await assert.rejects(assertSourceGrant(pool,{...target,workspace_id:'t_other_workspace'}),{code:'CONNECTION_GRANT_SCOPE_MISMATCH'});await assert.rejects(assertSourceGrant(pool,{...target,connection_grant_id:null}),{code:'CONNECTION_GRANT_REQUIRED'});
    await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2",[p,reviewer]);await assert.rejects(assertSourceGrant(pool,target),{code:'CONNECTION_GRANT_REVOKED'});await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2",[p,reviewer]);
    await pool.query("INSERT INTO channel_sources(id,project_id,provider,name,external_workspace_id,external_channel_id,created_by) VALUES($1,$2,'slack','Preserved source','nora:synthetic','C-ALLOWED',$3)",[sourceId,p,owner]);
    await pool.query("INSERT INTO nora_channel_sources(id,project_id,workspace_id,connector_id,provider,external_channel_id,name,schedule_enabled,trigger_enabled,status,pipeline_id,trigger_pipeline_id,library_tag,trigger_token_hash,created_by,connection_grant_id) VALUES($1,$2,$3,'slack-customer','slack','C-ALLOWED','Preserved source',true,true,'ready','pipeline-synthetic','trigger-synthetic','ains/channels/12345678901234567890123456789012',$4,$5,$6)",[sourceId,p,workspace,'a'.repeat(64),owner,grant.id]);
    await pool.query("INSERT INTO nora_channel_deliveries(source_id,project_id,entry_point,event_key) VALUES($1,$2,'manual','previously-approved')",[sourceId,p]);
  });
  await t.test('account pause waits for in-flight source commit, then fences late callbacks and persists stop work',async()=>{
    const client=await pool.connect();await client.query('BEGIN');const current=(await client.query('SELECT * FROM nora_channel_sources WHERE id=$1 FOR UPDATE',[sourceId])).rows[0];
    let settled=false;const pause=service.updateConnection(customer.id,account.id,owner,{expected_version:1,status:'paused'}).then(r=>{settled=true;return r;});
    await new Promise(resolve=>setTimeout(resolve,30));assert.equal(settled,false);assert.equal((await assertSourceGrant(client,current)).id,grant.id);await client.query('COMMIT');client.release();const paused=await pause;assert.equal(paused.status,'paused');
    const stopped=await source();assert.equal(stopped.status,'draft');assert.equal(stopped.schedule_enabled,false);assert.equal(stopped.trigger_enabled,false);assert.equal(stopped.trigger_token_hash,null);assert.equal(stopped.version,current.version+1);await assert.rejects(assertSourceGrant(pool,stopped),{code:'CONNECTION_GRANT_REVOKED'});
    const stop=(await pool.query('SELECT * FROM nora_channel_stop_jobs WHERE source_id=$1',[sourceId])).rows[0];assert.equal(stop.status,'pending');assert.equal(stop.reason,'CONNECTION_ACCOUNT_PAUSED');assert.equal(stop.snapshot.scheduleEnabled,true);assert.equal(stop.snapshot.connectorId,'slack-customer');assert.equal(stop.source_version,current.version);assert.equal((await pool.query('SELECT status FROM nora_channel_deliveries WHERE source_id=$1',[sourceId])).rows[0].status,'failed');
    assert.equal((await service.grants(p,owner)).grants.find(r=>r.id===grant.id).usable,false);assert.equal((await service.grants(p,owner)).stop_pending_count,1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM channel_sources WHERE id=$1',[sourceId])).rows[0].n,1);
    await service.updateConnection(customer.id,account.id,owner,{expected_version:paused.version,status:'active'});assert.equal((await source()).schedule_enabled,false);
  });
  await t.test('grant version CAS and project-owner revocation require reapproval without deleting history',async()=>{
    await assert.rejects(service.updateGrant(p,grant.id,owner,{expected_version:0,status:'revoked'}),{code:'CUSTOMER_VERSION_CONFLICT'});
    await pool.query("UPDATE memberships SET role='owner' WHERE project_id=$1 AND user_id=$2",[p,reviewer]);const revoked=await service.updateGrant(p,grant.id,reviewer,{expected_version:grant.version,status:'revoked'});assert.equal(revoked.status,'revoked');await assert.rejects(assertSourceGrant(pool,await source()),{code:'CONNECTION_GRANT_REVOKED'});
    await assert.rejects(service.updateGrant(p,grant.id,reviewer,{expected_version:revoked.version,status:'active'}),{code:'FORBIDDEN'});
    const active=await service.updateGrant(p,grant.id,owner,{expected_version:revoked.version,status:'active'});assert.equal(active.status,'active');assert.equal((await source()).status,'draft');assert.equal((await pool.query('SELECT count(*)::int AS n FROM nora_channel_stop_jobs WHERE source_id=$1',[sourceId])).rows[0].n,1);
    const archived=await service.updateCustomer(customer.id,owner,{expected_version:customer.version,status:'archived'});assert.equal(archived.status,'archived');await assert.rejects(assertSourceGrant(pool,await source()),{code:'CONNECTION_GRANT_REVOKED'});
    assert.ok((await pool.query('SELECT count(*)::int AS n FROM customer_audit WHERE customer_id=$1',[customer.id])).rows[0].n>=5);await assert.rejects(pool.query('DELETE FROM customer_audit WHERE customer_id=$1',[customer.id]),{code:'23514'});
  });
  await t.test('account owner may stop a shared account without gaining access to its projects',async()=>{
    await service.addMember(internal.id,owner,{email:'outsider@customer.test',role:'owner'});
    await assert.rejects(service.grants(p,outsider),{code:'FORBIDDEN'});await assert.rejects(service.projectCustomer(p,outsider),{code:'FORBIDDEN'});
    const stopped=await service.updateConnection(internal.id,common.id,outsider,{expected_version:1,status:'paused'});assert.equal(stopped.status,'paused');
    const visible=(await service.listCustomers(outsider)).customers;assert.equal(visible.length,1);assert.equal(visible[0].id,internal.id);assert.equal(Object.hasOwn(visible[0],'projects'),false);
    assert.equal((await service.grants(p,owner)).grants.find(g=>g.connection_id===common.id).usable,false);
  });
  await t.test('customer member removal preserves an owner and transfers account responsibility first',async()=>{
    await assert.rejects(service.removeMember(customer.id,owner,owner,{expected_version:1}),{code:'CUSTOMER_LAST_OWNER'});
    await assert.rejects(service.removeMember(customer.id,member,outsider,{expected_version:1}),{code:'FORBIDDEN'});
    await assert.rejects(service.removeMember(customer.id,member,owner,{expected_version:0}),{code:'CUSTOMER_VERSION_CONFLICT'});
    await service.addMember(customer.id,owner,{email:'reviewer@customer.test',role:'owner'});
    await assert.rejects(service.removeMember(customer.id,owner,reviewer,{expected_version:1}),{code:'CUSTOMER_MEMBER_MANAGES_CONNECTION'});
    assert.deepEqual(await service.removeMember(customer.id,member,owner,{expected_version:1}),{removed:true,user_id:member});
    await assert.rejects(service.connections(customer.id,member),{code:'FORBIDDEN'});assert.equal((await service.listCustomers(member)).customers.length,0);
    await assert.rejects(service.removeMember(other.id,member,owner,{expected_version:1}),{code:'NOT_FOUND'});
    const currentAccount=(await service.connections(customer.id,reviewer)).connections.find(r=>r.id===account.id);
    await service.updateConnection(customer.id,account.id,reviewer,{expected_version:currentAccount.version,manager_user_id:reviewer});
    await service.removeMember(customer.id,owner,reviewer,{expected_version:1});await assert.rejects(service.connections(customer.id,owner),{code:'FORBIDDEN'});
    assert.equal((await service.members(customer.id,reviewer)).members.find(m=>m.user_id===reviewer).role,'owner');
  });
});
