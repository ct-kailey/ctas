'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {createContextAI}=require('../server/context-ai-ledger');

const url=process.env.TEST_DATABASE_URL,suite=url?test:test.skip;
let pool,admin,schema,owner,viewer,outsider,ledger;
before(async()=>{
 if(!url)return;
 schema='context_dispatch_'+randomUUID().replaceAll('-','');
 admin=createPool(url);await admin.query(`CREATE SCHEMA ${schema}`);
 pool=createPool({connectionString:url,options:`-c search_path=${schema}`});
 await migrate(pool);ledger=createLedger(pool);
 [owner,viewer,outsider]=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('owner@dispatch.test','Owner','unused'),('viewer@dispatch.test','Viewer','unused'),('outsider@dispatch.test','Outsider','unused') RETURNING id")).rows.map(r=>r.id);
});
after(async()=>{
 if(pool)await pool.end();
 if(admin){await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
async function fixture(){
 const p=await ledger.createProject(owner,{name:'Context dispatch availability'});
 await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'viewer')",[p.id,viewer]);
 const text='고객은 Google 로그인으로 가입하도록 결정했습니다.';
 const source=await ledger.createRecord(p.id,owner,{title:'로그인 결정',record_kind:'decision',text,history:{source_type:'meeting',occurred_on:'2026-10-15'}});
 await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1",[source.revision_id,JSON.stringify({segments:[{text}]})]);
 return {p,body:{request_id:randomUUID(),expected_context_version:0,source_refs:[{type:'revision',id:source.revision_id}]}};
}
async function bind(p){
 await pool.query('INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name) VALUES($1,$2,$3,$4)',[p.id,'t_'+randomUUID().replaceAll('-',''),owner,p.name]);
}
async function snapshot(p){
 const [runs,counts]=await Promise.all([
  pool.query('SELECT * FROM context_ai_runs WHERE project_id=$1 ORDER BY id',[p]),
  pool.query(`SELECT
   (SELECT count(*)::int FROM events WHERE project_id=$1) events,
   (SELECT count(*)::int FROM context_candidates WHERE project_id=$1) candidates,
   (SELECT count(*)::int FROM context_records WHERE project_id=$1) records,
   (SELECT count(*)::int FROM task_automation_jobs WHERE project_id=$1) jobs`,[p])
 ]);
 return {runs:runs.rows,counts:counts.rows[0]};
}

suite('bound project exposes immutable expired history while legacy dispatch stays unavailable',async()=>{
 const {p,body}=await fixture();let remoteCalls=0;
 const client={startContextReview:async()=>{remoteCalls++;},getApproval:async()=>{remoteCalls++;},decideApproval:async()=>{remoteCalls++;}};
 const ai=createContextAI({pool,enabled:true,client});
 const run=await ai.create(p.id,owner,body);
 await pool.query("UPDATE context_ai_runs SET status='failed',error_code='CONTEXT_APPROVAL_EXPIRED' WHERE id=$1",[run.id]);
 await bind(p);
 const before=await snapshot(p.id);
 const db=await pool.connect();
 try{
  await db.query('BEGIN READ ONLY');
  const reader=createContextAI({pool:db,enabled:true,client});
  for(const user of [owner,viewer]){
   const listed=await reader.list(p.id,user);
   assert.equal(listed.enabled,false);
   assert.equal(listed.dispatch_mode,'project_workspace');
   assert.equal(listed.disabled_reason,'NORA_PROJECT_FLOW_SETUP_REQUIRED');
   assert.equal(listed.runs.length,1);
   assert.equal(listed.runs[0].id,run.id);
   assert.equal(listed.runs[0].status,'failed');
   assert.equal(listed.runs[0].error_code,'CONTEXT_APPROVAL_EXPIRED');
   assert.equal(listed.runs[0].decision,null);
   assert.deepEqual(await reader.get(p.id,run.id,user),listed.runs[0]);
  }
  await db.query('ROLLBACK');
 }finally{db.release();}
 await assert.rejects(ai.list(p.id,outsider),{code:'FORBIDDEN'});
 await assert.rejects(ai.create(p.id,owner,{...body,request_id:randomUUID()}),{code:'NORA_PROJECT_FLOW_SETUP_REQUIRED',status:409});
 assert.deepEqual(await snapshot(p.id),before);
 assert.equal(before.counts.jobs,0);
 assert.equal(remoteCalls,0);
});

suite('unbound projects retain configured availability and are isolated from foreign bindings',async()=>{
 const {p:foreign}=await fixture();await bind(foreign);
 const {p,body}=await fixture();
 const ai=createContextAI({pool,enabled:true});
 const listed=await ai.list(p.id,owner);
 assert.equal(listed.enabled,true);
 assert.equal(listed.dispatch_mode,'legacy');
 assert.equal(listed.disabled_reason,null);
 assert.deepEqual(listed.runs,[]);
 const run=await ai.create(p.id,owner,body);
 assert.equal(run.status,'queued');
 assert.equal((await ai.list(p.id,viewer)).runs[0].id,run.id);

 const disabled=createContextAI({pool,enabled:false});
 const unavailable=await disabled.list(p.id,viewer);
 assert.equal(unavailable.enabled,false);
 assert.equal(unavailable.dispatch_mode,'legacy');
 assert.equal(unavailable.disabled_reason,'CONTEXT_AI_DISABLED');
 assert.equal(unavailable.runs[0].id,run.id);
 const before=await snapshot(p.id);
 await assert.rejects(disabled.create(p.id,owner,{...body,request_id:randomUUID()}),{code:'CONTEXT_AI_DISABLED',status:503});
 assert.deepEqual(await snapshot(p.id),before);
});

suite('pending and failed workspace bindings never fall back to globally enabled legacy analysis',async()=>{
 const {p}=await fixture();await bind(p);
 for(const status of ['pending','failed']){
  await pool.query('UPDATE project_nora_workspaces SET status=$2 WHERE project_id=$1',[p.id,status]);
  for(const enabled of [true,false]){
   const result=await createContextAI({pool,enabled}).list(p.id,owner);
   assert.equal(result.enabled,false);
   assert.equal(result.dispatch_mode,'project_workspace');
   assert.equal(result.disabled_reason,'NORA_PROJECT_FLOW_SETUP_REQUIRED');
  }
 }
});
