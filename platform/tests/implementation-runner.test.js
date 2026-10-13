'use strict';
// Legacy behavior tests isolate pre-existing state rules; mandatory governance is covered by work-execution HTTP tests.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {createImplementationLedger}=require('../server/implementation-ledger');
const {createImplementationRunner,validateCompletion}=require('../server/implementation-runner');
const url=process.env.TEST_DATABASE_URL,suite=url?test:test.skip,code=c=>e=>e.code===c;
const sha=v=>createHash('sha256').update(v).digest('hex');
let admin,pool,ledger,implementation,runner,schema,owner,reviewer,member,outsider;
before(async()=>{
 if(!url)return;schema='runner_'+randomUUID().replaceAll('-','');admin=createPool(url);await admin.query(`CREATE SCHEMA ${schema}`);
 pool=createPool({connectionString:url,options:`-c search_path=${schema}`});await migrate(pool);ledger=createLedger(pool);implementation=createImplementationLedger(pool,{requireGovernance:false});runner=createImplementationRunner({requireGovernance:false,pool,appOrigin:'https://runner.example.test'});
 const rows=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('owner@runner.test','Owner','unused'),('reviewer@runner.test','Reviewer','unused'),('member@runner.test','Member','unused'),('outsider@runner.test','Outsider','unused') RETURNING id,email")).rows;
 [owner,reviewer,member,outsider]=['owner','reviewer','member','outsider'].map(n=>rows.find(r=>r.email.startsWith(n+'@')).id);
});
after(async()=>{if(!url)return;if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
async function fixture(){
 const p=await ledger.createProject(owner,{name:'실행 연결 합성 검증'});await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'reviewer'),($1,$3,'member')",[p.id,reviewer,member]);
 await implementation.saveSettings(p.id,owner,{expected_version:1,goal:'회원 이메일 인증 기능 구현',repository_url:'https://github.com/ct-kailey/nora-flow.git',base_branch:'main'});
 await implementation.recordRepositoryCheck(p.id,owner,2,{status:'ready',head_sha:'a'.repeat(40),checked_at:new Date().toISOString()});
 const record=await ledger.createRecord(p.id,member,{title:'회원 기획',text:'가입 시 이메일을 인증한다.'}),r=await ledger.getRevision(p.id,record.revision_id);
 const doc={schema_version:'1.0',project_id:p.id,document_id:record.document_id,revision_id:r.id,source:{filename:r.filename,mime_type:r.mime_type,sha256:r.sha256},segments:[{segment_id:'s1',requirement_key:'REQ-1',text:'가입 시 이메일을 인증한다.',locator:{kind:'text',label:'본문'},extraction_status:'ok'}],extraction:{complete:true,warnings:[]},normalization:{status:'ready',warnings:[],segment_count:1}};
 await pool.query("UPDATE revisions SET status='ready',document_json=$1 WHERE id=$2",[JSON.stringify(doc),r.id]);await pool.query("UPDATE jobs SET status='succeeded' WHERE id=$1",[record.job_id]);await ledger.publishInitial(p.id,r.id,reviewer,{reason:'기획 확인',acknowledge_extraction:true});
 const plan=await implementation.createPlan(p.id,member,{request_id:randomUUID(),revision_ids:[r.id]});
 const result={title:'이메일 인증 구현',summary:'이메일 인증을 구현합니다.',tasks:[{id:'TASK-1',title:'인증 처리',description:'기획에 따른 인증 흐름을 추가합니다.',acceptance_criteria:['인증 실패 시 가입되지 않는다.'],evidence:[{revision_id:r.id,segment_id:'s1'}],depends_on:[]}],questions:[],assumptions:[],test_strategy:['인증 성공·실패 검사']};
 await pool.query("UPDATE implementation_plans SET status='needs_review',result=$1,trace_id='trc_runner_fixture' WHERE id=$2",[JSON.stringify(result),plan.id]);await implementation.decidePlan(p.id,plan.id,reviewer,{decision:'approved',reason:'작업 범위 확인',acknowledge_sources:true});
 const request=await implementation.requestExecution(p.id,plan.id,reviewer,{reason:'승인 계획 구현',acknowledge_code_execution:true});return {p,record,plan,request};
}
async function ticket(f){return (await runner.issue(f.p.id,f.request.id,owner)).ticket;}
const auth=t=>'Bearer '+t.token;
function patchResult(){const patch='diff --git a/src/auth.js b/src/auth.js\nnew file mode 100644\nindex 0000000..1234567\n--- /dev/null\n+++ b/src/auth.js\n@@ -0,0 +1 @@\n+module.exports = true;\n';return {summary:'이메일 인증 기능 변경안',patch,changed_files:['src/auth.js'],reported_checks:['합성 단위 테스트 통과'],observed_commands:[{command:'node --test',exit_code:0}],limitations:['합성 테스트 결과'],base_commit_sha:'a'.repeat(40),patch_sha256:sha(patch)};}
function completion(lease,result=patchResult()){return {lease_token:lease,status:'patch_ready',result,error_code:null};}
const state=async id=>(await pool.query('SELECT * FROM implementation_requests WHERE id=$1',[id])).rows[0];

test('completion validates base commit, patch hash, structured fields and relative output paths',()=>{
 const row={input_snapshot:{repository:{head_sha:'a'.repeat(40)}}},lease=randomUUID(),good=completion(lease);
 assert.equal(validateCompletion(good,row).status,'patch_ready');
 const frozen={input_snapshot:{...row.input_snapshot,governance:{scope:[{kind:'path',key:'src'}]}}};
 assert.equal(validateCompletion(good,frozen).status,'patch_ready');
 for(const scope of [[{kind:'path',key:'other'}],[{kind:'feature',key:'auth'}],[]])assert.throws(()=>validateCompletion(good,{input_snapshot:{...row.input_snapshot,governance:{scope}}}),code('EXECUTOR_SCOPE_EXCEEDED'));
 for(const patch of [{patch_sha256:'b'.repeat(64)},{base_commit_sha:'b'.repeat(40)},{patch:'not a diff'},{changed_files:['../outside']},{changed_files:['.git/config']},{changed_files:['/tmp/file']},{observed_commands:[{command:'test',exit_code:'0'}]}])assert.throws(()=>validateCompletion(completion(lease,{...good.result,...patch}),row),code('INVALID_RUNNER_RESULT'));
 assert.throws(()=>validateCompletion({...good,extra:true},row),code('INVALID_RUNNER_INPUT'));
 assert.throws(()=>validateCompletion({lease_token:lease,status:'failed',result:good.result,error_code:'ERROR'},row),code('INVALID_RUNNER_INPUT'));
});
suite('only owners issue/revoke one-request two-hour tickets and token material is hashed',async()=>{
 const f=await fixture();
 for(const user of [reviewer,member,outsider])await assert.rejects(runner.issue(f.p.id,f.request.id,user),code('FORBIDDEN'));
 const t=await ticket(f);assert.match(t.token,/^ains_run_[a-f0-9]{64}$/);assert.equal(t.request_id,f.request.id);assert.equal(t.url,'https://runner.example.test');assert.ok(new Date(t.expires_at)-Date.now()>119*60000);
 const stored=(await pool.query('SELECT * FROM implementation_runner_tokens WHERE request_id=$1',[f.request.id])).rows[0];assert.equal(stored.token_hash,sha(t.token));assert.equal(JSON.stringify(stored).includes(t.token),false);
 const event=await pool.query("SELECT detail FROM events WHERE entity_id=$1 AND kind='implementation.runner_ticket_issued'",[f.request.id]);assert.equal(JSON.stringify(event.rows).includes(t.token),false);
 await assert.rejects(runner.revoke(f.p.id,f.request.id,reviewer),code('FORBIDDEN'));
 await runner.revoke(f.p.id,f.request.id,owner);await assert.rejects(runner.claim(f.request.id,auth(t)),code('RUNNER_UNAUTHORIZED'));
});
suite('wrong, expired, revoked, cross-project tokens and lost issuing-owner role cannot claim',async()=>{
 const f=await fixture(),g=await fixture(),t=await ticket(f);
 await assert.rejects(runner.issue(g.p.id,f.request.id,owner),code('NOT_FOUND'));
 await assert.rejects(runner.claim(g.request.id,auth(t)),code('RUNNER_UNAUTHORIZED'));
 await assert.rejects(runner.claim(f.request.id,'Bearer ains_run_'+'0'.repeat(64)),code('RUNNER_UNAUTHORIZED'));
 await pool.query("UPDATE implementation_runner_tokens SET expires_at=now()-interval '1 second' WHERE request_id=$1",[f.request.id]);await assert.rejects(runner.claim(f.request.id,auth(t)),code('RUNNER_UNAUTHORIZED'));
 const replacement=await ticket(f);await assert.rejects(runner.claim(f.request.id,auth(t)),code('RUNNER_UNAUTHORIZED'));
 await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2",[f.p.id,owner]);await assert.rejects(runner.claim(f.request.id,auth(replacement)),code('RUNNER_UNAUTHORIZED'));
 assert.equal((await state(f.request.id)).status,'awaiting_runner');
});
suite('claim is single-use under concurrency and only its lease can heartbeat or complete',async()=>{
 const f=await fixture(),t=await ticket(f),claims=await Promise.allSettled([runner.claim(f.request.id,auth(t)),runner.claim(f.request.id,auth(t))]);
 assert.equal(claims.filter(c=>c.status==='fulfilled').length,1);assert.equal(claims.find(c=>c.status==='rejected').reason.code,'RUNNER_ALREADY_CLAIMED');
 const claim=claims.find(c=>c.status==='fulfilled').value;assert.equal(claim.input_sha256,f.request.input_sha256);assert.equal(claim.input_snapshot.approval.decision,'approved');
 assert.ok(new Date(claim.lease_expires_at)>new Date());
 await assert.rejects(runner.heartbeat(f.request.id,auth(t),{lease_token:randomUUID()}),code('RUNNER_LEASE_LOST'));
 assert.ok((await runner.heartbeat(f.request.id,auth(t),{lease_token:claim.lease_token})).lease_expires_at);
 await assert.rejects(runner.issue(f.p.id,f.request.id,owner),code('RUNNER_NOT_WAITING'));
 await assert.rejects(runner.revoke(f.p.id,f.request.id,owner),code('RUNNER_NOT_WAITING'));
 await assert.rejects(runner.complete(f.request.id,auth(t),completion(randomUUID())),code('RUNNER_LEASE_LOST'));
 const bad=patchResult();bad.patch_sha256='0'.repeat(64);await assert.rejects(runner.complete(f.request.id,auth(t),completion(claim.lease_token,bad)),code('INVALID_RUNNER_RESULT'));
 assert.equal((await state(f.request.id)).status,'running');
 const done=await runner.complete(f.request.id,auth(t),completion(claim.lease_token));assert.equal(done.status,'patch_ready');assert.deepEqual(await runner.complete(f.request.id,auth(t),completion(claim.lease_token)),done);
 await assert.rejects(runner.complete(f.request.id,auth(t),completion(claim.lease_token,{...patchResult(),summary:'Different summary'})),code('RUNNER_RESULT_CONFLICT'));
 const persisted=await state(f.request.id);assert.equal(persisted.result.patch_sha256,patchResult().patch_sha256);assert.equal(persisted.lease_token,null);
 assert.equal((await pool.query("SELECT count(*)::int n FROM events WHERE entity_id=$1 AND kind='implementation.execution_patch_ready'",[f.request.id])).rows[0].n,1);
});
suite('stale settings, repository HEAD and baseline block both new tickets and existing ticket claims',async()=>{
 for(const change of ['settings','head','baseline']){
  const f=await fixture(),t=await ticket(f);
  if(change==='settings')await implementation.saveSettings(f.p.id,owner,{expected_version:2,goal:'수정한 프로젝트 목표',repository_url:'https://github.com/ct-kailey/nora-flow.git',base_branch:'main'});
  if(change==='head')await implementation.recordRepositoryCheck(f.p.id,owner,2,{status:'ready',head_sha:'b'.repeat(40),checked_at:new Date().toISOString()});
  if(change==='baseline')await pool.query('UPDATE documents SET baseline_revision_id=NULL WHERE id=$1',[f.record.document_id]);
  await assert.rejects(runner.issue(f.p.id,f.request.id,owner),code('IMPLEMENTATION_STALE'));await assert.rejects(runner.claim(f.request.id,auth(t)),code('IMPLEMENTATION_STALE'));
  assert.equal((await state(f.request.id)).status,'awaiting_runner');
 }
});
suite('expired lease becomes uncertain without reclaim or late result overwrite',async()=>{
 const f=await fixture(),t=await ticket(f),claim=await runner.claim(f.request.id,auth(t));await pool.query("UPDATE implementation_requests SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[f.request.id]);
 await assert.rejects(runner.heartbeat(f.request.id,auth(t),{lease_token:claim.lease_token}),code('RUNNER_LEASE_LOST'));
 await assert.rejects(runner.complete(f.request.id,auth(t),completion(claim.lease_token)),code('RUNNER_LEASE_LOST'));
 assert.equal(await runner.recoverExpired(),1);assert.equal(await runner.recoverExpired(),0);
 const expired=await state(f.request.id);assert.equal(expired.status,'uncertain');assert.equal(expired.error_code,'RUNNER_LEASE_EXPIRED');assert.equal(expired.result,null);
 await assert.rejects(runner.claim(f.request.id,auth(t)),code('RUNNER_ALREADY_CLAIMED'));await assert.rejects(runner.complete(f.request.id,auth(t),completion(claim.lease_token)),code('RUNNER_RESULT_CONFLICT'));
});
suite('owner-role loss or token expiry during execution blocks heartbeat and completion',async()=>{
 for(const change of ['role','expiry']){
  const f=await fixture(),t=await ticket(f),claim=await runner.claim(f.request.id,auth(t));
  if(change==='role')await pool.query("UPDATE memberships SET role='viewer' WHERE project_id=$1 AND user_id=$2",[f.p.id,owner]);else await pool.query("UPDATE implementation_runner_tokens SET expires_at=now()-interval '1 second' WHERE request_id=$1",[f.request.id]);
  await assert.rejects(runner.heartbeat(f.request.id,auth(t),{lease_token:claim.lease_token}),code('RUNNER_UNAUTHORIZED'));await assert.rejects(runner.complete(f.request.id,auth(t),completion(claim.lease_token)),code('RUNNER_UNAUTHORIZED'));
 }
});
suite('completion and audit insert are atomic when recording result fails',async()=>{
 const f=await fixture(),t=await ticket(f),claim=await runner.claim(f.request.id,auth(t));
 await pool.query("CREATE FUNCTION fail_runner_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='implementation.execution_patch_ready' THEN RAISE EXCEPTION 'forced runner audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_runner_audit BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_runner_audit_test()");
 try{await assert.rejects(runner.complete(f.request.id,auth(t),completion(claim.lease_token)),/forced runner audit failure/);}finally{await pool.query('DROP TRIGGER fail_runner_audit ON events; DROP FUNCTION fail_runner_audit_test()');}
 const row=await state(f.request.id);assert.equal(row.status,'running');assert.equal(row.result,null);assert.equal(row.lease_token,claim.lease_token);
});
suite('HTTP runner routes use request tickets while ticket issuance retains session, Origin and CSRF checks',async t=>{
 const {createApp}=require('../server/server');const f=await require('./work-execution-fixture').seed(pool,owner),origin='https://runner.example.test';
 await f.approve(await f.preflight());await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'member')",[f.p.id,member]);f.request=await f.implementation.requestExecution(f.p.id,f.plan.id,owner,{reason:'합성 승인 범위 실행',acknowledge_code_execution:true});
 assert.throws(()=>createApp({governance:{enforce:false},pool,production:true}),/GOVERNANCE_REQUIRED_IN_PRODUCTION/);
 const server=createApp({pool,appOrigin:origin,production:true}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 async function session(user){const token=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''),csrf=randomUUID();await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sha(token),user,csrf]);return {Cookie:'ains_session='+token,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};}
 const headers=await session(owner),memberHeaders=await session(member),route='/api/projects/'+f.p.id+'/implementation-requests/'+f.request.id+'/runner-ticket';
 async function post(path,body,authHeaders,expected){const response=await fetch(base+path,{method:'POST',headers:authHeaders,body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,expected,data.error?.code);return data;}
 await post(route,{},memberHeaders,403);await post(route,{}, {...headers,'X-CSRF-Token':'invalid'},403);await post(route,{}, {...headers,Origin:'https://foreign.test'},403);
 const issued=await post(route,{},headers,200),r='/api/implementation-runner/'+f.request.id,tokenHeaders={'Content-Type':'application/json',Authorization:auth(issued.ticket)};
 await post(r+'/claim',{},headers,401);const claimed=await post(r+'/claim',{},tokenHeaders,200);await post(r+'/claim',{},tokenHeaders,409);
 await post(r+'/heartbeat',{lease_token:claimed.lease_token},tokenHeaders,200);
 const completed=await post(r+'/complete',{lease_token:claimed.lease_token,status:'failed',result:null,error_code:'SYNTHETIC_CHECK_FAILURE'},tokenHeaders,200);assert.equal(completed.status,'failed');
 await post(r+'/complete',{lease_token:claimed.lease_token,status:'failed',result:null,error_code:'SYNTHETIC_CHECK_FAILURE'},tokenHeaders,200);
});

test('completion cross-checks actual patch paths against the manifest and rejects unsafe patch forms',()=>{
 const row={input_snapshot:{repository:{head_sha:'a'.repeat(40)}}},lease=randomUUID(),base=patchResult();
 const cases=[
  {patch:base.patch.replaceAll('src/auth.js','../../outside'),changed_files:['src/auth.js']},
  {patch:base.patch.replaceAll('src/auth.js','.git/config'),changed_files:['src/auth.js']},
  {patch:base.patch.replaceAll('src/auth.js','.env.production'),changed_files:['.env.production']},
  {patch:base.patch.replaceAll('src/auth.js','nested/credentials.json'),changed_files:['nested/credentials.json']},
  {patch:base.patch,changed_files:['src/other.js']},
  {patch:base.patch,changed_files:['src/auth.js','src/auth.js']},
  {patch:base.patch.replace('+++ b/src/auth.js','+++ b/../../outside'),changed_files:['src/auth.js']},
  {patch:base.patch.replace('new file mode 100644','new file mode 120000'),changed_files:['src/auth.js']},
  {patch:base.patch.replace('new file mode 100644','new file mode 160000'),changed_files:['src/auth.js']},
  {patch:base.patch.replace('new file mode 100644','rename from src/old.js\nrename to src/auth.js'),changed_files:['src/auth.js']},
  {patch:base.patch+'GIT binary patch\n',changed_files:['src/auth.js']},
 ];
 for(const value of cases){const result={...base,...value,patch_sha256:sha(value.patch)};assert.throws(()=>validateCompletion(completion(lease,result),row),code('INVALID_RUNNER_RESULT'));}
 assert.equal(validateCompletion(completion(lease,base),row).status,'patch_ready');
});
