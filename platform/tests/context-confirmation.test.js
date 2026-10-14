'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {createContextAI}=require('../server/context-ai-ledger');
const {confirmContextAnalysis}=require('../server/context-confirmation');
const {hash}=require('../server/context-contract');
const url=process.env.TEST_DATABASE_URL,suite=url?test:test.skip;
let pool,admin,schema,owner,reviewer,viewer,ledger;
before(async()=>{if(!url)return;schema='context_confirm_'+randomUUID().replaceAll('-','');admin=createPool(url);await admin.query(`CREATE SCHEMA ${schema}`);pool=createPool({connectionString:url,options:`-c search_path=${schema}`});await migrate(pool);ledger=createLedger(pool);[owner,reviewer,viewer]=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('owner@confirm.test','Owner','unused'),('reviewer@confirm.test','Reviewer','unused'),('viewer@confirm.test','Viewer','unused') RETURNING id")).rows.map(r=>r.id);});
after(async()=>{if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}});
const code=c=>e=>e.code===c;
async function fixture({broken=false,status='ready'}={}){
 const p=await ledger.createProject(owner,{name:'Unified confirmation test'});
 await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'reviewer'),($1,$3,'viewer')",[p.id,reviewer,viewer]);
 const sourceText='승인 담당자를 지정한다. 결과는 PDF로 내려받는다.';
 const s=await ledger.createRecord(p.id,owner,{title:'기획서',record_kind:'specification',text:sourceText});
 await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1",[s.revision_id,JSON.stringify({segments:[{text:sourceText}]})]);
 const ai=createContextAI({pool,enabled:true});
 const run=await ai.create(p.id,owner,{request_id:randomUUID(),expected_context_version:0,source_refs:[{type:'revision',id:s.revision_id}]});
 const result={schema_version:'1.0',request_id:run.id,project_id:p.id,context_version:0,summary:'승인·보고서 요구사항',items:['승인 담당자 지정','PDF 내려받기'].map((title,i)=>({kind:'requirement',title,content:title,rationale:'등록한 기획서',alternatives:[],evidence:[{source_id:'revision:'+s.revision_id,quote:sourceText}],conflicts_with:[],certainty:broken&&i===1?'invalid':'agreed',scope:'in_scope'})),warnings:[]};
 const sha=hash(result);
 await pool.query('UPDATE context_ai_runs SET status=$2,reviewed_candidate=$3,reviewed_sha256=$4,result=$3,decision=$5 WHERE id=$1',[run.id,status,JSON.stringify(result),sha,JSON.stringify({actor_id:owner,decision:'approved',reason:'원문 대조',decided_at:new Date().toISOString()})]);
 return {p,s,run,ai,body:{selected_indices:[0,1],expected_sha256:sha,expected_context_version:0,reason:'선택한 두 요구사항과 원문을 확인했습니다.'}};
}
suite('one explicit confirmation merges multiple selected items atomically and repeats without duplicate records',async()=>{
 const {p,run,ai,body}=await fixture();
 const results=await Promise.all([confirmContextAnalysis(pool,p.id,run.id,owner,body),confirmContextAnalysis(pool,p.id,run.id,owner,body)]);
 assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);assert.equal(results[0].record_ids.length,2);
 const rows=(await pool.query('SELECT context_version,payload,reviewed_by FROM context_records WHERE project_id=$1 ORDER BY context_version',[p.id])).rows;
 assert.deepEqual(rows.map(r=>Number(r.context_version)),[1,2]);assert.ok(rows.every(r=>r.reviewed_by===owner&&r.payload.source_refs[0].id));
 assert.deepEqual((await ai.get(p.id,run.id,owner)).imported_indices,[0,1]);
 const retry=await confirmContextAnalysis(pool,p.id,run.id,owner,{...body,selected_indices:[1,0]});assert.equal(retry.replayed,true);
 assert.equal((await confirmContextAnalysis(pool,p.id,run.id.toUpperCase(),owner,body)).replayed,true);
 assert.deepEqual((await ai.get(p.id,run.id,owner)).confirmation.selected_indices,[0,1]);
 await assert.rejects(confirmContextAnalysis(pool,p.id,run.id,owner,{...body,selected_indices:[0]}),code('CONTEXT_ALREADY_DECIDED'));
 await assert.rejects(confirmContextAnalysis(pool,p.id,run.id,reviewer,body),code('CONTEXT_ALREADY_DECIDED'));
});
suite('last item validation failure rolls back earlier candidate creation and all history writes',async()=>{
 const {p,run,body}=await fixture({broken:true});
 await assert.rejects(confirmContextAnalysis(pool,p.id,run.id,owner,body),code('INVALID_CONTEXT_INPUT'));
 for(const table of ['context_candidates','context_records'])assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM ${table} WHERE project_id=$1`,[p.id])).rows[0].n),0);
 assert.equal(Number((await pool.query("SELECT count(*) AS n FROM events WHERE project_id=$1 AND kind='context.candidate_created'",[p.id])).rows[0].n),0);
});
suite('viewer, foreign project, stale snapshot and pending Nora result cannot confirm',async()=>{
 const {p,run,body}=await fixture(),foreign=await fixture();
 await assert.rejects(confirmContextAnalysis(pool,p.id,run.id,viewer,body),code('FORBIDDEN'));
 await assert.rejects(confirmContextAnalysis(pool,foreign.p.id,run.id,owner,body),code('CONTEXT_AI_NOT_FOUND'));
 await assert.rejects(confirmContextAnalysis(pool,p.id,run.id,owner,{...body,expected_sha256:'0'.repeat(64)}),code('CONTEXT_REVIEW_STALE'));
 await assert.rejects(confirmContextAnalysis(pool,p.id,run.id,owner,{...body,expected_context_version:3}),code('CONTEXT_VERSION_CONFLICT'));
 const pending=await fixture({status:'finalizing'});await assert.rejects(confirmContextAnalysis(pool,pending.p.id,pending.run.id,owner,pending.body),code('CONTEXT_AI_NOT_READY'));
});
suite('changed source or project context blocks a complete batch without partially confirming it',async()=>{
 const {p,s,run,body}=await fixture();
 await pool.query('UPDATE documents SET baseline_revision_id=$1 WHERE id=$2',[s.revision_id,s.document_id]);
 await assert.rejects(confirmContextAnalysis(pool,p.id,run.id,owner,body),code('CONTEXT_SOURCE_STALE'));
 const other=await fixture();await pool.query('INSERT INTO context_heads(project_id,version) VALUES($1,1)',[other.p.id]);
 await assert.rejects(confirmContextAnalysis(pool,other.p.id,other.run.id,owner,other.body),code('CONTEXT_VERSION_CONFLICT'));
 assert.equal(Number((await pool.query('SELECT count(*) n FROM context_records WHERE project_id=$1',[p.id])).rows[0].n),0);
});
suite('only explicitly selected items become records',async()=>{
 const {p,run,body}=await fixture();const result=await confirmContextAnalysis(pool,p.id,run.id,owner,{...body,selected_indices:[1]});
 assert.equal(result.record_ids.length,1);assert.equal(result.version,1);
 const rows=(await pool.query('SELECT title FROM context_records WHERE project_id=$1',[p.id])).rows;assert.deepEqual(rows.map(r=>r.title),['PDF 내려받기']);
});

suite('reviewer revoked while waiting for the project lock cannot confirm',async()=>{
 const {p,run,body}=await fixture();const held=await pool.connect();
 await held.query('BEGIN');await held.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-context:'||$1,0))",[p.id]);
 const attempt=confirmContextAnalysis(pool,p.id,run.id,reviewer,body);
 const rejected=assert.rejects(attempt,code('FORBIDDEN'));
 try {
  let waiting=false;
  for(let i=0;i<100;i++){
   waiting=Number((await pool.query("SELECT count(*) n FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND NOT l.granted AND a.query LIKE '%ains-context%' AND a.query NOT LIKE '%pg_locks%'" )).rows[0].n)>0;
   if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(waiting,true);
  await pool.query("UPDATE memberships SET role='viewer' WHERE project_id=$1 AND user_id=$2",[p.id,reviewer]);
  await held.query('COMMIT');await rejected;
  assert.equal(Number((await pool.query('SELECT count(*) n FROM context_records WHERE project_id=$1',[p.id])).rows[0].n),0);
 } finally {await held.query('ROLLBACK');held.release();}
});
