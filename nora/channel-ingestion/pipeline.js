'use strict';
const {createHash}=require('node:crypto');

const VERSION='1.0';
const INTERVALS=[5,10,15,30,60,120,180,240,360,720,1440];
function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,32);}
function invalid(message){throw Object.assign(new Error(message),{code:'NORA_CHANNEL_INPUT_INVALID',status:400,noSideEffects:true});}
function identity(input){
  for(const key of ['projectId','workspaceId','sourceId'])if(typeof input[key]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(input[key]))invalid('프로젝트와 수집 채널 식별자를 확인하세요.');
  const key=hash([VERSION,input.workspaceId,input.projectId,input.sourceId]);
  return {key,libraryTag:`ains/channels/${key}`,pipelineId:`pipe_ains_channel_${key}`,triggerPipelineId:`pipe_ains_event_${key}`};
}
function cronFor(minutes){
  if(!INTERVALS.includes(minutes))invalid('수집 주기는 5·10·15·30분 또는 1·2·3·4·6·12·24시간 중에서 선택하세요.');
  if(minutes<60)return `*/${minutes} * * * *`;
  if(minutes===1440)return '0 0 * * *';
  return `0 */${minutes/60} * * *`;
}
/** Two independent entry pipelines share one source-scoped Library destination.
 * Their inputs only wake the fixed connector/channel. Incoming event bodies
 * cannot override connector, channel, destination, or project identity. */
function buildChannelPipeline(input,{entrypoint='schedule',enabled=false,intervalMinutes=15}={}){
  const ids=identity(input);
  if(!['schedule','trigger'].includes(entrypoint))invalid('수집 진입점을 확인하세요.');
  if(typeof input.connectorId!=='string'||!/^conn_[A-Za-z0-9_-]{8,199}$/.test(input.connectorId))invalid('Nora 수집 커넥터를 선택하세요.');
  if(typeof input.externalChannelId!=='string'||!input.externalChannelId.trim()||input.externalChannelId.length>500||/[\u0000-\u001f]/.test(input.externalChannelId))invalid('수집할 채널 또는 폴더 ID를 확인하세요.');
  const pipelineId=entrypoint==='schedule'?ids.pipelineId:ids.triggerPipelineId;
  const notes=role=>JSON.stringify({ains_channel_version:VERSION,project_id:input.projectId,workspace_id:input.workspaceId,source_id:input.sourceId,entrypoint,role});
  const id=role=>`n_ains_${hash([pipelineId,role])}`;
  const config=entrypoint==='schedule'
    ? (enabled?{scheduleMode:'cron',cron:cronFor(intervalMinutes),scheduleTimezone:'Asia/Seoul',scheduleInput:JSON.stringify({source_id:input.sourceId})}:{})
    // The event endpoint is called through workspace-authenticated MCP. Never
    // publish an unauthenticated external endpoint for incoming channel data.
    : {auth:'bearer',path_hint:`ains-channel-event-${ids.key}`};
  const nodes=[
    {id:id('entry'),paletteId:entrypoint==='schedule'?'ingest_schedule':'trg_http_api',stage:'trigger',title:entrypoint==='schedule'?'주기적 채널 확인':'인증된 새 기록 이벤트',icon:entrypoint==='schedule'?'table':'globe',tone:'source',order:0,config,notes:notes('entry')},
    {id:id('source'),paletteId:'src_cloud',stage:'source',title:'Nora 커넥터에서 채널 기록 수집',icon:'cloud',tone:'source',order:1,config:{connector:input.connectorId,folder_id:input.externalChannelId,recursive:false,library_folder:ids.libraryTag,conditions:[],ocr_model:'',retry_max:3,retry_backoff:'exponential',retry_delay_s:5,timeout_s:120},notes:notes('source')},
    // Nora's document runner extracts source bytes and caches full text before
    // executing the DAG. Chunking is deterministic; AINS reads that full cache,
    // never reconstructed chunks or previews. No LLM typing/embedding is used.
    {id:id('extract'),paletteId:'norm_chunk',stage:'normalize',title:'원문 추출 확인·문단 분할',icon:'doc',tone:'normalize',order:2,config:{strategy:'recursive',chunk_size:512,overlap:0,preserve_sentence:true,preserve_table:true,type_profile:'off',retry_max:0,timeout_s:30},notes:notes('extract')},
  ];
  return {pipelineId,name:`AINS 채널 수집 · ${ids.key} · ${entrypoint}`,libraryTag:ids.libraryTag,addedStages:['trigger','source','normalize'],nodes,edges:[{fromNodeId:id('entry'),toNodeId:id('source')},{fromNodeId:id('source'),toNodeId:id('extract')}]};
}
module.exports={VERSION,INTERVALS,identity,cronFor,buildChannelPipeline};
