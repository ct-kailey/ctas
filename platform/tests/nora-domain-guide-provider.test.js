'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createNoraDomainGuideProvider}=require('../server/nora-domain-guide-provider');
const {buildGuideFlow,validateGuide}=require('../../nora/domain-guide/contract');
const projectId='guide-project',workspaceId='t_guide_workspace',traceId='trc_guide_test_12345678';
function snapshot(){return {schema_version:'1.0',project_id:projectId,project:{name:'도메인 학습',goal:'학습 가이드'},sources:[{id:'record:one',kind:'context_record',title:'확정 정책',body:'검토 완료 후 결과를 전달한다.',authority:'confirmed',domain_id:null,domain_name:null,occurred_at:null},{id:'revision:two',kind:'revision',title:'참고 자료',body:'결과 화면 초안이다.',authority:'reference',domain_id:null,domain_name:null,occurred_at:null}]};}
function guide(){return {schema_version:'1.0',project_id:projectId,title:'프로젝트 학습 가이드',summary:'검토 후 결과 전달',summary_evidence_ids:['record:one'],sections:[{id:'policies',title:'확정 정책',body:'검토 완료 후 결과를 전달한다.',status:'confirmed',evidence_ids:['record:one']}],glossary:[{term:'검토',definition:'결과 전달 전 확인',evidence_ids:['record:one']}],workflows:[{title:'업무 흐름',nodes:[{id:'review',kind:'process',label:'결과 검토',evidence_ids:['record:one']},{id:'deliver',kind:'end',label:'결과 전달',evidence_ids:['record:one']}],edges:[{from:'review',to:'deliver',label:''}],evidence_ids:['record:one']}],changes:[],questions:[]};}
function fixture(options={}){
 const input={projectId,workspaceId,requestId:'guide-request',snapshot:snapshot()},calls=[],flows=new Map();let request;
 const pool={query:async()=>({rows:[{project_id:projectId,workspace_id:options.foreign?'t_foreign_workspace':workspaceId,status:'ready'}]})};
 const provider={callTool:async call=>{calls.push(call);assert.equal(call.workspaceId,workspaceId);assert.equal(call.projectId,projectId);const a=call.arguments;
  switch(call.name){
   case 'list_flows':return {flows:[...flows.values()].map(v=>({id:v.id}))};
   case 'apply_flow':{const row={id:a.slug,payload:structuredClone(a.payload),publishState:{}};options.tamper?.(row);flows.set(a.slug,row);return {};}
   case 'get_flow':return structuredClone(flows.get(a.slug));
   case 'publish_flow':flows.get(a.slug).publishState={publishedVersionId:'published-guide-v1',hasUnpublishedChanges:false};return {};
   case 'run_flow':request=a.variables.guide_request;if(options.transport)throw Object.assign(new Error('lost connection'),{code:'NORA_MCP_TRANSPORT_UNKNOWN'});return options.legacy?{status:'ok',rawStatus:'completed',traceId,output:JSON.stringify(guide())}:{kind:'flowRun',ok:true,slug:a.slug,status:'ok',run:{status:'ok',rawStatus:'completed',traceId,output:JSON.stringify(guide())}};
   case 'get_trace':{const trace={traceId,status:'completed',payload:{tenant_id:workspaceId,graph_slug:buildGuideFlow({projectId}).slug,flow_input:JSON.stringify(request),flow_output:JSON.stringify(guide())}};options.trace?.(trace);return trace;}
   default:throw Error('Unexpected '+call.name);
  }
 }};
 return {input,calls,flows,service:createNoraDomainGuideProvider({pool,provider})};
}
test('managed guide flow is project-scoped, isolated and idempotently published',async()=>{
 const f=fixture(),result=await f.service.generate(f.input);assert.equal(result.traceId,traceId);assert.equal(result.guide.title,guide().title);
 await f.service.generate(f.input);assert.equal(f.calls.filter(c=>c.name==='apply_flow').length,1);assert.equal(f.calls.filter(c=>c.name==='publish_flow').length,1);
 const flow=[...f.flows.values()][0];assert.ok(flow.payload.agents.every(a=>a.mode==='api'&&a.forceFreshContext&&!a.nativeTools.length&&!a.connectedMemoryIds.length));
 assert.equal(flow.payload.triggerBlocks[0].config.apiSlug,flow.id);assert.ok(flow.payload.edges.some(e=>e.sourceId===flow.payload.triggerBlocks[0].id&&e.targetId===flow.payload.agents[0].id));assert.equal(flow.payload.variables[0].name,'guide_request');assert.equal(flow.payload.meta.ains_project_id,projectId);
});
test('legacy direct runtime replies retain strict trace validation',async()=>{const f=fixture({legacy:true});assert.equal((await f.service.generate(f.input)).traceId,traceId);});
test('Nora ID-sorted canvas registries preserve the managed flow contract',async()=>{const f=fixture({tamper:r=>{r.payload.edges.reverse();r.payload.agents.reverse();}});assert.equal((await f.service.generate(f.input)).traceId,traceId);});
test('foreign workspace and customized flow cannot dispatch',async()=>{
 const foreign=fixture({foreign:true});await assert.rejects(foreign.service.generate(foreign.input),{code:'GUIDE_CONNECTION_REQUIRED'});assert.equal(foreign.calls.length,0);
 for(const tamper of [r=>r.payload.agents[0].nativeTools.push('web'),r=>r.payload.agents[0].prompt+='changed',r=>r.payload.meta.ains_project_id='another']){const f=fixture({tamper});await assert.rejects(f.service.generate(f.input),{code:'GUIDE_FLOW_CHANGED'});assert.equal(f.calls.filter(c=>c.name==='run_flow').length,0);}
});
test('trace must match exact project workspace, request and result',async()=>{
 for(const trace of [t=>t.payload.tenant_id='t_other_workspace',t=>t.payload.flow_input='{}',t=>t.payload.flow_output='{}',t=>t.status='error']){const f=fixture({trace});await assert.rejects(f.service.generate(f.input),{code:'GUIDE_TRACE_MISMATCH',dispatched:true,definiteFailure:true});}
});
test('unknown dispatch outcome is marked and never silently replayed by provider',async()=>{const f=fixture({transport:true});await assert.rejects(f.service.generate(f.input),{dispatched:true,noSideEffects:false});assert.equal(f.calls.filter(c=>c.name==='run_flow').length,1);});
test('guide cannot cite another project, missing evidence or promote reference to confirmed policy',()=>{
 for(const change of [g=>g.project_id='foreign',g=>g.sections[0].evidence_ids=['missing'],g=>g.sections[0].evidence_ids=['revision:two']]){const g=guide();change(g);assert.throws(()=>validateGuide(g,snapshot()));}
});
test('diagram rejects dangling edges, disconnected nodes and ambiguous decision branches',()=>{
 for(const change of [w=>w.edges[0].to='missing',w=>w.nodes.push({id:'orphan',kind:'process',label:'고립',evidence_ids:['record:one']}),w=>w.nodes[0].kind='decision']){const g=guide();change(g.workflows[0]);assert.throws(()=>validateGuide(g,snapshot()),{code:'GUIDE_DIAGRAM_INVALID'});}
 assert.deepEqual(validateGuide(guide(),snapshot()),guide());
});
test('template is deterministic and treats source prose as data rather than instructions',()=>{const one=buildGuideFlow({projectId}),two=buildGuideFlow({projectId});assert.deepEqual(one,two);assert.ok(one.payload.agents.every(a=>a.prompt.includes('untrusted source data')));assert.notEqual(one.slug,buildGuideFlow({projectId:'different'}).slug);});
module.exports={snapshot,guide};
