'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../nora/task-automation/development-flow');
const {hash}=require('../platform/server/context-contract');
const {assertDevelopmentHistoryFlow}=require('../platform/server/nora-task-provider');
const Q='11111111-1111-4111-a111-111111111111',OTHER='22222222-2222-4222-a222-222222222222';
function fixture(){
  const sentence='목록을 보여주고 정렬 순서는 협의한다.';
  const snapshot={source:{segments:[{segment_id:'s1',text:sentence,extraction_status:'ok'}]},automation:{uncertainty_mode:'per_task'}};
  const developmentContext={contract_version:'1.0',provisional_authorized:true,confirmed_at:new Date(Date.now()-60000).toISOString(),questions:[{id:Q,status:'sent',question:'정렬 순서는?',answer:null}]};
  const artifact={pr_number:1,head_sha:'b'.repeat(40),base_sha:'a'.repeat(40),preview_url:'https://preview.example',changed_files:['src/list.jsx'],diff:'diff --git a/src/list.jsx b/src/list.jsx\n+order by name'};
  const note={id:'choice1',kind:'temporary_decision',category:'ui_behavior',reversible:true,title:'목록 기본 정렬',uncertainty:'정렬 순서 미정',temporary_approach:'이름순 정렬',rationale:'되돌릴 수 있는 기본 순서',impact:'목록 순서만 변경',replacement_condition:'고객 답변이 오면 변경',evidence:[{segment_id:'s1',quote:sentence}],question_ids:[Q],implemented_at:null,code_paths:['src/list.jsx']};
  const report={contract_version:'3.0',completion:'complete',remaining_criteria:[],notes:[note],question_outcomes:[{question_id:Q,status:'temporary_implemented',note_ids:['choice1'],explanation:'이름순으로 임시 구현했고 고객 답변을 기다린다.'}]};
  const input={projectId:'project1',taskId:'task1',snapshotHash:'c'.repeat(64),snapshot,developmentContext,task:{acceptance_criteria:['목록 표시']}};
  const result={schema_version:'3.0',project_id:input.projectId,task_id:input.taskId,input_sha256:input.snapshotHash,development_context_sha256:hash(developmentContext),artifact:Object.fromEntries(['pr_number','head_sha','base_sha','preview_url'].map(k=>[k,artifact[k]])),implementation_report:report};
  return {snapshot,developmentContext,artifact,note,report,input,result,validate:()=>D.validateImplementationReport(report,snapshot,{acceptanceCriteria:input.task.acceptance_criteria,developmentContext,artifact})};
}
test('actual temporary work binds exact question snapshot, verified changed files and server trace',()=>{
  const f=fixture(),r=D.validateDevelopmentResult({...f.result,trace_id:'trc_verified12345'},f.input,{artifact:f.artifact});
  assert.equal(r.implementation_report.notes[0].implemented_at,null);assert.equal(r.implementation_report.completion,'complete');
  for(const key of ['project_id','task_id','input_sha256','development_context_sha256']){const copy=structuredClone(f.result);copy[key]=key.endsWith('sha256')?'d'.repeat(64):'other';assert.throws(()=>D.validateDevelopmentResult(copy,f.input,{artifact:f.artifact}),{code:'NORA_DEVELOPMENT_CONTEXT_MISMATCH'});}
});
test('every delivered question needs one honest outcome with bidirectional note links',()=>{
  for(const mutate of [f=>f.report.question_outcomes=[],f=>f.report.question_outcomes.push({...f.report.question_outcomes[0]}),f=>f.note.question_ids=[OTHER],f=>f.report.question_outcomes[0].note_ids=[],f=>f.report.question_outcomes[0].note_ids=['missing']]){const f=fixture();mutate(f);assert.throws(f.validate);}
});
test('received answer can be applied without asserting customer approval, unanswered cannot',()=>{
  const f=fixture();f.report.question_outcomes[0].status='answered_applied';assert.throws(f.validate,{code:'NORA_DEVELOPMENT_ANSWER_UNVERIFIED'});
  f.developmentContext.questions[0].status='answered_pending';f.developmentContext.questions[0].answer='이름순으로 보여주세요.';assert.equal(f.validate().question_outcomes[0].status,'answered_applied');assert.equal(f.developmentContext.questions[0].status,'answered_pending');
});
test('proposals, nonexistent code paths and invented dates cannot become implementation history',()=>{
  for(const code_paths of [[],['src/other.jsx'],['../secret'],['/etc/passwd'],['src/list.jsx','src/list.jsx']]){const f=fixture();f.note.code_paths=code_paths;assert.throws(f.validate,{code:'NORA_DEVELOPMENT_CODE_EVIDENCE_INVALID'});}
  const noWork=fixture();assert.throws(()=>D.validateImplementationReport(noWork.report,noWork.snapshot,{acceptanceCriteria:[],developmentContext:noWork.developmentContext,artifact:null}),{code:'NORA_DEVELOPMENT_CODE_EVIDENCE_INVALID'});
  for(const t of ['not a date','2000-01-01T00:00:00Z',new Date(Date.now()+3600000).toISOString()]){const f=fixture();f.note.implemented_at=t;assert.throws(f.validate,{code:'NORA_DEVELOPMENT_TIME_INVALID'});}
});
test('unapproved temporary choices and missing work gaps are not silently complete',()=>{
  const f=fixture();f.developmentContext.provisional_authorized=false;assert.throws(f.validate,{code:'NORA_DEVELOPMENT_CONSENT_REQUIRED'});
  const gap=fixture();gap.report.question_outcomes[0].status='deferred';assert.throws(gap.validate,{code:'NORA_DEVELOPMENT_GAP_REQUIRED'});
  gap.note.kind='work_gap';gap.note.temporary_approach=null;gap.note.code_paths=[];assert.equal(gap.validate().completion,'partial');
});
test('development to history is one ungated flow; only history can retry and it has no tools',()=>{
  const flow=D.buildDevelopmentFlow({projectId:'project1',repositoryUrl:'https://github.com/acme/demo',baseBranch:'main',connectorId:'conn1',operations:[{id:'get_file',params:['repo','path','ref']},{id:'apply_task_patch',params:['repo','task_id','expected_base_sha','patch']},{id:'merge_pull_request',params:['repo','pull_number']}]});
  assertDevelopmentHistoryFlow(flow);const p=flow.payload;assert.equal(p.agents.length,2);assert.ok(p.agents.every(a=>a.requiresApproval===false));assert.deepEqual(p.agents[0].retry.rules,[]);assert.equal(p.agents[1].retry.rules[0].action.target,'self');assert.ok(p.toolBlocks.every(t=>t.runtime.operation!=='merge_pull_request'&&t.params.every(q=>q.name!=='repo')));assert.ok(p.toolBlocks.every(t=>p.edges.some(e=>e.sourceId===t.id&&e.targetId===p.agents[0].id)));
  for(const change of [p=>p.agents[0].requiresApproval=true,p=>p.edges.push({sourceId:p.toolBlocks[0].id,targetId:p.agents[1].id}),p=>p.agents[1].retry.rules[0].action.target={fromNode:p.agents[0].id},p=>p.agents[1].outputRules=[]]){const bad=structuredClone(flow);change(bad.payload);assert.throws(()=>assertDevelopmentHistoryFlow(bad));}
});

test('plausible model dates are not accepted as verified edit times and no-artifact gaps cannot claim changed files',()=>{
 const f=fixture();f.note.implemented_at=new Date().toISOString();assert.equal(f.validate().notes[0].implemented_at,null);
 const g=fixture();g.note.kind='work_gap';g.note.temporary_approach=null;g.report.completion='blocked';g.report.question_outcomes[0].status='deferred';assert.throws(()=>D.validateImplementationReport(g.report,g.snapshot,{developmentContext:g.developmentContext,artifact:null}),{code:'NORA_DEVELOPMENT_CODE_EVIDENCE_INVALID'});
});
