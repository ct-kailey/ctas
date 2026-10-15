'use strict';
const { transaction } = require('./db');
const { membership } = require('./context-ledger');
const { hash, timestamp } = require('./context-contract');

const STAGES = { planning:'기획', contract:'계약', requirements:'요구사항', implementation:'구현', review:'검토', delivery:'최종 전달', closure:'계약 종료' };
const TYPES = ['revision','commercial_revision','commercial_decision','context_record','task_draft','work_item_event','automation_task','analysis','implementation_note_event','question_event','audit','milestone'];
const MANUAL_REFS = ['revision','commercial_revision','work_item','automation_task','task_draft','implementation_note','context_record','question'];
const SOURCE_TYPES = [...MANUAL_REFS,'review','implementation_plan','implementation_request','work_preflight','work_validation','analysis'];
const MILESTONES = {planning_started:'planning',contract_signed:'contract',final_delivery:'delivery',contract_closed:'closure',custom:null};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function fail(code,message,status=400) { throw Object.assign(new Error(message),{code,status}); }
function id(v) { if(typeof v!=='string'||!UUID.test(v)) fail('JOURNEY_ID_INVALID','올바른 기록 ID가 필요합니다.'); return v.toLowerCase(); }
function object(v,keys) { if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k))) fail('JOURNEY_INPUT_INVALID','타임라인 입력 항목을 확인하세요.'); }
function text(v,max,optional=false) { if(optional && v==null)return ''; if(typeof v!=='string'||v.length>max||!optional&&!v.trim()||v.includes('\0')||!v.isWellFormed())fail('JOURNEY_INPUT_INVALID','입력한 텍스트의 길이와 내용을 확인하세요.'); return v.trim(); }
function date(v) { try { return timestamp(v); } catch { fail('JOURNEY_DATE_INVALID','시간대가 포함된 올바른 일시를 입력하세요.'); } }
function parseMilestone(v) {
  object(v,['request_id','kind','stage','title','description','occurred_at','source_refs']);
  if(!Object.hasOwn(MILESTONES,v.kind))fail('JOURNEY_KIND_INVALID','주요일정 종류를 선택하세요.');
  const stage = MILESTONES[v.kind] || v.stage;
  if(!Object.hasOwn(STAGES,stage)||v.stage!=null&&v.stage!==stage)fail('JOURNEY_STAGE_INVALID','주요일정의 단계를 확인하세요.');
  const refs = v.source_refs ?? [];
  if(!Array.isArray(refs)||refs.length>20)fail('JOURNEY_REFERENCES_INVALID','연결할 기록은 20개 이하로 선택하세요.');
  const source_refs = refs.map(r=>{object(r,['type','id']);if(!MANUAL_REFS.includes(r.type))fail('JOURNEY_REFERENCES_INVALID','지원하는 문서 또는 작업 기록을 선택하세요.');return {type:r.type,id:id(r.id)};});
  if(new Set(source_refs.map(r=>r.type+':'+r.id)).size!==source_refs.length)fail('JOURNEY_REFERENCES_INVALID','같은 기록을 중복해서 연결할 수 없습니다.');
  const occurred_at = date(v.occurred_at);
  if(Date.parse(occurred_at)>Date.now()+300000)fail('JOURNEY_FUTURE_EVENT','이미 발생한 일정을 기록하세요. 미래 예약은 지원하지 않습니다.');
  return {request_id:id(v.request_id),kind:v.kind,stage,title:text(v.title,300),description:text(v.description,10000,true),occurred_at,source_refs};
}
function parseFilters(q={}) {
  object(q,['stage','type','from','to','limit','cursor']);
  const stage=q.stage||null,type=q.type||null,from=q.from?date(q.from):null,to=q.to?date(q.to):null;
  if(stage&&!Object.hasOwn(STAGES,stage))fail('JOURNEY_STAGE_INVALID','타임라인 단계를 선택하세요.');
  if(type&&!TYPES.includes(type))fail('JOURNEY_TYPE_INVALID','타임라인 기록 종류를 선택하세요.');
  if(from&&to&&from>=to)fail('JOURNEY_DATE_INVALID','종료 일시는 시작 일시보다 뒤여야 합니다.');
  const limit=q.limit==null?50:Number(q.limit);
  if(!Number.isInteger(limit)||limit<1||limit>100)fail('JOURNEY_PAGE_INVALID','한 번에 1~100개 기록을 조회할 수 있습니다.');
  return {stage,type,from,to,limit};
}
const sqlString = v => "'"+v.replaceAll("'","''")+"'";
function ref(type,key,title,documentId) { return `jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('type',${sqlString(type)},'id',${key},'title',${title}${documentId?",'document_id',"+documentId:''})))`; }
function fields(...entries) { return `jsonb_build_array(${entries.map(([label,value])=>`jsonb_build_object('label',${sqlString(label)},'value',${value})`).join(',')})`; }
function branch(type,from,{stage,kind,title,description="''",occurred='x.created_at',recorded='x.created_at',actor='x.created_by',refs="'[]'::jsonb",extra="'[]'::jsonb",where='TRUE'}) {
  return `SELECT x.id::text id,${sqlString(type)}::text type,${stage}::text stage,${kind}::text kind,${title}::text title,
    left(COALESCE(${description},''),10000) description,${occurred} occurred_at,${recorded} recorded_at,${sqlString(occurred===recorded?'recorded':'occurred')}::text occurred_time_source,${actor} actor_id,
    ${refs} source_refs,${extra} fields FROM ${from} WHERE x.project_id=$1 AND ${where}`;
}
// Deliberate allowlist: dedicated histories below already represent work items, notes,
// questions, document registration and commercial decisions. Never UNION their audit copies.
const AUDIT_KINDS = {
  'project.created':['planning','프로젝트 등록',null],
  'baseline.initial_published':['requirements','첫 문서 확정본 지정','revision'],
  'review.requested':['review','문서 변경 검토 요청','review'],
  'review.question_answered':['review','문서 검토 질문 답변','review'],
  'review.approved':['review','문서 변경 승인','review'],
  'review.rejected':['review','문서 변경 반려','review'],
  'baseline.published':['requirements','문서 확정본 반영','review'],
  'commercial.stage_changed':['contract','계약 진행 단계 변경',null],
  'commercial.confirmation_invalidated':['contract','계약 확인 재검토',null],
  'commercial.feedback_recorded':['contract','고객 보충 요청 기록',null],
  'commercial.feedback_answered':['contract','고객 보충 요청 답변',null],
  'implementation.plan_requested':['implementation','구현 계획 요청','implementation_plan'],
  'implementation.plan_needs_review':['review','구현 계획 검토 대기','implementation_plan'],
  'implementation.plan_approved':['review','구현 계획 승인','implementation_plan'],
  'implementation.plan_rejected':['review','구현 계획 반려','implementation_plan'],
  'implementation.plan_failed':['implementation','구현 계획 처리 실패','implementation_plan'],
  'implementation.plan_uncertain':['implementation','구현 계획 결과 확인 필요','implementation_plan'],
  'implementation.execution_requested':['implementation','구현 실행 요청','implementation_request'],
  'implementation.execution_patch_ready':['review','변경안 검토 대기','implementation_request'],
  'implementation.execution_failed':['implementation','구현 실행 실패','implementation_request'],
  'implementation.execution_uncertain':['implementation','구현 실행 결과 확인 필요','implementation_request'],
  'implementation.execution_cancelled':['implementation','구현 실행 요청 취소','implementation_request'],
  'governance.preflight_created':['implementation','작업 사전 검토 등록','work_preflight'],
  'governance.scope_locked':['implementation','작업 범위 승인','work_preflight'],
  'governance.validation_created':['review','작업 결과 검수 요청','work_validation'],
  'governance.validation_accepted':['review','작업 결과 검수 수용','work_validation'],
  'governance.validation_changes_requested':['review','작업 결과 수정 요청','work_validation'],
  'task_automation.tasks_created':['requirements','정책 분석 및 작업 생성','analysis'],
  'task_automation.questions_drafted':['requirements','정책 확인 질문 초안','analysis'],
  'task_automation.development_requested':['implementation','AI 작업 시작 요청','automation_task'],
  'task_automation.review_ready':['review','AI 작업 검토 대기','automation_task'],
  'task_automation.development_blocked':['implementation','AI 작업 구현 공백 기록','automation_task'],
  'task_automation.merge_approved':['review','검토한 변경의 병합 승인','automation_task'],
  'task_automation.merged':['implementation','AI 작업 병합 확인','automation_task'],
  'task_area.updated':['implementation','화면·서버·DB 담당 영역 변경','automation_task'],
  'task_automation.execution_awaiting_connection':['implementation','자동 작업 연결 대기',null],
  'task_automation.execution_failed':['implementation','자동 작업 처리 실패',null],
  'task_automation.execution_uncertain':['implementation','자동 작업 결과 확인 필요',null]
};
const auditCase = index => 'CASE x.kind '+Object.entries(AUDIT_KINDS).map(([kind,v])=>`WHEN ${sqlString(kind)} THEN ${v[index]?sqlString(v[index]):'NULL'}`).join(' ')+' END';
const auditRefs = `CASE WHEN x.entity_id ~* '${UUID.source}' AND (${auditCase(2)}) IS NOT NULL
 THEN jsonb_build_array(jsonb_build_object('type',${auditCase(2)},'id',x.entity_id,'title',${auditCase(1)})) ELSE '[]'::jsonb END`;
const EVENT_SQL = [
  branch('revision','revisions x JOIN documents d ON d.id=x.document_id AND d.project_id=x.project_id',{stage:"CASE WHEN d.document_category IN ('proposal','estimate','contract') THEN 'contract' WHEN d.document_category='planning' THEN 'planning' ELSE 'requirements' END",kind:"'document_registered'",title:"'문서 등록 · '||d.title",description:'x.filename',refs:ref('revision','x.id','d.title','x.document_id'),extra:fields(['원문 발생일',"x.history->>'occurred_on'"],['원문 생성일',"x.history->>'source_created_at'"],['문서 분류','d.document_category'],['시간 기준',"'문서를 시스템에 등록한 시각'"])}),
  branch('commercial_revision','commercial_document_revisions x JOIN commercial_documents d ON d.id=x.document_id AND d.project_id=x.project_id',{stage:"'contract'",kind:"'commercial_document_registered'",title:"'계약 문서 등록 · '||x.title",description:'x.reason',refs:ref('commercial_revision','x.id','x.title','x.document_id'),extra:fields(['문서 종류','d.kind'],['문서 버전','x.sequence'])}),
  branch('commercial_decision','commercial_decisions x JOIN commercial_document_revisions r ON r.id=x.revision_id AND r.project_id=x.project_id',{stage:"'contract'",kind:"'commercial_'||x.decision",title:"CASE x.decision WHEN 'approved' THEN '계약 문서 승인 · ' ELSE '계약 문서 반려 · ' END||r.title",description:'x.reason',actor:'x.actor_id',refs:ref('commercial_revision','r.id','r.title','r.document_id'),extra:fields(['기록 당시 판단','x.decision'])}),
  branch('context_record','context_records x',{stage:"CASE WHEN x.kind='retrospective' THEN 'review' ELSE 'requirements' END",kind:"'context_'||x.kind",title:"'요구사항·결정 확정 · '||x.title",description:'x.body',occurred:'x.occurred_at',actor:'x.reviewed_by',refs:ref('context_record','x.id','x.title'),extra:fields(['맥락 버전','x.context_version'],['시간 기준',"'기록에 지정된 발생 시각'"])}),
  branch('task_draft','project_task_drafts x',{stage:"'requirements'",kind:"'task_draft_registered'",title:"'작업 초안 등록 · '||x.title",description:'x.description',refs:ref('task_draft','x.id','x.title')+'||'+ref('revision','x.source_revision_id','x.source_title','x.source_document_id'),extra:fields(['진행률 포함',"'미검증 초안은 실행 작업의 분모에서 제외'"])}),
  branch('work_item_event','work_item_events x JOIN work_items w ON w.id=x.work_item_id AND w.project_id=x.project_id',{stage:"CASE WHEN x.after_state->>'status' IN ('qa','done') THEN 'review' ELSE 'implementation' END",kind:"'work_item_'||x.kind",title:"CASE x.kind WHEN 'imported' THEN '작업 등록 · ' ELSE '작업 변경 · ' END||COALESCE(w.source_task->>'title',w.source_task_id)",description:'x.note',actor:'x.actor_id',refs:ref('work_item','w.id',"COALESCE(w.source_task->>'title',w.source_task_id)"),extra:fields(['이전 상태',"x.before_state->>'status'"],['기록 당시 상태',"x.after_state->>'status'"],['QA 근거','x.qa_evidence'])}),
  branch('automation_task','automation_tasks x',{stage:"'implementation'",kind:"'automation_task_registered'",title:"'AI 작업 등록 · '||x.title",description:'x.description',refs:ref('automation_task','x.id','x.title')}),
  branch('analysis','task_automation_analyses x JOIN documents d ON d.project_id=x.project_id JOIN revisions r ON r.id=x.revision_id AND r.project_id=x.project_id AND r.document_id=d.id',{stage:"'requirements'",kind:"'risk_analysis_requested'",title:"'정책 분석 요청 · '||d.title",description:"'분석 요청은 작업 완료를 의미하지 않습니다.'",refs:ref('analysis','x.id',"'정책 분석'")+'||'+ref('revision','r.id','d.title','r.document_id')}),
  branch('implementation_note_event','project_implementation_note_history x JOIN project_implementation_notes n ON n.id=x.note_id AND n.project_id=x.project_id',{stage:"CASE WHEN x.kind IN ('accepted','resolved') THEN 'review' ELSE 'implementation' END",kind:"'implementation_note_'||x.kind",title:"CASE n.kind WHEN 'work_gap' THEN '작업 공백 · ' ELSE '임시 구현 · ' END||n.title",description:"COALESCE(x.detail->>'text',x.detail->>'note',n.uncertainty)",actor:'x.actor_id',refs:ref('implementation_note','n.id','n.title'),extra:fields(['기록 종류','n.kind'],['이력 동작','x.kind'],['기록 버전','x.version'],['의미',"'기록의 수용·해결 상태는 코드 배포 여부와 별개입니다.'"])}),
  branch('question_event','question_events x JOIN project_questions q ON q.id=x.question_id AND q.project_id=x.project_id',{stage:"'requirements'",kind:"'question_'||x.kind",title:"'질문 · '||q.title",description:"COALESCE(x.detail->>'note',x.detail->>'reason',x.detail#>>'{answer,text}',CASE WHEN x.kind='created' THEN x.detail->>'question' END,'')",actor:'x.actor_id',refs:ref('question','q.id','q.title'),extra:fields(['이력 동작','x.kind'],['기록 버전','x.version'])}),
  branch('audit','events x',{stage:auditCase(0),kind:'x.kind',title:auditCase(1),description:"COALESCE(x.detail->>'reason',x.detail->>'note',x.detail->>'request_text',x.detail->>'response_text','')",actor:'x.actor_id',refs:auditRefs,where:`x.kind IN (${Object.keys(AUDIT_KINDS).map(sqlString).join(',')})`,extra:fields(['이전 계약 진행 단계',"x.detail#>>'{before,stage}'"],['변경된 계약 진행 단계',"x.detail#>>'{after,stage}'"],['오류 코드',"x.detail->>'error_code'"],['구현 결과',"x.detail->>'completion'"],['작업 영역',"CASE WHEN x.kind='task_area.updated' THEN CASE x.detail->>'area' WHEN 'screen' THEN '화면' WHEN 'server' THEN '서버' WHEN 'database' THEN 'DB' END END"],['변경 전 상태',"CASE WHEN x.kind='task_area.updated' THEN CASE x.detail#>>'{before,status}' WHEN 'todo' THEN '할 일' WHEN 'in_progress' THEN '진행 중' WHEN 'blocked' THEN '확인 필요' WHEN 'review' THEN '검토 중' WHEN 'done' THEN '완료' WHEN 'not_applicable' THEN '작업 없음' END END"],['변경 후 상태',"CASE WHEN x.kind='task_area.updated' THEN CASE x.detail#>>'{after,status}' WHEN 'todo' THEN '할 일' WHEN 'in_progress' THEN '진행 중' WHEN 'blocked' THEN '확인 필요' WHEN 'review' THEN '검토 중' WHEN 'done' THEN '완료' WHEN 'not_applicable' THEN '작업 없음' END END"],['변경 항목',"CASE WHEN x.kind='task_area.updated' THEN concat_ws(' · ',CASE WHEN x.detail->'changed_fields' ? 'status' THEN '진행 상태' END,CASE WHEN x.detail->'changed_fields' ? 'assignee_ids' THEN '담당자' END,CASE WHEN x.detail->'changed_fields' ? 'description' THEN '작업 내용' END,CASE WHEN x.detail->'changed_fields' ? 'reference' THEN '관련 경로' END) END"],['주의',"CASE WHEN x.kind='commercial.stage_changed' AND x.detail#>>'{after,stage}'='handoff' THEN '개발 인계 기록입니다. 최종 전달 또는 계약 종료가 아닙니다.' END"])}),
  branch('audit','events x JOIN github_deliveries g ON g.id::text=x.entity_id AND g.project_id=x.project_id',{stage:"'review'",kind:'x.kind',title:"'검토용 Draft PR 발행'",description:"'검토용 PR 발행 기록입니다. 병합·최종 전달·계약 종료가 아닙니다.'",actor:'x.actor_id',refs:ref('implementation_request','g.execution_id',"'구현 실행'"),where:"x.kind='github_delivery.published'",extra:fields(['발행 PR',"x.detail->>'pr_url'"])}),
  branch('audit','events x JOIN work_result_artifacts a ON a.id::text=x.entity_id AND a.project_id=x.project_id',{stage:"'review'",kind:'x.kind',title:"'검수 결과물 등록 · '||a.title",description:"'등록된 결과물의 실제 충족 여부는 별도 검수가 필요합니다.'",actor:'x.actor_id',refs:ref('work_preflight','a.preflight_id',"'연결된 사전 검토'"),where:"x.kind='governance.artifact_registered'",extra:fields(['결과물 종류','a.kind'])}),
  branch('milestone','project_journey_milestones x',{stage:'x.stage',kind:'x.kind',title:'x.title',description:'x.description',occurred:'x.occurred_at',refs:'x.source_refs',extra:fields(['기록 방식',"'사용자가 실제 발생을 기록한 주요일정'"])}),
].join('\nUNION ALL\n');

function eventProjection(row) {
  const {fields,actor_id,...event}=row;
  return event;
}
function detailProjection(row) { return {event:eventProjection(row),detail:{description:row.description,fields:row.fields.filter(f=>f.value!=null&&f.value!==''),source_refs:row.source_refs}}; }
// JSON preserves PostgreSQL's microsecond timestamps for the keyset cursor.
const ENRICH = `SELECT to_jsonb(e)-'actor_id'||jsonb_build_object('actor',CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('id',u.id,'name',u.name) END) row FROM selected e LEFT JOIN users u ON u.id=e.actor_id`;
function decodeCursor(value,p,filters) {
  if(typeof value!=='string'||value.length>2500||!/^[A-Za-z0-9_-]+$/.test(value))fail('JOURNEY_CURSOR_INVALID','조회 위치를 다시 불러오세요.');
  try {
    const c=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    const exactTime=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
    if(c.v!==1||c.project_id!==p||c.filters!==hash(filters)||!TYPES.includes(c.type)||typeof c.id!=='string'||!UUID.test(c.id)||!exactTime(c.snapshot_at)||!exactTime(c.occurred_at))throw Error();
    return c;
  } catch { fail('JOURNEY_CURSOR_INVALID','조회 조건 또는 조회 위치가 달라졌습니다. 목록을 새로 불러오세요.'); }
}

const SOURCE_QUERIES = {
  revision:`SELECT x.id,d.title,x.document_id,x.filename description,x.status,x.created_at,x.sha256,x.history->>'occurred_on' occurred_on FROM revisions x JOIN documents d ON d.id=x.document_id AND d.project_id=x.project_id WHERE x.project_id=$1 AND x.id=$2`,
  commercial_revision:`SELECT x.id,x.title,x.document_id,x.reason description,x.created_at,x.sequence,x.content FROM commercial_document_revisions x WHERE x.project_id=$1 AND x.id=$2`,
  work_item:`SELECT x.id,COALESCE(x.source_task->>'title',x.source_task_id) title,x.source_task->>'description' description,x.status,x.created_at,x.plan_id FROM work_items x WHERE x.project_id=$1 AND x.id=$2`,
  automation_task:`SELECT x.id,x.title,x.description,x.status,x.execution_status,x.created_at,x.analysis_id,x.artifact->'implementation_report'->>'completion' completion FROM automation_tasks x WHERE x.project_id=$1 AND x.id=$2`,
  task_draft:`SELECT x.id,x.title,x.description,x.status,x.created_at,x.source_revision_id,x.source_document_id FROM project_task_drafts x WHERE x.project_id=$1 AND x.id=$2`,
  implementation_note:`SELECT x.id,x.title,x.uncertainty description,x.kind,x.status,x.created_at,x.temporary_approach,x.rationale,x.impact,x.replacement_condition,x.source_revision_id,x.automation_task_id,x.task_draft_id FROM project_implementation_notes x WHERE x.project_id=$1 AND x.id=$2`,
  context_record:`SELECT x.id,x.title,x.body description,x.kind,x.created_at,x.occurred_at FROM context_records x WHERE x.project_id=$1 AND x.id=$2`,
  question:`SELECT x.id,x.title,x.question description,x.status,x.created_at FROM project_questions x WHERE x.project_id=$1 AND x.id=$2`,
  review:`SELECT x.id,'문서 변경 검토' title,x.decision->>'reason' description,x.status,x.created_at,x.baseline_revision_id,x.current_revision_id FROM reviews x WHERE x.project_id=$1 AND x.id=$2`,
  implementation_plan:`SELECT x.id,'구현 계획' title,x.decision->>'reason' description,x.status,x.created_at,x.requested_revision_ids,x.result FROM implementation_plans x WHERE x.project_id=$1 AND x.id=$2`,
  implementation_request:`SELECT x.id,'구현 실행' title,'변경안 생성·실행 상태는 최종 전달 또는 병합 완료와 별개입니다.' description,x.status,x.created_at,x.plan_id,x.result FROM implementation_requests x WHERE x.project_id=$1 AND x.id=$2`,
  work_preflight:`SELECT x.id,COALESCE(x.input_snapshot->>'title','작업 사전 검토') title,x.decision->>'note' description,x.status,x.created_at,x.work_item_id,x.plan_id,x.report,x.input_snapshot->>'requirement' requirement FROM work_preflights x WHERE x.project_id=$1 AND x.id=$2`,
  work_validation:`SELECT x.id,'작업 결과 검수' title,x.decision->>'note' description,x.status,x.created_at,x.preflight_id,x.report FROM work_result_validations x WHERE x.project_id=$1 AND x.id=$2`,
  analysis:`SELECT x.id,'정책 분석' title,'분석 완료와 실행 작업 완료는 별개입니다.' description,x.status,x.error_code,x.created_at,x.revision_id,x.result FROM task_automation_analyses x WHERE x.project_id=$1 AND x.id=$2`
};
const FIELD_LABELS = {status:'현재 상태',execution_status:'현재 실행 상태',created_at:'등록 일시',occurred_at:'발생 일시',occurred_on:'원문 발생일',sha256:'원문 SHA-256',sequence:'문서 버전',kind:'기록 종류',completion:'구현 결과',temporary_approach:'임시 구현 방식',rationale:'판단 근거',impact:'영향',replacement_condition:'교체·해결 조건',error_code:'오류 코드'};
// Only declared human-readable content fields are exposed, never arbitrary result JSON,
// executable patches, runner metadata, repository configuration or input snapshots.
function sourceContents(row) {
  const entries=[];
  const add=(label,v)=>{if(typeof v==='string'&&v.trim())entries.push({label,value:v.slice(0,20000)});};
  const lines=(values,keys)=>Array.isArray(values)?values.slice(0,50).map(v=>typeof v==='string'?v:keys.map(k=>typeof v?.[k]==='string'?v[k]:'').filter(Boolean).join(' · ')).filter(Boolean).join('\n'):'';
  add('요청 내용',row.requirement);
  const r=row.result||row.report;
  if(r){add('요약',r.summary);add('계획 제목',r.title);add('검토 결과',r.verdict);
    for(const [key,label,keys] of [['tasks','작업 내용',['title','description']],['risks','위험·확인 사항',['description','severity']],['questions','확인 질문',['question','text']],['issues','검수 확인 사항',['message','severity']],['findings','점검 결과',['message','description','text']],['requirements','수용 기준 점검',['text','status']],['policies','정책 적용 점검',['text','status']],['scope','작업 범위 점검',['text','status']],['limitations','남은 확인 사항',[]]])add(label,lines(r[key],keys));
  }
  if(row.content){
    for(const s of (Array.isArray(row.content.sections)?row.content.sections:[]).slice(0,12))add(typeof s.title==='string'?s.title.slice(0,200):'본문',s.body);
    for(const t of (Array.isArray(row.content.tables)?row.content.tables:[]).slice(0,5)){
      const rows=[t.columns,...(Array.isArray(t.rows)?t.rows:[]).slice(0,30)].filter(Array.isArray).map(r=>r.slice(0,8).map(c=>typeof c==='string'?c.slice(0,500):'').join(' | '));
      add(typeof t.title==='string'?t.title.slice(0,200):'표',rows.join('\n'));
    }
  }
  // Keep the response bounded even for older data predating current input limits.
  let remaining=100000;
  return entries.flatMap(f=>{if(!remaining)return [];const value=f.value.slice(0,remaining);remaining-=value.length;return [{label:f.label,value}];});
}
async function getSource(db,p,type,sourceId,{lock=false}={}) {
  if(!SOURCE_TYPES.includes(type))fail('JOURNEY_SOURCE_TYPE_INVALID','지원하는 연결 기록을 선택하세요.');
  const row=(await db.query(SOURCE_QUERIES[type]+(lock?' FOR SHARE OF x':''),[p,id(sourceId)])).rows[0];
  if(!row)fail('JOURNEY_SOURCE_NOT_FOUND','이 프로젝트에서 연결 기록을 찾을 수 없습니다.',404);
  const source={type,id:row.id,title:row.title,...(row.document_id?{document_id:row.document_id}:{})};
  const source_refs=[];
  for(const [key,t,title] of [['plan_id','implementation_plan','구현 계획'],['analysis_id','analysis','정책 분석'],['source_revision_id','revision','원문 문서'],['revision_id','revision','원문 문서'],['baseline_revision_id','revision','기준 문서'],['current_revision_id','revision','변경 문서'],['automation_task_id','automation_task','AI 작업'],['task_draft_id','task_draft','작업 초안'],['work_item_id','work_item','작업'],['preflight_id','work_preflight','사전 검토']])if(row[key])source_refs.push({type:t,id:row[key],title});
  for(const rid of row.requested_revision_ids||[])source_refs.push({type:'revision',id:rid,title:'구현 근거 문서'});
  return {source,description:(row.description||'').slice(0,10000),fields:[...Object.entries(FIELD_LABELS).filter(([k])=>row[k]!=null&&row[k]!=='').map(([k,label])=>({label,value:row[k] instanceof Date?row[k].toISOString():String(row[k]).slice(0,10000)})),...sourceContents(row)],source_refs};
}

function createProjectJourney({pool}) {
  return {
    async overview(p,u) {
      return transaction(pool,async db=>{
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const role=await membership(db,p,u),project=(await db.query('SELECT id,name FROM projects WHERE id=$1',[p])).rows[0];
        const stats=(await db.query(`WITH journey AS (${EVENT_SQL}) SELECT stage,count(*)::int event_count,count(*) FILTER(WHERE type='milestone')::int milestone_count,min(occurred_at) first_at,max(occurred_at) last_at FROM journey GROUP BY stage`,[p])).rows;
        const counts=(await db.query(`WITH tasks AS (SELECT status,NULL::jsonb artifact FROM work_items WHERE project_id=$1 UNION ALL SELECT status,artifact FROM automation_tasks WHERE project_id=$1)
          SELECT count(*)::int total,count(*) FILTER(WHERE status='done')::int done,count(*) FILTER(WHERE status='todo')::int todo,
          count(*) FILTER(WHERE status='in_progress')::int in_progress,count(*) FILTER(WHERE status='qa')::int qa,count(*) FILTER(WHERE status='blocked')::int blocked,
          count(*) FILTER(WHERE status='done' AND artifact#>>'{implementation_report,completion}'='partial')::int completed_partial_tasks,
          (SELECT count(*)::int FROM project_task_drafts WHERE project_id=$1) unvalidated_drafts,
          (SELECT count(*)::int FROM project_implementation_notes WHERE project_id=$1 AND kind='work_gap' AND status NOT IN ('accepted','resolved')) open_work_gaps,
          (SELECT count(*)::int FROM project_implementation_notes WHERE project_id=$1 AND kind='temporary_decision' AND status NOT IN ('accepted','resolved')) open_temporary_decisions FROM tasks`,[p])).rows[0];
        const stages=Object.entries(STAGES).map(([id,label])=>({id,label,event_count:stats.find(s=>s.stage===id)?.event_count||0,milestone_count:stats.find(s=>s.stage===id)?.milestone_count||0}));
        return {project,summary:{first_occurred_at:stats.length?new Date(Math.min(...stats.map(s=>new Date(s.first_at)))):null,last_occurred_at:stats.length?new Date(Math.max(...stats.map(s=>new Date(s.last_at)))):null,event_count:stats.reduce((n,s)=>n+s.event_count,0)},stages,
          progress:{scope:'execution_tasks',...counts,percent:counts.total?Math.round(counts.done/counts.total*1000)/10:null,cancelled_excluded:0,rejected_excluded:0,
            definition:'등록된 실행 작업(work_items와 automation_tasks)의 현재 done/전체 비율입니다. 작업 초안·분석·실행 요청·Draft PR은 별도 기록이며 중복 집계하지 않습니다. 일반 작업 done은 QA·검수 완료, AI 작업 done은 검토 후 병합 확인을 뜻합니다. 취소·반려된 실행 요청이나 검토안은 작업 수에 포함되지 않으며, 완료 작업에도 미해결 공백이 남을 수 있습니다.'},permissions:{record_milestone:['owner','reviewer'].includes(role)}};
      });
    },
    async events(p,u,query={}) {
      await membership(pool,p,u);
      const {limit,...filters}=parseFilters(query),cursor=query.cursor?decodeCursor(query.cursor,p,filters):null;
      const snapshot=cursor?.snapshot_at||(await pool.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') t")).rows[0].t;
      const args=[p,snapshot,filters.stage,filters.type,filters.from,filters.to,cursor?.occurred_at||null,cursor?.type||null,cursor?.id||null,limit+1];
      const result=(await pool.query(`WITH journey AS (${EVENT_SQL}), filtered AS MATERIALIZED (
        SELECT * FROM journey WHERE recorded_at<=$2::timestamptz AND ($3::text IS NULL OR stage=$3) AND ($4::text IS NULL OR type=$4)
        AND ($5::timestamptz IS NULL OR occurred_at >= $5) AND ($6::timestamptz IS NULL OR occurred_at < $6)),
        selected AS (SELECT * FROM filtered WHERE $7::timestamptz IS NULL OR (occurred_at,type,id)>($7::timestamptz,$8::text,$9::text) ORDER BY occurred_at,type,id LIMIT $10),
        enriched AS (${ENRICH}) SELECT (SELECT count(*)::int FROM filtered) total,COALESCE((SELECT jsonb_agg(row ORDER BY (row->>'occurred_at')::timestamptz,row->>'type',row->>'id') FROM enriched),'[]') rows`,args)).rows[0];
      const has_more=result.rows.length>limit,rows=result.rows.slice(0,limit),last=rows.at(-1);
      const next_cursor=has_more?Buffer.from(JSON.stringify({v:1,project_id:p,filters:hash(filters),snapshot_at:snapshot,occurred_at:last.occurred_at,type:last.type,id:last.id})).toString('base64url'):null;
      return {events:rows.map(eventProjection),next_cursor,has_more,total:result.total,snapshot_at:snapshot};
    },
    async detail(p,u,type,eventId) {
      await membership(pool,p,u);
      if(!TYPES.includes(type))fail('JOURNEY_TYPE_INVALID','지원하는 타임라인 기록을 선택하세요.');
      const row=(await pool.query(`WITH journey AS (${EVENT_SQL}),selected AS(SELECT * FROM journey WHERE type=$2 AND id=$3) ${ENRICH}`,[p,type,id(eventId)])).rows[0]?.row;
      if(!row)fail('JOURNEY_EVENT_NOT_FOUND','이 프로젝트에서 타임라인 기록을 찾을 수 없습니다.',404);
      return detailProjection(row);
    },
    async getSource(p,u,type,sourceId) { await membership(pool,p,u); return getSource(pool,p,type,sourceId); },
    async recordMilestone(p,u,body) {
      const input=parseMilestone(body),fingerprint=hash(input);
      return transaction(pool,async db=>{
        const role=(await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE',[p,id(u)])).rows[0]?.role;
        if(!['owner','reviewer'].includes(role))fail('FORBIDDEN','프로젝트 소유자 또는 검토자가 주요일정을 기록할 수 있습니다.',403);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-journey:'||$1,0))",[input.request_id]);
        const existing=(await db.query('SELECT * FROM project_journey_milestones WHERE id=$1',[input.request_id])).rows[0];
        if(existing){if(existing.project_id!==p||existing.created_by!==u||existing.request_sha256!==fingerprint)fail('JOURNEY_REQUEST_CONFLICT','다른 내용에 사용된 요청 ID입니다.',409);const {request_sha256,...milestone}=existing;return {milestone,replayed:true};}
        const refs=[];
        for(const r of [...input.source_refs].sort((a,b)=>(a.type+a.id).localeCompare(b.type+b.id)))refs.push((await getSource(db,p,r.type,r.id,{lock:true})).source);
        const row=(await db.query(`INSERT INTO project_journey_milestones(id,project_id,kind,stage,title,description,occurred_at,source_refs,request_sha256,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[input.request_id,p,input.kind,input.stage,input.title,input.description,input.occurred_at,JSON.stringify(refs),fingerprint,u])).rows[0];
        const {request_sha256,...milestone}=row;
        return {milestone,replayed:false};
      });
    }
  };
}
module.exports={createProjectJourney,parseMilestone,parseFilters,STAGES,TYPES,SOURCE_TYPES,EVENT_SQL};
