'use strict';
const {createTranscriptionLedger}=require('./transcription-ledger');
const {modelConfig,normalizeTranscript,fail}=require('./transcription-contract');

async function transcribeAudio(job,config,{fetchImpl=fetch,signal,timeoutMs=300000}={}){
 const {apiKey,model}=modelConfig(config);if(!apiKey)fail('TRANSCRIPTION_NOT_CONFIGURED','음성 변환 API가 연결되지 않았습니다.',503);
 const form=new FormData();form.set('file',new Blob([job.audio],{type:job.mime_type}),job.filename);form.set('model',model);
 if(job.language)form.set('language',job.language);
 if(model==='whisper-1'){form.set('response_format','verbose_json');form.append('timestamp_granularities[]','segment');}
 else if(model==='gpt-4o-transcribe-diarize'){form.set('response_format','diarized_json');form.set('chunking_strategy','auto');}
 else form.set('response_format','json');
 const timeout=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;let providerRequestId=null;
 try{
  const response=await fetchImpl('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'X-Client-Request-Id':job.worker_id},body:form,signal:combined,redirect:'error'});
  providerRequestId=response.headers.get('x-request-id')?.slice(0,200)||null;
  if(!response.ok){const err=new Error('음성 변환 서비스가 요청을 완료하지 못했습니다.');err.code=`TRANSCRIPTION_PROVIDER_${response.status}`;err.uncertain=response.status>=500||response.status===408;err.providerRequestId=providerRequestId;throw err;}
  // Bound the response before parsing; never log the response or submitted recording.
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty response');let size=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw new Error('Response too large');}chunks.push(value);}
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));return {output:normalizeTranscript(payload,model),providerRequestId};
 }catch(err){if(!err.code?.startsWith('TRANSCRIPTION_PROVIDER_')){err.code=err.code==='TRANSCRIPTION_INVALID_RESULT'?err.code:combined.aborted?'TRANSCRIPTION_REQUEST_INTERRUPTED':'TRANSCRIPTION_RESULT_UNKNOWN';err.uncertain=true;err.providerRequestId=providerRequestId;}throw err;}
}

function startTranscriptionWorker({pool,resolveConfig=async()=>({apiKey:process.env.OPENAI_API_KEY,transcriptionModel:process.env.OPENAI_TRANSCRIPTION_MODEL}),pollMs=3000,fetchImpl=fetch,timeoutMs=300000,onError=()=>{}}){
 const ledger=createTranscriptionLedger(pool,{resolveConfig}),active=new Map();let stopped=false,ticking=false,timer;
 async function execute(job,config){const controller=new AbortController();active.set(job.id,controller);let heartbeatBusy=false;
  const heartbeat=setInterval(async()=>{if(heartbeatBusy)return;heartbeatBusy=true;try{if(!await ledger.heartbeat(job))controller.abort();}catch{controller.abort();}finally{heartbeatBusy=false;}},10000);heartbeat.unref?.();
  try{const result=await transcribeAudio(job,config,{fetchImpl,signal:controller.signal,timeoutMs});await ledger.complete(job,result.output,{providerRequestId:result.providerRequestId});}
  catch(err){await ledger.complete(job,null,{errorCode:err.code||'TRANSCRIPTION_RESULT_UNKNOWN',uncertain:err.uncertain!==false&&err.code!=='TRANSCRIPTION_NOT_CONFIGURED',providerRequestId:err.providerRequestId||null}).catch(()=>{});}
  finally{clearInterval(heartbeat);active.delete(job.id);}
 }
 async function tick(){if(stopped||ticking||active.size>=2)return;ticking=true;try{await ledger.recoverExpired();const next=await ledger.next();if(!next)return;let config;try{config=await resolveConfig(next.project_id);}catch{config={};}const job=await ledger.claim(next.id,config);if(job)void execute(job,config);}catch(err){onError({code:err.code||'TRANSCRIPTION_WORKER_ERROR'});}finally{ticking=false;}}
 timer=setInterval(tick,pollMs);timer.unref?.();void tick();return {tick,async stop(){stopped=true;clearInterval(timer);for(const controller of active.values())controller.abort();const deadline=Date.now()+5000;while(active.size&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));}};
}
module.exports={transcribeAudio,startTranscriptionWorker};
