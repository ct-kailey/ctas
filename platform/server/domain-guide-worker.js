'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {membership}=require('./context-ledger');
const {validateGuide}=require('../../nora/domain-guide/contract');
const {buildSnapshot,lockGuide,enqueueGuide,audit,WRITERS}=require('./domain-guide');

function createDomainGuideWorker({pool,provider={},pollMs=3000,debounceMs=120000,timeoutMs=300000,onError=()=>{}}){
  let timer=null,active=null,controller=null,stopping=false;
  const leaseMs=Math.max(60000,timeoutMs+60000);
  async function recover(){
    // Once claimed, a process may have called the external service before it
    // crashed. Never move expired jobs back to queued or reuse their request.
    return transaction(pool,async db=>{
      const rows=(await db.query(`UPDATE domain_guide_runs SET status='uncertain',error_code='GUIDE_EXECUTION_UNCERTAIN',error_message='실행 중 연결이 끊어져 결과 확인이 필요합니다. 자동으로 다시 실행하지 않았습니다.',lease_token=NULL,lease_expires_at=NULL,completed_at=clock_timestamp()
        WHERE status='running' AND lease_expires_at<clock_timestamp() RETURNING id,project_id,requested_by`)).rows;
      for(const row of rows)await audit(db,row.project_id,row.requested_by,'uncertain',row.id,{reason:'lease_expired'});
      return rows.length;
    });
  }
  async function schedule(){
    const pending=(await pool.query(`SELECT project_id FROM domain_guide_settings s WHERE auto_refresh AND requested_by IS NOT NULL AND dirty_generation>processed_generation
      AND dirty_at<=clock_timestamp()-($1::double precision*interval '1 millisecond')
      AND NOT EXISTS(SELECT 1 FROM domain_guide_runs r WHERE r.project_id=s.project_id AND (r.status IN ('queued','running') OR (r.status='uncertain' AND NOT EXISTS(SELECT 1 FROM domain_guide_run_retries a WHERE a.run_id=r.id))))
      ORDER BY dirty_at,project_id LIMIT 5`,[debounceMs])).rows;
    for(const {project_id:p} of pending){
      await transaction(pool,async db=>{
        const settings=await lockGuide(db,p);
        if(!settings.auto_refresh||!settings.requested_by||BigInt(settings.dirty_generation)<=BigInt(settings.processed_generation)||Date.now()-new Date(settings.dirty_at).getTime()<debounceMs)return;
        try{
          await membership(db,p,settings.requested_by,['owner']);
          await enqueueGuide(db,p,settings.requested_by,settings,await buildSnapshot(db,p));
        }catch(error){
          // Invalid sources/configuration are visible, wait for another change or
          // an explicit refresh instead of creating repeated failed requests.
          if(!error.code||!(/^(GUIDE_|FORBIDDEN)/.test(error.code)))throw error;
          await db.query('UPDATE domain_guide_settings SET processed_generation=$2,last_error_code=$3,last_error_message=$4 WHERE project_id=$1',[p,settings.dirty_generation,error.code,error.message]);
        }
      });
    }
  }
  async function claim(){
    const candidate=(await pool.query("SELECT project_id FROM domain_guide_runs WHERE status='queued' ORDER BY created_at,id LIMIT 1")).rows[0];
    if(!candidate)return null;
    return transaction(pool,async db=>{
      await lockGuide(db,candidate.project_id);
      const row=(await db.query("SELECT * FROM domain_guide_runs WHERE project_id=$1 AND status='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",[candidate.project_id])).rows[0];
      if(!row)return null;
      const leaseToken=randomUUID();
      return (await db.query("UPDATE domain_guide_runs SET status='running',lease_token=$2,lease_expires_at=clock_timestamp()+($3::double precision*interval '1 millisecond') WHERE id=$1 RETURNING *",[row.id,leaseToken,leaseMs])).rows[0];
    });
  }
  async function owned(db,run){return (await db.query("SELECT * FROM domain_guide_runs WHERE id=$1 AND project_id=$2 AND status='running' AND lease_token=$3 AND lease_expires_at>clock_timestamp() FOR UPDATE",[run.id,run.project_id,run.lease_token])).rows[0];}
  async function finishFailure(run,error,{dispatched=false,returned=false}={}){
    const uncertain=dispatched&&!returned&&error.noSideEffects!==true&&error.definiteFailure!==true;
    // Provider messages may contain remote identifiers/prompts. Persist only our
    // allowlisted code and a fixed, user-facing explanation.
    const known=/^(GUIDE_|NORA_)[A-Z0-9_]{1,90}$/.test(error.code||'');
    const code=uncertain?'GUIDE_EXECUTION_UNCERTAIN':known?error.code:error.code==='FORBIDDEN'?'GUIDE_PERMISSION_CHANGED':'GUIDE_GENERATION_FAILED';
    const message=uncertain?'Nora 실행의 최종 결과를 확인하지 못했습니다. 중복 실행을 막기 위해 자동 재시도를 중지했습니다.':code==='GUIDE_SOURCE_STALE'?'실행 전에 근거가 변경되었습니다. 최신 근거로 다시 갱신하세요.':code==='GUIDE_PERMISSION_CHANGED'?'요청자의 프로젝트 권한이 변경되어 실행을 중지했습니다.':'가이드를 생성하지 못했습니다. 근거와 Nora 연결 상태를 확인한 뒤 다시 요청하세요.';
    return transaction(pool,async db=>{
      await lockGuide(db,run.project_id);if(!await owned(db,run))return false;
      await db.query('UPDATE domain_guide_runs SET status=$2,error_code=$3,error_message=$4,lease_token=NULL,lease_expires_at=NULL,completed_at=clock_timestamp() WHERE id=$1',[run.id,uncertain?'uncertain':'failed',code,message]);
      await audit(db,run.project_id,run.requested_by,uncertain?'uncertain':'failed',run.id,{error_code:code});return true;
    });
  }
  async function execute(run){
    let dispatched=false,returned=false,timeout,onAbort;
    controller=new AbortController();
    try{
      // Recheck authorization, current binding and snapshot before persisting the
      // dispatch marker. No network request runs inside this transaction.
      const ready=await transaction(pool,async db=>{
        await lockGuide(db,run.project_id);if(!await owned(db,run))return false;
        await membership(db,run.project_id,run.requested_by,WRITERS);
        const binding=(await db.query("SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1 AND status='ready'",[run.project_id])).rows[0];
        if(!binding||binding.workspace_id!==run.workspace_id)throw Object.assign(new Error('Workspace changed'),{code:'GUIDE_NORA_NOT_READY',noSideEffects:true});
        const current=await buildSnapshot(db,run.project_id);
        if(current.fingerprint!==run.source_fingerprint)throw Object.assign(new Error('Sources changed'),{code:'GUIDE_SOURCE_STALE',noSideEffects:true});
        if(typeof provider.generate!=='function')throw Object.assign(new Error('Provider unavailable'),{code:'GUIDE_PROVIDER_UNAVAILABLE',noSideEffects:true});
        await db.query('UPDATE domain_guide_runs SET dispatch_started_at=clock_timestamp() WHERE id=$1',[run.id]);return true;
      });
      if(!ready)return;
      if(stopping||controller.signal.aborted)throw Object.assign(new Error('Stopped before dispatch'),{code:'GUIDE_INTERRUPTED',noSideEffects:true});
      dispatched=true;
      const interrupted=new Promise((_,reject)=>{
        onAbort=()=>reject(Object.assign(new Error('Domain guide interrupted'),{code:'GUIDE_INTERRUPTED'}));
        controller.signal.addEventListener('abort',onAbort,{once:true});
        timeout=setTimeout(()=>{controller?.abort();},timeoutMs);
      });
      const result=await Promise.race([provider.generate({projectId:run.project_id,workspaceId:run.workspace_id,requestId:run.id,snapshot:run.snapshot,signal:controller.signal}),interrupted]);
      returned=true;clearTimeout(timeout);
      const guide=validateGuide(result?.guide,run.snapshot);
      if(!result||!['traceId','flowSlug','publishedVersionId'].every(k=>typeof result[k]==='string'&&result[k].length>0&&result[k].length<=300))throw Object.assign(new Error('Missing execution provenance'),{code:'GUIDE_PROVENANCE_INVALID',noSideEffects:true});
      await transaction(pool,async db=>{
        await lockGuide(db,run.project_id);if(!await owned(db,run))return;
        // Revoked access or a binding change cannot produce a new visible draft.
        await membership(db,run.project_id,run.requested_by,WRITERS);
        const binding=(await db.query("SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1 AND status='ready'",[run.project_id])).rows[0];
        if(!binding||binding.workspace_id!==run.workspace_id)throw Object.assign(new Error('Workspace changed'),{code:'GUIDE_NORA_NOT_READY'});
        const number=Number((await db.query('SELECT COALESCE(max(number),0)+1 AS next FROM domain_guide_versions WHERE project_id=$1',[run.project_id])).rows[0].next);
        const versionId=randomUUID();
        await db.query(`INSERT INTO domain_guide_versions(id,project_id,run_id,number,guide,snapshot,source_fingerprint,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[versionId,run.project_id,run.id,number,JSON.stringify(guide),JSON.stringify(run.snapshot),run.source_fingerprint,run.requested_by]);
        await db.query("UPDATE domain_guide_runs SET status='succeeded',trace_id=$2,flow_slug=$3,published_flow_version_id=$4,completed_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1",[run.id,result.traceId,result.flowSlug,result.publishedVersionId]);
        await audit(db,run.project_id,run.requested_by,'draft_created',versionId,{number,source_fingerprint:run.source_fingerprint,run_id:run.id});
      });
    }catch(error){await finishFailure(run,error,{dispatched,returned});}
    finally{clearTimeout(timeout);if(onAbort)controller?.signal.removeEventListener('abort',onAbort);controller=null;}
  }
  async function runOnce(){await recover();if(stopping)return null;await schedule();if(stopping)return null;const run=await claim();if(run)await execute(run);return run?.id||null;}
  function tick(){if(active)return active;active=runOnce().finally(()=>{active=null;});return active;}
  function start(){if(timer)return;stopping=false;timer=setInterval(()=>{tick().catch(onError);},pollMs);timer.unref?.();tick().catch(onError);}
  async function stop(){stopping=true;if(timer)clearInterval(timer);timer=null;controller?.abort();if(active)await active;}
  return {tick,start,stop};
}
module.exports={createDomainGuideWorker};
