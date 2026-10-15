'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {createChannelLedger}=require('./channel-ledger');
const {createNoraChannelSources,authorized,safeError,isAuthorizationError}=require('./nora-channel-sources');
const {enqueueSourceStop}=require('./customer-connections');
const {hash}=require('./integration-contract');
function fail(code){throw Object.assign(new Error(code),{code});}
function time(value){if(value===undefined||value===null)return null;if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail('NORA_CHANNEL_RECORD_INVALID');return new Date(value).toISOString();}
function normalizeRecord(record){
 if(!record||typeof record!=='object'||typeof record.id!=='string'||!record.id||record.id.length>1000||/[\u0000-\u001f]/.test(record.id)||typeof record.text!=='string'||record.text.length>1000000||record.text.includes('\0')||!record.text.isWellFormed())fail('NORA_CHANNEL_RECORD_INVALID');
 if(record.deleted!==undefined&&typeof record.deleted!=='boolean')fail('NORA_CHANNEL_RECORD_INVALID');
 if(!record.deleted&&!record.text.trim())fail('NORA_CHANNEL_RECORD_EMPTY');
 let url=record.url||null;if(url){try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||url.length>2048)throw Error();}catch{fail('NORA_CHANNEL_RECORD_INVALID');}}
 const metadata={};for(const key of ['nora_document_id','nora_library_tag','nora_created_at','published_at','effective_at','issuer','source_timestamp_status'])if(typeof record.metadata?.[key]==='string')metadata[key]=record.metadata[key].slice(0,300);
 return {id:record.id,title:typeof record.title==='string'?record.title.slice(0,200):null,metadata,text:record.deleted?'':record.text,author:typeof record.author==='string'&&record.author.trim()?record.author.trim().slice(0,200):'원본 작성자 미제공',sent_at:time(record.sent_at),changed_at:time(record.changed_at),url,deleted:record.deleted===true,conversation_key:typeof record.conversation_key==='string'&&record.conversation_key?record.conversation_key:record.id};
}
function fingerprint(record){const {changed_at,...content}=record;return hash(content);}
// Preserve long records in ordered parts; never silently truncate source text.
function recordPayload(source,record,prior){
 const contentHash=fingerprint(record),conversation_key=prior?.event_payload.conversation_key||`nora:${hash([source.id,record.conversation_key])}`;
 const chunks=[];let start=0;while(start<record.text.length){let end=Math.min(start+18000,record.text.length);if(end<record.text.length&&/[\uD800-\uDBFF]/.test(record.text[end-1]))end--;chunks.push(record.text.slice(start,end));start=end;}
 if(!chunks.length)chunks.push('');
 const oldCount=prior?.event_payload.messages?.length||0,count=Math.max(chunks.length,oldCount),messages=[];
 for(let part=0;part<count;part++){
  const deleted=record.deleted||part>=chunks.length,kind=deleted?'deleted':prior?'updated':'created';
  const event_id=`nora:${hash([record.id,contentHash,prior?.content_hash||null,prior?.event_payload.messages?.[part]?.event_id||null,part])}`;
  const metadata=Object.entries(record.metadata||{}).filter(([key])=>['published_at','effective_at','issuer'].includes(key)).map(([key,value])=>`${key}: ${value}`).join(' · ');
  const header=`[Nora 원문 문서: ${record.id}]${record.title?' '+record.title:''}\n${metadata?`[원문 문서 속성 · 결정일로 확정하지 않음] ${metadata}\n`:''}${chunks.length>1?`[본문 ${part+1}/${chunks.length}]\n`:''}`;
  messages.push({event_id,message_id:`nora:${hash(record.id)}:${part+1}`,kind,author:record.author,text:deleted?'':header+chunks[part],sent_at:record.sent_at,changed_at:record.changed_at||null,url:record.url});
 }
 return {conversation_key,messages,source_changed_at:record.changed_at,source_metadata:record.metadata||{}};
}
function createNoraChannelSourceWorker({pool,provider,pollMs=5000}){
 const ledger=createNoraChannelSources({pool,provider}),channels=createChannelLedger(pool);let timer,busy,stopped=true,lastAuthorizationSweep=0;
 const remote=row=>ledger.remote(row);
 async function assertLease(db,row){const r=(await db.query('SELECT * FROM nora_channel_sources WHERE id=$1 FOR UPDATE',[row.id])).rows[0];if(r?.lease_token!==row.lease_token||r.status!=='ready'||new Date(r.lease_expires_at)<=new Date())fail('NORA_CHANNEL_LEASE_LOST');const grant=await authorized(db,r);if(row.operator_id&&grant.operator_id!==row.operator_id)fail('NORA_CHANNEL_LEASE_LOST');return {...r,operator_id:grant.operator_id,reviewer_id:grant.reviewer_id};}
 async function invalidate(db,row,code){
  await enqueueSourceStop(db,row,code);
  await db.query("UPDATE nora_channel_sources SET status='draft',schedule_enabled=false,trigger_enabled=false,trigger_token_hash=NULL,lease_token=NULL,lease_expires_at=NULL,provision_token=NULL,last_error_code=$2,version=version+1,updated_at=now() WHERE id=$1",[row.id,code]);
  await db.query("UPDATE nora_channel_deliveries SET status=CASE WHEN status='running' THEN 'uncertain' ELSE 'failed' END,error_code=$2,completed_at=now() WHERE source_id=$1 AND status IN ('queued','running')",[row.id,code]);
 }
 async function sweepAuthorizations(){
  if(Date.now()-lastAuthorizationSweep<60000)return;lastAuthorizationSweep=Date.now();
  // A native cron can still exist while settings are saved as draft or after
  // an upstream error, so losing an operator must stop those sources too.
  const candidates=(await pool.query('SELECT id FROM nora_channel_sources WHERE pipeline_id IS NOT NULL OR trigger_pipeline_id IS NOT NULL OR remote_provision_token IS NOT NULL ORDER BY id')).rows;
  for(const candidate of candidates)await transaction(pool,async db=>{const row=(await db.query('SELECT * FROM nora_channel_sources WHERE id=$1 FOR UPDATE',[candidate.id])).rows[0];if(!row)return;
   try{await authorized(db,row);}catch(error){if(!isAuthorizationError(error))throw error;
    const alreadyPaused=row.status==='draft'&&!row.schedule_enabled&&!row.trigger_enabled&&!row.trigger_token_hash&&!row.lease_token&&!row.provision_token;
    if(alreadyPaused&&(await db.query('SELECT 1 FROM nora_channel_stop_jobs WHERE source_id=$1 AND source_version >= $2',[row.id,row.version-1])).rowCount)return;
    await invalidate(db,row,safeError(error));
   }
  });
 }
 async function stopOnce(){
  const job=await transaction(pool,async db=>{const selected=(await db.query("SELECT j.* FROM nora_channel_stop_jobs j JOIN nora_channel_sources s ON s.id=j.source_id WHERE (s.remote_provision_token IS NULL OR s.remote_provision_expires_at<=now()) AND (j.status IN ('pending','failed') OR (j.status='running' AND j.lease_expires_at<now())) AND j.next_attempt_at<=now() ORDER BY j.next_attempt_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1")).rows[0];if(!selected)return null;return (await db.query("UPDATE nora_channel_stop_jobs SET status='running',attempt=attempt+1,lease_token=$2,lease_expires_at=now()+interval '5 minutes',updated_at=now() WHERE id=$1 RETURNING *",[selected.id,randomUUID()])).rows[0];});
  if(!job)return null;
  const authorizeStop=async()=>{const current=(await pool.query("SELECT 1 FROM nora_channel_stop_jobs WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now()",[job.id,job.lease_token]));if(!current.rowCount)fail('NORA_CHANNEL_STOP_LEASE_LOST');};
  const heartbeat=setInterval(()=>pool.query("UPDATE nora_channel_stop_jobs SET lease_expires_at=now()+interval '5 minutes' WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now()",[job.id,job.lease_token]).catch(()=>{}),30000);heartbeat.unref?.();
  try{
   if(typeof provider.pause!=='function')fail('NORA_CHANNEL_STOP_UNAVAILABLE');
   await authorizeStop();const result=await provider.pause({...job.snapshot,authorizeStop});
   if(result?.status!=='stopped'||result.schedulePaused!==true||result.triggerKeyRotated!==true)fail('NORA_CHANNEL_STOP_UNCONFIRMED');
   const saved=await transaction(pool,async db=>{await db.query('SELECT id FROM nora_channel_sources WHERE id=$1 FOR UPDATE',[job.source_id]);return db.query("UPDATE nora_channel_stop_jobs SET status='completed',lease_token=NULL,lease_expires_at=NULL,error_code=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now() RETURNING id",[job.id,job.lease_token]);});
   return {source_id:job.source_id,remote_stop_status:saved.rowCount?'completed':'pending'};
  }catch(error){const code=safeError(error);await pool.query("UPDATE nora_channel_stop_jobs SET status='failed',error_code=$3,next_attempt_at=now()+make_interval(secs=>$4),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",[job.id,job.lease_token,code,Math.min(3600,5*2**Math.min(job.attempt,10))]);return {source_id:job.source_id,remote_stop_status:'failed',error_code:code};}
  finally{clearInterval(heartbeat);}
 }
 async function claim(){return transaction(pool,async db=>{
  const expired=(await db.query("SELECT * FROM nora_channel_sources WHERE remote_provision_token IS NOT NULL AND remote_provision_expires_at<=now() ORDER BY remote_provision_expires_at,id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
  if(expired){await invalidate(db,expired,'NORA_CHANNEL_PROVISION_EXPIRED');await db.query('UPDATE nora_channel_sources SET remote_provision_token=NULL,remote_provision_expires_at=NULL WHERE id=$1',[expired.id]);return {...expired,authorization_error:'NORA_CHANNEL_PROVISION_EXPIRED'};}

  // Expired dispatched requests are visible as uncertain; never blindly replay them.
  await db.query("UPDATE nora_channel_deliveries d SET status='uncertain',error_code='NORA_CHANNEL_LEASE_EXPIRED',completed_at=now() FROM nora_channel_sources s WHERE d.source_id=s.id AND d.status='running' AND (s.lease_expires_at<now() OR s.lease_token IS NULL)");
  const row=(await db.query("SELECT s.* FROM nora_channel_sources s WHERE s.status='ready' AND (s.lease_token IS NULL OR s.lease_expires_at<now()) AND s.next_sync_at<=now() ORDER BY s.next_sync_at,s.id FOR UPDATE OF s SKIP LOCKED LIMIT 1")).rows[0];if(!row)return null;
  let grant;try{grant=await authorized(db,row);}catch(error){if(!isAuthorizationError(error))throw error;await invalidate(db,row,safeError(error));return {...row,authorization_error:safeError(error)};}
  const claimed=(await db.query("UPDATE nora_channel_sources SET lease_token=$2,lease_expires_at=now()+interval '5 minutes' WHERE id=$1 RETURNING *",[row.id,randomUUID()])).rows[0];return {...claimed,operator_id:grant.operator_id,reviewer_id:grant.reviewer_id};
 });}
 async function dispatch(row){
  const delivery=await transaction(pool,async db=>{await assertLease(db,row);const d=(await db.query("SELECT * FROM nora_channel_deliveries WHERE source_id=$1 AND status='queued' AND entry_point<>'reconcile' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",[row.id])).rows[0];if(!d)return null;if(d.entry_point==='trigger'&&!row.trigger_enabled){await db.query("UPDATE nora_channel_deliveries SET status='failed',error_code='NORA_CHANNEL_TRIGGER_PAUSED',completed_at=now() WHERE id=$1",[d.id]);return null;}await db.query("UPDATE nora_channel_deliveries SET status='running' WHERE id=$1",[d.id]);return d;});
  if(!delivery)return;
  try{const result=await provider.run({...remote(row),entrypoint:delivery.entry_point==='trigger'?'trigger':'schedule',requestId:delivery.id});await transaction(pool,async db=>{await assertLease(db,row);await db.query("UPDATE nora_channel_deliveries SET status='submitted',nora_run_id=$2,completed_at=now() WHERE id=$1 AND status='running'",[delivery.id,result?.runId||null]);});}
  catch(error){await pool.query("UPDATE nora_channel_deliveries SET status=$2,error_code=$3,completed_at=now() WHERE id=$1 AND status='running'",[delivery.id,error.noSideEffects?'failed':'uncertain',safeError(error)]);throw error;}
 }
 async function observe(row,records){await transaction(pool,async db=>{await assertLease(db,row);for(const raw of records){const record=normalizeRecord(raw),prior=(await db.query('SELECT * FROM nora_channel_objects WHERE source_id=$1 AND external_id=$2 FOR UPDATE',[row.id,record.id])).rows[0],contentHash=fingerprint(record);
  if(prior?.content_hash===contentHash)continue;
  if(prior&&!prior.delivered)fail('NORA_CHANNEL_PENDING_DELIVERY');
  const previous=prior?.event_payload.source_changed_at;if(previous&&record.changed_at&&Date.parse(record.changed_at)<Date.parse(previous))continue;
  const payload=recordPayload(row,record,prior);
  await db.query('INSERT INTO nora_channel_objects(source_id,external_id,content_hash,event_payload) VALUES($1,$2,$3,$4) ON CONFLICT(source_id,external_id) DO UPDATE SET content_hash=excluded.content_hash,event_payload=excluded.event_payload,delivered=false,updated_at=now()',[row.id,record.id,contentHash,payload]);
 }});}
 async function flush(row){let count=0;const inboxIds=[];const items=(await pool.query('SELECT * FROM nora_channel_objects WHERE source_id=$1 AND NOT delivered ORDER BY updated_at,external_id LIMIT 20',[row.id])).rows;
  try{for(const item of items){for(const message of item.event_payload.messages){
   // A single source record can exceed the inbox's 20k evidence budget. Each
   // ordered part gets an immutable receipt and is retried with the same key.
   const result=await channels.ingest(row.project_id,row.id,row.operator_id,{batch_id:`nora:${hash([message.event_id])}`,conversation_key:item.event_payload.conversation_key,messages:[message]},{authorize:db=>assertLease(db,row)});inboxIds.push(result.id);if(!result.replayed)count++;
  }
  await transaction(pool,async db=>{await assertLease(db,row);await db.query('UPDATE nora_channel_objects SET delivered=true WHERE source_id=$1 AND external_id=$2 AND content_hash=$3',[row.id,item.external_id,item.content_hash]);});
  }}catch(error){throw Object.assign(error,{deliveredCount:count,deliveredInboxIds:inboxIds});}return {count,inboxIds};
 }
 async function runOnce(){await sweepAuthorizations();const stop=await stopOnce();const row=await claim();if(!row)return stop;if(row.authorization_error)return {source_id:row.id,error_code:row.authorization_error};let deliveryId,count=0,inboxIds=[];const heartbeat=setInterval(()=>pool.query("UPDATE nora_channel_sources SET lease_expires_at=now()+interval '5 minutes' WHERE id=$1 AND lease_token=$2 AND status='ready' AND lease_expires_at>now()",[row.id,row.lease_token]).catch(()=>{}),30000);heartbeat.unref?.();
  try{
   await transaction(pool,db=>assertLease(db,row));await dispatch(row);
   deliveryId=(await pool.query("INSERT INTO nora_channel_deliveries(source_id,project_id,entry_point,event_key,status) VALUES($1,$2,'reconcile',$3,'running') RETURNING id",[row.id,row.project_id,randomUUID()])).rows[0].id;
   let result=await flush(row);count+=result.count;inboxIds.push(...result.inboxIds);
   const page=await provider.readRecords({...remote(row),cursor:row.cursor,limit:20});if(!page||!Array.isArray(page.records)||page.records.length>100||(page.cursor!==null&&(typeof page.cursor!=='object'||Array.isArray(page.cursor))))fail('NORA_CHANNEL_RESPONSE_INVALID');
   await observe(row,page.records);result=await flush(row);count+=result.count;inboxIds.push(...result.inboxIds);
   await transaction(pool,async db=>{await assertLease(db,row);await db.query("UPDATE nora_channel_sources SET cursor=$3,last_received_at=CASE WHEN $4>0 THEN now() ELSE last_received_at END,last_error_code=NULL,next_sync_at=now()+make_interval(secs=>$5),lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2",[row.id,row.lease_token,page.cursor||{},count,page.hasMore?5:60]);await db.query("UPDATE nora_channel_deliveries SET status='completed',message_count=$2,inbox_ids=$3,completed_at=now() WHERE id=$1 AND status='running'",[deliveryId,count,[...new Set(inboxIds)]]);});
   return {source_id:row.id,message_count:count};
  }catch(error){count+=error.deliveredCount||0;inboxIds.push(...(error.deliveredInboxIds||[]));const code=safeError(error);if(deliveryId)await pool.query("UPDATE nora_channel_deliveries SET status='failed',error_code=$2,message_count=$3,inbox_ids=$4,completed_at=now() WHERE id=$1 AND status='running'",[deliveryId,code,count,[...new Set(inboxIds)]]);await transaction(pool,async db=>{const current=(await db.query('SELECT * FROM nora_channel_sources WHERE id=$1 FOR UPDATE',[row.id])).rows[0];if(!current||current.lease_token!==row.lease_token)return;if(isAuthorizationError(error)){await invalidate(db,current,code);return;}await db.query("UPDATE nora_channel_sources SET last_error_code=$3,next_sync_at=now()+make_interval(secs=>$4),lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2",[row.id,row.lease_token,code,code==='CHANNEL_RATE_LIMIT'?3600:['NORA_CHANNEL_DOCUMENT_NOT_READY','NORA_CHANNEL_DOCUMENT_CHANGED'].includes(code)?30:300]);});return {source_id:row.id,error_code:code};}
  finally{clearInterval(heartbeat);}
 }
 async function tick(){if(busy)return null;busy=runOnce();try{return await busy;}finally{busy=null;}}
 return {runOnce:tick,stopOnce,sweepAuthorizations,start(){if(!stopped)return;stopped=false;timer=setInterval(()=>void tick().catch(()=>{}),pollMs);timer.unref?.();void tick().catch(()=>{});},async stop(){stopped=true;clearInterval(timer);if(busy)await busy.catch(()=>{});}};
}
module.exports={createNoraChannelSourceWorker,normalizeRecord,fingerprint,recordPayload};
