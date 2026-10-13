'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = fs.readFileSync(path.join(__dirname,'../nora/flow/review-core.js'),'utf8');
const assembler = fs.readFileSync(path.join(__dirname,'../nora/flow/proposal-assembler.js'),'utf8');
const sandbox = vm.createContext({}); vm.runInContext(core+'\n'+assembler,sandbox);
function fixture() {
  const request = structuredClone(require('../nora/examples/change-request.json'));
  const suffix='\n탭\t따옴표 "인용" 및 경로 C:\\source\\sample\n';
  request.baseline.segments[0].text+=suffix; request.current.segments[0].text+=suffix;
  const proposal = {schema_version:'1.0',request_id:request.request_id,project_id:request.project_id,status:'needs_review',changes:[{change_id:'chg-001',change_type:'modified',risk:'high',summary:'임계값 변경',reason:'수치 변경',impacts:[]}],questions:[],warnings:[],approval:{status:'not_requested',baseline_publication_allowed:false}};
  return {request,proposal};
}
test('assembler hydrates original multiline/tab/quote/backslash evidence without model copies',()=>{
  const {request,proposal}=fixture(),copy=structuredClone(request);
  const result=sandbox.assembleReview(request,proposal);
  assert.equal(result.changes[0].before.text,request.baseline.segments[0].text);
  assert.equal(result.changes[0].after.text,request.current.segments[0].text);
  assert.deepEqual(request,copy); assert.equal('before' in proposal.changes[0],false);
});
test('assembler rejects model-supplied evidence instead of silently repairing it',()=>{
  const {request,proposal}=fixture(); proposal.changes[0].before={text:'fabricated'};
  assert.throws(()=>sandbox.assembleReview(request,proposal),e=>e.code==='PROPOSAL_SCHEMA_INVALID');
});
test('assembler rejects unknown, omitted and duplicated deterministic references',()=>{
  for(const mode of ['unknown','omitted','duplicate']) {
    const {request,proposal}=fixture();
    if(mode==='unknown')proposal.changes[0].change_id='not-real';
    if(mode==='omitted')proposal.changes=[];
    if(mode==='duplicate')proposal.changes.push({...proposal.changes[0]});
    assert.throws(()=>sandbox.assembleReview(request,proposal),e=>['OUTPUT_COVERAGE_INVALID','OMITTED_CHANGE'].includes(e.code));
  }
});
test('assembler retains strict numeric risk, identity and approval validation',()=>{
  for(const mode of ['risk','identity','approval']) {
    const {request,proposal}=fixture();
    if(mode==='risk')proposal.changes[0].risk='low';
    if(mode==='identity')proposal.project_id='another-project';
    if(mode==='approval')proposal.approval.baseline_publication_allowed=true;
    assert.throws(()=>sandbox.assembleReview(request,proposal),e=>['CRITICAL_CHANGE_DOWNGRADED','OUTPUT_IDENTITY_MISMATCH','ILLEGAL_APPROVAL'].includes(e.code));
  }
});
test('object invocation never interpolates source as executable script',()=>{
  const {request,proposal}=fixture();
  request.baseline.segments[0].text+='\n"});globalThis.executed=true;/*';
  request.current.segments[0].text+='\n"});globalThis.executed=true;/*';
  const result=sandbox.assembleReview(request,proposal);
  assert.equal(sandbox.executed,undefined);assert.equal(result.changes[0].after.text,request.current.segments[0].text);
});
