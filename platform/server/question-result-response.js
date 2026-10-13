'use strict';
const {transaction}=require('./db');
const {membership}=require('./context-ledger');
const {getQuestion,checkVersion,getBlockingQuestions,validateSources}=require('./question-ledger');
const {lockGovernanceProject,staleReasons,buildCurrentPreflightReport}=require('./work-governance');
const {hash,fail}=require('./question-contract');

const clipped=(value,max=160)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
const TEST_STATUS={passed:'통과로 기록',failed:'실패로 기록',unknown:'확인되지 않음',not_run:'실행하지 않음'};
const WORK_STATUS={todo:'진행 전',in_progress:'진행 중',blocked:'대기',qa:'검수 중',done:'완료 확정'};
function renderResponse(question,items,at){
 const blocks=items.map(w=>{
  const lines=[`• ${clipped(w.title,120)} (업무 상태: ${WORK_STATUS[w.status]||w.status})`,`  요구사항 검수: ${w.requirements.length}개 수용 기준을 검토자가 확인했습니다.`];
  for(const r of w.requirements.slice(0,3))lines.push('  - '+clipped(r.text,180));
  if(w.requirements.length>3)lines.push(`  - 그 외 ${w.requirements.length-3}개 기준 포함`);
  for(const a of w.artifacts.filter(a=>a.kind==='test').slice(0,5))lines.push(`  검수에 포함된 테스트: ${clipped(a.title,100)} — ${TEST_STATUS[a.test_status]||TEST_STATUS.unknown}`);
  if(!w.artifacts.some(a=>a.kind==='test'))lines.push('  테스트: 등록된 테스트 근거 없음');
  for(const pr of w.published_prs)lines.push('  Draft PR 발행 기록: '+pr.pr_url);
  if(!w.published_prs.length)lines.push('  PR: 이 검수 결과와 연결된 발행 기록 없음');
  return lines.join('\n');
 });
 const body=`안녕하세요. ${clipped(question.title,160)} 관련하여 검토한 작업 결과를 안내드립니다.\n\n${blocks.join('\n\n')}\n\n기록 확인 시각: ${at}\n위 내용은 검수 및 PR 발행 기록 기준입니다. 현재 PR 병합 여부와 서비스 배포 여부는 별도 확인이 필요합니다.`;
 if(body.length>10000)fail('QUESTION_RESULT_DRAFT_TOO_LARGE','연결된 결과가 10,000자를 초과합니다. 질문에 연결할 작업 범위를 나누어 주세요.',422);
 return {subject:clipped(question.title+' · 작업 결과 안내',200),body};
}
// This endpoint creates no delivery and calls no model or external messaging provider.
// A later delivery has its own immutable content approval and explicit send action.
async function resultResponseDraft(pool,p,u,qid,expectedVersion){
 return transaction(pool,async db=>{
  await membership(db,p,u);
  await lockGovernanceProject(db,p);
  const question=await getQuestion(db,p,qid);checkVersion(question,expectedVersion);
  if(question.status==='cancelled')fail('QUESTION_CLOSED','취소한 질문에는 결과 안내 초안을 만들 수 없습니다.',409);
  await validateSources(db,p,question.source_refs);
  const works=(await db.query('SELECT w.* FROM question_work_items j JOIN work_items w ON w.project_id=j.project_id AND w.id=j.work_item_id WHERE j.project_id=$1 AND j.question_id=$2 ORDER BY w.created_at,w.id',[p,question.id])).rows;
  if(!works.length)fail('QUESTION_RESULT_WORK_REQUIRED','결과를 안내할 작업을 질문에 먼저 연결하세요.',409);
  const items=[],sources=new Map();
  for(const work of works){
   // Do not fall back to an old accepted result when a newer review is pending/rejected.
   const pf=(await db.query('SELECT * FROM work_preflights WHERE project_id=$1 AND (work_item_id=$2 OR (work_item_id IS NULL AND plan_id=$3)) ORDER BY created_at DESC,id DESC LIMIT 1',[p,work.id,work.plan_id])).rows[0];
   const validation=pf&&(await db.query('SELECT * FROM work_result_validations WHERE project_id=$1 AND preflight_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[p,pf.id])).rows[0];
   if(pf?.status!=='approved'||validation?.status!=='accepted')fail('QUESTION_RESULT_NOT_REVIEWED','연결한 모든 작업의 최신 결과 검수를 승인한 뒤 초안을 생성하세요.',409);
   const snapshot=validation.input_snapshot;
   if(snapshot.preflight_sha256!==pf.input_sha256||snapshot.scope_sha256!==hash(pf.decision)||validation.input_sha256!==hash(snapshot))fail('QUESTION_RESULT_EVIDENCE_CHANGED','검수 근거와 승인 범위가 일치하지 않습니다. 결과를 다시 검수하세요.',409);
   if((await staleReasons(db,p,snapshot,{lock:true})).length)fail('QUESTION_RESULT_STALE','검수 이후 요구사항·정책·저장소 기준이 변경되었습니다. 최신 기준으로 다시 검수하세요.',409);
   const originBlocked=(await db.query("SELECT 1 FROM project_questions q JOIN question_events e ON e.project_id=q.project_id AND e.question_id=q.id AND e.kind='created' WHERE q.project_id=$1 AND q.blocking AND q.status IN ('draft','waiting','answered_pending') AND (e.detail->>'origin_preflight_id'=$2 OR e.detail->>'origin_plan_id'=$3) LIMIT 1",[p,pf.id,work.plan_id])).rows[0];
   if((await buildCurrentPreflightReport(db,p,snapshot)).findings.some(f=>f.severity==='blocking')||(await getBlockingQuestions(db,p,work.id)).length||originBlocked)fail('QUESTION_RESULT_CONFLICT','연결한 작업에 해결되지 않은 충돌 또는 필수 질문이 있습니다. 확인 후 초안을 생성하세요.',409);
   const ids=work.source_task.acceptance_criteria.map((_,i)=>work.source_task_id+':AC'+(i+1));
   const requirements=validation.report.requirements.filter(r=>ids.includes(r.id));
   if(requirements.length!==ids.length||ids.some(id=>!validation.decision.matrix_checks.some(c=>c.id===id&&c.status==='verified')))fail('QUESTION_RESULT_NOT_REVIEWED','연결한 작업의 모든 수용 기준에 대한 검토 근거가 필요합니다.',409);
   const artifactIds=new Set(requirements.flatMap(r=>r.artifact_ids));
   const rows=(await db.query('SELECT id,content_sha256,work_item_id FROM work_result_artifacts WHERE project_id=$1 AND preflight_id=$2 AND id=ANY($3::uuid[])',[p,pf.id,snapshot.artifacts.map(a=>a.id)])).rows;
   if(rows.length!==snapshot.artifacts.length||snapshot.artifacts.some(a=>hash(a.payload)!==a.content_sha256||!rows.some(r=>r.id===a.id&&r.content_sha256===a.content_sha256)))fail('QUESTION_RESULT_EVIDENCE_CHANGED','검수한 결과물의 근거를 확인할 수 없습니다.',409);
   const artifacts=snapshot.artifacts.filter(a=>artifactIds.has(a.id)||a.kind==='test'&&rows.some(r=>r.id===a.id&&(!r.work_item_id||r.work_item_id===work.id)));
   const executions=artifacts.filter(a=>a.payload.result_kind==='code_patch').map(a=>a.payload.execution_id);
   const deliveries=executions.length?(await db.query("SELECT id,execution_id,pr_url,commit_sha,snapshot,created_at FROM github_deliveries WHERE project_id=$1 AND status='published' AND execution_id=ANY($2::uuid[]) ORDER BY created_at,id",[p,executions])).rows:[];
   const published=deliveries.filter(d=>artifacts.some(a=>a.payload.execution_id===d.execution_id&&a.payload.patch_sha256===d.snapshot.patch_sha256)&&d.snapshot.preflight_ids?.includes(pf.id)&&/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(d.pr_url||''));
   for(const s of snapshot.sources)sources.set(s.type+':'+s.id,{type:s.type,id:s.id,sha256:s.sha256});
   items.push({id:work.id,version:Number(work.version),title:work.source_task.title,status:work.status,preflight_id:pf.id,validation_id:validation.id,validation_version:Number(validation.version),reviewed_at:validation.decision.decided_at,requirements:requirements.map(({id,text})=>({id,text})),artifacts:artifacts.map(a=>({id:a.id,kind:a.kind,title:a.title,content_sha256:a.content_sha256,test_status:a.payload.test_status||'unknown',provenance:a.payload.provenance||'user_submitted'})),published_prs:published.map(d=>({id:d.id,execution_id:d.execution_id,pr_url:d.pr_url,commit_sha:d.commit_sha,recorded_at:d.created_at}))});
  }
  const generated_at=new Date().toISOString(),source_refs=[...sources.values()],data_sha256=hash({question_id:question.id,question_version:Number(question.version),source_refs,items});
  return {method:'reviewed_result_template',generated_at,question_id:question.id,question_version:Number(question.version),data_sha256,source_refs,items,...renderResponse(question,items,generated_at),delivery_created:false,point_in_time:true};
 });
}
module.exports={resultResponseDraft,renderResponse};
