'use strict';
const {createHash}=require('node:crypto');
const {hash}=require('./context-contract');
const questions=require('./question-ledger');
const catalog=require('./context-sources');
const {parseCreate}=require('./question-contract');
function stableId(...parts){const h=createHash('sha256').update(parts.join(':')).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
function questionInputs(result){
  // A risk-only analysis still produces a reviewable question. Do not infer
  // that an AI's proposed temporary approach answered the customer's question.
  const explicit=result.questions||[],covered=new Set(explicit.map(q=>q.deferred_by).filter(Boolean));
  const risks=(result.risks||[]).filter(r=>r.blocking&&(!explicit.length||r.deferred_by&&!covered.has(r.deferred_by))).map(r=>({...r,question:'다음 위험에 대한 판단을 확인해 주세요: '+r.description,issue_kind:'risk'}));
  return [...explicit,...risks];
}
function taskQuestionIds(analysisId,result,index){
  const linked=new Set((result.temporary_decisions||[]).filter(n=>n.task_indexes.includes(index)).flatMap(n=>n.issue_refs.map(ref=>ref.kind+':'+ref.id)));
  return questionInputs(result).flatMap((q,i)=>linked.has((q.issue_kind||'question')+':'+q.id)?[stableId(analysisId,'question',String(i))]:[]);
}
async function draftAnalysisQuestions(db,row,result){
  const inputs=questionInputs(result),ids=[];
  if(!inputs.length)return ids;
  const source=await catalog.source(db,row.project_id,'revision',row.revision_id);
  for(let i=0;i<inputs.length;i++){
    const q=inputs[i],qid=stableId(row.id,'question',String(i));
    const input=parseCreate({request_id:qid,title:('정책 확인: '+q.question).slice(0,300),question:q.question.slice(0,10000),recipient:'확인 담당자 지정 필요',channel:'발송 전 검토',assigned_to:row.created_by,blocking:true,source_refs:[{type:'revision',id:row.revision_id,sha256:source.sha256}],work_item_ids:[]});
    const refs=await questions.validateSources(db,row.project_id,input.source_refs);
    const created=(await db.query(`INSERT INTO project_questions(id,project_id,title,question,recipient,channel,assigned_to,created_by,blocking,status,source_refs,request_sha256)
      VALUES($1,$2,$3,$4,$5,$6,$7,$7,true,'draft',$8,$9) ON CONFLICT(id) DO NOTHING RETURNING *`,[qid,row.project_id,input.title,input.question,input.recipient,input.channel,row.created_by,JSON.stringify(refs),hash(input)])).rows[0];
    if(created)await questions.event(db,row.project_id,row.created_by,created,'created',{...input,source_refs:refs,automation_analysis_id:row.id,evidence:q.evidence});
    ids.push(qid);
  }
  return ids;
}
async function startCheck(db,p,row){
  const analysis=(await db.query('SELECT * FROM task_automation_analyses WHERE project_id=$1 AND id=$2',[p,row.analysis_id])).rows[0];
  const result=analysis?.result||{},index=(result.tasks||[]).findIndex((_,i)=>stableId(row.analysis_id,'task',String(i))===row.id);
  const proposals=[...(result.temporary_decisions||[]),...(result.work_gaps||[])].filter(n=>n.task_indexes.includes(index));
  const proposedNotes=proposals.length?proposals:(row.input_snapshot.implementation_notes||[]);
  const legacyIds=index<0?[]:taskQuestionIds(row.analysis_id,result,index),ids=[...new Set([...(row.question_ids||[]),...legacyIds])].sort();
  const found=ids.length?(await db.query(`SELECT id,version,title,question,status,answer,resolution,asked_at,recipient,channel FROM project_questions WHERE project_id=$1 AND id=ANY($2::uuid[]) ORDER BY id`,[p,ids])).rows:[];
  const lookup=new Map(found.map(q=>[q.id,q])),inputQuestions=questionInputs(result);
  const frozenQuestions=ids.map(qid=>{
    const stored=lookup.get(qid);if(stored)return {...stored,asked_at:stored.asked_at?new Date(stored.asked_at).toISOString():null};
    // Old v2 tasks never persisted their deferred questions. Show the same
    // deterministic draft that will be persisted atomically when confirmed.
    const original=inputQuestions.find((_,i)=>stableId(row.analysis_id,'question',String(i))===qid);
    if(!original)throw Object.assign(new Error('연결한 고객 질문을 찾을 수 없습니다.'),{code:'TASK_QUESTION_SCOPE_INVALID',status:409});
    return {id:qid,version:1,title:('정책 확인: '+original.question).slice(0,300),question:original.question.slice(0,10000),status:'draft',answer:null,resolution:null,asked_at:null,recipient:'확인 담당자 지정 필요',channel:'발송 전 검토'};
  });
  const pending=frozenQuestions.some(q=>!['resolved','cancelled'].includes(q.status));
  const requires=pending||proposedNotes.length>0;
  const review_token=hash({project_id:p,task_id:row.id,task_version:row.version,input_sha256:row.input_sha256,questions:frozenQuestions,proposed_notes:proposedNotes});
  return {task_id:row.id,task_version:row.version,review_token,requires_confirmation:requires,confirmation_reason:pending?'고객 검토가 필요한 질문이 남아있습니다.':proposedNotes.length?'확인이 필요한 구현 내용이 남아있습니다.':null,questions:frozenQuestions,temporary_decisions:proposedNotes.filter(n=>n.kind==='temporary_decision'),work_gaps:proposedNotes.filter(n=>n.kind==='work_gap')};
}
function executionContext(check,actorId){return {contract_version:'1.0',task_version:check.task_version,review_token:check.review_token,confirmed_by:actorId,confirmed_at:new Date().toISOString(),provisional_authorized:check.requires_confirmation,questions:check.questions,proposed_notes:[...check.temporary_decisions,...check.work_gaps]};}
function assertExecutionContext(row){
  if(row.execution_context){if(hash(row.execution_context)!==row.execution_context_sha256)throw Object.assign(new Error('개발 시작 때 확인한 질문 기록을 검증할 수 없습니다.'),{code:'TASK_EXECUTION_CONTEXT_MISMATCH',status:409});}
  else if(row.input_snapshot.schema_version==='3.0')throw Object.assign(new Error('개발 시작 확인 기록이 필요합니다.'),{code:'TASK_EXECUTION_CONTEXT_REQUIRED',status:409});
}
module.exports={questionInputs,taskQuestionIds,draftAnalysisQuestions,startCheck,executionContext,assertExecutionContext};
