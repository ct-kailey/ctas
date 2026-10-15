'use strict';
const {isDeepStrictEqual}=require('node:util');
const {binding,remoteId}=require('./project-nora');
const {identity,cronFor,INTERVALS,buildChannelPipeline}=require('../../nora/channel-ingestion/pipeline');

const SOURCE_PROVIDERS=new Set(['slack','discord','google_drive','gdrive','google-drive','onedrive','microsoft']);
const DEFAULTS={dispatch:'parallel',exclusive:true,routing_key:'',retry_max:0,retry_backoff:'exponential',retry_delay_s:1,timeout_s:0,scheduleInput:''};
function fail(code,message,status=409){throw Object.assign(new Error(message),{code,status,noSideEffects:true});}
function array(value,key){const rows=Array.isArray(value)?value:value?.[key];if(!Array.isArray(rows)||rows.length>10000)fail('NORA_CHANNEL_RESPONSE_INVALID','Nora 수집 응답을 확인하지 못했습니다.',502);return rows;}
function scope(value,workspaceId){for(const key of ['tenant_id','workspace_id','workspaceId'])if(value?.[key]!==undefined&&value[key]!==workspaceId)fail('NORA_CHANNEL_SCOPE_MISMATCH','수집 대상의 Nora 워크스페이스가 일치하지 않습니다.',403);}
function cleanConfig(value,expected){
  const result={...value};
  for(const [key,defaultValue]of Object.entries(DEFAULTS))if(!Object.hasOwn(expected,key)&&isDeepStrictEqual(result[key],defaultValue))delete result[key];
  // API trigger secrets are generated and encrypted by Nora, never returned to
  // the browser or used as collection credentials. MCP authenticates dispatch.
  if(result.apiAuthSecret&&typeof result.apiAuthSecret==='object'&&typeof result.apiAuthSecret.lastFour==='string'&&typeof result.apiAuthSecret.enc==='string')delete result.apiAuthSecret;
  return result;
}
function inspectGraph(graph,template,{partial=false}={}){
  if(!graph||graph.name!==template.name||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))fail('NORA_CHANNEL_PIPELINE_CHANGED','Nora 수집 파이프라인의 구성을 확인하세요.');
  if(!partial&&graph.nodes.length!==template.nodes.length)fail('NORA_CHANNEL_PIPELINE_CHANGED','수집 파이프라인에 예상하지 못한 노드가 있습니다.');
  const wanted=new Map(template.nodes.map(n=>[n.id,n])),seen=new Set();
  for(const node of graph.nodes){
    const expected=wanted.get(node.id);
    if(!expected||seen.has(node.id)||node.locked===true||node.notes!==expected.notes||(node.palette_id??node.paletteId)!==expected.paletteId||node.stage!==expected.stage||node.title!==expected.title||!isDeepStrictEqual(cleanConfig(node.config||{},expected.config),expected.config)||(node.output_ports??node.outputPorts??[]).length)fail('NORA_CHANNEL_PIPELINE_CHANGED','자동 수집 노드가 수정되었습니다. 변경된 설정을 덮어쓰지 않습니다.');
    seen.add(node.id);
  }
  const edges=graph.edges.map(edge=>{
    if(edge.label||edge.match_mode||edge.matchMode||edge.from_port||edge.fromPort)fail('NORA_CHANNEL_PIPELINE_CHANGED','수집 파이프라인 연결이 변경되었습니다.');
    return `${edge.from_node_id??edge.fromNodeId}->${edge.to_node_id??edge.toNodeId}`;
  }),expectedEdges=template.edges.map(edge=>`${edge.fromNodeId}->${edge.toNodeId}`);
  if(new Set(edges).size!==edges.length||edges.some(e=>!expectedEdges.includes(e))||(!partial&&edges.length!==expectedEdges.length))fail('NORA_CHANNEL_PIPELINE_CHANGED','수집 파이프라인 연결이 변경되었습니다.');
  return {nodeIds:seen,edges:new Set(edges)};
}
function existingSchedule(graph,template){
  const config=graph?.nodes?.find(n=>n.id===template.nodes[0].id)?.config||{};
  if(!config.cron)return {enabled:false,intervalMinutes:15};
  const intervalMinutes=INTERVALS.find(n=>cronFor(n)===config.cron);
  if(!intervalMinutes||config.scheduleMode!=='cron'||config.scheduleTimezone!=='Asia/Seoul')fail('NORA_CHANNEL_PIPELINE_CHANGED','수집 일정이 Nora에서 직접 변경되었습니다.');
  return {enabled:true,intervalMinutes};
}
function timestamp(value){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value)||!Number.isFinite(Date.parse(value)))return null;
  // PostgreSQL has microsecond precision; Date.toISOString alone would collapse
  // distinct revisions into the same cursor and silently skip a fast edit.
  const fraction=(/\.(\d{1,9})(?:Z|[+-]\d\d:\d\d)$/.exec(value)?.[1]||'').padEnd(9,'0');
  return `${new Date(value).toISOString().slice(0,19)}.${fraction}Z`;
}
function sourceDate(value){return typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value))?value:timestamp(value);}
function cursorValue(value){
  if(value==null||(typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0))return null;
  if(typeof value!=='object'||Array.isArray(value)||!timestamp(value.updatedAt)||!remoteId(value.id))fail('NORA_CHANNEL_CURSOR_INVALID','수집 재개 위치를 확인하세요.',400);
  return {updatedAt:timestamp(value.updatedAt),id:value.id};
}
function compare(a,b){return a.updatedAt.localeCompare(b.updatedAt)||a.id.localeCompare(b.id);}

function createNoraChannelSourceProvider({pool,provider}){
  const extractionAttempts=new Map();
  async function bound(input){identity(input);const row=await binding(pool,input.projectId);if(!row||row.workspace_id!==input.workspaceId||row.status!=='ready'||typeof provider?.callTool!=='function')fail('NORA_CHANNEL_CONNECTION_REQUIRED','프로젝트의 Nora 워크스페이스 연결을 먼저 완료하세요.');return row;}
  const call=async(input,name,args={})=>{await input.authorize?.();return provider.callTool({projectId:input.projectId,workspaceId:input.workspaceId,name,arguments:args,signal:input.signal});};
  async function connectors(input){
    const rows=array(await call(input,'list_connectors'),'connectors');
    return rows.filter(row=>SOURCE_PROVIDERS.has(row.provider)).map(row=>{
      scope(row,input.workspaceId);if(!remoteId(row.id))fail('NORA_CHANNEL_RESPONSE_INVALID','Nora 커넥터 식별자를 확인하지 못했습니다.',502);
      return {id:row.id,name:typeof row.name==='string'?row.name:row.id,provider:row.provider,enabled:row.enabled!==false&&!['disabled','revoked','disconnected','error'].includes(row.status)};
    });
  }
  async function get(input,pipelineId){const graph=await call(input,'get_pipeline',{pipelineId});if(graph?.id!==pipelineId)fail('NORA_CHANNEL_PIPELINE_CHANGED','수집 파이프라인이 일치하지 않습니다.');scope(graph,input.workspaceId);for(const node of graph.nodes||[])scope(node,input.workspaceId);return graph;}
  async function published(input,template){
    const live=await call(input,'get_live_pipeline_publication',{pipelineId:template.pipelineId});
    if(!live?.is_live||!live.payload||!live.content_hash)fail('NORA_CHANNEL_PIPELINE_UNPUBLISHED','수집 파이프라인 발행을 확인하지 못했습니다.');
    inspectGraph(live.payload,template);return live;
  }
  async function ensure(input,entrypoint,listed){
    const disabled=buildChannelPipeline(input,{entrypoint}),exists=listed.some(row=>row.id===disabled.pipelineId);
    if(!exists)await call(input,'create_pipeline',{id:disabled.pipelineId,name:disabled.name,addedStages:disabled.addedStages});
    let graph=await get(input,disabled.pipelineId);
    if(exists&&graph.nodes.length<disabled.nodes.length&&await call(input,'get_live_pipeline_publication',{pipelineId:disabled.pipelineId}))fail('NORA_CHANNEL_PIPELINE_CHANGED','발행한 수집 파이프라인에서 노드가 삭제되었습니다. 변경 사항을 덮어쓰지 않습니다.');
    const oldOptions=entrypoint==='schedule'?existingSchedule(graph,disabled):{},old=buildChannelPipeline(input,{entrypoint,...oldOptions});
    const current=inspectGraph(graph,old,{partial:!exists||graph.nodes.length<old.nodes.length});
    // Recover a partially created managed graph after a transport failure; every
    // existing node/edge must still match before adding the missing pieces.
    for(const node of old.nodes)if(!current.nodeIds.has(node.id))await call(input,'add_pipeline_node',{pipelineId:old.pipelineId,...node});
    for(const edge of old.edges)if(!current.edges.has(`${edge.fromNodeId}->${edge.toNodeId}`))await call(input,'connect_pipeline_edge',{pipelineId:old.pipelineId,...edge});
    graph=await get(input,old.pipelineId);inspectGraph(graph,old);
    if(entrypoint==='trigger'&&!graph.nodes.find(n=>n.id===old.nodes[0].id)?.config?.apiAuthSecret){
      // The public Nora API route must remain protected even though AINS uses
      // workspace-authenticated MCP. Nora stores the generated key encrypted;
      // discard its one-time plaintext reply instead of persisting another key.
      await call(input,'rotate_pipeline_trigger_secret',{pipelineId:old.pipelineId,nodeId:old.nodes[0].id});
      graph=await get(input,old.pipelineId);inspectGraph(graph,old);
      const secret=graph.nodes.find(n=>n.id===old.nodes[0].id)?.config?.apiAuthSecret;
      if(!secret?.enc||!secret?.lastFour)fail('NORA_CHANNEL_TRIGGER_AUTH_INVALID','Nora 이벤트 진입점의 인증 설정을 확인하지 못했습니다.');
    }
    const desired=buildChannelPipeline(input,{entrypoint,enabled:entrypoint==='schedule'&&input.scheduleEnabled===true,intervalMinutes:input.intervalMinutes??15});
    if(entrypoint==='schedule'&&!isDeepStrictEqual(old.nodes[0].config,desired.nodes[0].config)){
      await bound(input);
      if(input.scheduleEnabled)await call(input,'set_pipeline_schedule',{pipelineId:old.pipelineId,mode:'cron',cron:cronFor(input.intervalMinutes??15),tz:'Asia/Seoul',input:JSON.stringify({source_id:input.sourceId})});
      else await call(input,'clear_pipeline_schedule',{pipelineId:old.pipelineId});
    }
    graph=await get(input,desired.pipelineId);inspectGraph(graph,desired);
    // Publishing unchanged graphs is an idempotent no-op in Nora.
    await call(input,'publish_pipeline',{pipelineId:desired.pipelineId,summary:'AINS managed channel ingestion v1',authorLabel:'AINS'});
    await published(input,desired);return desired;
  }
  return {
    async listConnectors(input){
      // Discovery is project-scoped but no source exists yet.
      const row=await binding(pool,input.projectId);if(!row||row.workspace_id!==input.workspaceId||row.status!=='ready'||typeof provider?.callTool!=='function')fail('NORA_CHANNEL_CONNECTION_REQUIRED','프로젝트의 Nora 워크스페이스 연결을 먼저 완료하세요.');
      return connectors(input);
    },
    async provision(input){
      await bound(input);cronFor(input.intervalMinutes??15);const ids=identity(input);
      for(const [key,expected]of [['previousPipelineId',ids.pipelineId],['pipelineId',ids.pipelineId],['triggerPipelineId',ids.triggerPipelineId],['libraryTag',ids.libraryTag]])if(input[key]&&input[key]!==expected)fail('NORA_CHANNEL_SCOPE_MISMATCH','수집 설정이 현재 프로젝트·채널과 일치하지 않습니다.',403);
      const connector=(await connectors(input)).find(c=>c.id===input.connectorId);
      const listed=array(await call(input,'list_pipelines'),'pipelines');
      const pausingExisting=input.scheduleEnabled===false&&input.triggerEnabled===false&&listed.some(p=>p.id===ids.pipelineId)&&listed.some(p=>p.id===ids.triggerPipelineId);
      if(!connector?.enabled&&!pausingExisting)fail('NORA_CHANNEL_CONNECTOR_REQUIRED','Nora 설정에서 수집할 Slack·Discord·Drive 커넥터를 연결하세요.');
      await call(input,'create_knowledge_folder',{name:ids.libraryTag});
      await ensure(input,'trigger',listed);await ensure(input,'schedule',listed);await bound(input);
      return {...ids,triggerUrl:null,status:'ready',delivery:'nora_library',provider:connector?.provider||null};
    },
    async pause(input){
      // Revoked grants still need cleanup. Only the original project's bound
      // workspace and immutable managed pipeline identity may be touched.
      const stopping={...input,authorize:input.authorizeStop};await bound(stopping);const ids=identity(stopping);
      for(const [key,expected]of [['pipelineId',ids.pipelineId],['triggerPipelineId',ids.triggerPipelineId],['libraryTag',ids.libraryTag]])if(stopping[key]&&stopping[key]!==expected)fail('NORA_CHANNEL_SCOPE_MISMATCH','중지할 수집 파이프라인이 일치하지 않습니다.',403);
      const listed=array(await call(stopping,'list_pipelines'),'pipelines'),plans=[];
      // Validate both current graphs and every published snapshot before any
      // mutation. Never clear another pipeline's schedule or overwrite edits.
      for(const entrypoint of ['schedule','trigger']){
        const base=buildChannelPipeline(stopping,{entrypoint});
        if(!listed.some(row=>row.id===base.pipelineId))continue;
        const graph=await get(stopping,base.pipelineId),options=entrypoint==='schedule'?existingSchedule(graph,base):{};
        const template=buildChannelPipeline(stopping,{entrypoint,...options});inspectGraph(graph,template,{partial:true});
        const live=await call(stopping,'get_live_pipeline_publication',{pipelineId:base.pipelineId});
        if(live){if(!live.is_live||!live.payload||!live.content_hash)fail('NORA_CHANNEL_PIPELINE_UNPUBLISHED','발행한 수집 파이프라인의 중지 상태를 확인하지 못했습니다.');const liveOptions=entrypoint==='schedule'?existingSchedule(live.payload,base):{};inspectGraph(live.payload,buildChannelPipeline(stopping,{entrypoint,...liveOptions}));}
        plans.push({entrypoint,base,graph,live});
      }
      for(const {entrypoint,base,graph,live}of plans){
        await bound(stopping);const entry=graph.nodes.find(node=>node.id===base.nodes[0].id);
        if(entrypoint==='schedule'&&entry)await call(stopping,'clear_pipeline_schedule',{pipelineId:base.pipelineId});
        if(entrypoint==='trigger'&&entry){
          const before=entry.config?.apiAuthSecret?.enc;
          await call(stopping,'rotate_pipeline_trigger_secret',{pipelineId:base.pipelineId,nodeId:entry.id});
          const changed=await get(stopping,base.pipelineId),secret=changed.nodes.find(node=>node.id===entry.id)?.config?.apiAuthSecret;
          if(!secret?.enc||!secret?.lastFour||secret.enc===before)fail('NORA_CHANNEL_TRIGGER_AUTH_INVALID','Nora 이벤트 키 교체를 확인하지 못했습니다.');
        }
        const stopped=await get(stopping,base.pipelineId);inspectGraph(stopped,base,{partial:true});
        if(stopped.nodes.length===base.nodes.length){await call(stopping,'publish_pipeline',{pipelineId:base.pipelineId,summary:'AINS managed channel ingestion paused',authorLabel:'AINS'});await published(stopping,base);}
        else if(live)fail('NORA_CHANNEL_PIPELINE_CHANGED','발행한 파이프라인의 일부 노드가 누락되어 중지를 확인하지 못했습니다.');
      }
      await bound(stopping);return {status:'stopped',schedulePaused:true,triggerKeyRotated:true};
    },
    async run(input){
      await bound(input);const ids=identity(input),entrypoint=input.entrypoint==='trigger'?'trigger':'schedule';
      if(input.pipelineId!==ids.pipelineId||input.triggerPipelineId!==ids.triggerPipelineId)fail('NORA_CHANNEL_SCOPE_MISMATCH','실행할 수집 파이프라인이 일치하지 않습니다.',403);
      if(entrypoint==='trigger'&&input.triggerEnabled===false)fail('NORA_CHANNEL_TRIGGER_DISABLED','이 채널의 새 기록 트리거가 꺼져 있습니다.');
      if(typeof input.requestId!=='string'||!input.requestId||input.requestId.length>200)fail('NORA_CHANNEL_INPUT_INVALID','수집 실행 식별자가 필요합니다.',400);
      const template=buildChannelPipeline(input,{entrypoint,enabled:entrypoint==='schedule'&&input.scheduleEnabled===true,intervalMinutes:input.intervalMinutes??15});
      inspectGraph(await get(input,template.pipelineId),template);await published(input,template);await bound(input);
      let result;
      try{result=await call(input,'invoke_pipeline',{pipelineId:template.pipelineId,input:{source_id:input.sourceId},idempotencyKey:`ains-channel:${input.sourceId}:${input.requestId}`,test:false});}
      catch(error){throw Object.assign(error,{dispatched:true,noSideEffects:false});}
      const value=result?.run??result;
      if((result?.kind&&result.kind!=='pipelineRun')||result?.ok===false||(result?.pipelineId&&result.pipelineId!==template.pipelineId)||!value?.runId||!remoteId(value.runId)||!['queued','running','pending','succeeded','ok'].includes(value.status)||value.report?.stages?.some(stage=>['error','failed'].includes(stage.status)||Number(stage.artifacts?.failed)>0))throw Object.assign(new Error('Nora 채널 수집 실행 결과를 확인하세요.'),{code:'NORA_CHANNEL_RUN_FAILED',status:502,dispatched:true,noSideEffects:false});
      return {runId:value.runId,status:value.status||'running',pipelineId:template.pipelineId};
    },
    async readRecords(input){
      await bound(input);const ids=identity(input);
      if(input.libraryTag!==ids.libraryTag)fail('NORA_CHANNEL_SCOPE_MISMATCH','다른 프로젝트의 수집 자료를 읽을 수 없습니다.',403);
      for(const entrypoint of ['schedule','trigger']){
        const template=buildChannelPipeline(input,{entrypoint,enabled:entrypoint==='schedule'&&input.scheduleEnabled===true,intervalMinutes:input.intervalMinutes??15});
        inspectGraph(await get(input,template.pipelineId),template);await published(input,template);
      }
      const after=cursorValue(input.cursor),limit=Math.min(20,Math.max(1,Number.isSafeInteger(input.limit)?input.limit:20));
      const docs=array(await call(input,'list_documents',{tag:ids.libraryTag,fields:['id','tenant_id','name','tags','has_extracted_text','updated_at','created_at','pipeline_ids','upload_state','run_state']}),'documents');
      const candidates=docs.map(doc=>{
        scope(doc,input.workspaceId);
        if(!remoteId(doc.id)||!timestamp(doc.updated_at)||!Array.isArray(doc.tags)||!doc.tags.includes(ids.libraryTag))fail('NORA_CHANNEL_DOCUMENT_INVALID','수집 문서의 출처와 변경 일시를 확인하지 못했습니다.',502);
        return {doc,id:doc.id,updatedAt:timestamp(doc.updated_at)};
      }).filter(row=>!after||compare(row,after)>0).sort(compare);
      const records=[];let cursor=after;
      for(const item of candidates.slice(0,limit)){
        const response=await call(input,'get_document',{documentId:item.id}),doc=response?.document??response;scope(doc,input.workspaceId);
        if(doc?.id!==item.id||!Array.isArray(doc.tags)||!doc.tags.includes(ids.libraryTag))fail('NORA_CHANNEL_DOCUMENT_INVALID','수집 문서의 출처를 확인하지 못했습니다.',502);
        if(typeof doc.extracted_text!=='string'||!doc.extracted_text.trim()){
          // Nora persists terminal extraction state on the document. Failed or
          // textless completed extraction needs review, not an endless retry.
          if(['failed','error','done','completed','complete'].includes(doc.extract_status))fail('NORA_CHANNEL_EXTRACTION_REVIEW_REQUIRED','원문 추출이 끝났지만 읽을 텍스트가 없습니다. Nora에서 원문·추출 상태를 검토해 주세요.',409);
          if(['pending','running','extracting','queued'].includes(doc.extract_status))fail('NORA_CHANNEL_DOCUMENT_NOT_READY','Nora에서 원문을 추출하고 있습니다.',409);
          const attemptKey=`${input.workspaceId}:${input.sourceId}:${item.id}`,attempts=extractionAttempts.get(attemptKey)||0;
          // This secondary guard bounds null-status/transport anomalies. It is
          // per process; persisted Nora terminal states above survive restarts.
          if(attempts>=3)fail('NORA_CHANNEL_EXTRACTION_REVIEW_REQUIRED','원문 추출을 세 번 시도했습니다. Nora에서 원문·추출 상태를 검토해 주세요.',409);
          if(extractionAttempts.size>=5000&&!extractionAttempts.has(attemptKey))fail('NORA_CHANNEL_EXTRACTION_REVIEW_REQUIRED','검토가 필요한 원문 추출이 누적되었습니다. 수집 상태를 확인해 주세요.',409);
          // Cloud ingestion can land bytes before extraction completes. Invoke
          // Nora's native byte extractor via the already verified deterministic
          // document graph; never manufacture a transcript with update_document.
          const template=buildChannelPipeline(input,{entrypoint:'schedule',enabled:input.scheduleEnabled===true,intervalMinutes:input.intervalMinutes??15});
          inspectGraph(await get(input,template.pipelineId),template);await bound(input);
          extractionAttempts.set(attemptKey,attempts+1);
          const result=await call(input,'run_pipeline_document',{pipelineId:template.pipelineId,documentId:item.id});
          const report=result?.report??result,stages=report?.stages;
          if(!Array.isArray(stages)||stages.some(stage=>stage.status!=='ok'||Number(stage.artifacts?.failed)>0)||!stages.some(stage=>(stage.block_id??stage.nodeId)===template.nodes[2].id&&stage.palette_id==='norm_chunk'))fail('NORA_CHANNEL_EXTRACTION_FAILED','Nora 원문 추출 결과를 확인하지 못했습니다.',502);
          const afterResponse=await call(input,'get_document',{documentId:item.id}),extracted=afterResponse?.document??afterResponse;scope(extracted,input.workspaceId);
          if(extracted?.id!==item.id||!extracted.tags?.includes(ids.libraryTag)||typeof extracted.extracted_text!=='string'||!extracted.extracted_text.trim())fail('NORA_CHANNEL_DOCUMENT_NOT_READY','Nora에서 원문 추출을 마친 뒤 다시 수집합니다.',409);
          extractionAttempts.delete(attemptKey);
          // Extraction updates updated_at. Rescan on the next short poll rather
          // than moving a cursor past records reordered by that update.
          await bound(input);return {records,cursor:cursor||{},hasMore:true};
        }
        extractionAttempts.delete(`${input.workspaceId}:${input.sourceId}:${item.id}`);
        if(Buffer.byteLength(doc.extracted_text,'utf8')>1024*1024)fail('NORA_CHANNEL_DOCUMENT_TOO_LARGE','수집 원문이 1MB를 넘습니다. 자료를 나누어 주세요.',413);
        const changed=timestamp(doc.updated_at);
        // A document changed after the metadata snapshot: retry with its new
        // ordering rather than stepping the cursor past a concurrent revision.
        if(changed!==item.updatedAt)fail('NORA_CHANNEL_DOCUMENT_CHANGED','수집 중 원문이 변경되어 다시 확인합니다.',409);
        records.push({id:doc.id,text:doc.extracted_text,title:typeof doc.name==='string'?doc.name:'수집한 기록',author:null,sent_at:null,changed_at:changed,url:null,conversation_key:doc.id,deleted:false,metadata:{nora_document_id:doc.id,nora_library_tag:ids.libraryTag,nora_created_at:timestamp(doc.created_at),published_at:sourceDate(doc.published_at),effective_at:sourceDate(doc.effective_at),issuer:typeof doc.issuer==='string'?doc.issuer:null,source_timestamp_status:'not_provided'}});
        cursor={updatedAt:item.updatedAt,id:item.id};
      }
      await bound(input);return {records,cursor:cursor||{},hasMore:candidates.length>limit};
    },
  };
}
module.exports={createNoraChannelSourceProvider,SOURCE_PROVIDERS,inspectGraph};
