'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {membership}=require('./context-ledger');
const {hash}=require('./context-contract');
const questions=require('./question-ledger');
const A=require('./task-automation');
const noteArchive=require('./implementation-notes');
const riskV2=require('../../nora/task-automation/risk-flow-v2');
const riskV3=require('../../nora/task-automation/risk-flow-v3');
const provisional=require('./task-provisional-execution');

function createTaskAutomationWorker({pool,provider={},pollMs=3000,timeoutMs=300000,onError=()=>{}}) {
  const service=A.createTaskAutomation({pool,provider});let active,timer,controller,stopped=false;
  async function intake() {
    const row=(await pool.query("SELECT * FROM task_automation_intake WHERE status IN('pending','awaiting_connection') AND next_attempt_at<=now() ORDER BY created_at LIMIT 1")).rows[0];if(!row)return false;
    try {await service.analyze(row.project_id,row.created_by,{revision_id:row.revision_id,request_id:row.request_id});await pool.query("UPDATE task_automation_intake SET status='submitted',error_code=NULL WHERE revision_id=$1",[row.revision_id]);}
    catch(e){const code=A.safeCode(e),waiting=['TASK_CONNECTION_REQUIRED','NORA_AUTH_REQUIRED','TASK_AUTOMATION_DISABLED'].includes(code);await pool.query("UPDATE task_automation_intake SET status=$2,error_code=$3,next_attempt_at=now()+interval '30 seconds' WHERE revision_id=$1",[row.revision_id,waiting?'awaiting_connection':'failed',code]);}
    return true;
  }
  async function recover() {
    return transaction(pool,async db=>{const rows=(await db.query("UPDATE task_automation_jobs SET status='uncertain',error_code='TASK_EXECUTION_INTERRUPTED',lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE status='running' AND payload->>'execution_mode' IS DISTINCT FROM 'desktop' AND lease_expires_at<=now() RETURNING *")).rows;for(const r of rows){if(r.kind==='risk')await db.query("UPDATE task_automation_analyses SET status='uncertain',error_code='TASK_EXECUTION_INTERRUPTED',updated_at=now() WHERE id=$1 AND status='running'",[r.analysis_id]);else await db.query("UPDATE automation_tasks SET execution_status='uncertain',error_code='TASK_EXECUTION_INTERRUPTED',version=version+1,updated_at=now() WHERE id=$1 AND status<>'done'",[r.task_id]);}return rows.length;});
  }
  async function claim() {
    return transaction(pool,async db=>{const r=(await db.query("SELECT * FROM task_automation_jobs WHERE status IN('queued','awaiting_connection') AND payload->>'execution_mode' IS DISTINCT FROM 'desktop' AND next_attempt_at<=now() ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!r)return null;const token=randomUUID();await db.query("UPDATE task_automation_jobs SET status='running',lease_token=$2,lease_expires_at=now()+make_interval(secs=>$3),updated_at=now() WHERE id=$1",[r.id,token,Math.max(600,Math.ceil(timeoutMs/1000)+60)]);if(r.kind==='risk')await db.query("UPDATE task_automation_analyses SET status='running',error_code=NULL,updated_at=now() WHERE id=$1",[r.analysis_id]);else if(r.kind==='develop')await db.query("UPDATE automation_tasks SET execution_status='running',error_code=NULL,version=version+1,updated_at=now() WHERE id=$1",[r.task_id]);return {...r,lease_token:token};});
  }
  async function owned(db,job) {const r=(await db.query("SELECT id FROM task_automation_jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now() FOR UPDATE",[job.id,job.lease_token])).rows[0];if(!r)A.fail('TASK_LEASE_LOST','실행 결과의 점유가 만료되었습니다.');}
  async function finishError(job,state,code,traceId=null) {
    traceId=/^trc_[A-Za-z0-9_-]{1,200}$/.test(traceId||'')?traceId:null;
    return transaction(pool,async db=>{const changed=await db.query("UPDATE task_automation_jobs SET status=$3,error_code=$4,trace_id=COALESCE(trace_id,$5),lease_token=NULL,lease_expires_at=NULL,next_attempt_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING id",[job.id,job.lease_token,state,code,traceId]);if(!changed.rowCount)return {id:job.id,status:'uncertain',error_code:'TASK_LEASE_LOST'};if(job.kind==='risk')await db.query('UPDATE task_automation_analyses SET status=$2,error_code=$3,updated_at=now() WHERE id=$1',[job.analysis_id,state,code]);else await db.query("UPDATE automation_tasks SET status=CASE WHEN $2='failed' AND $4='develop' THEN 'blocked' ELSE status END,execution_status=$2,error_code=$3,execution_trace_id=CASE WHEN $4='develop' THEN COALESCE(execution_trace_id,$5) ELSE execution_trace_id END,version=version+1,updated_at=now() WHERE id=$1 AND status<>'done'",[job.task_id,state,code,job.kind,traceId]);await A.audit(db,job.project_id,job.created_by,'execution_'+state,job.task_id||job.analysis_id,{kind:job.kind,error_code:code,...(traceId?{trace_id:traceId}:{})});return {id:job.id,status:state,error_code:code};});
  }
  async function completeJob(db,job,traceId=null) {await db.query("UPDATE task_automation_jobs SET status='succeeded',error_code=NULL,trace_id=COALESCE(trace_id,$3),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",[job.id,job.lease_token,traceId]);}
  async function riskResult(job,row,result) {
    return transaction(pool,async db=>{await A.lock(db,row.project_id);await questions.lockQuestionWorkflow(db,row.project_id);await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-context:' || $1,0))",[row.project_id]);await owned(db,job);await membership(db,row.project_id,job.created_by,A.WRITERS);await A.assertFresh(db,row.project_id,row.input_snapshot,row.input_sha256);
      const modern=['2.0','3.0'].includes(row.input_snapshot.schema_version),blocked=modern?result.execution_blocked:result.risks.some(r=>r.blocking)||result.questions.length>0;
      // Questions remain real, unanswered customer questions even when a safe
      // task candidate can proceed after explicit per-task confirmation.
      const ids=await provisional.draftAnalysisQuestions(db,{...row,created_by:job.created_by},result);
      if(!blocked)for(let i=0;i<result.tasks.length;i++){
        const t=result.tasks[i],tid=A.stableId(row.id,'task',String(i)),input=modern?{...row.input_snapshot,implementation_notes:riskV2.taskNotes(result,i)}:row.input_snapshot;
        const questionIds=modern?provisional.taskQuestionIds(row.id,result,i):[];
        await db.query(`INSERT INTO automation_tasks(id,project_id,analysis_id,title,description,acceptance_criteria,evidence,input_snapshot,input_sha256,created_by,question_ids)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,[tid,row.project_id,row.id,t.title,t.description,JSON.stringify(t.acceptance_criteria),JSON.stringify(t.evidence),input,hash(input),job.created_by,JSON.stringify(questionIds)]);
      }
      await db.query('UPDATE task_automation_analyses SET status=$2,result=$3,question_ids=$4,error_code=NULL,updated_at=now() WHERE id=$1',[row.id,blocked?'blocked':'completed',result,JSON.stringify(ids)]);await completeJob(db,job,result.trace_id);await A.audit(db,row.project_id,job.created_by,blocked?'questions_drafted':'tasks_created',row.id,{question_ids:ids,task_count:blocked?0:result.tasks.length,trace_id:result.trace_id,job_id:job.id});return {id:job.id,status:'succeeded',analysis_status:blocked?'blocked':'completed'};});
  }
  async function artifactResult(job,row,artifact) {
    return transaction(pool,async db=>{await A.lock(db,row.project_id);await owned(db,job);await membership(db,row.project_id,job.created_by,A.WRITERS);let freshnessCode=null;
      try{await A.assertFresh(db,row.project_id,row.input_snapshot,row.input_sha256,{development:true});}
      catch(error){if(row.execution_context&&['TASK_SOURCE_STALE','TASK_FEEDBACK_STALE'].includes(error.code))freshnessCode=error.code;else throw error;}
      // A changed planning context prevents approval; it must not erase code
      // and implementation history that was already produced from the snapshot.
      const report=artifact.implementation_report,status=freshnessCode||(report||artifact.reported_implementation_report)?.completion==='blocked'?'blocked':'qa';
      if(report){
        const executionContexts=Object.fromEntries(report.notes.map(n=>[A.stableId(job.id,row.id,'development-note',n.id),{
          contract_version:'1.0',operation_id:job.id,development_context_sha256:row.execution_context_sha256,
          confirmed_by:row.execution_context?.confirmed_by||job.created_by,confirmed_at:row.execution_context?.confirmed_at||null,
          question_ids:n.question_ids||[],questions:(row.execution_context?.questions||[]).filter(q=>(n.question_ids||[]).includes(q.id)),
          implemented_at:n.implemented_at||null,development_completed_at:artifact.development_completed_at||null,code_paths:n.code_paths||[],pr_url:artifact.pr_url||null,pr_number:artifact.pr_number||null,
          head_sha:artifact.head_sha||null,base_sha:artifact.base_sha||null,diff_sha256:typeof artifact.diff==='string'?hash(artifact.diff):null,
          trace_id:artifact.trace_id,history_trace_id:artifact.history_trace_id||artifact.trace_id,
          question_outcomes:(report.question_outcomes||[]).filter(q=>q.note_ids.includes(n.id))
        }]));
        await noteArchive.appendNoraNotes(db,{projectId:row.project_id,actorId:job.created_by,sourceRevisionId:row.input_snapshot.source.revision_id,analysisId:row.analysis_id,traceId:artifact.trace_id,executionContexts,notes:report.notes.map(n=>({...riskV2.noteSnapshot(n),request_id:A.stableId(job.id,row.id,'development-note',n.id),automation_task_id:row.id}))});
      }
      await db.query("UPDATE automation_tasks SET status=$3,execution_status='ready',artifact=$2,error_code=$5,execution_trace_id=$4,version=version+1,updated_at=now() WHERE id=$1",[row.id,artifact,status,artifact.trace_id,freshnessCode]);await completeJob(db,job);await A.audit(db,row.project_id,job.created_by,status==='qa'?'review_ready':'development_blocked',row.id,{head_sha:artifact.head_sha,pr_number:artifact.pr_number,completion:(report||artifact.reported_implementation_report)?.completion||'complete',...(artifact.evidence_status?{evidence_status:artifact.evidence_status}:{}),...(freshnessCode?{error_code:freshnessCode}:{})});return {id:job.id,status:'succeeded',task_status:status};});
  }
  async function mergeResult(job,row,result) {
    return transaction(pool,async db=>{await A.lock(db,row.project_id);await owned(db,job);const current=await A.task(db,row.project_id,row.id,true);if(hash(A.effectiveArtifact(current))!==current.review?.artifact_sha256||current.review.head_sha!==result.head_sha)A.fail('TASK_REVIEW_STALE','승인한 변경 내역과 병합 결과가 다릅니다.');await db.query("UPDATE automation_tasks SET status='done',execution_status='ready',merge_result=$2,error_code=NULL,version=version+1,updated_at=now() WHERE id=$1",[row.id,result]);await completeJob(db,job);await A.audit(db,row.project_id,job.created_by,'merged',row.id,result);return {id:job.id,status:'succeeded',task_status:'done'};});
  }
  async function execute(job,signal) {
    let dispatched=false,returned=false,observedTrace=null;
    try {
      await membership(pool,job.project_id,job.created_by,['merge','reconcile_merge'].includes(job.kind)?A.REVIEWERS:A.WRITERS);
      const row=job.kind==='risk'?(await pool.query('SELECT * FROM task_automation_analyses WHERE project_id=$1 AND id=$2',[job.project_id,job.analysis_id])).rows[0]:await A.task(pool,job.project_id,job.task_id);
      if(!row)A.fail('TASK_NOT_FOUND','실행할 작업을 찾을 수 없습니다.');
      if(job.kind==='develop')provisional.assertExecutionContext(row);
      if(job.kind!=='reconcile_merge')await A.assertFresh(pool,job.project_id,row.input_snapshot,row.input_sha256,{development:job.kind!=='risk',verification:job.kind==='merge',profile:row.execution_context?.execution_profile});
      const ready=(await pool.query('SELECT workspace_id,status FROM project_nora_workspaces WHERE project_id=$1',[job.project_id])).rows[0];
      if(ready?.workspace_id!==row.input_snapshot.nora.workspace_id||ready.status!=='ready')return finishError(job,'awaiting_connection','TASK_CONNECTION_REQUIRED');
      const c=await A.capabilities(provider,job.project_id,pool),config=await A.settings(pool,job.project_id);
      if(job.kind==='risk'&&!c.risk_analysis||job.kind==='develop'&&!c.development||job.kind==='merge'&&!c.merge||job.kind==='reconcile_merge'&&typeof provider.reconcileMerge!=='function')return finishError(job,'awaiting_connection',job.kind==='risk'?'TASK_RISK_UNAVAILABLE':job.kind==='develop'?'TASK_DEVELOPMENT_UNAVAILABLE':'TASK_MERGE_UNAVAILABLE');
      const common={projectId:job.project_id,workspaceId:ready.workspace_id,requestId:job.kind==='risk'?row.id:job.id,snapshot:row.input_snapshot,snapshotHash:row.input_sha256,settings:config,signal};
      if(job.kind==='risk') {dispatched=true;const raw=await provider.analyzeRisk(common);returned=true;observedTrace=raw.trace_id;const result=(row.input_snapshot.schema_version==='3.0'?riskV3:row.input_snapshot.schema_version==='2.0'?riskV2:require('../../nora/task-automation/risk-flow')).validateRiskResult(raw,row.input_snapshot,row.input_sha256);if(!result.trace_id)A.fail('TASK_RISK_TRACE_REQUIRED','Nora 분석 실행 이력이 필요합니다.');return await riskResult(job,row,result);}
      if(job.kind==='develop') {dispatched=true;const raw=await provider.develop({...common,taskId:row.id,developmentContext:row.execution_context,task:{id:row.id,title:row.title,description:row.description,acceptance_criteria:row.acceptance_criteria,evidence:row.evidence}});returned=true;observedTrace=raw.trace_id;return await artifactResult(job,row,A.validateArtifact(raw,row));}
      row.artifact=A.effectiveArtifact(row);
      if(job.kind==='merge'&&hash(A.artifactVerificationPolicy(row))!==hash(A.verificationPolicy(config,row.execution_context?.execution_profile?A.executionProfile(config):null)))A.fail('TASK_VERIFICATION_STALE','승인 후 검증 설정이 변경되었습니다.');
      if(!row.review||hash(row.artifact)!==row.review.artifact_sha256||row.review.head_sha!==row.artifact.head_sha)A.fail('TASK_REVIEW_STALE','승인한 변경 내역을 확인할 수 없습니다.');
      const args={...common,taskId:row.id,artifact:row.artifact,expectedHeadSha:row.review.head_sha,targetBranch:row.review.target_branch,operationId:job.payload.operation_id||job.id};
      dispatched=true;const result=job.kind==='merge'?await provider.merge(args):await provider.reconcileMerge(args);returned=true;
      return await mergeResult(job,row,A.validateMerge(result,row));
    } catch(e) {
      const code=A.safeCode(e),waiting=e.noSideEffects===true&&['NORA_AUTH_REQUIRED','NORA_SERVICE_UNAVAILABLE','TASK_CONNECTION_REQUIRED'].includes(code);
      const uncertain=dispatched&&(!returned||['merge','reconcile_merge'].includes(job.kind))&&e.noSideEffects!==true;
      return finishError(job,waiting?'awaiting_connection':uncertain?'uncertain':'failed',code,e.trace_id||observedTrace);
    }
  }
  async function run() {await recover();await intake();const job=await claim();if(!job)return null;controller=new AbortController();try{return await execute(job,AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs)]));}finally{controller=null;}}
  function runOnce(){if(active)return active;active=run().finally(()=>{active=null;});return active;}
  async function tick(){if(!stopped)try{await runOnce();}catch(e){onError({code:A.safeCode(e)});}}
  return {runOnce,tick,recover,async start(){if(timer)return;stopped=false;void tick();timer=setInterval(tick,pollMs);timer.unref();},async stop(){stopped=true;clearInterval(timer);timer=null;controller?.abort();if(active)await active;}};
}
module.exports={createTaskAutomationWorker};
