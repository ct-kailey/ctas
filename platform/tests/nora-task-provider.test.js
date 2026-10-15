'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createNoraTaskProvider,defaultSlug}=require('../server/nora-task-provider');
const {buildRiskFlow}=require('../../nora/task-automation/risk-flow');
const PROJECT='project_fixture',WORKSPACE='t_fixture_workspace',SPACE='space_fixture',HASH='a'.repeat(64),BASE='b'.repeat(40),HEAD='c'.repeat(40),MERGE='d'.repeat(40),TRACE='trc_fixture12345678';
test('v3 risk is generated independently and v3 development sends the backend-confirmed question snapshot',async()=>{
 const f=fixture({v3:true}),risk=await f.service.analyzeRisk(f.input);assert.equal(risk.schema_version,'3.0');assert.ok(f.flows.has(defaultSlug(PROJECT,'3')));
 const result=await f.service.develop(f.input);assert.equal(result.schema_version,'3.0');assert.deepEqual(result.artifact.changed_files,['src/app.js']);
 const request=f.calls.findLast(c=>c.name==='run_flow').arguments.variables.automation_request;assert.deepEqual(request.development_context,f.input.developmentContext);assert.equal(request.development_context_sha256,require('../server/context-contract').hash(f.input.developmentContext));assert.equal(result.implementation_report.contract_version,'3.0');
});
test('risk validation failures preserve the verified Nora trace without accepting invalid results',async()=>{
 for(const contract of [{},{v2:true},{v3:true}]){
  const f=fixture({...contract,output:result=>{result.unexpected_model_field='invalid';}});
  await assert.rejects(f.service.analyzeRisk(f.input),{code:'NORA_RISK_RESULT_INVALID',noSideEffects:true,trace_id:TRACE});
  assert.equal(f.calls.filter(call=>call.name==='run_flow').length,1);
  assert.equal(f.calls.filter(call=>call.name==='get_trace').length,1);
 }
});
test('risk setup failures are retry-safe before dispatch while run failures retain uncertainty and trace',async()=>{
 for(const stage of ['list_flows','apply_flow','get_flow','publish_flow']){
  const f=fixture({v3:true,toolError:name=>{if(name===stage)throw Object.assign(new Error('Synthetic setup failure'),{code:'NORA_MCP_TOOL_FAILED',noSideEffects:false});}});
  await assert.rejects(f.service.analyzeRisk(f.input),{code:'NORA_MCP_TOOL_FAILED',noSideEffects:true});
  assert.equal(f.calls.filter(call=>call.name==='run_flow').length,0);
 }
 const changed=fixture({v3:true,afterPublish:flow=>{flow.payload.agents[0].nativeTools=['unsafe-tool'];}});
 await assert.rejects(changed.service.analyzeRisk(changed.input),{code:'NORA_RISK_FLOW_CHANGED',noSideEffects:true});
 assert.equal(changed.calls.filter(call=>call.name==='run_flow').length,0);
 for(const stage of ['run_flow','get_trace']){
  const f=fixture({v3:true,toolError:name=>{if(name===stage)throw Object.assign(new Error('Synthetic dispatch failure'),{code:'NORA_MCP_TOOL_FAILED',noSideEffects:false,trace_id:TRACE});}});
  await assert.rejects(f.service.analyzeRisk(f.input),{code:'NORA_MCP_TOOL_FAILED',noSideEffects:false,trace_id:TRACE});
  assert.equal(f.calls.filter(call=>call.name==='run_flow').length,1);
 }
});
test('revised managed risk flow preserves historical published flows and rejects edits to the new one',async()=>{
 const f=fixture({v3:true}),slug=defaultSlug(PROJECT,'3'),oldSlug=slug.replace(/-r\d+$/,'');
 const legacy={id:oldSlug,name:'AINS 프로젝트 질문·작업별 실행 검토 v3',payload:{historical:'published evidence'},publishState:{publishedVersionId:'historical-version',hasUnpublishedChanges:false}};
 f.flows.set(oldSlug,structuredClone(legacy));
 await f.service.analyzeRisk(f.input);
 assert.deepEqual(f.flows.get(oldSlug),legacy);
 assert.ok(f.flows.has(slug));
 assert.equal(f.calls.filter(c=>c.name==='apply_flow').length,1);
 assert.equal(f.calls.find(c=>c.name==='apply_flow').arguments.slug,slug);
 f.flows.get(slug).payload.agents[0].prompt='user edit';
 const count=f.calls.filter(c=>c.name==='run_flow').length;
 await assert.rejects(f.service.analyzeRisk(f.input),{code:'NORA_RISK_FLOW_CHANGED'});
 assert.equal(f.calls.filter(c=>c.name==='run_flow').length,count);
 assert.deepEqual(f.flows.get(oldSlug),legacy);
});
test('v3 requires a sequential tool-free history agent and preserves exact confirmed question identity',async()=>{
 const changed=fixture({v3:true,output:r=>{r.development_context_sha256='e'.repeat(64);}});await assert.rejects(changed.service.develop(changed.input),{code:'NORA_DEVELOPMENT_CONTEXT_MISMATCH',noSideEffects:false,trace_id:TRACE});assert.equal(changed.invocations.some(i=>i.operation==='get_pull_request'),false);
 for(const customDevelopment of [f=>f.payload.agents[1].requiresApproval=true,f=>f.payload.agents[1].retry.rules[0].action.target={fromNode:f.payload.agents[0].id},f=>f.payload.edges=[]]){const f=fixture({v3:true,customDevelopment});await assert.rejects(f.service.develop(f.input));assert.equal(f.calls.some(c=>c.name==='run_flow'),false);}
});
test('v3 retains actual code and history when CI fails or preview is not ready; merge still requires both',async()=>{
 const f=fixture({v3:true,gitResult:(op,v)=>{if(op==='list_check_runs')v.check_runs[0].conclusion='failure';if(op==='list_deployments')v.splice(0);}});
 const result=await f.service.develop(f.input);assert.equal(result.artifact.preview_url,null);assert.ok(result.artifact.checks.some(c=>c.status==='failed'));assert.ok(result.artifact.checks.some(c=>c.name==='웹 프리뷰 배포'&&c.status==='pending'));assert.equal(result.implementation_report.contract_version,'3.0');assert.ok(result.artifact.diff);
 await assert.rejects(f.service.merge({...f.input,artifact:result.artifact}),{code:'NORA_TASK_CHECKS_PENDING'});assert.equal(f.invocations.filter(i=>i.operation==='merge_pull_request').length,0);
});
function fixture(options={}){
  const snapshot={schema_version:'1.0',project_id:PROJECT,request_id:'request_fixture',source:{revision_id:'revision_fixture',document_id:'document_fixture',title:'원문',category:'specification',sha256:'e'.repeat(64),segments:[{segment_id:'seg-1',requirement_key:null,text:'이메일 로그인 기능을 제공한다.',locator:{kind:'text',label:'본문'},extraction_status:'ok'}]},context:{version:0,records:[]},project:{name:'합성 프로젝트',goal:'이메일 로그인',settings_version:1},repository:{url:'https://github.com/acme/demo',base_branch:'main',head_sha:BASE},nora:{workspace_id:WORKSPACE},automation:{settings_version:1,risk_flow_slug:null,development_flow_slug:'development-flow',preview_origins:['https://preview.example']}};
  if(options.v2||options.v3){snapshot.schema_version=options.v3?'3.0':'2.0';snapshot.automation.uncertainty_mode=options.v3?'per_task':'provisional';snapshot.feedback=null;snapshot.implementation_notes=[];}
  const input={projectId:PROJECT,workspaceId:WORKSPACE,snapshot,snapshotHash:HASH,settings:{...snapshot.automation},taskId:'task_fixture',task:{title:'이메일 로그인'},expectedHeadSha:HEAD,targetBranch:'main'};
  if(options.v3){input.developmentContext={contract_version:'1.0',provisional_authorized:false,confirmed_at:new Date().toISOString(),questions:[]};input.task.acceptance_criteria=['이메일 로그인이 가능하다.'];}
  if(options.sdk)Object.assign(input.settings,{execution_mode:'nora_sdk',sdk_provider:'codex',sdk_connection_id:'sdk-fixture',sdk_working_folder:'/tmp/ctas-sdk'});
  const artifact={pr_number:1,head_sha:HEAD,base_sha:BASE,preview_url:'https://preview.example/app'};input.artifact=artifact;
  const riskResult={schema_version:'1.0',project_id:PROJECT,request_id:snapshot.request_id,input_sha256:HASH,risks:[],questions:[],tasks:[{title:'이메일 로그인',description:'이메일 로그인 기능 제공',acceptance_criteria:['이메일 로그인이 가능하다.'],evidence:[{segment_id:'seg-1',quote:'이메일 로그인 기능을 제공한다.'}]}]};
  if(options.v2||options.v3){riskResult.schema_version=options.v3?'3.0':'2.0';riskResult.temporary_decisions=[];riskResult.work_gaps=[];}
  const row={project_id:PROJECT,workspace_id:WORKSPACE,space_id:SPACE,connector_id:'connector_fixture',status:'ready',version:1};
  const pool={query:async(sql,args)=>{assert.ok(sql.includes('project_nora_workspaces'));assert.equal(args[0],PROJECT);return {rows:[row]};}};
  const calls=[],invocations=[],flows=new Map();let raw,request,merged=false;
  function fullFlow(slug){return {id:slug,payload:buildRiskFlow({projectId:PROJECT,spaceId:SPACE,slug}).payload,publishState:{publishedVersionId:'version-1',hasUnpublishedChanges:false}};}
  const dev=fullFlow('development-flow');if(options.v3)dev.payload=require('../../nora/task-automation/development-flow').buildDevelopmentFlow({projectId:PROJECT,repositoryUrl:'https://github.com/acme/demo',baseBranch:'main',connectorId:'connector_fixture',slug:'development-flow',operations:[]}).payload;Object.assign(dev.payload.meta,{ains_repository_url:'https://github.com/acme/demo.git',ains_default_branch:'main'});if(options.sdk){Object.assign(dev.payload.meta,{ains_execution_mode:'nora_sdk',ains_sdk_provider:'codex',ains_sdk_connection_id:'sdk-fixture',ains_sdk_working_folder:'/tmp/ctas-sdk'});Object.assign(dev.payload.agents[0],{mode:'sdk',sdkProvider:'codex',nativeTools:[]});}options.customDevelopment?.(dev);flows.set('development-flow',dev);
  if(options.customRisk){input.settings.risk_flow_slug='custom-risk';const full=fullFlow('custom-risk');options.customRisk(full);flows.set('custom-risk',full);}
  const provider={callTool:async call=>{
    assert.equal(call.projectId,PROJECT);assert.equal(call.workspaceId,WORKSPACE);calls.push(call);
    const {name,arguments:args}=call;
    options.toolError?.(name,args);
    if(name==='get_local_sdk_connections'){const connection={id:'sdk-fixture',provider:'codex',workingFolder:'/tmp/ctas-sdk',connected:true,busy:false};options.sdkConnection?.(connection,calls.filter(c=>c.name===name).length);return {connections:options.noSdk?[]:[connection]};}
    if(name==='connect_local_sdk')return {id:'request-fixture',provider:args.provider,workingFolder:args.workingFolder,status:'pending'};
    if(name==='list_flows')return [...flows.values()].map(f=>({id:f.id,name:f.id}));
    if(name==='apply_flow'){assert.equal(args.expectedRevision,'0');assert.ok(!flows.has(args.slug));assert.ok(![...flows.values()].some(flow=>flow.name?.toLowerCase()===args.name?.toLowerCase()),'Nora display names must be unique in a workspace');flows.set(args.slug,{id:args.slug,name:args.name,payload:structuredClone(args.payload),publishState:{hasUnpublishedChanges:true}});return {id:args.slug};}
    if(name==='publish_flow'){const f=flows.get(args.slug);f.publishState={publishedVersionId:'version-1',hasUnpublishedChanges:false};options.afterPublish?.(f);return {versionId:'version-1'};}
    if(name==='get_flow'){const f=structuredClone(flows.get(args.slug));if(options.staleVersion&&raw)f.publishState.publishedVersionId='version-2';return f;}
    if(name==='run_flow'){
      request=args.variables.automation_request;assert.equal(args.input,JSON.stringify(request));assert.equal(args.test,false);
      const output=args.slug==='development-flow'?{project_id:PROJECT,task_id:input.taskId,input_sha256:HASH,artifact:structuredClone(artifact)}:structuredClone(riskResult);
      if(options.v3&&args.slug==='development-flow')Object.assign(output,{schema_version:'3.0',development_context_sha256:require('../server/context-contract').hash(input.developmentContext),implementation_report:{contract_version:'3.0',completion:'complete',notes:[],remaining_criteria:[],question_outcomes:[]}});
      options.output?.(output);raw={status:'ok',rawStatus:'completed',traceId:TRACE,output:JSON.stringify(output)};return options.flowEnvelope?{kind:'flowRun',ok:!options.badEnvelope,status:options.badEnvelope?'failed':'ok',slug:args.slug,run:raw}:raw;
    }
    if(name==='get_trace'){const trace={traceId:TRACE,status:'completed',payload:{tenant_id:WORKSPACE,graph_slug:calls.findLast(c=>c.name==='run_flow').arguments.slug,flow_input:JSON.stringify(request),flow_output:raw.output}};if(options.v3&&trace.payload.graph_slug==='development-flow'){const [dev,history]=flows.get('development-flow').payload.agents,final=JSON.parse(raw.output),journal={...structuredClone(final),development_journal:structuredClone(final.implementation_report)};delete journal.implementation_report;options.journal?.(journal);const at=new Date(Date.now()-1000).toISOString();trace.payload.nodes={[dev.id]:{id:dev.id,kind:'agent',status:'completed',started_at:at,completed_at:at,result:JSON.stringify(journal)},[history.id]:{id:history.id,kind:'agent',status:'completed',parent_node_id:dev.id,started_at:at,result:raw.output,tool_calls:[]}};}options.trace?.(trace);return trace;}
    throw new Error('Unexpected tool '+name);
  }};
  const operationParams={list_pull_requests:['state','head','base'],list_commits:['branch','per_page'],get_commit:['sha'],apply_task_patch:['task_id','expected_base_sha','patch'],get_pull_request:['pull_number'],list_check_runs:['ref'],list_deployments:['sha'],list_deployment_statuses:['deployment_id'],compare:['base','head'],merge_pull_request:['pull_number','sha','expected_base_sha','merge_method']};
  const operations=new Map(Object.entries(operationParams).map(([id,params])=>[id,{id,params:['repo',...params]}]));
  for(const key of options.omitOperations||[])operations.delete(key);
  const gitSnapshot={row,settings:{base_branch:'main',version:1},repo:{url:'https://github.com/acme/demo.git'},fullName:'acme/demo',operations};
  let snapshotCount=0;const git={snapshot:async p=>{assert.equal(p,PROJECT);options.gitSnapshot?.(gitSnapshot,++snapshotCount);return gitSnapshot;},head:async()=>options.baseChanged?'f'.repeat(40):BASE,unchanged:async()=>{},invoke:async(s,operation,args)=>{
    invocations.push({operation,args});let value;
    if(operation==='list_pull_requests')value=[{number:1,url:'https://github.com/acme/demo/pull/1'}];
    else if(operation==='list_commits')value=[{sha:HEAD,url:'https://github.com/acme/demo/commit/'+HEAD}];
    else if(operation==='get_commit')value={sha:HEAD,url:'https://github.com/acme/demo/commit/'+HEAD,files:[{filename:'src/app.js',patch:'@@ -1 +1 @@\n-old\n+new'}]};
    else if(operation==='get_pull_request')value={number:1,html_url:'https://github.com/acme/demo/pull/1',head:{sha:HEAD,ref:'ains/task/task_fixture',repo:{full_name:'acme/demo'}},base:{ref:'main',sha:BASE,repo:{full_name:'acme/demo'}},state:merged?'closed':'open',draft:false,merged,merge_commit_sha:merged?MERGE:null};
    else if(operation==='list_check_runs')value={total_count:1,check_runs:[{head_sha:HEAD,status:'completed',conclusion:'success',name:'test'}]};
    else if(operation==='list_deployments')value=[{id:10,sha:HEAD}];
    else if(operation==='list_deployment_statuses')value=[{state:'success',environment_url:artifact.preview_url}];
    else if(operation==='compare')value={base_commit:{sha:BASE},merge_base_commit:{sha:BASE},files:[{filename:'src/app.js',patch:'@@ -1 +1 @@\n-old\n+new'}]};
    else if(operation==='merge_pull_request'){merged=true;value={merged:true,sha:MERGE};}
    else throw new Error('Unexpected operation '+operation);
    options.gitResult?.(operation,value);return value;
  }};
  return {service:createNoraTaskProvider({pool,provider,git}),input,calls,invocations,flows,riskResult,artifact,row};
}
test('managed risk flow is created once, published and provenance-checked before accepting task output',async()=>{
  const f=fixture(),result=await f.service.analyzeRisk(f.input);assert.equal(result.trace_id,TRACE);assert.equal(result.tasks.length,1);
  assert.deepEqual(f.calls.map(c=>c.name),['list_flows','apply_flow','get_flow','publish_flow','get_flow','run_flow','get_flow','get_trace']);
  const created=f.flows.get(defaultSlug(PROJECT));assert.equal(created.payload.meta.ains_project_id,PROJECT);assert.equal(created.payload.meta.ains_context_space_id,SPACE);
  await f.service.analyzeRisk(f.input);assert.equal(f.calls.filter(c=>c.name==='apply_flow').length,1);assert.equal(f.calls.filter(c=>c.name==='publish_flow').length,1);
});
test('foreign trace workspace/input/output and model-invented trace are rejected',async()=>{
  for(const trace of [t=>{t.payload.tenant_id='t_other_workspace';},t=>{const value=JSON.parse(t.payload.flow_input);value.snapshot.project_id='other';t.payload.flow_input=JSON.stringify(value);},t=>{t.payload.flow_output='{}';}]){const f=fixture({trace});await assert.rejects(f.service.analyzeRisk(f.input),{code:'NORA_TASK_TRACE_MISMATCH'});}
  const forged=fixture({output:r=>{r.trace_id='trc_invented123';}});await assert.rejects(forged.service.analyzeRisk(forged.input),{code:'NORA_TASK_OUTPUT_INVALID'});
});
test('published version changes invalidate a completed execution',async()=>{
  const f=fixture({staleVersion:true});await assert.rejects(f.service.analyzeRisk(f.input),{code:'NORA_TASK_FLOW_CHANGED'});
});
test('managed risk flow modified while publishing must not execute',async()=>{
  const f=fixture({afterPublish:flow=>{flow.payload.agents[0].prompt='tampered prompt';}});
  await assert.rejects(f.service.analyzeRisk(f.input),{code:'NORA_RISK_FLOW_CHANGED'});
  assert.equal(f.calls.filter(c=>c.name==='run_flow').length,0);
});
test('foreign snapshot fails before any Nora call',async()=>{
  const f=fixture();f.input.snapshot.project_id='other';await assert.rejects(f.service.analyzeRisk(f.input));assert.equal(f.calls.length,0);
});
test('custom risk flows cannot attach tools, external data, session memory or CLI execution',async()=>{
  const changes=[f=>{f.payload.agents[0].nativeTools=['web_search'];},f=>{f.payload.agents[0].mode='sdk';},f=>{f.payload.agents[0].connectedMcpServerIds=['server_other'];},f=>{f.payload.agents[0].connectedKnowledgeIds=['knowledge_other'];},f=>{f.payload.agents[0].dataSources=[{url:'https://other.example'}];},f=>{f.payload.graphSettings.autoSessionDisabled=false;},f=>{f.payload.agents[0].forceFreshContext=false;},f=>{f.payload.toolBlocks=[{id:'http_tool',runtime:{kind:'http',url:'https://other.example'}}];},f=>{f.payload.agents[0].runtime={kind:'http',url:'https://other.example'};},f=>{f.payload.agents[0].requiresRouteApproval=true;},f=>{f.payload.meta.connectedMemoryIds=['foreign_memory'];},f=>{f.memorySpaces=[{id:'foreign_space',boundBy:'flow'}];}];
  for(const customRisk of changes){const f=fixture({customRisk});await assert.rejects(f.service.analyzeRisk(f.input));assert.equal(f.calls.filter(c=>c.name==='run_flow').length,0);}
});
test('development checks PR repository, base, CI and deployed preview at the same head',async()=>{
  const f=fixture();const result=await f.service.develop(f.input);assert.equal(result.artifact.pr_url,'https://github.com/acme/demo/pull/1');assert.equal(result.artifact.preview_url,'https://preview.example/app');assert.ok(result.artifact.diff.includes('src/app.js'));assert.deepEqual(result.artifact.checks,[{name:'test',status:'passed'}]);
  for(const {operation,args} of f.invocations)if(operation==='list_check_runs')assert.equal(args.ref,HEAD);else if(operation==='list_deployments')assert.equal(args.sha,HEAD);
});
test('foreign PR repository and changed baseline reject development evidence',async()=>{
  const foreign=fixture({gitResult:(op,value)=>{if(op==='get_pull_request')value.head.repo.full_name='other/repo';}});await assert.rejects(foreign.service.develop(foreign.input),{code:'NORA_TASK_PR_CHANGED'});
  const stale=fixture({baseChanged:true});await assert.rejects(stale.service.develop(stale.input),{code:'NORA_TASK_BASE_CHANGED'});
});
test('incomplete, missing-count or failed CI cannot become reviewable artifacts',async()=>{
  for(const change of [v=>{v.total_count=2;},v=>{delete v.total_count;},v=>{v.check_runs[0].conclusion='failure';},v=>{v.check_runs[0].head_sha='f'.repeat(40);}]){const f=fixture({gitResult:(op,value)=>{if(op==='list_check_runs')change(value);}});await assert.rejects(f.service.develop(f.input),{code:'NORA_TASK_CHECKS_PENDING'});}
});
test('preview must be successful deployment of that head on an approved HTTPS origin',async()=>{
  const wrongHead=fixture({gitResult:(op,v)=>{if(op==='list_deployments')v[0].sha='f'.repeat(40);}});await assert.rejects(wrongHead.service.develop(wrongHead.input),{code:'NORA_TASK_PREVIEW_UNVERIFIED'});
  const unsafe=fixture();unsafe.artifact.preview_url='https://unapproved.example/app';await assert.rejects(unsafe.service.develop(unsafe.input),{code:'NORA_TASK_PREVIEW_UNVERIFIED'});
  const failed=fixture({gitResult:(op,v)=>{if(op==='list_deployment_statuses')v[0].state='failure';}});await assert.rejects(failed.service.develop(failed.input),{code:'NORA_TASK_PREVIEW_UNVERIFIED'});
});
test('missing merge capability and wrong expected head cause no connector invocation',async()=>{
  const missing=fixture({omitOperations:['merge_pull_request']});await assert.rejects(missing.service.merge(missing.input),{code:'NORA_MERGE_CAPABILITY_REQUIRED'});assert.equal(missing.invocations.length,0);assert.equal(missing.calls.length,0);
  const wrong=fixture();wrong.input.expectedHeadSha='f'.repeat(40);await assert.rejects(wrong.service.merge(wrong.input),{code:'NORA_TASK_MERGE_SCOPE_MISMATCH'});assert.equal(wrong.invocations.length,0);
});
test('merge passes exact reviewed head and expected base then verifies GitHub result',async()=>{
  const f=fixture(),result=await f.service.merge(f.input);assert.equal(result.merged,true);assert.equal(result.merge_commit_sha,MERGE);
  const invocation=f.invocations.find(x=>x.operation==='merge_pull_request');assert.deepEqual(invocation.args,{pull_number:1,sha:HEAD,expected_base_sha:BASE,merge_method:'squash'});
  assert.equal(f.invocations.filter(x=>x.operation==='merge_pull_request').length,1);
});

test('development rejects foreign flow scope, arbitrary runtimes and merge tools before execution',async()=>{
  for(const change of [f=>{f.payload.meta.ains_project_id='other';},f=>{f.payload.agents[0].mode='sdk';},f=>{f.payload.actionBlocks=[{runtime:{kind:'connector',connectorId:'connector_fixture',operation:'merge_pull_request'}}];},f=>{f.payload.toolBlocks=[{runtime:{kind:'http',endpoint:'https://other.example'},params:[]}];},f=>{f.payload.toolBlocks=[{runtime:{kind:'connector',connectorId:'connector_fixture',operation:'get_file'},params:[{name:'repo'}]}];}]){
    const f=fixture({customDevelopment:change});await assert.rejects(f.service.develop(f.input),{code:'NORA_DEVELOPMENT_FLOW_SCOPE_REQUIRED'});assert.equal(f.calls.filter(c=>c.name==='run_flow').length,0);
  }
  const stale=fixture({baseChanged:true});await assert.rejects(stale.service.develop(stale.input),{code:'NORA_TASK_BASE_CHANGED'});assert.equal(stale.calls.filter(c=>c.name==='run_flow').length,0);
});

test('merge and read-only reconciliation never adopt a newly selected repository or branch',async()=>{
  const wrong=fixture({gitSnapshot:s=>{s.repo.url='https://github.com/other/repo.git';}});
  await assert.rejects(wrong.service.reconcileMerge(wrong.input),{code:'NORA_TASK_SCOPE_CHANGED'});assert.equal(wrong.invocations.length,0);
  const race=fixture({gitSnapshot:(s,count)=>{if(count===3)s.settings.base_branch='changed';}});
  await assert.rejects(race.service.merge(race.input),{code:'NORA_TASK_SCOPE_CHANGED'});assert.equal(race.invocations.filter(i=>i.operation==='merge_pull_request').length,0);
});

test('generic branch write capabilities cannot bypass task-branch or human merge boundary',async()=>{
  const f=fixture({omitOperations:['apply_task_patch'],gitSnapshot:s=>{s.operations.set('apply_patch',{id:'apply_patch',params:['repo','branch','base_sha','patch']});}});
  assert.equal((await f.service.capabilities(f.input)).development,false);await assert.rejects(f.service.develop(f.input));assert.equal(f.calls.filter(c=>c.name==='run_flow').length,0);
  const wrong=fixture({gitResult:(op,v)=>{if(op==='get_pull_request')v.head.ref='main';}});await assert.rejects(wrong.service.develop(wrong.input),{code:'NORA_TASK_PR_CHANGED'});
});

test('v2 managed risk uses a new flow and returns a result that worker can validate again',async()=>{
 const f=fixture({v2:true}),V=require('../../nora/task-automation/risk-flow-v2'),result=await f.service.analyzeRisk(f.input);
 assert.ok(f.flows.has(defaultSlug(PROJECT,'2')));assert.equal(f.flows.has(defaultSlug(PROJECT)),false);assert.equal(result.schema_version,'2.0');assert.equal(result.execution_blocked,false);
 assert.equal(V.validateRiskResult(result,f.input.snapshot,HASH).tasks.length,1);assert.equal(JSON.stringify(result).includes('execution_blocked'),false);
});
test('custom risk requires declared v2 contract and exact output schema before execution',async()=>{
 for(const customRisk of [()=>{},f=>{f.payload.meta.ains_risk_contract_version='2';}]){const f=fixture({v2:true,customRisk});await assert.rejects(f.service.analyzeRisk(f.input),{code:'NORA_RISK_V2_CONTRACT_REQUIRED',noSideEffects:true});assert.equal(f.calls.filter(c=>c.name==='run_flow').length,0);}
 const f=fixture({v2:true,customRisk:f=>{f.payload.meta.ains_risk_contract_version='2';f.payload.agents.at(-1).outputRules=[{kind:'json',mode:'validate',schema:require('../../nora/task-automation/risk-flow-v2').MODEL_RESULT_SCHEMA}];}});assert.equal((await f.service.analyzeRisk(f.input)).schema_version,'2.0');
});
test('provisional development fails safely before dispatch without archive contract capability',async()=>{
 const f=fixture({v2:true}),c=await f.service.capabilities(f.input);assert.equal(c.development,false);assert.ok(c.blockers.some(b=>b.code==='NORA_DEVELOPMENT_NOTES_CONTRACT_REQUIRED'));
 await assert.rejects(f.service.develop(f.input),{code:'NORA_DEVELOPMENT_NOTES_CONTRACT_REQUIRED',noSideEffects:true});assert.equal(f.calls.filter(c=>c.name==='run_flow').length,0);assert.equal(f.invocations.length,0);
});
test('v2 development carries immutable notes and requires a source-grounded completion report',async()=>{
 const contract=f=>{f.payload.meta.ains_task_contract_version='2';};
 const missing=fixture({v2:true,customDevelopment:contract});await assert.rejects(missing.service.develop(missing.input),{code:'NORA_DEVELOPMENT_NOTES_REQUIRED'});
 const f=fixture({v2:true,customDevelopment:contract,output:r=>{r.schema_version='2.0';r.implementation_report={contract_version:'2.0',completion:'complete',remaining_criteria:[],notes:[]};}});
 const result=await f.service.develop(f.input);assert.equal(result.implementation_report.completion,'complete');const input=f.calls.find(c=>c.name==='run_flow').arguments.variables.automation_request;
 assert.equal(input.development_contract.version,'2.0');assert.deepEqual(input.snapshot.implementation_notes,[]);assert.ok(input.development_contract.report_schema);
});

test('verified completed v2 trace may report blocked work without fabricating a PR artifact',async()=>{
 const f=fixture({v2:true,customDevelopment:f=>{f.payload.meta.ains_task_contract_version='2';},output:r=>{r.schema_version='2.0';r.artifact=null;r.implementation_report={contract_version:'2.0',completion:'blocked',remaining_criteria:[],notes:[{id:'gap1',kind:'work_gap',category:'ui_behavior',reversible:true,title:'화면 미완료',uncertainty:'화면 선택 필요',temporary_approach:null,rationale:'표시 형식 확인',impact:'화면 일부 미완료',replacement_condition:'표시 형식 확정',evidence:[{segment_id:'seg-1',quote:'이메일 로그인 기능을 제공한다.'}]}]};}});
 const result=await f.service.develop(f.input);assert.equal(result.artifact,null);assert.equal(result.trace_id,TRACE);assert.equal(result.implementation_report.completion,'blocked');assert.equal(f.invocations.length,0);
 const partial=fixture({v2:true,customDevelopment:f=>{f.payload.meta.ains_task_contract_version='2';},output:r=>{r.schema_version='2.0';r.artifact=null;r.implementation_report={contract_version:'2.0',completion:'complete',remaining_criteria:[],notes:[]};}});await assert.rejects(partial.service.develop(partial.input),{code:'NORA_TASK_ARTIFACT_INVALID'});
});

test('v3 verifies actual sequential developer and history trace rather than trusting the last model output',async()=>{
 for(const trace of [t=>{delete t.payload.nodes;},t=>{Object.values(t.payload.nodes)[1].parent_node_id='other';},t=>{Object.values(t.payload.nodes)[1].tool_calls=[{name:'write'}];},t=>{Object.values(t.payload.nodes)[0].completed_at='2100-01-01T00:00:00Z';}]){const f=fixture({v3:true,trace});await assert.rejects(f.service.develop(f.input),{code:'NORA_DEVELOPMENT_HISTORY_TRACE_INVALID',trace_id:TRACE,noSideEffects:false});}
 for(const journal of [j=>{j.artifact.head_sha='e'.repeat(40);},j=>{j.development_journal.completion='blocked';},j=>{j.development_journal.remaining_criteria=['이메일 로그인이 가능하다.'];}]){const f=fixture({v3:true,journal});await assert.rejects(f.service.develop(f.input),{code:'NORA_DEVELOPMENT_HISTORY_CHANGED',trace_id:TRACE,noSideEffects:false});}
 const f=fixture({v3:true});assert.ok(Date.parse((await f.service.develop(f.input)).development_completed_at));
});
test('new task capabilities require v3 even if old project setting says strict',async()=>{
 const f=fixture();f.input.developmentContractVersion='3';f.input.settings.uncertainty_mode='strict';const c=await f.service.capabilities(f.input);assert.equal(c.development,false);assert.ok(c.blockers.some(b=>b.code==='NORA_DEVELOPMENT_NOTES_CONTRACT_REQUIRED'));
});

test('current Nora flowRun envelope and server-fixed execution variables are handled',async()=>{
 const f=fixture({v3:true,flowEnvelope:true});await f.service.develop(f.input);const vars=f.calls.find(c=>c.name==='run_flow').arguments.variables;assert.equal(vars.execution_task_id,f.input.taskId);assert.equal(vars.execution_base_sha,BASE);assert.equal(vars.execution_task_branch,'ains/task/'+f.input.taskId);assert.equal(vars.execution_base_branch,'main');
 const bad=fixture({v3:true,flowEnvelope:true,badEnvelope:true});await assert.rejects(bad.service.develop(bad.input),{code:'NORA_TASK_RUN_INCOMPLETE',trace_id:TRACE,noSideEffects:false});
});
test('v3 writing tools must fix task and base scope to declared server variables',async()=>{
 for(const change of [t=>t.params.find(p=>p.name==='task_id').source='llm',t=>t.params.find(p=>p.name==='expected_base_sha').fixedValue='another-sha']){const f=fixture({v3:true,customDevelopment:flow=>{const p=require('../../nora/task-automation/development-flow').buildDevelopmentFlow({projectId:PROJECT,repositoryUrl:'https://github.com/acme/demo',baseBranch:'main',connectorId:'connector_fixture',slug:'development-flow',operations:[{id:'apply_task_patch',params:['repo','task_id','expected_base_sha','patch']}]}).payload;change(p.toolBlocks[0]);flow.payload=p;}});await assert.rejects(f.service.develop(f.input),{code:'NORA_DEVELOPMENT_FLOW_SCOPE_REQUIRED',noSideEffects:true});assert.equal(f.calls.some(c=>c.name==='run_flow'),false);}
});


test('development starts without CI or preview capabilities and retains verified code before unavailable checks',async()=>{
 const f=fixture({v3:true,omitOperations:['list_check_runs','list_deployments','list_deployment_statuses']});f.input.settings.preview_origins=[];
 const c=await f.service.capabilities(f.input);assert.equal(c.development,true);assert.equal(c.ci,false);assert.equal(c.preview,false);assert.equal(c.merge,false);
 const result=await f.service.develop(f.input);assert.equal(result.artifact.evidence_status,'verified');assert.equal(result.artifact.ci_status,'unavailable');assert.equal(result.artifact.preview_status,'unavailable');assert.ok(result.artifact.diff);assert.equal(f.invocations.some(i=>i.operation==='list_check_runs'||i.operation==='list_deployments'),false);
 const count=f.calls.filter(c=>c.name==='run_flow').length;const refreshed=await f.service.refreshArtifact({...f.input,artifact:result.artifact});assert.equal(refreshed.diff,result.artifact.diff);assert.equal(f.calls.filter(c=>c.name==='run_flow').length,count);
});
test('normalized Nora compare binds exact repository refs, full commits and file evidence',()=>{
 const {comparisonEvidence}=require('../server/nora-task-provider'),s={fullName:'acme/demo'},data={url:`https://github.com/acme/demo/compare/${BASE}...${HEAD}`,status:'ahead',ahead_by:1,behind_by:0,commits:[{sha:HEAD,url:`https://github.com/acme/demo/commit/${HEAD}`}],files:[{filename:'src/app.js',patch:'@@ -1 +1 @@\n-old\n+new'}]};
 assert.deepEqual(comparisonEvidence(data,s,BASE,HEAD).changed_files,['src/app.js']);
 for(const modify of [d=>d.url+='?other=1',d=>d.url=d.url.replace('acme','other'),d=>d.behind_by=1,d=>d.ahead_by=2,d=>d.commits[0].sha=BASE,d=>d.files[0].filename='../other',d=>d.files[0].previous_filename='/etc/passwd']){const changed=structuredClone(data);modify(changed);assert.throws(()=>comparisonEvidence(changed,s,BASE,HEAD),{code:'NORA_TASK_DIFF_UNVERIFIED'});}
});
test('SDK runs with one project-bound developer and API history while requiring an actual connection',async()=>{
 const f=fixture({v3:true,sdk:true,omitOperations:['apply_task_patch','list_check_runs','list_deployments','list_deployment_statuses']});assert.equal((await f.service.capabilities(f.input)).development,true);const result=await f.service.develop(f.input);assert.ok(result.artifact.diff);
 const scope=f.calls.find(c=>c.name==='run_flow').arguments.variables.automation_request.sdk_execution_context;assert.equal(scope.working_folder,'/tmp/ctas-sdk');assert.equal(scope.task_branch,'ains/task/'+f.input.taskId);assert.equal(scope.base_sha,BASE);
 for(const sdkConnection of [c=>c.connected=false,c=>delete c.connected,c=>c.busy=true,c=>c.provider='claude-code',c=>c.workingFolder='/tmp/other',c=>c.workspace='/tmp/other']){const wrong=fixture({v3:true,sdk:true,sdkConnection});assert.equal((await wrong.service.capabilities(wrong.input)).development,false);await assert.rejects(wrong.service.develop(wrong.input));assert.equal(wrong.calls.some(c=>c.name==='run_flow'),false);}
 const pending=fixture({v3:true,sdk:true,noSdk:true});assert.equal((await pending.service.capabilities(pending.input)).development,false);
});
test('SDK connection folder changes after execution invalidate attribution and retain trace for recovery',async()=>{
 const f=fixture({v3:true,sdk:true,sdkConnection:(c,n)=>{if(n>=3)c.workingFolder='/tmp/changed';}});await assert.rejects(f.service.develop(f.input),{code:'NORA_SDK_CONNECTION_REQUIRED',noSideEffects:false,trace_id:TRACE});
});
test('SDK history cannot acquire native tools and selected runtime must match project settings',async()=>{
 for(const customDevelopment of [f=>f.payload.agents[1].nativeTools=['Bash'],f=>f.payload.agents[1].mode='sdk',f=>f.payload.meta.ains_sdk_working_folder='/other',f=>f.payload.agents[0].sdkProvider='claude-code']){const f=fixture({v3:true,sdk:true,customDevelopment});await assert.rejects(f.service.develop(f.input));assert.equal(f.calls.some(c=>c.name==='run_flow'),false);}
});


test('SDK local patch is retained as unverified reported work, never fabricated remote evidence',async()=>{
 const f=fixture({v3:true,sdk:true,output:r=>{r.artifact={kind:'local_patch',base_sha:BASE,patch:'diff --git a/src/app.js b/src/app.js\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1 @@\n-old\n+new',changed_files:['src/app.js']};}});
 const result=await f.service.develop(f.input);assert.equal(result.artifact.kind,'local_patch');assert.equal(result.artifact.evidence_status,'unverified');assert.equal(result.artifact.pr_number,null);assert.equal(result.artifact.head_sha,null);assert.equal(result.artifact.verification_status,'unavailable');assert.equal(f.invocations.length,0);
 await assert.rejects(f.service.merge({...f.input,artifact:result.artifact}),{code:'NORA_TASK_MERGE_SCOPE_MISMATCH'});
});
test('remote commit without PR is attributable only to the exact task branch and remains merge-blocked',async()=>{
 const setup={v3:true,sdk:true,omitOperations:['get_pull_request','list_check_runs','list_deployments','list_deployment_statuses'],output:r=>{r.artifact={kind:'git_commit',base_sha:BASE,head_sha:HEAD};}};
 const f=fixture(setup),result=await f.service.develop(f.input);assert.equal(result.artifact.kind,'git_commit');assert.equal(result.artifact.evidence_status,'verified');assert.equal(result.artifact.pr_number,null);assert.equal(result.artifact.verification_status,'unavailable');assert.equal(f.invocations.find(i=>i.operation==='list_commits').args.branch,'refs/heads/ains/task/'+f.input.taskId);
 for(const gitResult of [(op,v)=>{if(op==='list_commits')v[0].sha=BASE;},(op,v)=>{if(op==='list_commits')v[0].url=v[0].url.replace('acme','other');}]){const wrong=fixture({...setup,gitResult});await assert.rejects(wrong.service.develop(wrong.input),{code:'NORA_TASK_BRANCH_UNVERIFIED'});}
});
test('SDK flow may bind provider/folder while per-run observed connection identity is still pinned',async()=>{
 const f=fixture({v3:true,sdk:true,customDevelopment:f=>f.payload.meta.ains_sdk_connection_id=null});f.input.settings.sdk_connection_id=null;await f.service.develop(f.input);const request=f.calls.find(c=>c.name==='run_flow').arguments.variables.automation_request;assert.equal(request.sdk_execution_context.connection_id,'sdk-fixture');assert.ok(request.sdk_execution_commands.preflight);assert.ok(request.sdk_execution_commands.postflight);
 const changed=fixture({v3:true,sdk:true,customDevelopment:f=>f.payload.meta.ains_sdk_connection_id=null,sdkConnection:(c,n)=>{if(n>=3)c.id='sdk-replaced';}});changed.input.settings.sdk_connection_id=null;await assert.rejects(changed.service.develop(changed.input),{code:'NORA_SDK_CONNECTION_CHANGED',noSideEffects:false});
});
test('published legacy API v3 schema hashes remain compatible while SDK requires new contract',async()=>{
 const contract=require('../../nora/task-automation/development-flow'),hash=require('../server/context-contract').hash;
 const customDevelopment=f=>{f.payload.meta.ains_development_schema_sha256=hash(contract.LEGACY_DEVELOPMENT_RESULT_SCHEMA);f.payload.meta.ains_history_schema_sha256=hash(contract.LEGACY_MODEL_RESULT_SCHEMA);};
 const f=fixture({v3:true,customDevelopment});assert.ok((await f.service.develop(f.input)).artifact.diff);
 const sdk=fixture({v3:true,sdk:true,customDevelopment});await assert.rejects(sdk.service.develop(sdk.input));assert.equal(sdk.calls.some(c=>c.name==='run_flow'),false);
});


test('read-only refresh promotes a verified task commit to its exact PR without re-executing the flow',async()=>{
 const f=fixture({v3:true,sdk:true,output:r=>{r.artifact={kind:'git_commit',base_sha:BASE,head_sha:HEAD};}}),result=await f.service.develop(f.input);assert.equal(result.artifact.pr_number,null);const runs=f.calls.filter(c=>c.name==='run_flow').length;
 const refreshed=await f.service.refreshArtifact({...f.input,artifact:result.artifact});assert.equal(refreshed.kind,'pull_request');assert.equal(refreshed.pr_number,1);assert.equal(refreshed.head_sha,result.artifact.head_sha);assert.equal(refreshed.diff,result.artifact.diff);assert.equal(f.calls.filter(c=>c.name==='run_flow').length,runs);
 const listed=f.invocations.find(i=>i.operation==='list_pull_requests');assert.deepEqual(listed.args,{state:'open',head:'acme:ains/task/task_fixture',base:'main'});
 for(const gitResult of [(op,v)=>{if(op==='list_pull_requests')v.push({number:2});},(op,v)=>{if(op==='get_pull_request')v.head.ref='ains/task/another';}]){const bad=fixture({v3:true,sdk:true,gitResult});await assert.rejects(bad.service.refreshArtifact({...bad.input,artifact:{...result.artifact}}));}
});
test('reported SDK command output is retained separately and never becomes passed CI',async()=>{
 const reported=[{command:'npm test',exit_code:0,output:'AI reported output'}],f=fixture({v3:true,sdk:true,output:r=>{r.artifact={kind:'local_patch',base_sha:BASE,patch:'diff --git a/src/app.js b/src/app.js\n@@ -1 +1 @@\n-old\n+new',changed_files:['src/app.js'],reported_checks:reported};}});const result=await f.service.develop(f.input);assert.deepEqual(result.artifact.reported_checks,reported);assert.equal(result.artifact.ci_status,'unavailable');assert.equal(result.artifact.evidence_status,'unverified');
});
test('SDK metadata mismatches are reported by capability discovery before a task can start',async()=>{
 for(const mismatch of [{ains_sdk_working_folder:'/another-project'},{ains_sdk_provider:'claude-code'},{ains_sdk_connection_id:'another-connection'}]){
  const f=fixture({v3:true,sdk:true,customDevelopment:f=>Object.assign(f.payload.meta,mismatch)}),c=await f.service.capabilities(f.input);assert.equal(c.development,false);assert.ok(c.blockers.some(b=>b.code==='NORA_SDK_FLOW_SCOPE_REQUIRED'));assert.equal(f.calls.some(c=>c.name==='run_flow'),false);
 }
});
