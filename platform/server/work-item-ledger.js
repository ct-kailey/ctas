'use strict';
const {transaction}=require('./db');
const {lockGovernanceProject,assertWorkGovernance,assertPlanGovernance,releaseWorkScope}=require('./work-governance');
const {implementationHash,getImplementationStaleReasons}=require('./implementation-ledger');
const {validateImplementationResult}=require('../../nora/client/implementation-client');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REVIEWERS=['owner','reviewer'],WRITERS=[...REVIEWERS,'member'];
const STATUS=['todo','in_progress','blocked','qa','done'];
const ADVANCING=['in_progress','qa','done'];
const TRANSITIONS={todo:['in_progress','blocked'],in_progress:['todo','blocked','qa'],blocked:['todo','in_progress','qa'],qa:['todo','in_progress','blocked','done'],done:['todo']};
const owns=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
function fail(code,message,status=400){throw Object.assign(new Error(message),{code,status});}
function id(value){if(typeof value!=='string'||!UUID.test(value))fail('INVALID_ID','올바른 항목 ID가 필요합니다.');return value.toLowerCase();}
function object(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('INVALID_WORK_ITEM_INPUT','지원하지 않는 작업 입력 형식입니다.');}
function text(value,label,max=2000,empty=false){if(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||value.trim().length>max||(!empty&&!value.trim()))fail('INVALID_WORK_ITEM_INPUT',`${label}은 최대 ${max}자까지 입력하세요.`);return value.trim();}
function date(value){
  if(value===null)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01'||value>'9999-12-31')fail('INVALID_WORK_ITEM_DATE','완료 예정일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
  const parsed=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail('INVALID_WORK_ITEM_DATE','완료 예정일은 실제 달력 날짜여야 합니다.');
  return value;
}
async function membership(db,p,u,lock=false){
  const row=(await db.query(`SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2${lock?' FOR SHARE':''}`,[p,id(u)])).rows[0];
  if(!row)fail('FORBIDDEN','이 프로젝트에 접근할 권한이 없습니다.',403);return row.role;
}
async function projectLock(db,p){await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-work-items:'||$1,0))",[p]);}
async function readPlan(db,p,planId,lock=false){
  const row=(await db.query(`SELECT * FROM implementation_plans WHERE project_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[p,id(planId)])).rows[0];
  if(!row)fail('NOT_FOUND','프로젝트의 작업 계획을 찾을 수 없습니다.',404);return row;
}
function approvedPlan(row,p){
  if(row.status!=='approved'||row.decision?.decision!=='approved')fail('IMPLEMENTATION_APPROVAL_REQUIRED','검토자가 승인한 작업 계획만 업무로 등록할 수 있습니다.',409);
  if(row.input_sha256!==implementationHash(row.input_snapshot)||row.decision.input_sha256!==row.input_sha256||row.decision.result_sha256!==implementationHash(row.result))fail('DECISION_SNAPSHOT_MISMATCH','승인된 작업 계획의 근거가 일치하지 않습니다.',409);
  try{validateImplementationResult(row.result,row.input_snapshot,p);}catch{fail('INVALID_IMPLEMENTATION_RESULT','작업 계획의 형식 또는 근거가 올바르지 않습니다.',409);}
  if(row.result.questions.some(question=>question.blocking))fail('IMPLEMENTATION_BLOCKING_QUESTIONS','미해결 사항이 있는 작업 계획은 등록할 수 없습니다.',409);
}
const ITEM_SELECT=`SELECT w.*,to_char(w.due_on,'YYYY-MM-DD') AS due_on,p.result->>'title' AS plan_title,u.name AS assignee_name
  FROM work_items w JOIN implementation_plans p ON p.id=w.plan_id AND p.project_id=w.project_id
  LEFT JOIN users u ON u.id=w.assignee_id`;
async function rows(db,p,planId){return (await db.query(`${ITEM_SELECT} WHERE w.project_id=$1${planId?' AND w.plan_id=$2':''} ORDER BY w.created_at DESC,w.plan_id,substring(w.source_task_id from 6)::integer`,planId?[p,planId]:[p])).rows;}
function sourceContext(row,plan){
  return row.source_task.evidence.map(evidence=>{
    const source=plan.input_snapshot.sources.find(source=>source.revision_id===evidence.revision_id);
    const segment=source.segments.find(segment=>segment.segment_id===evidence.segment_id);
    return {...evidence,document_id:source.document_id,title:source.title,text:segment.text,locator:segment.locator};
  });
}
function decorate(row,all,reasons){return {...row,version:Number(row.version),stale_reasons:reasons,
  dependencies:row.source_task.depends_on.map(taskId=>{
    const dependency=all.find(item=>item.plan_id===row.plan_id&&item.source_task_id===taskId);
    return dependency?{id:dependency.id,source_task_id:taskId,title:dependency.source_task.title,status:dependency.status}:{id:null,source_task_id:taskId,title:taskId,status:'missing'};
  })};}
async function decorated(db,p,all){
  if(!all.length)return [];
  const planIds=[...new Set(all.map(row=>row.plan_id))];
  const plans=(await db.query('SELECT id,input_snapshot FROM implementation_plans WHERE project_id=$1 AND id=ANY($2::uuid[])',[p,planIds])).rows;
  const config=(await db.query('SELECT version,repository_check FROM project_settings WHERE project_id=$1',[p])).rows[0];
  const documentIds=[...new Set(plans.flatMap(plan=>plan.input_snapshot.sources.map(source=>source.document_id)))];
  const documents=new Map((await db.query('SELECT id,baseline_revision_id FROM documents WHERE project_id=$1 AND id=ANY($2::uuid[])',[p,documentIds])).rows.map(document=>[document.id,document.baseline_revision_id]));
  const reasons=new Map(plans.map(plan=>{
    const input=plan.input_snapshot,result=[];
    if(Number(config.version)!==input.settings_version)result.push('SETTINGS_CHANGED');
    const head=config.repository_check?.status==='ready'?config.repository_check.head_sha:null;
    if(head!==input.repository.head_sha)result.push('REPOSITORY_HEAD_CHANGED');
    if(input.sources.some(source=>documents.get(source.document_id)!==source.revision_id))result.push('BASELINE_CHANGED');
    return [plan.id,result];
  }));
  return all.map(row=>decorate(row,all,reasons.get(row.plan_id)));
}
async function detail(db,p,itemId,reasons){
  const row=(await db.query(`${ITEM_SELECT} WHERE w.project_id=$1 AND w.id=$2`,[p,id(itemId)])).rows[0];
  if(!row)fail('NOT_FOUND','프로젝트의 작업을 찾을 수 없습니다.',404);
  const plan=await readPlan(db,p,row.plan_id),all=await rows(db,p,row.plan_id);
  const item=decorate(row,all,reasons||await getImplementationStaleReasons(db,p,plan.input_snapshot));
  item.evidence_context=sourceContext(row,plan);
  item.history=(await db.query(`SELECT e.id,e.version,e.kind,e.actor_id,u.name AS actor_name,e.note,e.qa_evidence,
    e.before_state AS before,e.after_state AS after,e.created_at FROM work_item_events e
    JOIN users u ON u.id=e.actor_id WHERE e.project_id=$1 AND e.work_item_id=$2 ORDER BY e.version DESC`,[p,row.id])).rows.map(event=>({...event,version:Number(event.version)}));
  return item;
}
function state(row){return {status:row.status,assignee_id:row.assignee_id,due_on:row.due_on,blocker:row.blocker,version:Number(row.version)};}
async function history(db,p,u,row,before,note,qaEvidence,kind){
  await db.query(`INSERT INTO work_item_events(project_id,work_item_id,version,kind,actor_id,note,qa_evidence,before_state,after_state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[p,row.id,row.version,kind,u,note,qaEvidence,before?JSON.stringify(state(before)):null,JSON.stringify(state(row))]);
  await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)',
    [p,u,'work_item.'+kind,row.id,JSON.stringify({title:row.source_task.title,plan_id:row.plan_id,source_task_id:row.source_task_id,version:Number(row.version),reason:note,qa_evidence:qaEvidence,before:before?state(before):null,after:state(row)})]);
}
function assertFresh(reasons){if(reasons.length)fail('WORK_ITEM_PLAN_STALE','기획 기준선·프로젝트 설정 또는 저장소가 변경되었습니다. 새 계획을 검토한 후 진행하세요.',409);}
function assertDependencies(row,all){
  if(row.source_task.depends_on.some(taskId=>!all.some(item=>item.plan_id===row.plan_id&&item.source_task_id===taskId&&item.status==='done')))fail('WORK_ITEM_DEPENDENCIES_PENDING','선행 작업의 검토·완료 확정이 필요합니다.',409);
}
function assertReopen(row,all){
  if(all.some(item=>item.source_task.depends_on.includes(row.source_task_id)&&ADVANCING.includes(item.status)))fail('WORK_ITEM_REOPEN_BLOCKED','진행 중이거나 검토·완료된 후속 작업이 있습니다. 후속 작업부터 대기 또는 보류로 되돌린 뒤 재개하세요.',409);
}
function createWorkItemLedger(pool,{requireGovernance=true}={}){return {
  async list(p,u){
    await membership(pool,p,u);const all=await rows(pool,p);
    const members=(await pool.query("SELECT u.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1 AND m.role IN ('owner','reviewer','member') ORDER BY u.name,u.id",[p])).rows;
    return {items:await decorated(pool,p,all),members};
  },
  async get(p,itemId,u){await membership(pool,p,u);return detail(pool,p,itemId);},
  async importPlan(p,planId,u,body={}){
    object(body,['acknowledge_tasks']);if(body.acknowledge_tasks!==true)fail('WORK_ITEM_ACK_REQUIRED','승인된 계획을 업무로 등록함을 확인하세요.');
    return transaction(pool,async db=>{
      await projectLock(db,p);if(requireGovernance)await lockGovernanceProject(db,p);const role=await membership(db,p,u,true);if(!REVIEWERS.includes(role))fail('FORBIDDEN','검토자만 작업 계획을 업무로 등록할 수 있습니다.',403);
      const initial=await readPlan(db,p,planId);
      // Shared order with implementation approval: settings, source documents, then plan.
      const reasons=await getImplementationStaleReasons(db,p,initial.input_snapshot,{lock:true});
      const plan=await readPlan(db,p,planId,true);approvedPlan(plan,p);
      const previous=await rows(db,p,plan.id);
      if(previous.length){
        if(previous.length!==plan.result.tasks.length||plan.result.tasks.some(task=>!previous.some(row=>row.source_task_id===task.id&&implementationHash(row.source_task)===implementationHash(task))))fail('WORK_ITEM_IMPORT_INCOMPLETE','기존 작업과 승인 계획의 항목이 일치하지 않습니다.',409);
        return {items:previous.map(row=>decorate(row,previous,reasons)),replayed:true};
      }
      assertFresh(reasons);
      if(requireGovernance)await assertPlanGovernance(db,p,plan.id);
      for(const task of plan.result.tasks){
        const row=(await db.query('INSERT INTO work_items(project_id,plan_id,source_task_id,source_task,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[p,plan.id,task.id,JSON.stringify(task),u])).rows[0];
        await history(db,p,u,row,null,'승인한 계획의 작업을 등록했습니다.',null,'imported');
      }
      if(requireGovernance)await require('./work-result-bridge').attachPreflightQuestionsToWorkItems(db,p,plan.id);
      const items=await rows(db,p,plan.id);return {items:items.map(row=>decorate(row,items,reasons)),replayed:false};
    });
  },
  async update(p,itemId,u,body={}){
    object(body,['expected_version','status','assignee_id','due_on','blocker','note','qa_evidence']);
    if(!Number.isSafeInteger(body.expected_version)||body.expected_version<1)fail('WORK_ITEM_VERSION_REQUIRED','현재 작업 버전이 필요합니다.');
    const note=text(body.note,'변경 사유');
    if(owns(body,'status')&&!STATUS.includes(body.status))fail('INVALID_WORK_ITEM_INPUT','올바른 작업 상태를 선택하세요.');
    if(owns(body,'assignee_id')&&body.assignee_id!==null)id(body.assignee_id);
    if(owns(body,'due_on'))date(body.due_on);
    if(owns(body,'blocker'))text(body.blocker,'진행을 막는 이유',2000,true);
    const qaEvidence=owns(body,'qa_evidence')?text(body.qa_evidence,'QA 검토 근거',5000):null;
    return transaction(pool,async db=>{
      await projectLock(db,p);if(requireGovernance)await lockGovernanceProject(db,p);const role=await membership(db,p,u,true);
      if(!WRITERS.includes(role))fail('FORBIDDEN','작업을 변경할 권한이 없습니다.',403);
      const initial=(await db.query('SELECT plan_id FROM work_items WHERE project_id=$1 AND id=$2',[p,id(itemId)])).rows[0];
      if(!initial)fail('NOT_FOUND','프로젝트의 작업을 찾을 수 없습니다.',404);
      const originalPlan=await readPlan(db,p,initial.plan_id);
      const reasons=await getImplementationStaleReasons(db,p,originalPlan.input_snapshot,{lock:true});
      await readPlan(db,p,initial.plan_id,true);
      const row=(await db.query("SELECT *,to_char(due_on,'YYYY-MM-DD') AS due_on FROM work_items WHERE project_id=$1 AND id=$2 FOR UPDATE",[p,itemId])).rows[0];
      const isReviewer=REVIEWERS.includes(role);
      if(!isReviewer&&(row.assignee_id!==u||owns(body,'assignee_id')||owns(body,'due_on')||body.status==='done'||qaEvidence!==null))fail('FORBIDDEN','담당자는 자신의 진행 상태와 막힌 이유만 변경할 수 있습니다. 배정·일정·완료 확정은 검토자가 관리합니다.',403);
      if(Number(row.version)!==body.expected_version)fail('WORK_ITEM_VERSION_CONFLICT','작업이 변경되었습니다. 최신 내용을 확인하고 다시 저장하세요.',409);
      const next={...row,status:body.status??row.status,assignee_id:owns(body,'assignee_id')?(body.assignee_id===null?null:id(body.assignee_id)):row.assignee_id,
        due_on:owns(body,'due_on')?body.due_on:row.due_on,blocker:owns(body,'blocker')?body.blocker.trim():row.blocker,version:Number(row.version)+1};
      const transition=next.status!==row.status;
      if(transition&&!TRANSITIONS[row.status].includes(next.status))fail('WORK_ITEM_INVALID_TRANSITION','현재 상태에서 요청한 상태로 변경할 수 없습니다.',409);
      if(row.status==='done'&&transition&&!isReviewer)fail('FORBIDDEN','완료한 작업은 검토자가 대기로 되돌릴 수 있습니다.',403);
      if(next.status!=='blocked'){
        if(owns(body,'blocker')&&body.blocker.trim())fail('INVALID_WORK_ITEM_INPUT','막힌 이유는 보류 상태에서만 입력하세요.');
        next.blocker='';
      }else if(!next.blocker)fail('WORK_ITEM_BLOCKER_REQUIRED','보류할 때는 진행을 막는 이유를 입력하세요.');
      if(qaEvidence!==null&&!(transition&&next.status==='done'))fail('INVALID_WORK_ITEM_INPUT','QA 검토 근거는 완료 확정 시 입력하세요.');
      if(transition&&next.status==='done'&&!qaEvidence)fail('WORK_ITEM_QA_EVIDENCE_REQUIRED','완료 확정을 위한 QA 검토 근거를 입력하세요.');
      if(owns(body,'assignee_id')&&next.assignee_id!==null){
        const assignedRole=(await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE',[p,next.assignee_id])).rows[0]?.role;
        if(!WRITERS.includes(assignedRole))fail('WORK_ITEM_ASSIGNEE_INVALID','이 프로젝트에서 업무를 수행할 수 있는 구성원을 지정하세요.');
      }
      const all=await rows(db,p,row.plan_id);
      if(transition&&ADVANCING.includes(next.status)){assertFresh(reasons);assertDependencies(row,all);if(requireGovernance)await assertWorkGovernance(db,p,row.id,{completion:next.status==='done'});}
      if(row.status==='done'&&transition)assertReopen(row,all);
      const changed=(await db.query("UPDATE work_items SET status=$1,assignee_id=$2,due_on=$3,blocker=$4,version=version+1,updated_at=clock_timestamp() WHERE project_id=$5 AND id=$6 AND version=$7 RETURNING *,to_char(due_on,'YYYY-MM-DD') AS due_on",[next.status,next.assignee_id,next.due_on,next.blocker,p,row.id,body.expected_version])).rows[0];
      if(!changed)fail('WORK_ITEM_VERSION_CONFLICT','작업이 변경되었습니다. 최신 내용을 확인하고 다시 저장하세요.',409);
      await history(db,p,u,changed,row,note,qaEvidence,'updated');if(requireGovernance&&transition&&next.status==='done')await releaseWorkScope(db,p,row.id,u);return detail(db,p,row.id,reasons);
    });
  }
};}
module.exports={createWorkItemLedger};
