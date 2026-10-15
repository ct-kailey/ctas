'use strict';

const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {reconcileLegacyContextRuns}=require('../server/legacy-context-reconciliation');
const {createContextAIWorker}=require('../server/context-ai-worker');
const {createProjectNora}=require('../server/project-nora');
const {hash}=require('../server/context-contract');
const {APPROVAL_MARKER}=require('../../nora/context/contract');
const manifest=require('../../nora/context/manifest.json');

const url=process.env.TEST_DATABASE_URL,suite=url?test:test.skip;
let pool,admin,schema,owner,viewer;
before(async()=>{
  if(!url)return;
  if(!['localhost','127.0.0.1','::1','[::1]'].includes(new URL(url).hostname))throw new Error('This regression suite requires a local PostgreSQL server');
  schema='legacy_context_'+randomUUID().replaceAll('-','');
  admin=createPool(url);await admin.query(`CREATE SCHEMA ${schema}`);
  pool=createPool({connectionString:url,options:`-c search_path=${schema}`});await migrate(pool);
  [owner,viewer]=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('owner@legacy.test','Owner','unused'),('viewer@legacy.test','Viewer','unused') RETURNING id")).rows.map(r=>r.id);
});
after(async()=>{if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}});
const code=expected=>e=>e.code===expected;
async function project(){
  const p=randomUUID();await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)',[p,'Legacy reconciliation test']);
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')",[p,owner,viewer]);
  return p;
}
async function fixture(p,{status='uncertain',remoteStatus='expired',candidate=true,decision=null,result=false,reference=true}={}){
  const id=randomUUID(),approvalId='apv_'+randomUUID().replaceAll('-',''),traceId='trc_'+randomUUID().replaceAll('-','');
  const request={schema_version:'1.0',request_id:id,project_id:p,domain_id:null,context_version:0,sources:[{source_id:'revision:'+randomUUID(),content:'Synthetic source',occurred_at:null,source_type:'revision',title:'Synthetic source'}],current_items:[]};
  const output={schema_version:'1.0',request_id:id,project_id:p,context_version:0,summary:'Synthetic candidate',items:[],warnings:[]};
  const approval={id:approvalId,tenantId:manifest.workspace_id,traceId,graphSlug:manifest.slug,agentId:manifest.agents.finalize,kind:'agent',status:remoteStatus,message:'# Original user request\n'+JSON.stringify(request)+APPROVAL_MARKER+JSON.stringify(output),reason:'server_restart'};
  await pool.query(`INSERT INTO context_ai_runs(id,project_id,created_by,request_sha256,request,source_refs,status,approval_id,trace_id,reviewed_candidate,reviewed_sha256,decision,result)
    VALUES($1,$2,$3,$4,$5,'[]',$6,$7,$8,$9,$10,$11,$12)`,[id,p,owner,hash(request),request,status,reference?approvalId:null,reference?traceId:null,candidate?output:null,candidate?hash(output):null,decision,result?output:null]);
  return {id,p,request,output,approval};
}
const read=async id=>(await pool.query('SELECT * FROM context_ai_runs WHERE id=$1',[id])).rows[0];
const reconcile=(p,client,userId=owner)=>reconcileLegacyContextRuns({pool,projectId:p,userId,client});
const clientFor=rows=>({getApproval:async id=>structuredClone(rows.find(r=>r.approval.id===id).approval)});
async function bind(p){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='1s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-nora-dispatch:' || $1,0))",[p]);
    await db.query('INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name) VALUES($1,$2,$3,$4)',[p,'t_'+randomUUID().replaceAll('-',''),owner,'Bound']);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
async function waitUntil(fn){for(let i=0;i<150;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Timed out waiting for worker');}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function completed(f){return {status:'ok',rawStatus:'completed',traceId:f.approval.traceId,output:JSON.stringify(f.output),outputs:[{agentId:manifest.agents.analyze,text:JSON.stringify(f.output)},{agentId:manifest.agents.finalize,text:JSON.stringify(f.output)}]};}

suite('expired and rejected native approvals resolve only uncertain project runs and preserve all snapshots',async()=>{
  const p=await project(),foreign=await project();
  const decision={actor_id:owner,decision:'approved',reason:'Previously saved human decision',decided_at:new Date().toISOString()};
  const expired=await fixture(p,{decision,result:true}),rejected=await fixture(p,{remoteStatus:'rejected',candidate:false});
  const other=await fixture(foreign),running=await fixture(p,{status:'running'});
  const before=await read(expired.id);const answer=await reconcile(p,clientFor([expired,rejected]));
  assert.deepEqual(answer,{checked:2,resolved:2,remaining:0,errors:[]});
  const current=await read(expired.id);
  assert.equal(current.status,'failed');assert.equal(current.error_code,'CONTEXT_APPROVAL_EXPIRED');
  for(const field of ['request','request_sha256','reviewed_candidate','reviewed_sha256','decision','result','approval_id','trace_id'])assert.deepEqual(current[field],before[field]);
  assert.equal((await read(rejected.id)).status,'rejected');assert.equal((await read(rejected.id)).error_code,'CONTEXT_APPROVAL_REJECTED');
  assert.equal((await read(other.id)).status,'uncertain');assert.equal((await read(running.id)).status,'running');
  const events=(await pool.query("SELECT * FROM events WHERE project_id=$1 AND kind='context.ai_legacy_reconciled'",[p])).rows;
  assert.equal(events.length,2);assert.ok(events.every(e=>e.actor_id===owner));
  assert.equal(JSON.stringify(answer).includes('apv_'),false);assert.equal(JSON.stringify(answer).includes('trc_'),false);
  assert.deepEqual(await reconcile(p,{getApproval:async()=>{throw Error('No repeated lookup');}}),{checked:0,resolved:0,remaining:0,errors:[]});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM context_candidates WHERE project_id=$1',[p])).rows[0].n,0);
});

suite('pending, approved, missing references and failed lookup remain uncertain without leaking provider errors',async()=>{
  const p=await project();const pending=await fixture(p,{remoteStatus:'pending'}),approved=await fixture(p,{remoteStatus:'approved'}),missing=await fixture(p,{reference:false}),failed=await fixture(p);
  const client={getApproval:async id=>{if(id===failed.approval.id)throw Error('Secret '+id);return structuredClone(id===pending.approval.id?pending.approval:approved.approval);}};
  const answer=await reconcile(p,client);assert.equal(answer.checked,4);assert.equal(answer.resolved,0);assert.equal(answer.remaining,4);
  assert.deepEqual(new Map(answer.errors.map(e=>[e.code,e.count])),new Map([['CONTEXT_APPROVAL_REFERENCE_MISSING',1],['CONTEXT_APPROVAL_LOOKUP_FAILED',1]]));
  for(const row of [pending,approved,missing,failed])assert.equal((await read(row.id)).status,'uncertain');
  assert.equal(JSON.stringify(answer).includes('Secret'),false);assert.equal(JSON.stringify(answer).includes('apv_'),false);
});

suite('tenant, flow, agent, trace, approval ID and original request mismatches cannot resolve a run',async()=>{
  const p=await project(),rows=[];
  const mutations=[a=>a.tenantId='t_'+randomUUID().replaceAll('-',''),a=>a.graphSlug='foreign-flow',a=>a.agentId='foreign-agent',a=>a.traceId='trc_'+randomUUID().replaceAll('-',''),a=>a.id='apv_'+randomUUID().replaceAll('-',''),(a,f)=>a.message='# Original user request\n'+JSON.stringify({...f.request,project_id:'foreign-project'})+APPROVAL_MARKER+JSON.stringify(f.output)];
  for(const mutate of mutations){const f=await fixture(p);const raw=structuredClone(f.approval);mutate(raw,f);rows.push({...f,raw});}
  const answer=await reconcile(p,{getApproval:async id=>rows.find(r=>r.approval.id===id).raw});
  assert.equal(answer.resolved,0);assert.equal(answer.remaining,6);assert.deepEqual(answer.errors,[{code:'CONTEXT_APPROVAL_IDENTITY_MISMATCH',count:6}]);
});

suite('authorization and unbound checks precede any remote lookup',async()=>{
  const p=await project();await fixture(p);let calls=0;const client={getApproval:async()=>{calls++;throw Error('Forbidden lookup');}};
  await assert.rejects(reconcile(p,client,viewer),code('FORBIDDEN'));
  await assert.rejects(reconcile(p,client,randomUUID()),code('FORBIDDEN'));
  await bind(p);await assert.rejects(reconcile(p,client),code('NORA_LEGACY_RECONCILE_NOT_ALLOWED'));
  assert.equal(calls,0);
});

suite('network lookup holds no project lock and a concurrent binding prevents local reconciliation',async()=>{
  const p=await project(),f=await fixture(p);
  const client={getApproval:async()=>{await bind(p);return f.approval;}};
  await assert.rejects(reconcile(p,client),code('NORA_LEGACY_RECONCILE_NOT_ALLOWED'));
  assert.equal((await read(f.id)).status,'uncertain');
});

suite('changed permission or execution snapshot is rechecked after native lookup',async()=>{
  const p=await project(),f=await fixture(p);
  await assert.rejects(reconcile(p,{getApproval:async()=>{await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2",[p,owner]);return f.approval;}}),code('FORBIDDEN'));
  assert.equal((await read(f.id)).status,'uncertain');
  const p2=await project(),f2=await fixture(p2);const decision={decision:'approved',actor_id:owner};
  const answer=await reconcile(p2,{getApproval:async()=>{await pool.query('UPDATE context_ai_runs SET decision=$2 WHERE id=$1',[f2.id,decision]);return f2.approval;}});
  assert.equal(answer.resolved,0);assert.deepEqual(answer.errors,[{code:'CONTEXT_RECONCILIATION_STALE',count:1}]);
  assert.equal((await read(f2.id)).status,'uncertain');assert.deepEqual((await read(f2.id)).decision,decision);
});

suite('batch size is capped at 50 and remaining includes uninspected uncertain runs',async()=>{
  const p=await project(),rows=[];for(let i=0;i<51;i++)rows.push(await fixture(p));let calls=0;
  const answer=await reconcile(p,{getApproval:async id=>{calls++;return clientFor(rows).getApproval(id);}});
  assert.equal(calls,50);assert.equal(answer.checked,50);assert.equal(answer.resolved,50);assert.equal(answer.remaining,1);
});

suite('concurrent reconciliation cannot double-resolve or duplicate the audit event',async()=>{
  const p=await project(),f=await fixture(p),barrier=deferred();let calls=0;
  const client={getApproval:async()=>{if(++calls===2)barrier.resolve();await barrier.promise;return f.approval;}};
  const results=await Promise.all([reconcile(p,client),reconcile(p,client)]);
  assert.equal(results.reduce((sum,r)=>sum+r.resolved,0),1);
  assert.ok(results.every(r=>r.remaining===0));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM events WHERE project_id=$1 AND kind='context.ai_legacy_reconciled'",[p])).rows[0].n,1);
});

suite('workspace attach automatically reconciles an expired approval before registering the selected workspace',async()=>{
  const p=await project(),f=await fixture(p),workspaceId='t_'+randomUUID().replaceAll('-','');let calls=0;
  const service=createProjectNora({pool,legacyClient:{getApproval:async id=>{calls++;assert.equal(id,f.approval.id);return structuredClone(f.approval);}}});
  const result=await service.attach(p,owner,{workspace_id:workspaceId,expected_version:0});
  assert.equal(result.workspace_id,workspaceId);assert.equal(result.mode,'nora');assert.equal(result.status,'pending');
  assert.equal(calls,1);assert.equal((await read(f.id)).status,'failed');assert.equal((await read(f.id)).error_code,'CONTEXT_APPROVAL_EXPIRED');
  const kinds=(await pool.query('SELECT kind FROM events WHERE project_id=$1 ORDER BY created_at,id',[p])).rows.map(r=>r.kind);
  assert.equal(kinds.filter(k=>k==='context.ai_legacy_reconciled').length,1);assert.equal(kinds.filter(k=>k==='nora.workspace_registered').length,1);
  const replay=await service.attach(p,owner,{workspace_id:workspaceId,expected_version:0});
  assert.equal(replay.workspace_id,workspaceId);assert.equal(calls,1);
});

suite('workspace attach preserves a pending native approval and remains blocked',async()=>{
  const p=await project(),f=await fixture(p,{remoteStatus:'pending'}),workspaceId='t_'+randomUUID().replaceAll('-','');let calls=0;
  const service=createProjectNora({pool,legacyClient:{getApproval:async()=>{calls++;return structuredClone(f.approval);}}});
  await assert.rejects(service.attach(p,owner,{workspace_id:workspaceId,expected_version:0}),code('NORA_LEGACY_RUNS_ACTIVE'));
  assert.equal(calls,1);assert.equal((await read(f.id)).status,'uncertain');
  assert.equal((await pool.query('SELECT 1 FROM project_nora_workspaces WHERE project_id=$1',[p])).rowCount,0);
  assert.equal((await pool.query("SELECT 1 FROM events WHERE project_id=$1 AND kind='context.ai_legacy_reconciled'",[p])).rowCount,0);
});

suite('workspace attach accepts a concurrent registration of the same target after native lookup',async()=>{
  const p=await project(),f=await fixture(p),workspaceId='t_'+randomUUID().replaceAll('-',''),input={workspace_id:workspaceId,expected_version:0};
  const winner=createProjectNora({pool,legacyClient:clientFor([f])});
  const delayed=createProjectNora({pool,legacyClient:{getApproval:async()=>{const first=await winner.attach(p,owner,input);assert.equal(first.workspace_id,workspaceId);return structuredClone(f.approval);}}});
  const result=await delayed.attach(p,owner,input);
  assert.equal(result.workspace_id,workspaceId);assert.equal(result.status,'pending');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM events WHERE project_id=$1 AND kind='nora.workspace_registered'",[p])).rows[0].n,1);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM events WHERE project_id=$1 AND kind='context.ai_legacy_reconciled'",[p])).rows[0].n,1);
});

for(const outcome of ['late_success','late_failure'])suite('worker cannot revive a reconciled failed request: '+outcome,async()=>{
  const p=await project(),f=await fixture(p,{status:'queued'}),pending=deferred();let started=false,lookups=0;
  const client={startContextReview:async()=>{started=true;return pending.promise;},getApproval:async()=>{lookups++;return {...f.approval,status:'approved'};}};
  const worker=createContextAIWorker({pool,token:'test-only',client});
  try{
    await worker.tick();await waitUntil(()=>started);
    await pool.query("UPDATE context_ai_runs SET status='uncertain' WHERE id=$1",[f.id]);
    assert.equal((await reconcile(p,clientFor([f]))).resolved,1);
    if(outcome==='late_success')pending.resolve(completed(f));else pending.reject(Object.assign(Error('Late failure'),{code:'CONTEXT_TRANSPORT_UNKNOWN'}));
    await worker.stop();assert.equal((await read(f.id)).status,'failed');assert.equal((await read(f.id)).error_code,'CONTEXT_APPROVAL_EXPIRED');assert.equal(lookups,0);
  }finally{pending.resolve(completed(f));await worker.stop();}
});

suite('worker rechecks terminal state under row lock after validating a delayed native response',async()=>{
  const p=await project(),f=await fixture(p,{status:'queued'});let reconciled=false;
  const client={startContextReview:async()=>completed(f),getApproval:async()=>{
    await pool.query("UPDATE context_ai_runs SET status='uncertain' WHERE id=$1",[f.id]);
    assert.equal((await reconcile(p,clientFor([f]))).resolved,1);reconciled=true;
    return {...f.approval,status:'approved'};
  }};
  const worker=createContextAIWorker({pool,token:'test-only',client});
  try{await worker.tick();await waitUntil(()=>reconciled);await worker.stop();assert.equal((await read(f.id)).status,'failed');assert.equal((await read(f.id)).result,null);}
  finally{await worker.stop();}
});
