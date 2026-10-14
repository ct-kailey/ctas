'use strict';
const {createReviewedPlan}=require('./implementation-source-fixture');
// Legacy behavior tests isolate pre-existing state rules; mandatory governance is covered by work-execution HTTP tests.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {createImplementationLedger,implementationHash,getImplementationStaleReasons}=require('../server/implementation-ledger');
const url=process.env.TEST_DATABASE_URL,suite=url?test:test.skip,code=c=>e=>e.code===c;
let admin,pool,ledger,implementation,schema,owner,reviewer,member,viewer,outsider;
before(async()=>{
  if(!url)return;schema='implementation_'+randomUUID().replaceAll('-','');admin=createPool(url);await admin.query(`CREATE SCHEMA ${schema}`);
  pool=createPool({connectionString:url,options:`-c search_path=${schema}`});await migrate(pool);ledger=createLedger(pool);implementation=createImplementationLedger(pool,{requireGovernance:false});
  const rows=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('owner@impl.test','Owner','unused'),('reviewer@impl.test','Reviewer','unused'),('member@impl.test','Member','unused'),('viewer@impl.test','Viewer','unused'),('outsider@impl.test','Outsider','unused') RETURNING id,email")).rows;
  [owner,reviewer,member,viewer,outsider]=['owner','reviewer','member','viewer','outsider'].map(n=>rows.find(r=>r.email.startsWith(n+'@')).id);
});
after(async()=>{if(!url)return;if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
async function project(){const p=await ledger.createProject(owner,{name:'구현 검증 프로젝트'});await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'reviewer'),($1,$3,'member'),($1,$4,'viewer')",[p.id,reviewer,member,viewer]);return p;}
function config(expected_version=1,extra={}){return {expected_version,project_kind:'client_project',goal:'승인한 회원 정책을 구현하고 검증합니다.',repository_url:'https://github.com/ct-kailey/nora-flow.git',base_branch:'main',...extra};}
async function settings(p,ready=true){const s=await implementation.saveSettings(p.id,owner,config());if(!ready)return s;return implementation.recordRepositoryCheck(p.id,owner,s.version,{status:'ready',head_sha:'a'.repeat(40),checked_at:new Date().toISOString()});}
async function spec(p,{published=true,kind='specification',text='회원 가입시 이메일 인증을 수행한다.',document_id}={}){
  const r=await ledger.createRecord(p.id,member,{title:'회원 기획',text,record_kind:kind,document_id});
  const row=await ledger.getRevision(p.id,r.revision_id);
  const doc={schema_version:'1.0',project_id:p.id,document_id:r.document_id,revision_id:r.revision_id,source:{filename:row.filename,mime_type:row.mime_type,sha256:row.sha256},segments:[{segment_id:'s1',requirement_key:'REQ-001',text,locator:{kind:'text',label:'본문'},extraction_status:'ok'}],extraction:{complete:true,warnings:[]},normalization:{status:'ready',warnings:[],segment_count:1}};
  await pool.query("UPDATE revisions SET status='ready',document_json=$1 WHERE id=$2",[JSON.stringify(doc),r.revision_id]);await pool.query("UPDATE jobs SET status='succeeded' WHERE id=$1",[r.job_id]);
  if(published)await ledger.publishInitial(p.id,r.revision_id,reviewer,{reason:'원문 검토 완료',acknowledge_extraction:true});return r;
}
function body(revisions){return {request_id:randomUUID(),revision_ids:revisions.map(r=>r.revision_id)};}
function result(row,extra={}){return {title:'회원 정책 구현',summary:'승인된 기획에 맞춰 이메일 인증을 구현합니다.',tasks:[{id:'TASK-1',title:'이메일 인증 구현',description:'가입 시 이메일 인증을 요구합니다.',acceptance_criteria:['미인증 계정은 가입을 완료할 수 없다.'],evidence:[{revision_id:row.input_snapshot.sources[0].revision_id,segment_id:'s1'}],depends_on:[]}],questions:[],assumptions:[],test_strategy:['인증 성공과 실패 테스트'],...extra};}
async function analyzed(p,row,extra={}){await pool.query("UPDATE implementation_plans SET status='needs_review',result=$1,trace_id='trc_impl_synthetic',completed_at=now() WHERE project_id=$2 AND id=$3",[JSON.stringify(result(row,extra)),p.id,row.id]);}
const approval={decision:'approved',reason:'기획 근거와 작업 범위를 확인했습니다.',acknowledge_sources:true};
const execution={reason:'승인된 계획의 구현을 요청합니다.',acknowledge_code_execution:true};

test('implementation hashes survive JSONB key ordering',()=>{assert.equal(implementationHash({a:1,b:{c:2,d:3}}),implementationHash({b:{d:3,c:2},a:1}));});
suite('project settings require owner, CAS and safe repository/ref syntax',async()=>{
  const p=await project();assert.equal((await implementation.getSettings(p.id,viewer)).version,1);
  await assert.rejects(implementation.getSettings(p.id,outsider),code('FORBIDDEN'));
  await assert.rejects(implementation.saveSettings(p.id,reviewer,config()),code('FORBIDDEN'));
  for(const repository_url of ['https://user:secret@github.com/a/b','http://github.com/a/b','https://github.com/a/b?token=x','https://other.test/a/b','https://github.com/a/../b'])await assert.rejects(implementation.saveSettings(p.id,owner,config(1,{repository_url})),code('INVALID_REPOSITORY'));
  for(const base_branch of ['-x','../main','refs//main','main.lock','main@{x','main\n','/main','@'])await assert.rejects(implementation.saveSettings(p.id,owner,config(1,{base_branch})),code('INVALID_BRANCH'));
  const saved=await implementation.saveSettings(p.id,owner,config(1,{repository_url:'https://github.com/CT-Kailey/nora-flow'}));assert.equal(saved.version,2);assert.equal(saved.repository_url,'https://github.com/ct-kailey/nora-flow.git');
  assert.equal((await implementation.saveSettings(p.id,owner,config(2))).version,2);
  await assert.rejects(implementation.saveSettings(p.id,owner,config(1)),code('SETTINGS_VERSION_CONFLICT'));
  const checked=await implementation.recordRepositoryCheck(p.id,reviewer,2,{status:'ready',head_sha:'a'.repeat(40),checked_at:new Date().toISOString()});assert.equal(checked.version,2);
  const updated=await implementation.saveSettings(p.id,owner,config(2,{goal:'새 목표'}));assert.equal(updated.version,3);assert.equal(updated.repository_check,null);
  await assert.rejects(implementation.recordRepositoryCheck(p.id,owner,2,{status:'ready',head_sha:'b'.repeat(40),checked_at:new Date().toISOString()}),code('SETTINGS_VERSION_CONFLICT'));
  await assert.rejects(pool.query("UPDATE project_settings SET goal='변조' WHERE project_id=$1",[p.id]),code('23514'));
});
suite('only current published specification baselines can become immutable planning input',async()=>{
  const p=await project(),q=await project(),s=await spec(p),unpublished=await spec(p,{published:false}),conversation=await spec(p,{kind:'conversation'}),foreign=await spec(q);
  await assert.rejects(createReviewedPlan(pool,implementation,p.id,member,body([s])),code('PROJECT_SETTINGS_REQUIRED'));await settings(p);
  await assert.rejects(createReviewedPlan(pool,implementation,p.id,viewer,body([s])),code('FORBIDDEN'));
  await assert.rejects(createReviewedPlan(pool,implementation,p.id,member,body([foreign])),code('NOT_FOUND'));
  for(const invalid of [unpublished,conversation])await assert.rejects(createReviewedPlan(pool,implementation,p.id,member,body([invalid])),code('PUBLISHED_SPECIFICATION_REQUIRED'));
  const plan=await createReviewedPlan(pool,implementation,p.id,member,body([s]));assert.equal(plan.status,'queued');assert.equal(plan.decision,null);assert.equal(plan.input_snapshot.repository.head_sha,'a'.repeat(40));assert.equal(plan.input_snapshot.sources[0].segments[0].text,'회원 가입시 이메일 인증을 수행한다.');
  assert.equal(plan.input_sha256,implementationHash(plan.input_snapshot));
  await assert.rejects(pool.query("UPDATE implementation_plans SET input_snapshot='{}' WHERE id=$1",[plan.id]),code('23514'));
  await assert.rejects(pool.query('DELETE FROM implementation_plans WHERE id=$1',[plan.id]),code('23514'));
  assert.equal((await pool.query('SELECT count(*)::int n FROM implementation_requests WHERE project_id=$1',[p.id])).rows[0].n,0);
});
suite('planning enforces scope limits without truncation and request idempotency under concurrency',async()=>{
  const p=await project();await settings(p);const a=await spec(p),b=await spec(p,{text:'비밀번호는 12자 이상이다.'}),request=body([a,b]);
  for(const r of [a,b])await implementation.reviewSource(p.id,owner,{revision_id:r.revision_id,expected_settings_version:2,usage:'implementation',intended_project_id:p.id,reason:'동시 요청 전 입력 문서 대조'}); const prepared=await implementation.preparePlan(p.id,member,{revision_ids:request.revision_ids});Object.assign(request,{preparation_id:prepared.id,acknowledge_project_sources:true});
  const [one,two]=await Promise.all([implementation.createPlan(p.id,member,request),implementation.createPlan(p.id,member,{...request,revision_ids:[...request.revision_ids].reverse()})]);assert.equal(one.id,two.id);assert.equal([one,two].filter(r=>r.replayed).length,1);
  await assert.rejects(createReviewedPlan(pool,implementation,p.id,member,{...request,revision_ids:[a.revision_id]}),code('IMPLEMENTATION_REQUEST_CONFLICT'));
  await assert.rejects(createReviewedPlan(pool,implementation,p.id,member,body(Array(6).fill(a))),code('INVALID_IMPLEMENTATION_INPUT'));
  const huge=await spec(p,{text:'가'.repeat(40001)});await assert.rejects(createReviewedPlan(pool,implementation,p.id,member,body([huge])),code('IMPLEMENTATION_INPUT_TOO_LARGE'));
  assert.equal((await implementation.listPlans(p.id,viewer)).length,1);
});
suite('plan approval validates result evidence, blocking questions and reviewer permissions',async()=>{
  const p=await project();await settings(p);const s=await spec(p),row=await createReviewedPlan(pool,implementation,p.id,member,body([s]));
  await assert.rejects(implementation.decidePlan(p.id,row.id,reviewer,approval),code('IMPLEMENTATION_PLAN_NOT_READY'));
  await analyzed(p,row,{questions:[{question:'메일 제공자를 지정해야 합니다.',blocking:true}]});
  await assert.rejects(implementation.decidePlan(p.id,row.id,member,approval),code('FORBIDDEN'));
  await assert.rejects(implementation.decidePlan(p.id,row.id,reviewer,{...approval,acknowledge_sources:false}),code('SOURCES_ACK_REQUIRED'));
  await assert.rejects(implementation.decidePlan(p.id,row.id,reviewer,approval),code('IMPLEMENTATION_BLOCKING_QUESTIONS'));
  const bad=result(row);bad.tasks[0].evidence[0].revision_id=randomUUID();await pool.query('UPDATE implementation_plans SET result=$1 WHERE id=$2',[JSON.stringify(bad),row.id]);
  await assert.rejects(implementation.decidePlan(p.id,row.id,reviewer,approval),code('INVALID_IMPLEMENTATION_RESULT'));
  await analyzed(p,row);const approved=await implementation.decidePlan(p.id,row.id,reviewer,approval);assert.equal(approved.status,'approved');assert.equal((await implementation.decidePlan(p.id,row.id,owner,approval)).decision.actor_id,reviewer);
  await assert.rejects(implementation.decidePlan(p.id,row.id,owner,{...approval,reason:'다른 이유'}),code('DECISION_IMMUTABLE'));
  await assert.rejects(pool.query("UPDATE implementation_plans SET result='{}' WHERE id=$1",[row.id]),code('23514'));
});
suite('settings, HEAD and published baseline changes invalidate plans and execution',async()=>{
  for(const change of ['settings','head','baseline']){
    const p=await project();await settings(p);const source=await spec(p),row=await createReviewedPlan(pool,implementation,p.id,member,body([source]));await analyzed(p,row);await implementation.decidePlan(p.id,row.id,reviewer,approval);
    if(change==='settings')await implementation.saveSettings(p.id,owner,config(2,{goal:'목표 변경'}));
    if(change==='head')await implementation.recordRepositoryCheck(p.id,owner,2,{status:'ready',head_sha:'b'.repeat(40),checked_at:new Date().toISOString()});
    if(change==='baseline'){const next=await spec(p,{document_id:source.document_id,published:false,text:'회원 가입 시 전화 인증을 한다.'});await pool.query('UPDATE documents SET baseline_revision_id=$1 WHERE id=$2',[next.revision_id,source.document_id]);}
    const stale=await implementation.getPlan(p.id,row.id,viewer);assert.ok(stale.stale_reasons.includes({settings:'SETTINGS_CHANGED',head:'REPOSITORY_HEAD_CHANGED',baseline:'BASELINE_CHANGED'}[change]));
    await assert.rejects(implementation.requestExecution(p.id,row.id,reviewer,execution),code('IMPLEMENTATION_PLAN_STALE'));
    assert.ok((await getImplementationStaleReasons(pool,p.id,row.input_snapshot)).length);
  }
});
suite('empty/unverified repository supports blocking plans and verified HEAD requires a new plan',async()=>{
  const p=await project();await settings(p,false);const source=await spec(p),row=await createReviewedPlan(pool,implementation,p.id,member,body([source]));assert.equal(row.input_snapshot.repository.status,'unchecked');assert.equal(row.input_snapshot.repository.head_sha,null);
  await analyzed(p,row,{questions:[{question:'저장소와 기준 브랜치를 확인해야 합니다.',blocking:true}]});
  await assert.rejects(implementation.decidePlan(p.id,row.id,reviewer,approval),code('IMPLEMENTATION_BLOCKING_QUESTIONS'));
  await assert.rejects(implementation.requestExecution(p.id,row.id,owner,execution),code('IMPLEMENTATION_APPROVAL_REQUIRED'));
  await implementation.recordRepositoryCheck(p.id,owner,2,{status:'empty',head_sha:null,checked_at:new Date().toISOString()});
  const emptyPlan=await createReviewedPlan(pool,implementation,p.id,member,body([source]));assert.equal(emptyPlan.input_snapshot.repository.status,'empty');
  await analyzed(p,emptyPlan,{questions:[{question:'빈 저장소의 초기 구성을 확정해야 합니다.',blocking:true}]});await assert.rejects(implementation.decidePlan(p.id,emptyPlan.id,reviewer,approval),code('IMPLEMENTATION_BLOCKING_QUESTIONS'));
  await implementation.recordRepositoryCheck(p.id,owner,2,{status:'ready',head_sha:'a'.repeat(40),checked_at:new Date().toISOString()});assert.deepEqual((await implementation.getPlan(p.id,row.id,viewer)).stale_reasons,['REPOSITORY_HEAD_CHANGED']);
});
suite('execution is explicit, one-per-approved-plan and preserves immutable approval snapshots',async()=>{
  const p=await project();await settings(p);const source=await spec(p),row=await createReviewedPlan(pool,implementation,p.id,member,body([source]));await analyzed(p,row);
  await assert.rejects(implementation.requestExecution(p.id,row.id,owner,execution),code('IMPLEMENTATION_APPROVAL_REQUIRED'));await implementation.decidePlan(p.id,row.id,reviewer,approval);
  await assert.rejects(implementation.requestExecution(p.id,row.id,member,execution),code('FORBIDDEN'));
  await assert.rejects(implementation.requestExecution(p.id,row.id,owner,{...execution,acknowledge_code_execution:false}),code('EXECUTION_ACK_REQUIRED'));
  const [one,two]=await Promise.all([implementation.requestExecution(p.id,row.id,owner,execution),implementation.requestExecution(p.id,row.id,reviewer,execution)]);
  assert.equal(one.id,two.id);assert.equal(one.status,'awaiting_runner');assert.equal(one.input_snapshot.approval.actor_id,reviewer);assert.equal(one.input_snapshot.repository.head_sha,'a'.repeat(40));assert.equal(one.input_sha256,implementationHash(one.input_snapshot));
  await assert.rejects(implementation.requestExecution(p.id,row.id,owner,{...execution,reason:'다른 요청'}),code('IMPLEMENTATION_REQUEST_CONFLICT'));
  assert.equal((await implementation.listRequests(p.id,viewer)).length,1);
  await assert.rejects(implementation.getRequest(p.id,one.id,outsider),code('FORBIDDEN'));
  const q=await project();await assert.rejects(implementation.getRequest(q.id,one.id,owner),code('NOT_FOUND'));
  await assert.rejects(pool.query("UPDATE implementation_requests SET input_snapshot='{}' WHERE id=$1",[one.id]),code('23514'));
  await pool.query("UPDATE implementation_requests SET status='failed',error_code='TEST_FAILURE',completed_at=now() WHERE id=$1",[one.id]);
  await assert.rejects(pool.query("UPDATE implementation_requests SET status='awaiting_runner' WHERE id=$1",[one.id]),code('23514'));
});
suite('execution request and audit are atomic on final insertion failure',async()=>{
  const p=await project();await settings(p);const source=await spec(p),row=await createReviewedPlan(pool,implementation,p.id,member,body([source]));await analyzed(p,row);await implementation.decidePlan(p.id,row.id,owner,approval);
  await pool.query("CREATE FUNCTION fail_execution_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='implementation.execution_requested' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_execution BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_execution_test()");
  try{await assert.rejects(implementation.requestExecution(p.id,row.id,owner,execution),/forced audit failure/);}finally{await pool.query('DROP TRIGGER fail_execution ON events; DROP FUNCTION fail_execution_test()');}
  assert.equal((await implementation.listRequests(p.id,viewer)).length,0);assert.equal((await implementation.getPlan(p.id,row.id,viewer)).status,'approved');
});

suite('new plan admission is project-scoped, serialized at 20 per hour and permits exact replays',async()=>{
  const p=await project();await settings(p);const source=await spec(p),original=body([source]);
  await createReviewedPlan(pool,implementation,p.id,member,original);
  for(let i=1;i<19;i++)await createReviewedPlan(pool,implementation,p.id,member,body([source]));
  const final=await Promise.allSettled([createReviewedPlan(pool,implementation,p.id,member,body([source])),createReviewedPlan(pool,implementation,p.id,reviewer,body([source]))]);
  assert.equal(final.filter(r=>r.status==='fulfilled').length,1);const rejected=final.find(r=>r.status==='rejected');assert.equal(rejected.reason.code,'IMPLEMENTATION_RATE_LIMIT');assert.equal(rejected.reason.status,429);
  assert.equal((await implementation.listPlans(p.id,viewer)).length,20);
  assert.equal((await createReviewedPlan(pool,implementation,p.id,member,original)).id,original.request_id);
  const another=await spec(p,{text:'추가 기획'});
  await assert.rejects(createReviewedPlan(pool,implementation,p.id,member,{...original,revision_ids:[another.revision_id]}),code('IMPLEMENTATION_REQUEST_CONFLICT'));
  await assert.rejects(createReviewedPlan(pool,implementation,p.id,member,body([source])),code('IMPLEMENTATION_RATE_LIMIT'));
  const q=await project();await settings(q);const qSource=await spec(q);assert.equal((await createReviewedPlan(pool,implementation,q.id,member,body([qSource]))).status,'queued');
});
