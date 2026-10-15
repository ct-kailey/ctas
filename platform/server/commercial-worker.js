'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {assertLegacyNoraDispatch}=require('./project-nora');
const {runCommercialRewrite,validateCommercialRequest,validateCommercialResult,commercialInputHash}=require('../../nora/client/commercial-client');
const manifest=require('../../nora/commercial-drafting/manifest.json');
const KNOWN=new Set(['COMMERCIAL_PROJECT_CONTEXT_REQUIRED','PROJECT_MISMATCH','COMMERCIAL_REQUEST_INVALID','COMMERCIAL_REQUEST_TOO_LARGE','COMMERCIAL_TEMPLATE_MISMATCH','COMMERCIAL_RESULT_INVALID','COMMERCIAL_TABLES_CHANGED','COMMERCIAL_FACTS_CHANGED','COMMERCIAL_TERMS_INVENTED','COMMERCIAL_BLOCKING_QUESTION_REQUIRED','COMMERCIAL_RUN_NOT_SUCCEEDED','COMMERCIAL_OUTPUTS_INCOMPLETE','COMMERCIAL_OUTPUT_INVALID','COMMERCIAL_OUTPUT_MISMATCH','COMMERCIAL_NOT_PUBLISHED','COMMERCIAL_AUTH_REQUIRED','COMMERCIAL_TIMEOUT_INVALID','COMMERCIAL_TRANSPORT_UNKNOWN','COMMERCIAL_RESPONSE_INVALID','COMMERCIAL_RECORD_MISMATCH','COMMERCIAL_LEASE_LOST']);
function safeErrorCode(error){return error?.code==='NORA_PROJECT_FLOW_SETUP_REQUIRED'||KNOWN.has(error?.code)||/^COMMERCIAL_HTTP_[1-5]\d\d$/.test(error?.code||'')?error.code:'COMMERCIAL_INTERNAL';}
function classifyFailure(error,dispatched){const code=safeErrorCode(error);return{code,status:dispatched&&(['COMMERCIAL_INTERNAL','COMMERCIAL_TRANSPORT_UNKNOWN','COMMERCIAL_RESPONSE_INVALID','COMMERCIAL_RUN_NOT_SUCCEEDED'].includes(code)||/^COMMERCIAL_HTTP_(5\d\d|408)$/.test(code))?'uncertain':'failed'};}
function safeTrace(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value)?value:null;}
function fail(code){throw Object.assign(new Error(code),{code});}
/** A rewrite creates a review candidate only. Applying a revision is a separate authenticated user action. */
function createCommercialWorker({pool,token,invoke=runCommercialRewrite,onError=()=>{},pollMs=2000}={}){
 if(!pool||typeof pool.connect!=='function')throw new TypeError('pool is required');
 if(!Number.isFinite(pollMs)||pollMs<10)throw new TypeError('pollMs must be at least 10');
 let started=false,timer,processing;
 async function audit(client,row,kind,detail={}){await client.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,NULL,$2,$3,$4::jsonb)',[row.project_id,kind,row.id,JSON.stringify(detail)]);}
 async function recoverExpired(){return transaction(pool,async client=>{
  const{rows}=await client.query("SELECT * FROM commercial_rewrites WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=now()) ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED");
  for(const row of rows){await client.query("UPDATE commercial_rewrites SET status='uncertain',error_code='COMMERCIAL_LEASE_EXPIRED',lease_token=NULL,lease_expires_at=NULL,completed_at=now() WHERE id=$1",[row.id]);await audit(client,row,'commercial.rewrite_uncertain',{error_code:'COMMERCIAL_LEASE_EXPIRED'});}return rows.length;
 });}
 async function claim(){return transaction(pool,async client=>{
  const{rows:[row]}=await client.query("SELECT * FROM commercial_rewrites WHERE status='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");if(!row)return null;
  return(await client.query("UPDATE commercial_rewrites SET status='running',lease_token=$2,lease_expires_at=now()+interval '120 seconds',error_code=NULL WHERE id=$1 RETURNING *",[row.id,randomUUID()])).rows[0];
 });}
 async function intent(row){return transaction(pool,async client=>{
  const{rows:[fresh]}=await client.query("SELECT * FROM commercial_rewrites WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now() FOR UPDATE",[row.id,row.lease_token]);
  if(!fresh)fail('COMMERCIAL_LEASE_LOST');
  if(fresh.input_sha256!==row.input_sha256||commercialInputHash(fresh.input_snapshot)!==row.input_sha256)fail('COMMERCIAL_RECORD_MISMATCH');
  await audit(client,fresh,'commercial.rewrite_started',{published_version_id:manifest.published_version_id,flow_slug:manifest.slug,agent_id:manifest.agent_id,input_sha256:fresh.input_sha256});
 });}
 async function finish(row,status,code=null,result=null,traceId=null){return transaction(pool,async client=>{
  const{rows:[done]}=await client.query("UPDATE commercial_rewrites SET status=$3,error_code=$4,result=$5::jsonb,trace_id=$6,lease_token=NULL,lease_expires_at=NULL,completed_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now() RETURNING *",[row.id,row.lease_token,status,code,result===null?null:JSON.stringify(result),safeTrace(traceId)]);
  if(!done)return{id:row.id,status:'uncertain',code:'COMMERCIAL_LEASE_LOST'};
  await audit(client,done,'commercial.rewrite_'+status,{error_code:done.error_code,trace_id:done.trace_id});return{id:done.id,status:done.status,code:done.error_code};
 });}
 async function execute(row){let dispatched=false;try{
  await assertLegacyNoraDispatch(pool,row.project_id);
  const input=structuredClone(row.input_snapshot);validateCommercialRequest(input,row.project_id);
  if(input.request_id!==row.id||input.document.id!==row.document_id||input.document.revision_id!==row.source_revision_id||input.profile_version!==Number(row.profile_version)||commercialInputHash(input)!==row.input_sha256)fail('COMMERCIAL_RECORD_MISMATCH');
  if(typeof token!=='string'||!token.trim()||manifest.publication_status!=='published'||!manifest.published_version_id||!manifest.agent_id)return await finish(row,'failed','COMMERCIAL_UNAVAILABLE');
  await intent(row);dispatched=true;
  const response=await invoke(structuredClone(input),{expectedProjectId:row.project_id,token,timeoutMs:45000});
  const result=validateCommercialResult(response?.result,input,row.project_id);if(!safeTrace(response?.traceId))fail('COMMERCIAL_RUN_NOT_SUCCEEDED');
  return await finish(row,'needs_review',null,result,response.traceId);
 }catch(error){const failure=classifyFailure(error,dispatched);return finish(row,failure.status,failure.code,null,error?.traceId);}}
 async function processOnce(){if(processing)return null;processing=(async()=>{await recoverExpired();const row=await claim();return row?execute(row):null;})();try{return await processing;}finally{processing=undefined;}}
 async function loop(){if(!started)return;try{await processOnce();}catch{try{onError({code:'COMMERCIAL_WORKER_FAILED'});}catch{}}if(started){timer=setTimeout(loop,pollMs);timer.unref();}}
 function start(){if(started)return;started=true;void loop();}
 async function stop(){started=false;clearTimeout(timer);if(processing)await processing.catch(()=>{});}
 return{start,stop,tick:processOnce,processOnce,processOne:processOnce,recoverExpired};
}
module.exports={createCommercialWorker,safeErrorCode,classifyFailure};
