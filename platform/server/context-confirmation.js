'use strict';
const {transaction}=require('./db');
const {object,id,text,version,hash,fail}=require('./context-contract');
const {lock,lockSources,createCandidateInTransaction}=require('./context-ledger');
const {assertCurrent,itemInput,publicRun}=require('./context-ai-ledger');

// One human decision covers an explicit selection from one immutable Nora result.
// All candidates are checked before any is merged, so their common base version
// remains meaningful and a failing item cannot leave a partially confirmed batch.
async function confirmContextAnalysis(pool,p,rid,u,body){
  object(body,['selected_indices','expected_sha256','expected_context_version','reason']);
  rid=id(rid);u=id(u);version(body.expected_context_version);
  const reason=text(body.reason,'검토 의견',4000);
  if(!/^[a-f0-9]{64}$/.test(body.expected_sha256||''))fail('CONTEXT_HASH_REQUIRED','검토한 분석 결과를 다시 확인하세요.');
  if(!Array.isArray(body.selected_indices)||!body.selected_indices.length||body.selected_indices.length>100||body.selected_indices.some(i=>!Number.isSafeInteger(i)||i<0)||new Set(body.selected_indices).size!==body.selected_indices.length)fail('CONTEXT_SELECTION_INVALID','확정할 항목을 중복 없이 선택하세요.');
  const indices=[...body.selected_indices].sort((a,b)=>a-b);
  const requestHash=hash({...body,reason,selected_indices:indices});
  return transaction(pool,async db=>{
    const v=await lock(db,p,u,['owner','reviewer']);
    // Authorization may have changed while waiting for another context writer.
    // Keep the membership stable until this decision commits.
    const member=(await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE',[p,u])).rows[0];
    if(!member||!['owner','reviewer'].includes(member.role))fail('FORBIDDEN','현재 프로젝트 검토 권한이 필요합니다.',403);
    const run=(await db.query('SELECT * FROM context_ai_runs WHERE project_id=$1 AND id=$2 FOR UPDATE',[p,rid])).rows[0];
    if(!run)fail('CONTEXT_AI_NOT_FOUND','이 프로젝트의 분석 요청을 찾을 수 없습니다.',404);
    const prior=(await db.query("SELECT actor_id,detail FROM events WHERE project_id=$1 AND entity_id=$2 AND kind='context.ai_confirmed' ORDER BY created_at LIMIT 1",[p,rid])).rows[0];
    if(prior){
      if(prior.actor_id!==u||prior.detail.request_sha256!==requestHash)fail('CONTEXT_ALREADY_DECIDED','이미 확정한 분석입니다. 남은 내용은 최신 요구사항과 함께 다시 검토하세요.',409);
      return {run:publicRun(run),record_ids:prior.detail.record_ids,version:v,replayed:true};
    }
    if(run.status!=='ready'||!run.result||run.decision?.decision!=='approved')fail('CONTEXT_AI_NOT_READY','Nora 검토 결과 처리가 끝나면 같은 내용으로 다시 확정하세요.',409);
    if(run.reviewed_sha256!==body.expected_sha256||hash(run.result)!==body.expected_sha256)fail('CONTEXT_REVIEW_STALE','검토한 분석 결과와 현재 결과가 다릅니다.',409);
    if(v!==body.expected_context_version||v!==run.request.context_version)fail('CONTEXT_VERSION_CONFLICT','검토 중 프로젝트 기록이 바뀌었습니다. 최신 내용으로 다시 분석하세요.',409);
    if(indices.some(i=>!run.result.items[i]))fail('CONTEXT_SELECTION_INVALID','분석 결과에 없는 항목입니다.');
    const inputs=indices.map(i=>itemInput(run,run.result.items[i],i));
    await lockSources(db,p,[...run.source_refs,...run.request.current_items.map(item=>({type:'context_record',id:item.item_id}))]);
    await assertCurrent(db,run);
    const candidates=[];
    for(const input of inputs){
      const c=await createCandidateInTransaction(db,p,u,input,v);
      if(c.status!=='pending'||c.base_version!==v)fail('CONTEXT_ALREADY_DECIDED','선택한 항목에 이전에 처리한 내용이 있습니다. 다시 확인하세요.',409);
      if(c.conflicts.some(item=>item.resolution==='unresolved'))fail('CONTEXT_CONFLICT_UNRESOLVED','충돌하는 항목은 제외하고 확정하거나, 충돌 해결 근거를 먼저 기록하세요.',409);
      if(c.questions.some(q=>q.blocking&&!q.answer.trim()))fail('CONTEXT_QUESTIONS_UNRESOLVED','필수 질문에 대한 답변을 먼저 확인하세요.',409);
      // Nora cannot provide supersession resolution in this simplified action.
      if(c.conflicts.length||c.supersedes_id||c.knowledge_provenance)fail('CONTEXT_CONFIRM_REVIEW_REQUIRED','이 항목은 상세 검토에서 근거와 적용 관계를 확인해 주세요.',409);
      candidates.push(c);
    }
    for(let i=0;i<candidates.length;i++){
      const c=candidates[i];
      const stored=(await db.query('SELECT * FROM context_candidates WHERE project_id=$1 AND id=$2',[p,c.id])).rows[0];
      if(hash(stored.payload)!==stored.content_sha256)fail('CONTEXT_CANDIDATE_STALE','검토 후보 내용이 변경되었습니다.',409);
      const decision={actor_id:u,reason,decided_at:new Date().toISOString(),reviewed_context_version:v,content_sha256:c.content_sha256,analysis_id:run.id,selected_indices:indices};
      await db.query('INSERT INTO context_records(id,project_id,candidate_id,domain_id,context_version,kind,entity_key,title,body,occurred_at,payload,content_sha256,created_by,reviewed_by) VALUES($1,$2,$1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[c.id,p,c.domain_id,v+i+1,c.kind,c.entity_key,c.title,c.body,c.occurred_at,JSON.stringify(stored.payload),c.content_sha256,c.created_by,u]);
      await db.query("UPDATE context_candidates SET status='merged',decision=$3 WHERE project_id=$1 AND id=$2",[p,c.id,JSON.stringify(decision)]);
      await db.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,'context.candidate_merged',$3,$4)",[p,u,c.id,JSON.stringify({title:c.title,kind:c.kind,reason,context_version:v+i+1,analysis_id:run.id})]);
    }
    const recordIds=candidates.map(c=>c.id);
    await db.query('UPDATE context_heads SET version=$2 WHERE project_id=$1',[p,v+candidates.length]);
    const imported=[...new Set([...run.imported_ids,...recordIds])];
    const updated=(await db.query('UPDATE context_ai_runs SET imported_ids=$2,updated_at=now() WHERE id=$1 RETURNING *',[run.id,JSON.stringify(imported)])).rows[0];
    await db.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,'context.ai_confirmed',$3,$4)",[p,u,rid,JSON.stringify({request_sha256:requestHash,selected_indices:indices,record_ids:recordIds,reason,reviewed_context_version:v,context_version:v+candidates.length})]);
    return {run:publicRun(updated),record_ids:recordIds,version:v+candidates.length,replayed:false};
  });
}
module.exports={confirmContextAnalysis};
