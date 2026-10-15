'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {assertLegacyNoraDispatch}=require('./project-nora');
const {runImplementationPlan,validateImplementationRequest,validateImplementationResult}=require('../../nora/client/implementation-client');
const manifest=require('../../nora/implementation-plan/manifest.json');
const KNOWN=new Set(['NORA_PROJECT_FLOW_SETUP_REQUIRED','IMPLEMENTATION_PROJECT_CONTEXT_REQUIRED','PROJECT_MISMATCH','IMPLEMENTATION_REQUEST_INVALID','IMPLEMENTATION_REPOSITORY_INVALID',
  'IMPLEMENTATION_REQUEST_TOO_LARGE','IMPLEMENTATION_SOURCES_INVALID','IMPLEMENTATION_RESULT_INVALID','IMPLEMENTATION_DEPENDENCIES_INVALID',
  'IMPLEMENTATION_EVIDENCE_MISMATCH','IMPLEMENTATION_EXECUTABLE_OUTPUT','IMPLEMENTATION_BLOCKING_QUESTION_REQUIRED','IMPLEMENTATION_RUN_NOT_SUCCEEDED',
  'IMPLEMENTATION_OUTPUTS_INCOMPLETE','IMPLEMENTATION_OUTPUT_INVALID','IMPLEMENTATION_OUTPUT_MISMATCH','IMPLEMENTATION_NOT_PUBLISHED',
  'IMPLEMENTATION_AUTH_REQUIRED','IMPLEMENTATION_TIMEOUT_INVALID','IMPLEMENTATION_TRANSPORT_UNKNOWN','IMPLEMENTATION_RESPONSE_INVALID',
  'IMPLEMENTATION_RECORD_MISMATCH','IMPLEMENTATION_LEASE_LOST','IMPLEMENTATION_SOURCE_SCOPE_STALE']);
function safeErrorCode(error){return KNOWN.has(error?.code)||/^IMPLEMENTATION_HTTP_[1-5]\d\d$/.test(error?.code||'')?error.code:'IMPLEMENTATION_INTERNAL';}
function classifyFailure(error,dispatched){const code=safeErrorCode(error);return{code,status:dispatched&&(['IMPLEMENTATION_INTERNAL','IMPLEMENTATION_TRANSPORT_UNKNOWN','IMPLEMENTATION_RESPONSE_INVALID','IMPLEMENTATION_RUN_NOT_SUCCEEDED'].includes(code)||/^IMPLEMENTATION_HTTP_(5\d\d|408)$/.test(code))?'uncertain':'failed'};}
function safeTrace(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value)?value:null;}
function fail(code){throw Object.assign(new Error(code),{code});}

/** Produces a human-reviewable plan only; it cannot create or claim an execution request. */
function createImplementationWorker({pool,token,invoke=runImplementationPlan,onError=()=>{},pollMs=2000}={}){
  if(!pool||typeof pool.connect!=='function')throw new TypeError('pool is required');
  if(!Number.isFinite(pollMs)||pollMs<10)throw new TypeError('pollMs must be at least 10');
  let started=false,timer,processing;
  async function audit(client,row,kind,detail={}){await client.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,NULL,$2,$3,$4::jsonb)',[row.project_id,kind,row.id,JSON.stringify(detail)]);}
  async function recoverExpired(){return transaction(pool,async client=>{
    const {rows}=await client.query("SELECT * FROM implementation_plans WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=now()) ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED");
    for(const row of rows){await client.query("UPDATE implementation_plans SET status='uncertain',error_code='IMPLEMENTATION_LEASE_EXPIRED',lease_token=NULL,lease_expires_at=NULL,completed_at=now() WHERE id=$1",[row.id]);await audit(client,row,'implementation.plan_uncertain',{error_code:'IMPLEMENTATION_LEASE_EXPIRED'});}
    return rows.length;
  });}
  async function claim(){return transaction(pool,async client=>{
    const {rows:[row]}=await client.query("SELECT * FROM implementation_plans WHERE status='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");
    if(!row)return null;
    return(await client.query("UPDATE implementation_plans SET status='running',lease_token=$2,lease_expires_at=now()+interval '120 seconds',error_code=NULL WHERE id=$1 RETURNING *",[row.id,randomUUID()])).rows[0];
  });}
  async function intent(row){return transaction(pool,async client=>{
    if((await require('./implementation-ledger').getImplementationStaleReasons(client,row.project_id,row.input_snapshot,{lock:true})).length)fail('IMPLEMENTATION_SOURCE_SCOPE_STALE');
    const {rows:[fresh]}=await client.query("SELECT * FROM implementation_plans WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now() FOR UPDATE",[row.id,row.lease_token]);
    if(!fresh)fail('IMPLEMENTATION_LEASE_LOST');
    await audit(client,fresh,'implementation.plan_started',{published_version_id:manifest.published_version_id,flow_slug:manifest.slug,agent_id:manifest.agent_id,input_sha256:fresh.input_sha256});
  });}
  async function finish(row,status,code=null,result=null,traceId=null){return transaction(pool,async client=>{
    const {rows:[done]}=await client.query("UPDATE implementation_plans SET status=$3,error_code=$4,result=$5::jsonb,trace_id=$6,lease_token=NULL,lease_expires_at=NULL,completed_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now() RETURNING *",[row.id,row.lease_token,status,code,result===null?null:JSON.stringify(result),safeTrace(traceId)]);
    if(!done)return{id:row.id,status:'uncertain',code:'IMPLEMENTATION_LEASE_LOST'};
    await audit(client,done,'implementation.plan_'+status,{error_code:done.error_code,trace_id:done.trace_id});return{id:done.id,status:done.status,code:done.error_code};
  });}
  async function execute(row){let dispatched=false;try{
    await assertLegacyNoraDispatch(pool,row.project_id);
    const input=structuredClone(row.input_snapshot);validateImplementationRequest(input,row.project_id);
    if(input.request_id!==row.id||input.sources.length!==row.requested_revision_ids.length||input.sources.some(source=>!row.requested_revision_ids.includes(source.revision_id)))fail('IMPLEMENTATION_RECORD_MISMATCH');
    if(typeof token!=='string'||!token.trim()||manifest.publication_status!=='published'||!manifest.published_version_id||!manifest.agent_id)return await finish(row,'failed','IMPLEMENTATION_UNAVAILABLE');
    await intent(row);dispatched=true;
    const response=await invoke(structuredClone(input),{expectedProjectId:row.project_id,token,timeoutMs:45000});
    const result=validateImplementationResult(response?.result,input,row.project_id);if(!safeTrace(response?.traceId))fail('IMPLEMENTATION_RUN_NOT_SUCCEEDED');
    return await finish(row,'needs_review',null,result,response.traceId);
  }catch(error){const failure=classifyFailure(error,dispatched);return finish(row,failure.status,failure.code,null,error?.traceId);}}
  async function processOnce(){if(processing)return null;processing=(async()=>{await recoverExpired();const row=await claim();return row?execute(row):null;})();try{return await processing;}finally{processing=undefined;}}
  async function loop(){if(!started)return;try{await processOnce();}catch{try{onError({code:'IMPLEMENTATION_WORKER_FAILED'});}catch{}}
    if(started){timer=setTimeout(loop,pollMs);timer.unref();}}
  function start(){if(started)return;started=true;void loop();}
  async function stop(){started=false;clearTimeout(timer);if(processing)await processing.catch(()=>{});}
  return{start,stop,tick:processOnce,processOnce,processOne:processOnce,recoverExpired};
}
module.exports={createImplementationWorker,safeErrorCode,classifyFailure};
