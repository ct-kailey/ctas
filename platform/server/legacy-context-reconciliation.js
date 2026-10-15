'use strict';

const {isDeepStrictEqual}=require('node:util');
const {transaction}=require('./db');
const {normalizeApproval,extractApprovalRequest,validateRequest}=require('../../nora/context/contract');
const native=require('../../nora/context/client');

const LIMIT=50,CONCURRENCY=5;
function fail(code,message,status=409){throw Object.assign(new Error(message),{code,status});}
async function owner(db,p,u){
  const row=(await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE',[p,u])).rows[0];
  if(row?.role!=='owner')fail('FORBIDDEN','프로젝트 관리자만 이전 Nora 실행을 확인할 수 있습니다.',403);
}
// Keep this independent of project-nora: that service calls this helper before
// binding. The same dispatch lock protects the unbound recheck and final write.
async function unbound(db,p,u){
  await owner(db,p,u);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-nora-dispatch:' || $1,0))",[p]);
  if((await db.query('SELECT 1 FROM project_nora_workspaces WHERE project_id=$1',[p])).rowCount)
    fail('NORA_LEGACY_RECONCILE_NOT_ALLOWED','워크스페이스가 등록된 프로젝트의 이전 실행은 이 경로로 변경할 수 없습니다.');
}
function sameSnapshot(current,before){
  return current?.status==='uncertain' && current.project_id===before.project_id &&
    current.approval_id===before.approval_id && current.trace_id===before.trace_id &&
    current.request_sha256===before.request_sha256 && current.reviewed_sha256===before.reviewed_sha256 &&
    isDeepStrictEqual(current.request,before.request) && isDeepStrictEqual(current.reviewed_candidate,before.reviewed_candidate) &&
    isDeepStrictEqual(current.decision,before.decision) && isDeepStrictEqual(current.result,before.result);
}
function checkedApproval(raw,row,projectId){
  const approval=normalizeApproval(raw); // pins tenant, flow, finalizer and approval kind
  validateRequest(row.request,projectId);
  if(!row.trace_id || approval.id!==row.approval_id || approval.traceId!==row.trace_id ||
    row.request.request_id!==row.id || !isDeepStrictEqual(extractApprovalRequest(approval.message),row.request))
    fail('CONTEXT_APPROVAL_IDENTITY_MISMATCH','이전 실행과 Nora 승인 기록이 일치하지 않습니다.');
  return approval;
}

/**
 * Read-only Nora lookup followed by a narrowly fenced local reconciliation.
 * Never dispatches, decides an approval, imports candidates or rewrites results.
 * The response contains counts and stable error codes, never capability IDs.
 */
async function reconcileLegacyContextRuns({pool,projectId,userId,client=native}){
  const rows=await transaction(pool,async db=>{
    await unbound(db,projectId,userId);
    return (await db.query("SELECT * FROM context_ai_runs WHERE project_id=$1 AND status='uncertain' ORDER BY (approval_id IS NULL),created_at,id LIMIT 50",[projectId])).rows;
  });
  let resolved=0;
  const errors=new Map();
  const error=code=>errors.set(code,(errors.get(code)||0)+1);
  for(let start=0;start<rows.length;start+=CONCURRENCY){
    // No transaction/connection is retained during these bounded remote reads.
    const inspected=await Promise.all(rows.slice(start,start+CONCURRENCY).map(async row=>{
      if(!row.approval_id||!row.trace_id)return {row,error:'CONTEXT_APPROVAL_REFERENCE_MISSING'};
      let raw;
      try{raw=await client.getApproval(row.approval_id);}
      catch{return {row,error:'CONTEXT_APPROVAL_LOOKUP_FAILED'};}
      try{return {row,approval:checkedApproval(raw,row,projectId)};}
      catch{return {row,error:'CONTEXT_APPROVAL_IDENTITY_MISMATCH'};}
    }));
    for(const item of inspected){
      if(item.error){error(item.error);continue;}
      const {row,approval}=item;
      // Pending, approved, or any future outcome is deliberately not inferred.
      if(!['expired','rejected'].includes(approval.status))continue;
      const changed=await transaction(pool,async db=>{
        await unbound(db,projectId,userId);
        const current=(await db.query('SELECT * FROM context_ai_runs WHERE project_id=$1 AND id=$2 FOR UPDATE',[projectId,row.id])).rows[0];
        if(!sameSnapshot(current,row))return false;
        const status=approval.status==='expired'?'failed':'rejected';
        const code=approval.status==='expired'?'CONTEXT_APPROVAL_EXPIRED':'CONTEXT_APPROVAL_REJECTED';
        // Preserve the original request, candidate, result and human decision.
        await db.query("UPDATE context_ai_runs SET status=$3,error_code=$4,updated_at=now() WHERE project_id=$1 AND id=$2 AND status='uncertain'",[projectId,row.id,status,code]);
        await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[
          projectId,userId,'context.ai_legacy_reconciled',row.id,
          JSON.stringify({previous_status:'uncertain',status,native_approval_status:approval.status,error_code:code,request_sha256:row.request_sha256,method:'native_approval_read',replayed:false})
        ]);
        return true;
      });
      if(changed)resolved++;else error('CONTEXT_RECONCILIATION_STALE');
    }
  }
  const remaining=await transaction(pool,async db=>{
    await unbound(db,projectId,userId);
    return Number((await db.query("SELECT count(*)::int AS n FROM context_ai_runs WHERE project_id=$1 AND status='uncertain'",[projectId])).rows[0].n);
  });
  return {checked:Math.min(rows.length,LIMIT),resolved,remaining,errors:[...errors].map(([code,count])=>({code,count}))};
}

module.exports={reconcileLegacyContextRuns};
