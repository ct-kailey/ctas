'use strict';
const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {createPool,migrate} = require('../server/db');
const {createLedger} = require('../server/ledger');
const {createRegistrationAssistant} = require('../server/registration-assistant');
const suite=process.env.TEST_DATABASE_URL?test:test.skip;
let admin,pool,ledger,schema,owner,viewer,outsider;
before(async()=>{
  if(!process.env.TEST_DATABASE_URL)return;
  admin=createPool(process.env.TEST_DATABASE_URL);schema='suggestion_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});await migrate(pool);ledger=createLedger(pool);
  [owner,viewer,outsider]=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('o@test.local','o','unused'),('v@test.local','v','unused'),('x@test.local','x','unused') RETURNING id")).rows.map(r=>r.id);
});
after(async()=>{if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
async function setup(){const p=await ledger.createProject(owner,{name:'추천 검증'});await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'viewer')",[p.id,viewer]);const domains=await ledger.listDomains(p.id);return {p,domain:domains[0]};}
const draft={title:'회원 가입 정책 v2',text:'회원가입 승인 기준 변경',record_kind:'specification'};
const suggestion=(domain)=>({action:'new_document',domain_id:domain.id,document_id:null,record_kind:'specification',confidence:0.65,reason:'새 문서로 확인이 필요합니다.'});
suite('suggestions require writer access before dispatch or context reads',async()=>{
  const {p}=await setup();let calls=0;const a=createRegistrationAssistant({pool,available:true,invoke:async()=>{calls++;}});
  for(const user of [viewer,outsider])await assert.rejects(a.suggest(p.id,user,draft),{code:'FORBIDDEN'});
  assert.equal(calls,0);
});
suite('unavailable Nora does not block ordinary editor registration',async()=>{
  const {p}=await setup();const a=createRegistrationAssistant({pool,available:false});
  await assert.rejects(a.suggest(p.id,owner,draft),{code:'REGISTRATION_UNAVAILABLE'});
  const result=await ledger.createRecord(p.id,owner,{title:'회의 메모',text:'담당자 확인 필요',record_kind:'note'});
  assert.ok(result.revision_id);
});
suite('recommendation candidates are scoped; successful recommendation never creates a document or baseline',async()=>{
  const {p,domain}=await setup();const second=await setup();
  await ledger.createRecord(second.p.id,owner,{title:'다른 프로젝트 비밀',text:'excluded',record_kind:'specification'});
  const local=await ledger.createRecord(p.id,owner,{title:'기존 계획',text:'original',record_kind:'specification'});
  let captured;
  const a=createRegistrationAssistant({pool,available:true,invoke:async request=>{captured=request;return {traceId:'trace_test',suggestion:suggestion(domain)};}});
  const result=await a.suggest(p.id,owner,{...draft,domain_id:domain.id});
  assert.deepEqual(captured.documents.map(d=>d.id),[local.document_id]);assert.equal(captured.project_id,p.id);
  assert.equal(result.status,'suggested');assert.equal(result.suggestion.document_id,null);
  const docs=await ledger.listDocuments(p.id);assert.equal(docs.length,1);assert.equal(docs[0].baseline_revision_id,null);
  const run=(await pool.query('SELECT * FROM registration_requests WHERE id=$1',[result.request_id])).rows[0];
  assert.equal(run.status,'succeeded');assert.match(run.input_sha256,/^[a-f0-9]{64}$/);assert.equal(run.trace_id,'trace_test');
  assert.equal((await ledger.feed(p.id)).filter(e=>e.kind==='registration.suggested').length,1);
});
suite('foreign domain and invented document IDs cannot be accepted even from injected transport',async()=>{
  const {p,domain}=await setup(),other=await setup();let calls=0;
  const a=createRegistrationAssistant({pool,available:true,invoke:async()=>{calls++;return {traceId:'bad',suggestion:{...suggestion(domain),action:'new_revision',document_id:randomUUID()}};}});
  await assert.rejects(a.suggest(p.id,owner,{...draft,domain_id:other.domain.id}),{code:'INVALID_DOMAIN'});assert.equal(calls,0);
  await assert.rejects(a.suggest(p.id,owner,draft));assert.equal(calls,1);
  assert.equal((await pool.query('SELECT status FROM registration_requests WHERE project_id=$1',[p.id])).rows[0].status,'failed');
});
suite('classified registration suggestions only consider the selected purpose while preserving Nora schema',async()=>{
  const {p,domain}=await setup();
  const planning=await ledger.createRecord(p.id,owner,{title:'개발 기획서',document_category:'planning',text:'계획'});
  await ledger.createRecord(p.id,owner,{title:'기획 관련 요구사항',document_category:'requirements',text:'요구사항'});
  await ledger.createRecord(p.id,owner,{title:'기획 정책',document_category:'policy',text:'정책'});
  let captured;
  const a=createRegistrationAssistant({pool,available:true,invoke:async request=>{captured=request;return {traceId:'classified',suggestion:suggestion(domain)};}});
  await a.suggest(p.id,owner,{title:'개발 기획서 v2',text:'기획서 변경',document_category:'planning'});
  assert.equal(captured.record_kind,'specification');
  assert.deepEqual(captured.documents.map(d=>d.id),[planning.document_id]);
  assert.equal(captured.document_category,undefined,'published Nora request contract stays unchanged');
  await assert.rejects(a.suggest(p.id,owner,{title:'분류 오류',document_category:'invented'}),{code:'INVALID_DOCUMENT_CATEGORY'});
});
suite('transport uncertainty is recorded once without automatic retries',async()=>{
  const {p}=await setup();let calls=0;
  const a=createRegistrationAssistant({pool,available:true,invoke:async()=>{calls++;throw Object.assign(new Error('unknown'),{code:'REGISTRATION_TRANSPORT_UNKNOWN',traceId:'partial-trace'});}});
  await assert.rejects(a.suggest(p.id,owner,draft),{code:'REGISTRATION_TRANSPORT_UNKNOWN'});assert.equal(calls,1);
  const row=(await pool.query('SELECT status,trace_id FROM registration_requests WHERE project_id=$1',[p.id])).rows[0];assert.equal(row.status,'uncertain');assert.equal(row.trace_id,'partial-trace');
});
suite('repeated concurrent clicks do not dispatch a second model run',async()=>{
  const {p,domain}=await setup();let release,entered;const started=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const a=createRegistrationAssistant({pool,available:true,invoke:async()=>{entered();await gate;return {traceId:'single',suggestion:suggestion(domain)};}});
  const first=a.suggest(p.id,owner,draft);await started;
  try{await assert.rejects(a.suggest(p.id,owner,draft),{code:'REGISTRATION_BUSY'});}finally{release();}await first;
});
suite('oversize text and forged context cannot reach Nora',async()=>{
  const {p}=await setup();let calls=0;const a=createRegistrationAssistant({pool,available:true,invoke:async()=>{calls++;}});
  await assert.rejects(a.suggest(p.id,owner,{...draft,text:'x'.repeat(20001)}),{code:'INVALID_INPUT'});
  await assert.rejects(a.suggest(p.id,owner,{...draft,documents:[]}),{code:'INVALID_INPUT'});assert.equal(calls,0);
});
suite('hourly project quota uses persisted attempts',async()=>{
  const {p}=await setup();await pool.query("INSERT INTO registration_requests(id,project_id,actor_id,input_sha256,status) SELECT gen_random_uuid(),$1,$2,repeat('a',64),'failed' FROM generate_series(1,60)",[p.id,owner]);
  let calls=0;const a=createRegistrationAssistant({pool,available:true,invoke:async()=>{calls++;}});
  await assert.rejects(a.suggest(p.id,owner,draft),{code:'REGISTRATION_RATE_LIMIT'});assert.equal(calls,0);
});
suite('upstream HTTP 5xx preserves uncertain completion and available trace',async()=>{
  const {p}=await setup();let calls=0;
  const a=createRegistrationAssistant({pool,available:true,invoke:async()=>{calls++;throw Object.assign(new Error('gateway'),{code:'REGISTRATION_HTTP_502',traceId:'gateway-trace'});}});
  await assert.rejects(a.suggest(p.id,owner,draft),{code:'REGISTRATION_HTTP_502'});assert.equal(calls,1);
  const row=(await pool.query('SELECT status,trace_id FROM registration_requests WHERE project_id=$1',[p.id])).rows[0];
  assert.equal(row.status,'uncertain');assert.equal(row.trace_id,'gateway-trace');
});
