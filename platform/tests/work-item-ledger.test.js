'use strict';
const {createReviewedPlan}=require('./implementation-source-fixture');
// Legacy behavior tests isolate pre-existing state rules; mandatory governance is covered by work-execution HTTP tests.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {createImplementationLedger}=require('../server/implementation-ledger');
const {createWorkItemLedger}=require('../server/work-item-ledger');
const url=process.env.TEST_DATABASE_URL,suite=url?test:test.skip,code=value=>error=>error.code===value;
let admin,pool,ledger,implementation,work,schema,owner,reviewer,member,otherMember,viewer,outsider;
before(async()=>{
  if(!url)return;
  schema='work_items_'+randomUUID().replaceAll('-','');admin=createPool(url);await admin.query(`CREATE SCHEMA ${schema}`);
  pool=createPool({connectionString:url,options:`-c search_path=${schema}`});await migrate(pool);
  ledger=createLedger(pool);implementation=createImplementationLedger(pool,{requireGovernance:false});work=createWorkItemLedger(pool,{requireGovernance:false});
  const users=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('owner@work.test','관리자','unused'),('reviewer@work.test','검토자','unused'),('member@work.test','담당자','unused'),('other@work.test','다른 담당자','unused'),('viewer@work.test','조회자','unused'),('outsider@work.test','외부인','unused') RETURNING id,email")).rows;
  [owner,reviewer,member,otherMember,viewer,outsider]=['owner','reviewer','member','other','viewer','outsider'].map(name=>users.find(user=>user.email.startsWith(name+'@')).id);
});
after(async()=>{if(!url)return;if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
async function fixture({approved=true,count=2,dependencies=true}={}){
  const p=await ledger.createProject(owner,{name:'기능별 작업 관리'});
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'reviewer'),($1,$3,'member'),($1,$4,'member'),($1,$5,'viewer')",[p.id,reviewer,member,otherMember,viewer]);
  await implementation.saveSettings(p.id,owner,{expected_version:1,project_kind:'client_project',goal:'기획에 따라 이메일 인증과 권한을 구현한다.',repository_url:'https://github.com/ct-kailey/nora-flow.git',base_branch:'main'});
  await implementation.recordRepositoryCheck(p.id,owner,2,{status:'ready',head_sha:'a'.repeat(40),checked_at:new Date().toISOString()});
  const record=await ledger.createRecord(p.id,member,{title:'회원 기획',record_kind:'specification',text:'회원 가입에 이메일 인증과 역할별 권한을 적용한다.'});
  const revision=await ledger.getRevision(p.id,record.revision_id);
  const doc={schema_version:'1.0',project_id:p.id,document_id:record.document_id,revision_id:revision.id,source:{filename:revision.filename,mime_type:revision.mime_type,sha256:revision.sha256},segments:[{segment_id:'s1',requirement_key:'REQ-001',text:'회원 가입에 이메일 인증과 역할별 권한을 적용한다.',locator:{kind:'text',label:'본문'},extraction_status:'ok'}],extraction:{complete:true,warnings:[]},normalization:{status:'ready',warnings:[],segment_count:1}};
  await pool.query("UPDATE revisions SET status='ready',document_json=$1 WHERE id=$2",[JSON.stringify(doc),revision.id]);
  await pool.query("UPDATE jobs SET status='succeeded' WHERE id=$1",[record.job_id]);
  await ledger.publishInitial(p.id,revision.id,reviewer,{reason:'기획 검토 완료',acknowledge_extraction:true});
  const plan=await createReviewedPlan(pool,implementation,p.id,member,{request_id:randomUUID(),revision_ids:[revision.id]});
  const result={title:'회원 기능 구현',summary:'기획서 기준 작업 목록',tasks:Array.from({length:count},(_,i)=>({id:'TASK-'+(i+1),title:'회원 기능 '+(i+1),description:'기획에 따라 기능을 구현합니다.',acceptance_criteria:['기획한 권한과 인증 정책을 만족한다.'],evidence:[{revision_id:revision.id,segment_id:'s1'}],depends_on:dependencies&&i>0?['TASK-'+i]:[]})),questions:[],assumptions:[],test_strategy:['권한별 성공과 거부 경로를 검증한다.']};
  await pool.query("UPDATE implementation_plans SET status='needs_review',result=$1,trace_id='trc_work_fixture' WHERE id=$2",[JSON.stringify(result),plan.id]);
  if(approved)await implementation.decidePlan(p.id,plan.id,reviewer,{decision:'approved',reason:'기획 근거와 수용 기준 검토',acknowledge_sources:true});
  return {p,record,revision,plan,result};
}
async function imported(options){const f=await fixture(options);f.items=(await work.importPlan(f.p.id,f.plan.id,reviewer,{acknowledge_tasks:true})).items;return f;}
function update(f,item,extra={},actor=reviewer){return work.update(f.p.id,item.id,actor,{expected_version:item.version,note:'작업 진행 상황을 확인했습니다.',...extra});}
async function finish(f,item){item=await update(f,item,{status:'in_progress'});item=await update(f,item,{status:'qa'});return update(f,item,{status:'done',qa_evidence:'수용 기준의 성공·실패 경로 테스트와 변경안을 확인했습니다.'});}

suite('imports require fresh approved plans, reviewer confirmation and project scope',async()=>{
  const f=await fixture({approved:false});
  await assert.rejects(work.importPlan(f.p.id,f.plan.id,reviewer,{acknowledge_tasks:true}),code('IMPLEMENTATION_APPROVAL_REQUIRED'));
  await implementation.decidePlan(f.p.id,f.plan.id,reviewer,{decision:'approved',reason:'검토 완료',acknowledge_sources:true});
  for(const user of [member,viewer,outsider])await assert.rejects(work.importPlan(f.p.id,f.plan.id,user,{acknowledge_tasks:true}),code('FORBIDDEN'));
  await assert.rejects(work.importPlan(f.p.id,f.plan.id,reviewer,{acknowledge_tasks:false}),code('WORK_ITEM_ACK_REQUIRED'));
  const foreign=await fixture();await assert.rejects(work.importPlan(f.p.id,foreign.plan.id,reviewer,{acknowledge_tasks:true}),code('NOT_FOUND'));
  await implementation.recordRepositoryCheck(f.p.id,owner,2,{status:'ready',head_sha:'b'.repeat(40),checked_at:new Date().toISOString()});
  await assert.rejects(work.importPlan(f.p.id,f.plan.id,reviewer,{acknowledge_tasks:true}),code('WORK_ITEM_PLAN_STALE'));
  assert.deepEqual((await work.list(f.p.id,viewer)).items,[]);
});

suite('concurrent whole-plan imports are idempotent and source snapshots stay immutable',async()=>{
  const f=await fixture();const results=await Promise.all([work.importPlan(f.p.id,f.plan.id,owner,{acknowledge_tasks:true}),work.importPlan(f.p.id,f.plan.id,reviewer,{acknowledge_tasks:true})]);
  assert.equal(results.filter(result=>result.replayed).length,1);
  assert.deepEqual(results[0].items.map(item=>item.id),results[1].items.map(item=>item.id));
  const items=results[0].items;assert.equal(items.length,2);assert.deepEqual(items[0].source_task,f.result.tasks[0]);assert.equal(items[0].status,'todo');assert.equal(items[0].version,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM work_item_events WHERE project_id=$1',[f.p.id])).rows[0].n,2);
  for(const sql of ["UPDATE work_items SET source_task='{}',version=version+1 WHERE id=$1",'DELETE FROM work_items WHERE id=$1','UPDATE work_items SET version=version+2 WHERE id=$1'])await assert.rejects(pool.query(sql,[items[0].id]),code('23514'));
  assert.equal((await pool.query('SELECT count(*)::int n FROM implementation_requests WHERE project_id=$1',[f.p.id])).rows[0].n,0);
});

suite('list/detail expose evidence and project names without account emails',async()=>{
  const f=await imported();const list=await work.list(f.p.id,viewer),item=await work.get(f.p.id,f.items[1].id,viewer);
  assert.equal(list.members.length,4);assert.ok(list.members.every(value=>Object.keys(value).sort().join(',')==='id,name,role'));
  assert.equal(JSON.stringify(list).includes('@work.test'),false);assert.equal(JSON.stringify(item).includes('@work.test'),false);
  assert.equal(item.dependencies[0].id,f.items[0].id);assert.equal(item.evidence_context[0].text,'회원 가입에 이메일 인증과 역할별 권한을 적용한다.');assert.equal(item.history[0].kind,'imported');
  await assert.rejects(work.list(f.p.id,outsider),code('FORBIDDEN'));await assert.rejects(work.get(f.p.id,item.id,outsider),code('FORBIDDEN'));
  const other=await imported();await assert.rejects(work.get(other.p.id,item.id,reviewer),code('NOT_FOUND'));
  await assert.rejects(work.update(other.p.id,item.id,reviewer,{expected_version:1,note:'타 프로젝트 수정'}),code('NOT_FOUND'));
  await assert.rejects(pool.query('UPDATE work_items SET assignee_id=$1,version=version+1 WHERE id=$2',[outsider,item.id]),code('23503'));
});

suite('only project writers are assignable and assigned members cannot change assignment, dates or final approval',async()=>{
  const f=await imported();let item=f.items[0];
  for(const actor of [member,otherMember,viewer,outsider])await assert.rejects(update(f,item,{status:'in_progress'},actor),code('FORBIDDEN'));
  for(const assignee_id of [viewer,outsider])await assert.rejects(update(f,item,{assignee_id}),code('WORK_ITEM_ASSIGNEE_INVALID'));
  item=await update(f,item,{assignee_id:member,due_on:'2026-10-02'});assert.equal(item.assignee_name,'담당자');assert.equal(item.due_on,'2026-10-02');
  for(const extra of [{assignee_id:member},{due_on:'2026-10-02'},{qa_evidence:'검증'},{status:'done'}])await assert.rejects(update(f,item,extra,member),code('FORBIDDEN'));
  item=await update(f,item,{status:'in_progress'},member);assert.equal(item.status,'in_progress');
  item=await update(f,item,{status:'blocked',blocker:'고객의 인증 메일 문구 확인 필요'},member);assert.equal(item.blocker,'고객의 인증 메일 문구 확인 필요');
  item=await update(f,item,{status:'in_progress'},member);assert.equal(item.blocker,'');
  item=await update(f,item,{status:'qa'},member);await assert.rejects(update(f,item,{status:'done',qa_evidence:'테스트 완료'},member),code('FORBIDDEN'));
  item=await update(f,item,{status:'done',qa_evidence:'수용 기준과 테스트 결과 대조 완료'});assert.equal(item.status,'done');
  item=await update(f,item,{assignee_id:null,due_on:null});assert.equal(item.assignee_id,null);assert.equal(item.due_on,null);
});

suite('concurrent versions prevent lost updates and notes append ordered before/after history',async()=>{
  const f=await imported(),item=f.items[0];
  const outcomes=await Promise.allSettled([update(f,item,{due_on:'2026-10-03'}),update(f,item,{due_on:'2026-10-04'})]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);assert.equal(outcomes.find(result=>result.status==='rejected').reason.code,'WORK_ITEM_VERSION_CONFLICT');
  let current=await work.get(f.p.id,item.id,viewer);assert.equal(current.version,2);assert.equal(current.history.length,2);
  current=await update(f,current,{note:'고객과 완료 예정일을 다시 확인했습니다.'});assert.equal(current.version,3);assert.deepEqual(current.history.map(event=>event.version),[3,2,1]);
  assert.equal(current.history[1].before.due_on,null);assert.equal(current.history[1].after.due_on,current.due_on);
  for(const sql of ['DELETE FROM work_item_events WHERE work_item_id=$1',"UPDATE work_item_events SET note='덮어쓰기' WHERE work_item_id=$1"])await assert.rejects(pool.query(sql,[item.id]),code('23514'));
});

suite('QA requires reviewer evidence, completed dependencies, and safe reverse dependency reopening',async()=>{
  const f=await imported({count:3});let [first,second,third]=f.items;
  await assert.rejects(update(f,first,{status:'done',qa_evidence:'QA 완료'}),code('WORK_ITEM_INVALID_TRANSITION'));
  await assert.rejects(update(f,second,{status:'in_progress'}),code('WORK_ITEM_DEPENDENCIES_PENDING'));
  first=await update(f,first,{status:'in_progress'});first=await update(f,first,{status:'qa'});
  await assert.rejects(update(f,first,{status:'done'}),code('WORK_ITEM_QA_EVIDENCE_REQUIRED'));
  first=await update(f,first,{status:'done',qa_evidence:'로그인 성공과 실패 테스트 모두 통과'});
  second=await update(f,second,{status:'in_progress'});await assert.rejects(update(f,first,{status:'todo'}),code('WORK_ITEM_REOPEN_BLOCKED'));
  second=await update(f,second,{status:'qa'});second=await update(f,second,{status:'done',qa_evidence:'역할별 접근 제한 검증'});
  third=await update(f,third,{status:'in_progress'});await assert.rejects(update(f,second,{status:'todo'}),code('WORK_ITEM_REOPEN_BLOCKED'));
  third=await update(f,third,{status:'blocked',blocker:'상위 기능 재검토'});second=await update(f,second,{status:'todo'});first=await update(f,first,{status:'todo'});
  assert.equal(first.status,'todo');await assert.rejects(update(f,third,{status:'qa'}),code('WORK_ITEM_DEPENDENCIES_PENDING'));
});

suite('changed settings, baseline and repository retain history but block progress and first imports',async()=>{
  for(const change of ['settings','baseline','head']){
    const f=await imported();let item=await update(f,f.items[0],{status:'in_progress'});
    if(change==='settings')await implementation.saveSettings(f.p.id,owner,{expected_version:2,goal:'변경된 목표',repository_url:'https://github.com/ct-kailey/nora-flow.git',base_branch:'main'});
    if(change==='head')await implementation.recordRepositoryCheck(f.p.id,owner,2,{status:'ready',head_sha:'b'.repeat(40),checked_at:new Date().toISOString()});
    if(change==='baseline')await pool.query('UPDATE documents SET baseline_revision_id=NULL WHERE id=$1',[f.record.document_id]);
    const expected={settings:'SETTINGS_CHANGED',baseline:'BASELINE_CHANGED',head:'REPOSITORY_HEAD_CHANGED'}[change];
    assert.ok((await work.get(f.p.id,item.id,viewer)).stale_reasons.includes(expected));
    await assert.rejects(update(f,item,{status:'qa'}),code('WORK_ITEM_PLAN_STALE'));
    item=await update(f,item,{note:'원본 변경으로 재검토합니다.',assignee_id:member,due_on:'2026-10-05'});
    item=await update(f,item,{status:'blocked',blocker:'변경 기획 검토 대기'},member);
    assert.equal(item.status,'blocked');assert.equal(item.history.length,4);
    const replay=await work.importPlan(f.p.id,f.plan.id,reviewer,{acknowledge_tasks:true});assert.equal(replay.replayed,true);assert.equal(replay.items.length,2);assert.ok(replay.items[0].stale_reasons.includes(expected));
    await assert.rejects(update(f,item,{status:'in_progress'},member),code('WORK_ITEM_PLAN_STALE'));
    item=await update(f,item,{status:'todo'},member);assert.equal(item.status,'todo');
  }
});

suite('calendar dates and blocked reasons validate without inventing timestamps',async()=>{
  const f=await imported();let item=f.items[0];
  for(const due_on of ['2026-02-29','2026-04-31','2026-1-01','2026-01-01T00:00:00Z','0000-01-01','10000-01-01',123,''])await assert.rejects(update(f,item,{due_on}),code('INVALID_WORK_ITEM_DATE'));
  item=await update(f,item,{due_on:'2028-02-29'});assert.equal(item.due_on,'2028-02-29');assert.equal(item.history[0].after.due_on,'2028-02-29');
  await assert.rejects(update(f,item,{status:'blocked'}),code('WORK_ITEM_BLOCKER_REQUIRED'));
  await assert.rejects(update(f,item,{blocker:'미확정'}),code('INVALID_WORK_ITEM_INPUT'));
  await assert.rejects(update(f,item,{note:' '}),code('INVALID_WORK_ITEM_INPUT'));
  await assert.rejects(update(f,item,{status:'invalid'}),code('INVALID_WORK_ITEM_INPUT'));
  await assert.rejects(update(f,item,{qa_evidence:'test'}),code('INVALID_WORK_ITEM_INPUT'));
});

suite('audit failures roll back work item updates and full-plan imports atomically',async()=>{
  const f=await imported(),fresh=await fixture();
  await pool.query("CREATE FUNCTION fail_work_item_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind LIKE 'work_item.%' THEN RAISE EXCEPTION 'forced work audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_work_item_audit BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_work_item_audit_test()");
  try{
    await assert.rejects(update(f,f.items[0],{due_on:'2026-10-10'}),/forced work audit failure/);
    await assert.rejects(work.importPlan(fresh.p.id,fresh.plan.id,reviewer,{acknowledge_tasks:true}),/forced work audit failure/);
  }finally{await pool.query('DROP TRIGGER fail_work_item_audit ON events; DROP FUNCTION fail_work_item_audit_test()');}
  const item=await work.get(f.p.id,f.items[0].id,viewer);assert.equal(item.version,1);assert.equal(item.history.length,1);assert.equal(item.due_on,null);
  assert.equal((await work.list(fresh.p.id,viewer)).items.length,0);assert.equal((await pool.query('SELECT count(*)::int n FROM work_item_events WHERE project_id=$1',[fresh.p.id])).rows[0].n,0);
});

suite('board staleness queries stay bounded as the number of imported plans grows',async()=>{
  const f=await imported();let queries=0;
  const counted=createWorkItemLedger({query(...args){queries++;return pool.query(...args);}});
  await counted.list(f.p.id,viewer);const singlePlanQueries=queries;
  for(let index=0;index<3;index++){
    const plan=await createReviewedPlan(pool,implementation,f.p.id,member,{request_id:randomUUID(),revision_ids:[f.revision.id]});
    await pool.query("UPDATE implementation_plans SET status='needs_review',result=$1,trace_id='trc_work_batch' WHERE id=$2",[JSON.stringify(f.result),plan.id]);
    await implementation.decidePlan(f.p.id,plan.id,reviewer,{decision:'approved',reason:'기획 근거 검토',acknowledge_sources:true});
    await work.importPlan(f.p.id,plan.id,reviewer,{acknowledge_tasks:true});
  }
  queries=0;const list=await counted.list(f.p.id,viewer);assert.equal(list.items.length,8);assert.equal(queries,singlePlanQueries);assert.ok(queries<=6);
  await implementation.recordRepositoryCheck(f.p.id,owner,2,{status:'ready',head_sha:'b'.repeat(40),checked_at:new Date().toISOString()});
  assert.ok((await counted.list(f.p.id,viewer)).items.every(item=>item.stale_reasons.includes('REPOSITORY_HEAD_CHANGED')));
});
