'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createNoraChannelSourceProvider}=require('../server/nora-channel-source-provider');
const {buildChannelPipeline,identity,cronFor}=require('../../nora/channel-ingestion/pipeline');
const projectId='project-channel-test',workspaceId='t_channel_test_workspace',sourceId='channel-source-test';
function fixture(){
 const input={projectId,workspaceId,sourceId,connectorId:'conn_channel_test_slack',externalChannelId:'C_CHANNEL_TEST',intervalMinutes:15,scheduleEnabled:true,triggerEnabled:true};
 const graphs=new Map(),live=new Map(),docs=new Map(),calls=[];let foreign=false,autoExtract=false;
 const provider={callTool:async call=>{calls.push(call);assert.equal(call.projectId,projectId);assert.equal(call.workspaceId,workspaceId);const a=call.arguments;
  switch(call.name){
   case 'list_connectors':return [{id:input.connectorId,provider:'slack',name:'Slack 업무',status:'active',config:{token:'NEVER_RETURN'}},{id:'conn_github_test',provider:'github',name:'Code'},{id:'conn_discord_test',provider:'discord',status:'revoked'}];
   case 'list_pipelines':return [...graphs.values()].map(g=>({id:g.id,name:g.name}));
   case 'create_knowledge_folder':return {};
   case 'create_pipeline':graphs.set(a.id,{id:a.id,name:a.name,nodes:[],edges:[]});return {id:a.id};
   case 'get_pipeline':return structuredClone(graphs.get(a.pipelineId));
   case 'add_pipeline_node':{const {pipelineId,...node}=structuredClone(a);graphs.get(pipelineId).nodes.push(node);return node;}
   case 'connect_pipeline_edge':graphs.get(a.pipelineId).edges.push(structuredClone(a));return {};
   case 'set_pipeline_schedule':{const g=graphs.get(a.pipelineId),n=g.nodes.find(n=>n.paletteId==='ingest_schedule');n.config={scheduleMode:a.mode,cron:a.cron,scheduleTimezone:a.tz,scheduleInput:a.input};return {};}
   case 'clear_pipeline_schedule':graphs.get(a.pipelineId).nodes.find(n=>n.paletteId==='ingest_schedule').config={};return {};
   case 'rotate_pipeline_trigger_secret':graphs.get(a.pipelineId).nodes.find(n=>n.id===a.nodeId).config.apiAuthSecret={enc:'nora-encrypted-key',lastFour:'safe'};return {token:'ONE_TIME_PLAINTEXT_DO_NOT_RETURN'};
   case 'publish_pipeline':live.set(a.pipelineId,{is_live:true,content_hash:'fixed-hash',payload:structuredClone(graphs.get(a.pipelineId))});return {};
   case 'get_live_pipeline_publication':return structuredClone(live.get(a.pipelineId));
   case 'invoke_pipeline':return {kind:'pipelineRun',ok:true,pipelineId:a.pipelineId,runId:'00000000-0000-4000-8000-000000000001',status:'succeeded',report:{stages:[{status:'ok',artifacts:{failed:0}}]}};
   case 'list_documents':return [...docs.values()].filter(d=>d.tags.includes(a.tag)).map(d=>Object.fromEntries(Object.entries(d).filter(([k])=>a.fields.includes(k))));
   case 'get_document':return structuredClone(docs.get(a.documentId));
   case 'run_pipeline_document':{const node=graphs.get(a.pipelineId).nodes.find(n=>n.paletteId==='norm_chunk');if(autoExtract){docs.get(a.documentId).extracted_text='Nora 원문 추출 결과';docs.get(a.documentId).updated_at='2026-10-15T03:00:00Z';}return {stages:[{block_id:node.id,palette_id:'norm_chunk',status:'ok',artifacts:{chunk_count:1}}]};}
   default:throw new Error('unexpected '+call.name);
  }
 }};
 const pool={query:async()=>({rows:[{project_id:projectId,workspace_id:foreign?'t_foreign_workspace':workspaceId,status:'ready'}]})};
 return {input,calls,graphs,live,docs,provider,service:createNoraChannelSourceProvider({pool,provider}),setForeign:()=>foreign=true,setAutoExtract:()=>autoExtract=true};
}
function doc(input,id,updatedAt,text='원문 메시지'){return {id,tenant_id:workspaceId,name:'슬랙 기록',tags:[identity(input).libraryTag],updated_at:updatedAt,created_at:updatedAt,has_extracted_text:true,extracted_text:text};}
test('native schedule and authenticated event entry use the same fixed connector and Library scope',async()=>{
 const f=fixture(),result=await f.service.provision(f.input);assert.equal(result.delivery,'nora_library');assert.equal(result.triggerUrl,null);assert.equal(f.graphs.size,2);
 const schedule=f.graphs.get(result.pipelineId),event=f.graphs.get(result.triggerPipelineId);
 assert.equal(schedule.nodes[0].paletteId,'ingest_schedule');assert.equal(schedule.nodes[0].config.cron,'*/15 * * * *');assert.equal(event.nodes[0].paletteId,'trg_http_api');assert.equal(event.nodes[0].config.auth,'bearer');
 assert.equal(f.calls.filter(c=>c.name==='rotate_pipeline_trigger_secret').length,1);assert.ok(!JSON.stringify(result).includes('ONE_TIME_PLAINTEXT'));
 for(const graph of [schedule,event]){assert.equal(graph.nodes[1].config.connector,f.input.connectorId);assert.equal(graph.nodes[1].config.folder_id,f.input.externalChannelId);assert.equal(graph.nodes[1].config.library_folder,result.libraryTag);assert.ok(!JSON.stringify(graph).includes('callbackToken'));}
 assert.equal(schedule.nodes[2].paletteId,'norm_chunk');assert.equal(schedule.nodes[2].config.type_profile,'off');assert.ok(!schedule.nodes.some(n=>n.paletteId==='enr_script'));
 await f.service.provision({...f.input,...result});assert.equal(f.calls.filter(c=>c.name==='create_pipeline').length,2);assert.equal(f.calls.filter(c=>c.name==='add_pipeline_node').length,6);
});
test('Nora connector discovery returns only source providers and never credential fields',async()=>{
 const f=fixture(),rows=await f.service.listConnectors(f.input);assert.equal(rows.length,2);assert.equal(rows[1].enabled,false);assert.ok(!JSON.stringify(rows).includes('NEVER_RETURN'));assert.ok(!rows.some(c=>c.provider==='github'));
});
test('schedule changes and pause preserve source binding without rewriting nodes',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input);await f.service.provision({...f.input,...ids,intervalMinutes:60});assert.equal(f.graphs.get(ids.pipelineId).nodes[0].config.cron,'0 */1 * * *');
 await f.service.provision({...f.input,...ids,scheduleEnabled:false});assert.deepEqual(f.graphs.get(ids.pipelineId).nodes[0].config,{});assert.equal(f.calls.filter(c=>c.name==='clear_pipeline_schedule').length,1);
});
test('a removed connector does not prevent disabling an already managed native schedule',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input),original=f.provider.callTool;
 f.provider.callTool=c=>c.name==='list_connectors'?Promise.resolve([]):original(c);
 await f.service.provision({...f.input,...ids,scheduleEnabled:false,triggerEnabled:false});assert.deepEqual(f.graphs.get(ids.pipelineId).nodes[0].config,{});
});
test('manual and event runs validate immutable graph and published snapshot before dispatch',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input),args={...f.input,...ids,requestId:'request-one',entrypoint:'trigger'};
 const result=await f.service.run(args);assert.equal(result.pipelineId,ids.triggerPipelineId);assert.deepEqual(f.calls.find(c=>c.name==='invoke_pipeline').arguments.input,{source_id:sourceId});
 const graph=f.graphs.get(ids.triggerPipelineId);graph.nodes[1].config.folder_id='FOREIGN_CHANNEL';const count=f.calls.length;
 await assert.rejects(f.service.run(args),{code:'NORA_CHANNEL_PIPELINE_CHANGED'});assert.ok(!f.calls.slice(count).some(c=>c.name==='invoke_pipeline'));
});
test('external edits and foreign workspace are never overwritten or executed',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input);f.graphs.get(ids.pipelineId).nodes[1].config.recursive=true;const count=f.calls.length;
 await assert.rejects(f.service.provision({...f.input,...ids}),{code:'NORA_CHANNEL_PIPELINE_CHANGED'});assert.ok(!f.calls.slice(count).some(c=>['update_pipeline_node','set_pipeline_schedule'].includes(c.name)));
 f.setForeign();await assert.rejects(f.service.readRecords({...f.input,...ids}),{code:'NORA_CHANNEL_CONNECTION_REQUIRED'});
});
test('Library reconciliation reads complete text, stable cursor, and does not invent message time',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input);f.docs.set('doc_first',doc(f.input,'doc_first','2026-10-15T01:00:00Z','긴 원문\n'.repeat(3000)));f.docs.set('doc_second',doc(f.input,'doc_second','2026-10-15T02:00:00Z'));
 const first=await f.service.readRecords({...f.input,...ids,cursor:{},limit:1});assert.equal(first.records.length,1);assert.equal(first.records[0].text,'긴 원문\n'.repeat(3000));assert.equal(first.records[0].sent_at,null);assert.equal(first.hasMore,true);
 const second=await f.service.readRecords({...f.input,...ids,cursor:first.cursor,limit:1});assert.equal(second.records[0].id,'doc_second');assert.equal(second.hasMore,false);
 const empty=await f.service.readRecords({...f.input,...ids,cursor:second.cursor});assert.deepEqual(empty.records,[]);assert.deepEqual(empty.cursor,second.cursor);
 assert.ok(f.calls.filter(c=>c.name==='list_documents').every(c=>!c.arguments.fields.includes('extracted_text')));
});
test('unextracted documents, cross-project tags and foreign document scopes cannot advance ingestion',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input),record=doc(f.input,'doc_missing','2026-10-15T01:00:00Z');delete record.extracted_text;f.docs.set(record.id,record);
 await assert.rejects(f.service.readRecords({...f.input,...ids}),{code:'NORA_CHANNEL_DOCUMENT_NOT_READY'});
 await assert.rejects(f.service.readRecords({...f.input,...ids,libraryTag:'another-project'}),{code:'NORA_CHANNEL_SCOPE_MISMATCH'});
 record.tenant_id='t_foreign_workspace';await assert.rejects(f.service.readRecords({...f.input,...ids}),{code:'NORA_CHANNEL_SCOPE_MISMATCH'});
});
test('microsecond edits and original document dates survive cursor processing',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input),record={...doc(f.input,'doc_fast_edit','2026-10-15T01:00:00.123001Z'),published_at:'2026-10-14',effective_at:'2026-10-15'};f.docs.set(record.id,record);
 const first=await f.service.readRecords({...f.input,...ids});assert.equal(first.records[0].metadata.published_at,'2026-10-14');
 record.updated_at='2026-10-15T01:00:00.123002Z';record.extracted_text='동일 millisecond 내 수정';
 const second=await f.service.readRecords({...f.input,...ids,cursor:first.cursor});assert.equal(second.records.length,1);assert.notEqual(second.cursor.updatedAt,first.cursor.updatedAt);
});
test('raw Library documents are natively extracted before cursor advance, never manually transcribed',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input),record=doc(f.input,'doc_raw_bytes','2026-10-15T01:00:00Z');delete record.extracted_text;f.docs.set(record.id,record);f.setAutoExtract();
 const first=await f.service.readRecords({...f.input,...ids,cursor:{}});assert.deepEqual(first.records,[]);assert.deepEqual(first.cursor,{});assert.equal(first.hasMore,true);
 const second=await f.service.readRecords({...f.input,...ids,cursor:first.cursor});assert.equal(second.records[0].text,'Nora 원문 추출 결과');assert.equal(f.calls.filter(c=>c.name==='run_pipeline_document').length,1);assert.ok(!f.calls.some(c=>c.name==='update_document'));
});
test('known extraction failure and repeated null status do not cause unbounded document execution',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input),record=doc(f.input,'doc_no_text','2026-10-15T01:00:00Z');delete record.extracted_text;f.docs.set(record.id,record);
 record.extract_status='failed';await assert.rejects(f.service.readRecords({...f.input,...ids}),{code:'NORA_CHANNEL_EXTRACTION_REVIEW_REQUIRED'});assert.equal(f.calls.filter(c=>c.name==='run_pipeline_document').length,0);
 record.extract_status=null;
 for(let i=0;i<3;i++)await assert.rejects(f.service.readRecords({...f.input,...ids}),{code:'NORA_CHANNEL_DOCUMENT_NOT_READY'});
 await assert.rejects(f.service.readRecords({...f.input,...ids}),{code:'NORA_CHANNEL_EXTRACTION_REVIEW_REQUIRED'});assert.equal(f.calls.filter(c=>c.name==='run_pipeline_document').length,3);
});
test('failed records in a nominally successful Nora run do not count as success',async()=>{
 const f=fixture(),ids=await f.service.provision(f.input),original=f.provider.callTool;
 f.provider.callTool=async c=>c.name==='invoke_pipeline'?{kind:'pipelineRun',ok:true,pipelineId:ids.pipelineId,runId:'run_failed_one',status:'succeeded',report:{stages:[{status:'ok',artifacts:{failed:1}}]}}:original(c);
 await assert.rejects(f.service.run({...f.input,...ids,requestId:'one'}),{code:'NORA_CHANNEL_RUN_FAILED',dispatched:true,noSideEffects:false});
});
test('scope identifiers are deterministic, domain-isolated and schedule intervals exact',()=>{
 const f=fixture();assert.deepEqual(identity(f.input),identity(f.input));assert.notEqual(identity(f.input).libraryTag,identity({...f.input,projectId:'project-other'}).libraryTag);assert.equal(cronFor(120),'0 */2 * * *');assert.throws(()=>cronFor(90),{code:'NORA_CHANNEL_INPUT_INVALID'});
 assert.deepEqual(buildChannelPipeline(f.input),buildChannelPipeline(f.input));
});
