'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {requestFor,assertCase}=require('../nora/implementation-plan/run-acceptance');
const {validateImplementationRequest}=require('../nora/client/implementation-client');
const cases=require('../nora/implementation-plan/acceptance-cases.json');

test('all live acceptance fixtures meet the request contract without production data',()=>{
 for(const item of cases){const input=requestFor(item);validateImplementationRequest(input,input.project_id);assert.equal(input.project_id,'synthetic-implementation-acceptance');assert.equal(new URL(input.repository.url).pathname,'/example/synthetic-implementation.git');}
});
test('mismatch acceptance rejects a blocking warning that still proposes unrelated implementation',()=>{
 const item=cases.find(item=>item.id==='product-goal-with-customer-requirements-blocked'),input=requestFor(item);
 const task={id:'TASK-1',title:'개발 대상과 문서 범위 확인',evidence:[{revision_id:input.sources[0].revision_id,segment_id:'S1'}]};
 const result={title:'개발 대상과 문서 범위 확인',questions:[{blocking:true,question:input.sources[0].title+'의 실험 기능은 고객 제품 요구사항입니다. 개발 대상 문서를 확인해 주세요.'}],tasks:[task]};
 assertCase(item,result,input);
 assert.throws(()=>assertCase(item,{...result,tasks:[task,{...task,id:'TASK-2',title:'실험 선택 구현'}]},input),/UNRELATED_IMPLEMENTATION_TASKS/);
 assert.throws(()=>assertCase(item,{...result,tasks:[{...task,title:'실험 선택 구현'}]},input),/IMPLEMENTATION_REPLACED_CLARIFICATION/);
 assert.throws(()=>assertCase(item,{...result,tasks:[{...task,evidence:[]}]},input),/MISMATCH_EVIDENCE_MISSING/);
 assert.throws(()=>assertCase(item,{...result,questions:[{blocking:true,question:'다른 실험 프로젝트인지 확인'}]},input),/MISMATCH_SOURCE_NOT_IDENTIFIED/);
});
test('platform example acceptance rejects both unnecessary blocking and customer feature creation',()=>{
 const item=cases.find(item=>item.id==='managed-project-example-is-not-product-feature'),input=requestFor(item);
 const result={title:'프로젝트별 문서 접근',questions:[],tasks:[{title:'프로젝트별 문서 권한 검사'}]};
 assertCase(item,result,input);
 assert.throws(()=>assertCase(item,{...result,questions:[{blocking:true,question:'고객 문서가 포함되어 있어 차단'}]},input),/UNNECESSARY_BLOCKING_QUESTION/);
 assert.throws(()=>assertCase(item,{...result,tasks:[{title:'실험 선택 구현'}]},input),/EXAMPLE_BECAME_IMPLEMENTATION/);
});
