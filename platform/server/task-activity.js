'use strict';
const { membership } = require('./context-ledger');

const LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACE = /^trc_[A-Za-z0-9_-]{1,200}$/;
const CODE = /^(TASK|NORA)_[A-Z0-9_]{1,80}$/;
const TASK_EVENTS = ['development_requested','review_ready','development_blocked','execution_awaiting_connection','execution_failed','execution_uncertain','merge_approved','merged','artifact_verification_updated'].map(kind => 'task_automation.' + kind).concat('task_area.updated');
const ANALYSIS_EVENTS = ['analysis_requested','questions_drafted','tasks_created','execution_awaiting_connection','execution_failed','execution_uncertain'].map(kind => 'task_automation.' + kind);
const OPERATION_NAMES = { risk: '정책 분석', develop: '개발', merge: '병합', reconcile_merge: '병합 결과 확인' };
const JOB_STATES = { queued: '실행 대기', running: '실행 중', succeeded: '완료', awaiting_connection: '연결 대기', failed: '실패', uncertain: '결과 확인 필요' };
const AREA_NAMES = { screen: '화면', server: '서버', database: 'DB' };
const AREA_STATES = { todo: '할 일', in_progress: '진행 중', blocked: '확인 필요', review: '검토 중', done: '완료', not_applicable: '작업 없음' };
const EVENT_TITLES = {
  'task_automation.analysis_requested': '정책 분석 요청',
  'task_automation.questions_drafted': '고객 확인 질문 생성',
  'task_automation.tasks_created': '분석 결과에서 AI 작업 생성',
  'task_automation.development_requested': '개발 실행 요청',
  'task_automation.review_ready': '개발 결과 저장',
  'task_automation.development_blocked': '추가 확인이 필요한 개발 결과 저장',
  'task_automation.execution_awaiting_connection': '실행 연결 대기',
  'task_automation.execution_failed': '실행 실패 기록',
  'task_automation.execution_uncertain': '실행 결과 확인 필요',
  'task_automation.merge_approved': '병합 승인',
  'task_automation.merged': '병합 완료',
  'task_automation.artifact_verification_updated': '코드·CI·프리뷰 확인 결과 갱신',
  'task_area.updated': '영역별 담당·진행 변경',
};
const EVENT_STATUSES = {
  'task_automation.analysis_requested': 'queued', 'task_automation.development_requested': 'queued',
  'task_automation.review_ready': 'ready', 'task_automation.development_blocked': 'blocked',
  'task_automation.execution_awaiting_connection': 'awaiting_connection', 'task_automation.execution_failed': 'failed',
  'task_automation.execution_uncertain': 'uncertain', 'task_automation.merge_approved': 'merging', 'task_automation.merged': 'done',
};
function fail(code, message, status) { throw Object.assign(new Error(message), {code, status}); }
function taskId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail('TASK_ACTIVITY_ID_INVALID', '작업 식별자를 확인하세요.', 400);
  return value.toLowerCase();
}
function safeMetadata(row) {
  return { ...(typeof row.error_code === 'string' && CODE.test(row.error_code) ? {error_code: row.error_code} : {}),
    ...(typeof row.trace_id === 'string' && TRACE.test(row.trace_id) ? {trace_id: row.trace_id} : {}) };
}
function eventItem(row) {
  if (!EVENT_TITLES[row.kind]) return null;
  let summary;
  if (row.kind === 'task_area.updated') {
    const pieces = [];
    if (AREA_NAMES[row.area]) pieces.push(AREA_NAMES[row.area]);
    if (AREA_STATES[row.before_status] && AREA_STATES[row.after_status] && row.before_status !== row.after_status) pieces.push(AREA_STATES[row.before_status] + ' → ' + AREA_STATES[row.after_status]);
    for (const [field, label] of [['assignee_ids','담당자 변경'],['description','작업 내용 수정'],['reference','연결 정보 수정']]) if (Array.isArray(row.changed_fields) && row.changed_fields.includes(field)) pieces.push(label);
    summary = pieces.join(' · ') || '영역별 작업 정보가 변경되었습니다.';
  } else if (row.kind === 'task_automation.development_requested') {
    summary = row.provisional_authorized === true ? '고객 확인 사항을 남기고 임시 구현을 진행하도록 승인했습니다.' : '작업 실행 요청을 저장했습니다.';
  } else if (row.kind === 'task_automation.review_ready') {
    summary = row.evidence_status === 'unverified' ? '개발 결과가 저장되었습니다. 코드 실행 근거를 확인해야 합니다.' : '변경 내역과 결과를 확인할 수 있습니다. 병합은 별도 승인이 필요합니다.';
  } else if (row.kind.startsWith('task_automation.execution_') && OPERATION_NAMES[row.operation]) summary = OPERATION_NAMES[row.operation] + ' 실행 기록';
  return {id: 'event:' + row.id, kind: row.kind, title: EVENT_TITLES[row.kind], at: row.created_at,
    ...(EVENT_STATUSES[row.kind] ? {status: EVENT_STATUSES[row.kind]} : {}), ...(summary ? {summary} : {}), ...safeMetadata(row)};
}
function jobItems(row) {
  const name = OPERATION_NAMES[row.kind];
  if (!name || !JOB_STATES[row.status]) return [];
  const registered = {id:'job:'+row.id+':registered',kind:'job.registered',title:name+' 실행 등록',at:row.created_at,
    summary:'실행 요청이 작업 대기열에 등록되었습니다.'};
  if (row.status === 'queued' && new Date(row.updated_at).getTime() === new Date(row.created_at).getTime()) return [{...registered,status:'queued'}];
  // updated_at is the persisted row's observation time, not a reliable execution
  // start/finish timestamp. Never invent step logs or duration from this row.
  return [registered, {id:'job:'+row.id+':state',kind:'job.state',title:name+' 실행 상태',at:row.updated_at,status:row.status,
    summary:JOB_STATES[row.status]+' · 현재 저장된 상태이며 정확한 시작·종료 시각은 아닙니다.',...safeMetadata(row)}];
}
function boundedItems(items, limit = LIMIT) {
  const sorted = items.filter(Boolean).sort((a,b) => new Date(b.at)-new Date(a.at) || b.id.localeCompare(a.id));
  return {items: sorted.slice(0,limit).reverse(),has_more:sorted.length>limit,limit,order:'asc'};
}
function createTaskActivity({pool}) {
  return {
    async get(p,u,tid) {
      tid=taskId(tid); await membership(pool,p,u);
      const task=(await pool.query('SELECT id,analysis_id,created_at,execution_trace_id FROM automation_tasks WHERE project_id=$1 AND id=$2',[p,tid])).rows[0];
      if(!task)fail('TASK_NOT_FOUND','이 프로젝트의 자동화 작업을 찾을 수 없습니다.',404);
      // Only select explicitly permitted fields. Free-form event bodies, job
      // payloads, prompts, tokens, raw results and runner details are not read.
      const events=(await pool.query(`SELECT id,kind,created_at,
        CASE WHEN detail->>'error_code' ~ '^(TASK|NORA)_[A-Z0-9_]{1,80}$' THEN detail->>'error_code' END AS error_code,
        CASE WHEN detail->>'trace_id' ~ '^trc_[A-Za-z0-9_-]{1,200}$' THEN detail->>'trace_id' END AS trace_id,
        CASE WHEN detail->>'kind' IN ('risk','develop','merge','reconcile_merge') THEN detail->>'kind' END AS operation,
        detail->'provisional_authorized'='true'::jsonb AS provisional_authorized,
        CASE WHEN detail->>'evidence_status' IN ('verified','unverified') THEN detail->>'evidence_status' END AS evidence_status,
        CASE WHEN detail->>'area' IN ('screen','server','database') THEN detail->>'area' END AS area,
        CASE WHEN detail#>>'{before,status}' IN ('todo','in_progress','blocked','review','done','not_applicable') THEN detail#>>'{before,status}' END AS before_status,
        CASE WHEN detail#>>'{after,status}' IN ('todo','in_progress','blocked','review','done','not_applicable') THEN detail#>>'{after,status}' END AS after_status,
        to_jsonb(ARRAY(SELECT field FROM unnest(ARRAY['status','assignee_ids','description','reference']) field WHERE detail->'changed_fields' ? field)) AS changed_fields
        FROM events WHERE project_id=$1 AND ((entity_id=$2 AND kind=ANY($4::text[])) OR (entity_id=$3 AND kind=ANY($5::text[])))
        ORDER BY created_at DESC,id DESC LIMIT $6`,[p,tid,task.analysis_id,TASK_EVENTS,ANALYSIS_EVENTS,LIMIT+1])).rows;
      const jobs=(await pool.query(`SELECT id,kind,status,created_at,updated_at,error_code,trace_id FROM task_automation_jobs
        WHERE project_id=$1 AND ((task_id=$2 AND kind IN ('develop','merge','reconcile_merge')) OR (analysis_id=$3 AND kind='risk'))
        ORDER BY greatest(created_at,updated_at) DESC,id DESC LIMIT $4`,[p,tid,task.analysis_id,LIMIT+1])).rows;
      const notes=(await pool.query(`SELECT id,kind,origin,created_at,trace_id FROM project_implementation_notes
        WHERE project_id=$1 AND automation_task_id=$2 ORDER BY created_at DESC,id DESC LIMIT $3`,[p,tid,LIMIT+1])).rows;
      const items=[{id:'task:'+task.id+':created',kind:'task.created',title:'AI 작업 생성',at:task.created_at},
        ...events.map(row=>eventItem(['task_automation.review_ready','task_automation.development_blocked'].includes(row.kind)
          ? {...row,trace_id:row.trace_id||task.execution_trace_id} : row)),...jobs.flatMap(jobItems),...notes.map(row=>({id:'note:'+row.id+':created',kind:'implementation_note.created',
          title:row.kind==='work_gap'?'작업 공백 이력 저장':'임시 구현 이력 저장',at:row.created_at,
          summary:row.origin==='nora'?'Nora 실행에서 연결된 이력이 저장되었습니다.':'프로젝트 담당자가 이력을 기록했습니다.',...safeMetadata(row)}))];
      return boundedItems(items);
    },
  };
}
module.exports={createTaskActivity,eventItem,jobItems,boundedItems,LIMIT};
