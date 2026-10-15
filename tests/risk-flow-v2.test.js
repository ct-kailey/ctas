'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const V=require('../nora/task-automation/risk-flow-v2');
const V1=require('../nora/task-automation/risk-flow');
const {hash}=require('../platform/server/context-contract');
const evidence=[{segment_id:'seg1',quote:'목록 정렬 기준은 미정이다.'}];
function snapshot(){return {schema_version:'2.0',project_id:'project_test',request_id:'request_test',source:{revision_id:'revision_test',document_id:'document_test',title:'정책',category:'policy',sha256:'a'.repeat(64),segments:[{segment_id:'seg1',requirement_key:null,text:'목록 정렬 기준은 미정이다. 권한 정책은 미정이다.',locator:{kind:'text',label:'본문'},extraction_status:'ok'}]},context:{version:0,records:[]},project:{name:'합성 프로젝트',goal:'목록',settings_version:1},repository:{url:null,base_branch:null,head_sha:null},nora:{workspace_id:'t_fixture_workspace'},automation:{settings_version:1,risk_flow_slug:null,development_flow_slug:null,preview_origins:[],uncertainty_mode:'provisional'},feedback:null,implementation_notes:[]};}
function note(){return {id:'choice1',kind:'temporary_decision',category:'ui_behavior',reversible:true,title:'정렬 임시 선택',uncertainty:'목록 정렬 기준 미정',temporary_approach:'가나다 순으로 표시',rationale:'원문 범위에서 화면을 검토할 수 있다.',impact:'표시 순서만 달라진다.',replacement_condition:'사람이 정렬 기준을 정하면 교체',evidence:structuredClone(evidence)};}
function result(){const s=snapshot();return {schema_version:'2.0',project_id:s.project_id,request_id:s.request_id,input_sha256:hash(s),risks:[],questions:[{id:'question1',category:'ui_behavior',question:'목록 정렬 기준은 무엇인가?',evidence:structuredClone(evidence),deferred_by:'choice1'}],tasks:[{title:'목록 임시 정렬',description:'화면 표시 순서를 임시 설정한다.',acceptance_criteria:['가나다 순으로 표시'],evidence:structuredClone(evidence)}],temporary_decisions:[{...note(),task_indexes:[0],issue_refs:[{kind:'question',id:'question1'}]}],work_gaps:[]};}
test('v2 is a new deterministic isolated two-agent template and keeps v1 unchanged',()=>{
 const a=V.buildRiskFlow({projectId:'project_test',spaceId:'space_test'}),b=V.buildRiskFlow({projectId:'project_test',spaceId:'space_test'}),old=V1.buildRiskFlow({projectId:'project_test',spaceId:'space_test'});
 assert.deepEqual(a,b);assert.notEqual(a.slug,old.slug);assert.ok(a.slug.includes('-v2-'));assert.equal(old.payload.meta.ains_template_version,'1');
 assert.equal(a.payload.meta.ains_risk_contract_version,'2');assert.equal(a.payload.agents.length,2);assert.deepEqual(a.payload.toolBlocks,[]);
 for(const agent of a.payload.agents){assert.equal(agent.requiresApproval,false);assert.equal(agent.forceFreshContext,true);assert.deepEqual(agent.connectedMemorySpaceIds,[]);assert.ok(agent.prompt.includes('automation_request is an object {snapshot,input_sha256}'));}
});
test('reversible decision permits proposed tasks only with exact bidirectional issue and task evidence',()=>{
 const s=snapshot(),r=result(),valid=V.validateRiskResult(r,s,hash(s));assert.equal(valid.execution_blocked,false);assert.equal(valid.tasks.length,1);
 assert.equal(JSON.stringify(valid).includes('execution_blocked'),false);assert.equal(V.validateRiskResult(valid,s,hash(s)).execution_blocked,false);
 const input={...s,implementation_notes:V.taskNotes(valid,0)};assert.equal(input.implementation_notes.length,1);V.validateRiskRequest(input,{projectId:s.project_id,workspaceId:s.nora.workspace_id});
 for(const mutate of [r=>r.temporary_decisions[0].task_indexes=[1],r=>r.temporary_decisions[0].issue_refs[0].id='invented',r=>r.questions[0].deferred_by=null,r=>r.temporary_decisions[0].evidence[0].quote='원문에 없는 내용']){const changed=result();mutate(changed);assert.throws(()=>V.validateRiskResult(changed,s,hash(s)));}
});
test('strict mode, nonreversible and safety relabeling cannot create executable tasks',()=>{
 for(const mutate of [(r,s)=>s.automation.uncertainty_mode='strict',r=>r.temporary_decisions[0].reversible=false,r=>r.questions[0].category='security',r=>r.questions[0].evidence=[{segment_id:'seg1',quote:'권한 정책은 미정이다.'}],r=>r.temporary_decisions[0].uncertainty='사용자 권한 정책',r=>r.temporary_decisions[0].temporary_approach='권한 검사 우회']){const s=snapshot(),r=result();mutate(r,s);r.input_sha256=hash(s);const valid=V.validateRiskResult(r,s,hash(s));assert.equal(valid.execution_blocked,true);assert.equal(V.validateRiskResult(JSON.stringify(valid),s,hash(s)).execution_blocked,true);}
 const s=snapshot(),r=result();r.questions[0].deferred_by=null;r.temporary_decisions=[];assert.equal(V.validateRiskResult(r,s,hash(s)).execution_blocked,true);
});
test('forged fields, traces, empty rationale and undeclared notes are rejected',()=>{
 for(const mutate of [r=>r.approved=true,r=>r.execution_blocked=false,r=>r.temporary_decisions[0].rationale=' ',r=>r.temporary_decisions[0].temporary_approach=null,r=>r.tasks[0].command='run']){const r=result();mutate(r);assert.throws(()=>V.validateRiskResult(r,snapshot(),hash(snapshot())));}
 const r=result();r.trace_id='trc_wrong_trace';assert.throws(()=>V.validateRiskResult(r,snapshot(),hash(snapshot()),{expectedTraceId:'trc_verified_trace'}));
});
test('manual archive feedback preserves nullable approach, locator, long descriptions and original task',()=>{
 const s=snapshot(),gap={...V.noteSnapshot(note()),kind:'work_gap',temporary_approach:null,uncertainty:'가'.repeat(5000),evidence:evidence.map(e=>({...e,locator:{kind:'text',label:'본문'}}))};
 s.feedback={note_id:'note1',note_version:2,feedback_id:'feedback1',feedback_text:'최신순으로 표시해 주세요.',feedback_sha256:hash('최신순으로 표시해 주세요.'),note:gap,original_task:{id:'task1',kind:'task_draft',title:'목록',description:'가'.repeat(10000),acceptance_criteria:['보임'],evidence:gap.evidence,artifact:null}};
 V.validateRiskRequest(s,{projectId:s.project_id,workspaceId:s.nora.workspace_id});s.feedback.feedback_text='변조';assert.throws(()=>V.validateRiskRequest(s,{projectId:s.project_id,workspaceId:s.nora.workspace_id}),{code:'NORA_RISK_INPUT_INVALID'});
});
test('development cannot hide incomplete criteria or unsafe choices; partial report remains explicit',()=>{
 const s=snapshot(),gap={...note(),kind:'work_gap',temporary_approach:null};
 assert.throws(()=>V.validateDevelopmentNotes({contract_version:'2.0',completion:'partial',remaining_criteria:['정렬 피드백 적용'],notes:[]},s),{code:'NORA_DEVELOPMENT_NOTES_INVALID'});
 const report={contract_version:'2.0',completion:'complete',remaining_criteria:['정렬 피드백 적용'],notes:[gap]};assert.equal(V.validateDevelopmentNotes(report,s).completion,'partial');
 gap.category='authorization';assert.equal(V.validateDevelopmentNotes(report,s).completion,'blocked');
 assert.throws(()=>V.validateDevelopmentNotes(undefined,s),{code:'NORA_DEVELOPMENT_NOTES_REQUIRED'});
});
