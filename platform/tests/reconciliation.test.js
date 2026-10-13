'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FLOW_SLUG,validateFlowResponse,runDocumentPipeline}=require('../../nora/client/nora-client');
const request=require('../../nora/examples/change-request.json');

test('invalid final review retains Nora trace reference for reconciliation',()=>{
  assert.throws(()=>validateFlowResponse({kind:'flowRun',slug:FLOW_SLUG,ok:true,status:'ok',run:{traceId:'trc_invalid-evidence',status:'ok',output:'{}'}},request,request.project_id),error=>error.traceId==='trc_invalid-evidence');
});
test('invalid pipeline report retains Nora run reference for reconciliation',async()=>{
  await assert.rejects(()=>runDocumentPipeline(request.current,{expectedProjectId:request.project_id,token:'synthetic-test-token',fetchImpl:async()=>({ok:true,json:async()=>({runId:'run_invalid-report',status:'succeeded',report:{}})})}),error=>error.runId==='run_invalid-report');
});
