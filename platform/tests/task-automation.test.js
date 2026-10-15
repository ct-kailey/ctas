'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate,transaction}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {queueBinding}=require('../server/project-nora');
const A=require('../server/task-automation');
const {createTaskAutomationWorker}=require('../server/task-automation-worker');
const BASE='a'.repeat(40),HEAD='b'.repeat(40),MERGE='c'.repeat(40);

test('task artifact validation binds repository, preview origin, source commit, task and checks',()=>{
 const row={id:randomUUID(),project_id:'p',input_sha256:'a'.repeat(64),input_snapshot:{repository:{url:'https://github.com/acme/demo.git',head_sha:BASE,base_branch:'main'},automation:{preview_origins:['https://preview.example.test']}}};
 const output={schema_version:'1.0',project_id:'p',task_id:row.id,input_sha256:row.input_sha256,trace_id:'trc_synthetic_12345678',artifact:{pr_number:12,pr_url:'https://github.com/acme/demo/pull/12',head_sha:HEAD,base_sha:BASE,target_branch:'main',preview_url:'https://preview.example.test/build/12',diff:'diff --git a/a b/a\n+change',checks:[{name:'tests',status:'passed'}]}};
 assert.equal(A.validateArtifact(output,row).head_sha,HEAD);
 for(const mutation of [{pr_url:'https://github.com/other/repo/pull/12'},{base_sha:HEAD},{target_branch:'other'},{preview_url:'https://evil.test/build'},{checks:[]},{diff:''}]) assert.throws(()=>A.validateArtifact({...output,artifact:{...output.artifact,...mutation}},row));
 assert.throws(()=>A.validateArtifact({...output,project_id:'foreign'},row),{code:'TASK_DEVELOPMENT_SCOPE_MISMATCH'});
 row.artifact=A.validateArtifact(output,row);
 assert.throws(()=>A.validateMerge({project_id:'p',task_id:row.id,input_sha256:row.input_sha256,head_sha:HEAD,target_branch:'main',pr_number:12,merged:false},row),{code:'TASK_MERGE_NOT_CONFIRMED'});
});

test('policy automation creates reviewed drafts or tasks and merges only exact approved evidence', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const schema='task_auto_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);let pool;
 t.after(async()=>{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
 await admin.query(`CREATE SCHEMA ${schema}`);pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
 const users={};for(const role of ['owner','reviewer','member','viewer','outsider'])users[role]=(await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[role+'@automation.test',role,'unused'])).rows[0].id;
 const ledger=createLedger(pool),calls=[];
 function remote(overrides={}) {return {
  async capabilities(){return {risk_analysis:true,development:true,merge:true,blockers:[]};},
  async analyzeRisk(i){calls.push(['risk',i]);return {schema_version:'1.0',project_id:i.projectId,request_id:i.requestId,input_sha256:i.snapshotHash,trace_id:'trc_risk_synthetic12345',risks:[],questions:[],tasks:[{title:'정책 구현',description:'승인된 정책 요구사항 구현',acceptance_criteria:['원문 요구사항 검증'],evidence:[{segment_id:'s1',quote:'승인 조건'}]}]};},
  async develop(i){calls.push(['develop',i]);return {schema_version:'1.0',project_id:i.projectId,task_id:i.taskId,input_sha256:i.snapshotHash,trace_id:'trc_develop_synthetic123',artifact:{pr_number:12,pr_url:'https://github.com/acme/demo/pull/12',head_sha:HEAD,base_sha:BASE,target_branch:'main',preview_url:'https://preview.example.test/build/12',diff:'diff --git a/a b/a\n+policy implementation',checks:[{name:'unit tests',status:'passed'}]}};},
  async merge(i){calls.push(['merge',i]);return {project_id:i.projectId,task_id:i.taskId,input_sha256:i.snapshotHash,pr_number:12,head_sha:i.expectedHeadSha,target_branch:i.targetBranch,merged:true,merge_commit_sha:MERGE};},
  async reconcileMerge(i){calls.push(['reconcile',i]);return {project_id:i.projectId,task_id:i.taskId,input_sha256:i.snapshotHash,pr_number:12,head_sha:i.expectedHeadSha,target_branch:i.targetBranch,merged:true,merge_commit_sha:MERGE};},...overrides};}
 async function fixture({provider=remote(),category='policy',complete=true,mode='strict',policyText='승인 조건을 만족해야 한다.'}={}) {
  const p=await transaction(pool,async db=>{const p=(await db.query("INSERT INTO projects(name) VALUES('합성 정책 자동화') RETURNING id")).rows[0].id;for(const role of ['owner','reviewer','member','viewer'])await db.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,users[role],role]);await queueBinding(db,p,users.owner,'t_'+randomUUID().replaceAll('-',''));await db.query("UPDATE project_nora_workspaces SET status='ready',stage='complete',space_id=$2,connector_id='synthetic_github' WHERE project_id=$1",[p,'space_'+p]);await db.query("UPDATE project_settings SET goal='정책 구현',repository_url='https://github.com/acme/demo.git',base_branch='main',version=version+1 WHERE project_id=$1",[p]);await db.query("UPDATE project_settings SET repository_check=$2 WHERE project_id=$1",[p,{status:'ready',head_sha:BASE,credential_source:'nora'}]);return p;});
  const legacyProvider=provider;
  provider={...legacyProvider,async analyzeRisk(input){
   const raw=await legacyProvider.analyzeRisk(input);
   return {...raw,schema_version:input.snapshot.schema_version,temporary_decisions:raw.temporary_decisions||[],work_gaps:raw.work_gaps||[],risks:raw.risks.map((r,i)=>({id:r.id||'risk'+i,category:'business_rule',deferred_by:null,...r})),questions:raw.questions.map((q,i)=>({id:q.id||'question'+i,category:'business_rule',deferred_by:null,...q}))};
  },async develop(input){
   const raw=await legacyProvider.develop(input),report=raw.implementation_report||{completion:'complete',remaining_criteria:[],notes:[]};
   const notes=report.notes.map(n=>({...n,question_ids:input.developmentContext.questions.map(q=>q.id),implemented_at:null,code_paths:n.kind==='temporary_decision'?['a']:[]}));
   return {...raw,schema_version:'3.0',development_context_sha256:require('../server/context-contract').hash(input.developmentContext),implementation_report:{...report,contract_version:'3.0',notes,question_outcomes:input.developmentContext.questions.map(q=>({question_id:q.id,status:notes.some(n=>n.kind==='temporary_decision')?'temporary_implemented':notes.some(n=>n.kind==='work_gap')?'deferred':'not_applicable',note_ids:notes.map(n=>n.id),explanation:'합성 테스트에서 실제 반환한 구현 결과와 연결'}))}};
  }};
  const service=A.createTaskAutomation({pool,provider});await service.saveSettings(p,users.owner,{expected_version:1,enabled:true,risk_flow_slug:null,development_flow_slug:'project-development',preview_origins:['https://preview.example.test'],uncertainty_mode:mode});
  const source=await ledger.createRecord(p,users.owner,{title:'정책서',document_category:category,text:policyText});
  const rev=(await pool.query('SELECT * FROM revisions WHERE id=$1',[source.revision_id])).rows[0];
  const document={schema_version:'1.0',project_id:p,document_id:source.document_id,revision_id:rev.id,source:{filename:rev.filename,mime_type:rev.mime_type,sha256:rev.sha256},segments:[{segment_id:'s1',requirement_key:'REQ-1',text:policyText,locator:{kind:'text',label:'본문'},extraction_status:'ok',normalized_text:policyText}],extraction:{complete,warnings:['CONTENT_IS_UNTRUSTED','MOCK_DATA_UNVERIFIED']},normalization:{status:'needs_review',warnings:['CONTENT_IS_UNTRUSTED','MOCK_DATA_UNVERIFIED'],segment_count:1}};
  await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1",[rev.id,document]);
  return {p,source,service,provider,worker:createTaskAutomationWorker({pool,provider})};
 }
 async function todo(f){await f.worker.runOnce();const view=await f.service.overview(f.p,users.owner);assert.equal(view.tasks.length,1);return view.tasks[0];}
 async function qa(f){const task=await todo(f);await f.service.transition(f.p,users.member,task.id,{expected_version:task.version,status:'in_progress'});await f.worker.runOnce();return f.service.getTask(f.p,users.owner,task.id);}

 await t.test('only future ready policy documents autoqueue; informational warnings remain analyzable',async()=>{
  const f=await fixture();assert.equal((await pool.query('SELECT * FROM task_automation_intake WHERE project_id=$1',[f.p])).rows.length,1);
  const r=await todo(f);assert.equal(r.status,'todo');assert.equal((await f.service.overview(f.p,users.viewer)).analyses[0].status,'completed');
  assert.equal((await pool.query('SELECT count(*) n FROM project_questions WHERE project_id=$1',[f.p])).rows[0].n,'0');
  const nonPolicy=await fixture({category:'meeting'});assert.equal((await pool.query('SELECT * FROM task_automation_intake WHERE project_id=$1',[nonPolicy.p])).rowCount,0);
  await assert.rejects(nonPolicy.service.analyze(nonPolicy.p,users.owner,{revision_id:nonPolicy.source.revision_id,request_id:randomUUID()}),{code:'TASK_POLICY_REQUIRED'});
 });
 await t.test('fresh request IDs for identical evidence reuse one analysis and durable request identities',async()=>{
  const f=await fixture(),r=await todo(f),first=(await f.service.overview(f.p,users.owner)).analyses[0],request=randomUUID();
  const again=await f.service.analyze(f.p,users.member,{revision_id:f.source.revision_id,request_id:request});assert.equal(again.id,first.id);
  const replay=await f.service.analyze(f.p,users.member,{revision_id:f.source.revision_id,request_id:request});assert.equal(replay.id,first.id);
  await assert.rejects(f.service.analyze(f.p,users.owner,{revision_id:f.source.revision_id,request_id:request}),{code:'TASK_REQUEST_CONFLICT'});
  await f.worker.runOnce();assert.equal((await f.service.overview(f.p,users.owner)).tasks.length,1);assert.equal(calls.filter(c=>c[0]==='risk'&&c[1].projectId===f.p).length,1);
  const config=(await f.service.overview(f.p,users.owner)).settings;
  await f.service.saveSettings(f.p,users.owner,{expected_version:config.version,enabled:true,risk_flow_slug:'reviewed-policy-flow',development_flow_slug:config.development_flow_slug,preview_origins:config.preview_origins});
  const fresh=await f.service.analyze(f.p,users.owner,{revision_id:f.source.revision_id,request_id:randomUUID()});assert.notEqual(fresh.id,first.id);
  await f.worker.runOnce();assert.equal((await f.service.overview(f.p,users.owner)).tasks.length,2);
  await assert.rejects(f.service.transition(f.p,users.member,r.id,{expected_version:r.version,status:'in_progress'}),{code:'TASK_SOURCE_STALE'});
 });
 await t.test('unchecked repositories allow risk planning but development explains the missing verified branch',async()=>{
  const f=await fixture();await pool.query("UPDATE project_settings SET repository_check=NULL WHERE project_id=$1",[f.p]);const r=await todo(f),view=await f.service.overview(f.p,users.owner);
  assert.equal(view.capabilities.risk_analysis,true);assert.equal(view.capabilities.development,false);assert.ok(view.capabilities.blockers.some(b=>b.code==='TASK_REPOSITORY_REQUIRED'));
  await assert.rejects(f.service.transition(f.p,users.member,r.id,{expected_version:r.version,status:'in_progress'}),{code:'TASK_DEVELOPMENT_UNAVAILABLE'});
  const config=view.settings;await f.service.saveSettings(f.p,users.owner,{expected_version:config.version,enabled:true,risk_flow_slug:null,development_flow_slug:null,preview_origins:[]});
  const missing=(await f.service.overview(f.p,users.owner)).capabilities.blockers;assert.ok(missing.some(b=>b.code==='TASK_DEVELOPMENT_FLOW_REQUIRED'));assert.ok(missing.some(b=>b.code==='TASK_PREVIEW_ORIGIN_REQUIRED'));
 });
 await t.test('blocking risk or question creates existing question drafts atomically with no tasks or outbound messages',async()=>{
  const provider=remote({async analyzeRisk(i){const result=await remote().analyzeRisk(i);return {...result,risks:[{id:'risk1',blocking:true,description:'승인 담당자가 불명확함',evidence:[{segment_id:'s1',quote:'승인 조건'}]}],questions:[{question:'승인 담당자는 누구인가요?',evidence:[{segment_id:'s1',quote:'승인 조건'}]}]};}});
  const f=await fixture({provider});await f.worker.runOnce();const view=await f.service.overview(f.p,users.owner);assert.equal(view.analyses[0].status,'blocked');assert.equal(view.tasks.length,0);assert.equal(view.analyses[0].question_ids.length,1);
  const q=(await pool.query('SELECT * FROM project_questions WHERE project_id=$1',[f.p])).rows[0];assert.equal(q.status,'draft');assert.equal(q.asked_at,null);assert.equal(q.blocking,true);assert.equal(q.assigned_to,users.owner);
  assert.equal((await pool.query('SELECT 1 FROM question_deliveries WHERE project_id=$1',[f.p])).rowCount,0);
  await f.worker.runOnce();assert.equal((await pool.query('SELECT 1 FROM project_questions WHERE project_id=$1',[f.p])).rowCount,1);
 });
 await t.test('incomplete extraction blocks analysis and produces no tasks',async()=>{const f=await fixture({complete:false});await f.worker.runOnce();const v=await f.service.overview(f.p,users.owner);assert.equal(v.tasks.length,0);assert.equal(v.intake[0].error_code,'TASK_SOURCE_NOT_READY');});
 await t.test('scope, role and request identity are enforced before analysis or execution',async()=>{
  const f=await fixture(),other=await fixture({category:'meeting'}),request=randomUUID();
  await assert.rejects(f.service.analyze(f.p,users.viewer,{revision_id:f.source.revision_id,request_id:request}),{code:'FORBIDDEN'});
  await assert.rejects(f.service.analyze(f.p,users.owner,{revision_id:other.source.revision_id,request_id:request}),{code:'TASK_SOURCE_NOT_FOUND'});
  const intake=(await pool.query('SELECT request_id FROM task_automation_intake WHERE project_id=$1',[f.p])).rows[0];
  const a=await f.service.analyze(f.p,users.owner,{revision_id:f.source.revision_id,request_id:intake.request_id});const again=await f.service.analyze(f.p,users.owner,{revision_id:f.source.revision_id,request_id:intake.request_id});assert.equal(a.id,again.id);
  await assert.rejects(other.service.analyze(other.p,users.owner,{revision_id:other.source.revision_id,request_id:intake.request_id}),{code:'TASK_REQUEST_CONFLICT'});
  const task=await todo(f);await assert.rejects(f.service.getTask(other.p,users.owner,task.id),{code:'TASK_NOT_FOUND'});await assert.rejects(f.service.transition(f.p,users.viewer,task.id,{status:'in_progress',expected_version:task.version}),{code:'FORBIDDEN'});
 });
 await t.test('TODO move queues development once; QA review checks exact head; completion requires verified merge',async()=>{
  const f=await fixture(),task=await todo(f);const moves=await Promise.all([1,2].map(()=>f.service.transition(f.p,users.member,task.id,{expected_version:task.version,status:'in_progress'})));assert.equal(moves[0].id,moves[1].id);assert.equal((await pool.query("SELECT 1 FROM task_automation_jobs WHERE task_id=$1 AND kind='develop'",[task.id])).rowCount,1);
  await f.worker.runOnce();const review=await f.service.getTask(f.p,users.owner,task.id);assert.equal(review.status,'qa');assert.ok(review.artifact.diff);assert.equal((await f.service.overview(f.p,users.owner)).tasks[0].artifact.diff,undefined);
  await assert.rejects(f.service.transition(f.p,users.owner,task.id,{expected_version:review.version,status:'done'}),{code:'TASK_QA_APPROVAL_REQUIRED'});
  await assert.rejects(f.service.approveMerge(f.p,users.member,task.id,{expected_version:review.version,head_sha:HEAD,note:'검토'}),{code:'FORBIDDEN'});
  await assert.rejects(f.service.approveMerge(f.p,users.reviewer,task.id,{expected_version:review.version,head_sha:BASE,note:'검토'}),{code:'TASK_REVIEW_STALE'});
  const body={expected_version:review.version,head_sha:HEAD,note:'프리뷰와 diff를 검토했습니다.'};await Promise.all([1,2].map(()=>f.service.approveMerge(f.p,users.reviewer,task.id,body)));
  assert.equal((await f.service.getTask(f.p,users.owner,task.id)).status,'qa');await f.worker.runOnce();const done=await f.service.getTask(f.p,users.owner,task.id);assert.equal(done.status,'done');assert.equal(done.merge_result.merge_commit_sha,MERGE);
  const call=calls.filter(c=>c[0]==='merge'&&c[1].taskId===task.id);assert.equal(call.length,1);assert.equal(call[0][1].expectedHeadSha,HEAD);assert.equal(call[0][1].targetBranch,'main');
 });
 await t.test('provisional analysis uses the real provider contract, archives choices, retains partial QA and creates feedback followups without resetting done work',async()=>{
  const {createImplementationNotes}=require('../server/implementation-notes'),{createNoraTaskProvider}=require('../server/nora-task-provider'),V=require('../../nora/task-automation/risk-flow-v2'),{hash}=require('../server/context-contract');
  const flows=new Map(),runs=new Map(),sourceEvidence=[{segment_id:'s1',quote:'목록 정렬 기준은 미정이다.'}];let riskCalls=0;
  const choice={id:'sort-choice',kind:'temporary_decision',category:'ui_behavior',reversible:true,title:'목록 표시 순서',uncertainty:'정렬 기준 미정',temporary_approach:'가나다 순 표시',rationale:'화면 검토가 가능하다.',impact:'표시 순서만 달라진다.',replacement_condition:'정렬 피드백을 받으면 교체',evidence:sourceEvidence};
  const transport={async callTool({name,arguments:args,workspaceId}){
   if(name==='list_flows')return [...flows.values()].map(f=>({id:f.id}));
   if(name==='apply_flow'){flows.set(args.slug,{id:args.slug,payload:args.payload,publishState:{hasUnpublishedChanges:true}});return {};}
   if(name==='publish_flow'){flows.get(args.slug).publishState={publishedVersionId:'v2-published',hasUnpublishedChanges:false};return {};}
   if(name==='get_flow')return structuredClone(flows.get(args.slug));
   if(name==='run_flow'){
    riskCalls++;const request=args.variables.automation_request,input=request.snapshot,followup=!!input.feedback;
    const output={schema_version:input.schema_version,project_id:input.project_id,request_id:input.request_id,input_sha256:request.input_sha256,risks:[],questions:followup?[]:[{id:'sort-question',category:'ui_behavior',question:'표시 순서는 무엇인가?',evidence:sourceEvidence,deferred_by:choice.id}],tasks:[{title:followup?'피드백 정렬 보완':'임시 정렬',description:followup?'구체적인 피드백을 별도 작업으로 구현':'가나다 순 임시 표시',acceptance_criteria:['정렬된 목록 표시'],evidence:sourceEvidence}],temporary_decisions:followup?[]:[{...choice,task_indexes:[0],issue_refs:[{kind:'question',id:'sort-question'}]}],work_gaps:[]};
    const trace='trc_provisional_'+riskCalls;runs.set(trace,{traceId:trace,status:'completed',payload:{tenant_id:workspaceId,graph_slug:args.slug,flow_input:JSON.stringify(request),flow_output:JSON.stringify(output)}});
    return {status:'ok',rawStatus:'completed',traceId:trace,output:JSON.stringify(output)};
   }
   if(name==='get_trace')return runs.get(args.traceId);throw Error(name);
  }};
  const actual=createNoraTaskProvider({pool,provider:transport,git:{}}),provider=remote({analyzeRisk:i=>actual.analyzeRisk(i),async develop(i){assert.equal(i.snapshot.implementation_notes.length,1);const raw=await remote().develop(i);return {...raw,schema_version:'2.0',implementation_report:{contract_version:'2.0',completion:'partial',remaining_criteria:['정렬된 목록 표시'],notes:[choice,{...choice,id:'remaining-sort',kind:'work_gap',temporary_approach:null,title:'최종 정렬 적용 대기'}]}};}});
  const f=await fixture({provider,mode:'provisional',policyText:'목록 정렬 기준은 미정이다.'}),first=await todo(f),notes=createImplementationNotes({pool});
  const detail=await f.service.getTask(f.p,users.owner,first.id);assert.equal(detail.input_snapshot.schema_version,'3.0');assert.equal(detail.input_snapshot.implementation_notes.length,1);assert.equal(hash(detail.input_snapshot),detail.input_sha256);
  let archived=await notes.list(f.p,users.owner,{automation_task_id:first.id});assert.equal(archived.notes.length,0);assert.equal(detail.requires_provisional_confirmation,true);assert.equal((await f.service.startCheck(f.p,users.owner,first.id)).questions.length,1);
  await f.service.transition(f.p,users.member,first.id,{status:'in_progress',expected_version:first.version,provisional_consent:{review_token:(await f.service.startCheck(f.p,users.member,first.id)).review_token}});await f.worker.runOnce();const qa=await f.service.getTask(f.p,users.owner,first.id);assert.equal(qa.status,'qa');assert.equal(qa.artifact.implementation_report.completion,'partial');assert.equal(qa.artifact.implementation_report.remaining_criteria.length,1);
  archived=await notes.list(f.p,users.owner,{automation_task_id:first.id});assert.equal(archived.notes.length,2);
  await f.service.approveMerge(f.p,users.owner,first.id,{expected_version:qa.version,head_sha:HEAD,note:'임시 표시와 미완료 정렬 범위를 확인했습니다.'});await f.worker.runOnce();assert.equal((await f.service.getTask(f.p,users.owner,first.id)).status,'done');
  assert.ok((await notes.list(f.p,users.owner,{automation_task_id:first.id})).notes.every(n=>n.status==='open'));
  const note=archived.notes.find(n=>n.kind==='temporary_decision'),feedback=await notes.feedback(f.p,users.member,note.id,{request_id:randomUUID(),expected_version:note.version,text:'최신순으로 정렬해 주세요.'});
  const request={note_id:note.id,expected_version:feedback.note.version,request_id:randomUUID()};
  await assert.rejects(f.service.analyzeFeedback(f.p,users.viewer,request),{code:'FORBIDDEN'});
  const followup=await f.service.analyzeFeedback(f.p,users.member,request),replay=await f.service.analyzeFeedback(f.p,users.member,request);assert.equal(followup.id,replay.id);assert.equal(followup.status,'queued');
  const frozen=(await pool.query('SELECT input_snapshot FROM task_automation_analyses WHERE id=$1',[followup.id])).rows[0].input_snapshot;
  assert.equal(frozen.feedback.original_task.id,first.id);assert.equal(frozen.feedback.original_task.artifact.pr_url,qa.artifact.pr_url);assert.equal(frozen.feedback.feedback_text,'최신순으로 정렬해 주세요.');
  await f.worker.runOnce();const view=await f.service.overview(f.p,users.owner);assert.equal(view.tasks.length,2);const next=view.tasks.find(r=>r.id!==first.id);assert.equal(next.status,'todo');assert.equal(view.tasks.find(r=>r.id===first.id).status,'done');assert.equal(riskCalls,2);
  const accepted=await notes.review(f.p,users.owner,note.id,{request_id:randomUUID(),expected_version:feedback.note.version+1,status:'accepted',note:'원래 임시 정렬의 검토 기록',result_evidence:[{type:'revision',id:f.source.revision_id,...sourceEvidence[0]}]});
  const freshTask=await f.service.getTask(f.p,users.owner,next.id);await A.assertFresh(pool,f.p,freshTask.input_snapshot,freshTask.input_sha256);
  await notes.feedback(f.p,users.member,note.id,{request_id:randomUUID(),expected_version:accepted.note.version,text:'다시 오래된 순으로 정렬해 주세요.'});
  await assert.rejects(A.assertFresh(pool,f.p,freshTask.input_snapshot,freshTask.input_sha256),{code:'TASK_FEEDBACK_STALE'});
  assert.equal((await f.service.getTask(f.p,users.owner,first.id)).status,'done');
 });
 await t.test('blocked development without PR archives the verified gap and can never enter QA or merge',async()=>{
  const evidence=[{segment_id:'s1',quote:'목록 정렬 기준은 미정이다.'}],gap={id:'gap1',kind:'work_gap',category:'ui_behavior',reversible:true,title:'정렬 구현 미완료',uncertainty:'정렬 기준 미정',temporary_approach:null,rationale:'확인할 정렬 기준이 남았다.',impact:'화면 구현 미완료',replacement_condition:'정렬 기준을 확인하면 보완',evidence};
  const provider=remote({async analyzeRisk(i){return {schema_version:'2.0',project_id:i.projectId,request_id:i.requestId,input_sha256:i.snapshotHash,trace_id:'trc_risk_synthetic12345',risks:[],questions:[],temporary_decisions:[],work_gaps:[],tasks:[{title:'목록',description:'목록 구현',acceptance_criteria:['정렬된 목록 표시'],evidence}]};},async develop(i){return {schema_version:'2.0',project_id:i.projectId,task_id:i.taskId,input_sha256:i.snapshotHash,trace_id:'trc_develop_synthetic123',artifact:null,implementation_report:{contract_version:'2.0',completion:'blocked',remaining_criteria:['정렬된 목록 표시'],notes:[gap]}};}});
  const f=await fixture({provider,mode:'provisional',policyText:'목록 정렬 기준은 미정이다.'}),task=await todo(f);await f.service.transition(f.p,users.member,task.id,{status:'in_progress',expected_version:task.version});await f.worker.runOnce();const blocked=await f.service.getTask(f.p,users.owner,task.id);
  assert.equal(blocked.status,'blocked');assert.equal(blocked.artifact.pr_url,undefined);assert.equal(blocked.artifact.implementation_report.completion,'blocked');
  const records=(await pool.query('SELECT * FROM project_implementation_notes WHERE automation_task_id=$1',[task.id])).rows;assert.equal(records.length,1);assert.equal(records[0].origin,'nora');assert.equal(records[0].status,'open');assert.equal(records[0].trace_id,'trc_develop_synthetic123');
  await assert.rejects(f.service.approveMerge(f.p,users.owner,task.id,{expected_version:blocked.version,head_sha:HEAD,note:'PR 없음'}),{code:'TASK_REVIEW_STALE'});
  const notes=require('../server/implementation-notes').createImplementationNotes({pool}),feedback=await notes.feedback(f.p,users.member,records[0].id,{request_id:randomUUID(),expected_version:records[0].version,text:'최신순으로 목록을 구현해 주세요.'});
  const followup=await f.service.analyzeFeedback(f.p,users.member,{note_id:records[0].id,request_id:randomUUID(),expected_version:feedback.note.version});
  const frozen=(await pool.query('SELECT input_snapshot FROM task_automation_analyses WHERE id=$1',[followup.id])).rows[0].input_snapshot;assert.equal(frozen.feedback.original_task.artifact,null);
  await f.worker.runOnce();const view=await f.service.overview(f.p,users.owner);assert.equal(view.tasks.length,2);assert.equal(view.tasks.find(t=>t.id===task.id).status,'blocked');assert.equal(view.tasks.find(t=>t.id!==task.id).status,'todo');
 });
 await t.test('blocked risk proposals never become implementation history and post-development archive conflicts stay atomic',async()=>{
  const {createImplementationNotes}=require('../server/implementation-notes'),evidence=[{segment_id:'s1',quote:'목록 정렬 기준은 미정이다.'}];
  const note={id:'choice1',kind:'temporary_decision',category:'ui_behavior',reversible:true,title:'임시 순서',uncertainty:'정렬 기준 미정',temporary_approach:'가나다 순',rationale:'화면 확인 가능',impact:'표시 순서 차이',replacement_condition:'피드백 후 변경',evidence,task_indexes:[0],issue_refs:[{kind:'question',id:'question1'}]};
  const make=blocked=>remote({async analyzeRisk(i){return {schema_version:'2.0',project_id:i.projectId,request_id:i.requestId,input_sha256:i.snapshotHash,trace_id:'trc_risk_synthetic12345',risks:[],questions:[{id:'question1',category:blocked?'authorization':'ui_behavior',question:blocked?'권한 범위는 무엇인가?':'정렬 기준은 무엇인가?',evidence,deferred_by:'choice1'}],temporary_decisions:[note],work_gaps:[],tasks:[{title:'목록',description:'목록 표시',acceptance_criteria:['목록 표시'],evidence}]};}});
  const blocked=await fixture({provider:make(true),mode:'provisional',policyText:'목록 정렬 기준은 미정이다.'});await blocked.worker.runOnce();const view=await blocked.service.overview(blocked.p,users.owner);assert.equal(view.tasks.length,0);assert.equal(view.analyses[0].status,'blocked');
  const archived=(await pool.query('SELECT * FROM project_implementation_notes WHERE project_id=$1',[blocked.p])).rows;assert.equal(archived.length,0);
  const p=make(false);p.develop=async i=>({...await remote().develop(i),implementation_report:{contract_version:'2.0',completion:'complete',remaining_criteria:[],notes:[Object.fromEntries(Object.entries(note).filter(([k])=>!['task_indexes','issue_refs'].includes(k)))]}});
  const f=await fixture({provider:p,mode:'provisional',policyText:'목록 정렬 기준은 미정이다.'}),task=await todo(f),check=await f.service.startCheck(f.p,users.owner,task.id);
  await f.service.transition(f.p,users.owner,task.id,{status:'in_progress',expected_version:task.version,provisional_consent:{review_token:check.review_token}});
  const job=(await pool.query("SELECT id FROM task_automation_jobs WHERE task_id=$1 AND kind='develop'",[task.id])).rows[0],noteId=A.stableId(job.id,task.id,'development-note','choice1');
  await createImplementationNotes({pool}).create(f.p,users.owner,{...require('../../nora/task-automation/risk-flow-v2').noteSnapshot(note),request_id:noteId,source_revision_id:f.source.revision_id,analysis_id:task.analysis_id,automation_task_id:task.id});
  await f.worker.runOnce();const failed=await f.service.getTask(f.p,users.owner,task.id);assert.equal(failed.execution_status,'failed');assert.equal(failed.artifact,null);assert.equal((await pool.query("SELECT 1 FROM project_implementation_notes WHERE project_id=$1 AND origin='nora'",[f.p])).rowCount,0);
 });
 await t.test('settings clients that omit uncertainty_mode preserve provisional mode',async()=>{
  const f=await fixture({mode:'provisional',category:'meeting'}),s=(await f.service.overview(f.p,users.owner)).settings;
  const updated=await f.service.saveSettings(f.p,users.owner,{expected_version:s.version,enabled:true,risk_flow_slug:null,development_flow_slug:s.development_flow_slug,preview_origins:s.preview_origins});assert.equal(updated.uncertainty_mode,'provisional');
 });
 await t.test('missing connector operations stay explicit and uncertain development is never automatically repeated',async()=>{
  const missing=await fixture({provider:remote({async capabilities(){return{risk_analysis:false,development:false,merge:false,blockers:[{code:'NORA_AUTH_REQUIRED',message:'Nora 로그인 필요'}]};}})});await missing.worker.runOnce();assert.equal((await missing.service.overview(missing.p,users.owner)).analyses[0].status,'awaiting_connection');
  const provider=remote({async develop(i){calls.push(['unknown-development',i]);throw Error('Lost response');}}),f=await fixture({provider}),r=await todo(f);await f.service.transition(f.p,users.member,r.id,{expected_version:r.version,status:'in_progress'});await f.worker.runOnce();assert.equal((await f.service.getTask(f.p,users.owner,r.id)).execution_status,'uncertain');await f.worker.runOnce();assert.equal(calls.filter(c=>c[0]==='unknown-development'&&c[1].taskId===r.id).length,1);
 });
 await t.test('uncertain merge only permits read-only reconciliation of the approved operation',async()=>{
  const provider=remote({async merge(i){calls.push(['unknown-merge',i]);throw Error('Lost merge response');}}),f=await fixture({provider}),r=await qa(f);
  await f.service.approveMerge(f.p,users.owner,r.id,{expected_version:r.version,head_sha:HEAD,note:'승인한 SHA만 병합'});await f.worker.runOnce();const unknown=await f.service.getTask(f.p,users.owner,r.id);assert.equal(unknown.status,'qa');assert.equal(unknown.execution_status,'uncertain');await f.worker.runOnce();assert.equal(calls.filter(c=>c[0]==='unknown-merge'&&c[1].taskId===r.id).length,1);
  await f.service.reconcileMerge(f.p,users.reviewer,r.id,{expected_version:unknown.version});await f.worker.runOnce();assert.equal((await f.service.getTask(f.p,users.owner,r.id)).status,'done');
 });
 await t.test('changed source settings prevent stale task execution and no provider call occurs',async()=>{const f=await fixture(),r=await todo(f),s=(await f.service.overview(f.p,users.owner)).settings;await f.service.saveSettings(f.p,users.owner,{expected_version:s.version,enabled:true,risk_flow_slug:null,development_flow_slug:'new-published-flow',preview_origins:s.preview_origins});await assert.rejects(f.service.transition(f.p,users.member,r.id,{expected_version:r.version,status:'in_progress'}),{code:'TASK_SOURCE_STALE'});assert.equal(calls.filter(c=>c[0]==='develop'&&c[1].taskId===r.id).length,0);});
 await t.test('per-task consent is required even in legacy strict settings; cancellation queues nothing and confirmed retries dispatch once',async()=>{
  const evidence=[{segment_id:'s1',quote:'목록 정렬 기준은 미정이다.'}],choice={id:'choice',kind:'temporary_decision',category:'ui_behavior',reversible:true,title:'목록 정렬',uncertainty:'정렬 기준 미정',temporary_approach:'가나다 순',rationale:'검토 가능한 목록 제공',impact:'목록 표시 순서',replacement_condition:'최종 정렬 기준 답변 수신',evidence};
  const provider=remote({async analyzeRisk(i){return {schema_version:'3.0',project_id:i.projectId,request_id:i.requestId,input_sha256:i.snapshotHash,trace_id:'trc_risk_consent_synthetic',risks:[],questions:[{id:'sort-q',category:'ui_behavior',question:'어떤 순서로 정렬할까요?',evidence,deferred_by:'choice'}],temporary_decisions:[{...choice,task_indexes:[0],issue_refs:[{kind:'question',id:'sort-q'}]}],work_gaps:[],tasks:[{title:'목록 구현',description:'목록 구현',acceptance_criteria:['목록 표시'],evidence}]};},async develop(i){return {...await remote().develop(i),implementation_report:{completion:'complete',remaining_criteria:[],notes:[choice]}};}});
  const f=await fixture({provider,mode:'strict',policyText:'목록 정렬 기준은 미정이다.'}),task=await todo(f);
  const before=await f.service.startCheck(f.p,users.member,task.id);assert.equal(before.requires_confirmation,true);assert.equal(before.questions[0].status,'draft');assert.equal(task.requires_provisional_confirmation,true);
  assert.equal((await pool.query('SELECT 1 FROM project_implementation_notes WHERE project_id=$1',[f.p])).rowCount,0);
  await assert.rejects(f.service.transition(f.p,users.member,task.id,{status:'in_progress',expected_version:task.version}),{code:'TASK_PROVISIONAL_CONFIRMATION_REQUIRED'});
  assert.equal((await pool.query("SELECT 1 FROM task_automation_jobs WHERE task_id=$1 AND kind='develop'",[task.id])).rowCount,0);
  const body={status:'in_progress',expected_version:task.version,provisional_consent:{review_token:before.review_token}};
  await Promise.all([f.service.transition(f.p,users.member,task.id,body),f.service.transition(f.p,users.member,task.id,body)]);
  await assert.rejects(f.service.transition(f.p,users.owner,task.id,body),{code:'TASK_VERSION_CONFLICT'});
  await f.worker.runOnce();const qa=await f.service.getTask(f.p,users.owner,task.id);assert.equal(qa.status,'qa');
  assert.equal((await f.service.transition(f.p,users.member,task.id,body)).status,'qa','lost response can be replayed after execution without a duplicate job');
  assert.equal((await pool.query("SELECT 1 FROM task_automation_jobs WHERE task_id=$1 AND kind='develop'",[task.id])).rowCount,1);
  const note=(await pool.query('SELECT * FROM project_implementation_notes WHERE automation_task_id=$1',[task.id])).rows[0];
  assert.equal(note.execution_context.questions[0].id,before.questions[0].id);assert.equal(note.execution_context.questions[0].status,'draft');assert.equal(note.execution_context.pr_url,qa.artifact.pr_url);assert.deepEqual(note.execution_context.code_paths,['a']);assert.equal(note.execution_context.implemented_at,null);assert.ok(note.created_at);assert.equal(note.execution_context.confirmed_by,users.member);
  assert.equal((await pool.query('SELECT status FROM project_questions WHERE id=$1',[before.questions[0].id])).rows[0].status,'draft','temporary development does not resolve customer questions');
  await assert.rejects(pool.query("UPDATE automation_tasks SET execution_context=execution_context||'{\"provisional_authorized\":false}'::jsonb WHERE id=$1",[task.id]),{code:'23514'});
  await assert.rejects(pool.query("UPDATE project_implementation_notes SET execution_context='{}' WHERE id=$1",[note.id]),{code:'23514'});
 });
 await t.test('a changed customer answer invalidates the modal token and the accepted answer snapshot reaches development without marking it approved',async()=>{
  const evidence=[{segment_id:'s1',quote:'목록 정렬 기준은 미정이다.'}],choice={id:'sort',kind:'temporary_decision',category:'ui_behavior',reversible:true,title:'정렬',uncertainty:'정렬 기준 미정',temporary_approach:'가나다 순',rationale:'목록 검토',impact:'표시 순서',replacement_condition:'답변 후 보완',evidence};
  const provider=remote({async analyzeRisk(i){return {schema_version:'3.0',project_id:i.projectId,request_id:i.requestId,input_sha256:i.snapshotHash,trace_id:'trc_question_changed_synthetic',risks:[],questions:[{id:'q',category:'ui_behavior',question:'정렬 순서는?',evidence,deferred_by:'sort'}],temporary_decisions:[{...choice,task_indexes:[0],issue_refs:[{kind:'question',id:'q'}]}],work_gaps:[],tasks:[{title:'정렬',description:'정렬 구현',acceptance_criteria:['목록 표시'],evidence}]};},async develop(i){assert.equal(i.developmentContext.questions[0].answer.text,'최신순으로 정렬해 주세요.');assert.equal(i.developmentContext.questions[0].status,'answered_pending');return {...await remote().develop(i),implementation_report:{completion:'complete',remaining_criteria:[],notes:[choice]}};}});
  const f=await fixture({provider,policyText:'목록 정렬 기준은 미정이다.'}),task=await todo(f),check=await f.service.startCheck(f.p,users.owner,task.id),q=check.questions[0],qservice=require('../server/question-ledger').createQuestionService(pool);
  await qservice.markAsked(f.p,users.owner,q.id,{expected_version:q.version,asked_by:'담당자',asked_at:new Date(Date.now()-5000).toISOString(),note:'기존 고객 질문 발송 기록'});
  await qservice.answer(f.p,users.owner,q.id,{expected_version:q.version+1,text:'최신순으로 정렬해 주세요.',responded_by:'고객',responded_at:new Date().toISOString(),channel:'메일',source_refs:[]});
  await assert.rejects(f.service.transition(f.p,users.owner,task.id,{status:'in_progress',expected_version:task.version,provisional_consent:{review_token:check.review_token}}),{code:'TASK_PROVISIONAL_CONTEXT_CHANGED'});
  const fresh=await f.service.startCheck(f.p,users.owner,task.id);assert.notEqual(fresh.review_token,check.review_token);assert.equal(fresh.questions[0].status,'answered_pending');
  const other=await fixture({category:'meeting'});await assert.rejects(f.service.startCheck(other.p,users.owner,task.id),{code:'TASK_NOT_FOUND'});
  await f.service.transition(f.p,users.owner,task.id,{status:'in_progress',expected_version:task.version,provisional_consent:{review_token:fresh.review_token}});await f.worker.runOnce();assert.equal((await f.service.getTask(f.p,users.owner,task.id)).status,'qa');
  assert.equal((await qservice.get(f.p,users.owner,q.id)).status,'answered_pending');
 });
 await t.test('history-agent failure preserves the remote trace and never reruns development automatically',async()=>{
  const f=await fixture({provider:remote({async develop(i){calls.push(['history-failure',i]);throw Object.assign(new Error('history failed after development'),{code:'NORA_DEVELOPMENT_REPORT_INVALID',trace_id:'trc_history_failure_synthetic'});}})}),task=await todo(f);
  await f.service.transition(f.p,users.member,task.id,{status:'in_progress',expected_version:task.version});await f.worker.runOnce();
  const current=await f.service.getTask(f.p,users.owner,task.id);assert.equal(current.execution_status,'uncertain');assert.equal(current.execution_trace_id,'trc_history_failure_synthetic');
  await f.worker.runOnce();assert.equal(calls.filter(c=>c[0]==='history-failure'&&c[1].taskId===task.id).length,1);
  assert.equal((await pool.query("SELECT trace_id FROM task_automation_jobs WHERE task_id=$1 AND kind='develop'",[task.id])).rows[0].trace_id,current.execution_trace_id);
 });

 await t.test('a verified code change with failing CI or no preview keeps its actual history but cannot enter QA or merge',async()=>{
  const evidence=[{segment_id:'s1',quote:'목록 정렬 기준은 미정이다.'}],gap={id:'remaining',kind:'work_gap',category:'ui_behavior',reversible:true,title:'최종 정렬 검토',uncertainty:'표시 기준 미확정',temporary_approach:null,rationale:'결과 검토 대기',impact:'목록 표시',replacement_condition:'검토 후 보완',evidence};
  const provider=remote({async analyzeRisk(i){return {schema_version:'3.0',project_id:i.projectId,request_id:i.requestId,input_sha256:i.snapshotHash,trace_id:'trc_review_pending_synthetic',risks:[],questions:[],temporary_decisions:[],work_gaps:[],tasks:[{title:'목록',description:'목록 구현',acceptance_criteria:['목록 표시'],evidence}]};},async develop(i){const raw=await remote().develop(i);return {...raw,artifact:{...raw.artifact,preview_url:null,checks:[{name:'unit',status:'failed'},{name:'웹 프리뷰 배포',status:'pending'}]},implementation_report:{completion:'partial',remaining_criteria:['목록 표시'],notes:[gap]}};}});
  const f=await fixture({provider,policyText:'목록 정렬 기준은 미정이다.'}),task=await todo(f);await f.service.transition(f.p,users.owner,task.id,{status:'in_progress',expected_version:task.version});await f.worker.runOnce();
  const blocked=await f.service.getTask(f.p,users.owner,task.id);assert.equal(blocked.status,'blocked');assert.equal(blocked.artifact.preview_url,null);assert.equal(blocked.artifact.pr_number,12);assert.equal((await pool.query('SELECT 1 FROM project_implementation_notes WHERE automation_task_id=$1',[task.id])).rowCount,1);
  await assert.rejects(f.service.approveMerge(f.p,users.owner,task.id,{expected_version:blocked.version,head_sha:HEAD,note:'미검증 결과 병합 시도'}),{code:'TASK_REVIEW_STALE'});
  const archive=require('../server/implementation-notes').createImplementationNotes({pool}),note=(await archive.list(f.p,users.owner,{automation_task_id:task.id})).notes[0];
  const feedback=await archive.feedback(f.p,users.owner,note.id,{request_id:randomUUID(),expected_version:note.version,text:'실패한 테스트와 웹 프리뷰 배포를 보완해 주세요.'});
  const followup=await f.service.analyzeFeedback(f.p,users.owner,{note_id:note.id,expected_version:feedback.note.version,request_id:randomUUID()});
  const frozen=(await pool.query('SELECT input_snapshot FROM task_automation_analyses WHERE id=$1',[followup.id])).rows[0].input_snapshot;
  assert.equal(frozen.feedback.original_task.artifact.pr_number,12);assert.equal(frozen.feedback.original_task.artifact.preview_url,null);
  await f.worker.runOnce();const next=(await f.service.overview(f.p,users.owner)).tasks.find(t=>t.id!==task.id);assert.ok(next);assert.equal(next.status,'todo');assert.equal((await f.service.getTask(f.p,users.owner,task.id)).status,'blocked');

 });

 await t.test('context changes during development block approval but do not discard the verified PR and execution history',async()=>{
  const provider=remote({async develop(i){await pool.query("UPDATE project_settings SET goal='개발 중 갱신된 프로젝트 목표',version=version+1,repository_check=NULL WHERE project_id=$1",[i.projectId]);return remote().develop(i);}}),f=await fixture({provider}),task=await todo(f);
  await f.service.transition(f.p,users.owner,task.id,{status:'in_progress',expected_version:task.version});await f.worker.runOnce();
  const current=await f.service.getTask(f.p,users.owner,task.id);assert.equal(current.status,'blocked',JSON.stringify({status:current.status,execution_status:current.execution_status,error_code:current.error_code}));assert.equal(current.error_code,'TASK_SOURCE_STALE');assert.equal(current.artifact.pr_number,12);assert.ok(current.execution_context.confirmed_at);assert.equal(current.execution_trace_id,'trc_develop_synthetic123');
  await assert.rejects(f.service.approveMerge(f.p,users.owner,task.id,{expected_version:current.version,head_sha:HEAD,note:'변경 전 근거로 생성된 PR'}),{code:'TASK_MERGE_UNAVAILABLE'});
 });

});
