'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createNoraTaskProvider,defaultSlug}=require('../server/nora-task-provider');
const {buildRiskFlow}=require('../../nora/task-automation/risk-flow');
const PROJECT='project_fixture',WORKSPACE='t_fixture_workspace',SPACE='space_fixture',HASH='a'.repeat(64),BASE='b'.repeat(40),HEAD='c'.repeat(40),MERGE='d'.repeat(40),TRACE='trc_fixture12345678';
function fixture(options={}){
  const snapshot={schema_version:'1.0',project_id:PROJECT,request_id:'request_fixture',source:{revision_id:'revision_fixture',document_id:'document_fixture',title:'원문',category:'specification',sha256:'e'.repeat(64),segments:[{segment_id:'seg-1',requirement_key:null,text:'이메일 로그인 기능을 제공한다.',locator:{kind:'text',label:'본문'},extraction_status:'ok'}]},context:{version:0,records:[]},project:{name:'합성 프로젝트',goal:'이메일 로그인',settings_version:1},repository:{url:'https://github.com/acme/demo',base_branch:'main',head_sha:BASE},nora:{workspace_id:WORKSPACE},automation:{settings_version:1,risk_flow_slug:null,development_flow_slug:'development-flow',preview_origins:['https://preview.example']}};
  const input={projectId:PROJECT,workspaceId:WORKSPACE,snapshot,snapshotHash:HASH,settings:{...snapshot.automation},taskId:'task_fixture',task:{title:'이메일 로그인'},expectedHeadSha:HEAD,targetBranch:'main'};
  const artifact={pr_number:1,head_sha:HEAD,base_sha:BASE,preview_url:'https://preview.example/app'};input.artifact=artifact;
  const riskResult={schema_version:'1.0',project_id:PROJECT,request_id:snapshot.request_id,input_sha256:HASH,risks:[],questions:[],tasks:[{title:'이메일 로그인',description:'이메일 로그인 기능 제공',acceptance_criteria:['이메일 로그인이 가능하다.'],evidence:[{segment_id:'seg-1',quote:'이메일 로그인 기능을 제공한다.'}]}]};
  const row={project_id:PROJECT,workspace_id:WORKSPACE,space_id:SPACE,connector_id:'connector_fixture',status:'ready',version:1};
  const pool={query:async(sql,args)=>{assert.ok(sql.includes('project_nora_workspaces'));assert.equal(args[0],PROJECT);return {rows:[row]};}};
  const calls=[],invocations=[],flows=new Map();let raw,request,merged=false;
  function fullFlow(slug){return {id:slug,payload:buildRiskFlow({projectId:PROJECT,spaceId:SPACE,slug}).payload,publishState:{publishedVersionId:'version-1',hasUnpublishedChanges:false}};}
  const dev=fullFlow('development-flow');Object.assign(dev.payload.meta,{ains_repository_url:'https://github.com/acme/demo.git',ains_default_branch:'main'});options.customDevelopment?.(dev);flows.set('development-flow',dev);
  if(options.customRisk){input.settings.risk_flow_slug='custom-risk';const full=fullFlow('custom-risk');options.customRisk(full);flows.set('custom-risk',full);}
  const provider={callTool:async call=>{
    assert.equal(call.projectId,PROJECT);assert.equal(call.workspaceId,WORKSPACE);calls.push(call);
    const {name,arguments:args}=call;
    if(name==='list_flows')return [...flows.values()].map(f=>({id:f.id,name:f.id}));
    if(name==='apply_flow'){assert.equal(args.expectedRevision,'0');assert.ok(!flows.has(args.slug));flows.set(args.slug,{id:args.slug,payload:structuredClone(args.payload),publishState:{hasUnpublishedChanges:true}});return {id:args.slug};}
    if(name==='publish_flow'){const f=flows.get(args.slug);f.publishState={publishedVersionId:'version-1',hasUnpublishedChanges:false};options.afterPublish?.(f);return {versionId:'version-1'};}
    if(name==='get_flow'){const f=structuredClone(flows.get(args.slug));if(options.staleVersion&&raw)f.publishState.publishedVersionId='version-2';return f;}
    if(name==='run_flow'){
      request=args.variables.automation_request;assert.equal(args.input,JSON.stringify(request));assert.equal(args.test,false);
      const output=args.slug==='development-flow'?{project_id:PROJECT,task_id:input.taskId,input_sha256:HASH,artifact:structuredClone(artifact)}:structuredClone(riskResult);
      options.output?.(output);raw={status:'ok',rawStatus:'completed',traceId:TRACE,output:JSON.stringify(output)};return raw;
    }
    if(name==='get_trace'){const trace={traceId:TRACE,status:'completed',payload:{tenant_id:WORKSPACE,graph_slug:calls.findLast(c=>c.name==='run_flow').arguments.slug,flow_input:JSON.stringify(request),flow_output:raw.output}};options.trace?.(trace);return trace;}
    throw new Error('Unexpected tool '+name);
  }};
  const operationParams={apply_task_patch:['task_id','expected_base_sha','patch'],get_pull_request:['pull_number'],list_check_runs:['ref'],list_deployments:['sha'],list_deployment_statuses:['deployment_id'],compare:['base','head'],merge_pull_request:['pull_number','sha','expected_base_sha','merge_method']};
  const operations=new Map(Object.entries(operationParams).map(([id,params])=>[id,{id,params:['repo',...params]}]));
  for(const key of options.omitOperations||[])operations.delete(key);
  const gitSnapshot={row,settings:{base_branch:'main',version:1},repo:{url:'https://github.com/acme/demo.git'},fullName:'acme/demo',operations};
  let snapshotCount=0;const git={snapshot:async p=>{assert.equal(p,PROJECT);options.gitSnapshot?.(gitSnapshot,++snapshotCount);return gitSnapshot;},head:async()=>options.baseChanged?'f'.repeat(40):BASE,unchanged:async()=>{},invoke:async(s,operation,args)=>{
    invocations.push({operation,args});let value;
    if(operation==='get_pull_request')value={number:1,html_url:'https://github.com/acme/demo/pull/1',head:{sha:HEAD,ref:'ains/task/task_fixture',repo:{full_name:'acme/demo'}},base:{ref:'main',sha:BASE,repo:{full_name:'acme/demo'}},state:merged?'closed':'open',draft:false,merged,merge_commit_sha:merged?MERGE:null};
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
