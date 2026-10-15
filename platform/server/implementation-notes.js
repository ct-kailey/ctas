'use strict';
const { transaction } = require('./db');
const { hash } = require('./context-contract');
const { membership } = require('./context-ledger');

const WRITERS = ['owner', 'reviewer', 'member'], REVIEWERS = ['owner', 'reviewer'];
const KINDS = ['temporary_decision', 'work_gap'];
const STATUSES = ['open', 'feedback_received', 'followup_created', 'accepted', 'resolved'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(code, message, status = 400) { throw Object.assign(new Error(message), { code, status }); }
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('IMPLEMENTATION_NOTE_INPUT_INVALID', '기록의 입력 항목을 확인하세요.');
}
function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail('IMPLEMENTATION_NOTE_ID_INVALID', '올바른 요청·문서·기록 ID가 필요합니다.');
  return value.toLowerCase();
}
function text(value, max, exact = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0') || !value.isWellFormed()) fail('IMPLEMENTATION_NOTE_INPUT_INVALID', '기록 텍스트의 형식과 길이를 확인하세요.');
  return exact ? value : value.trim();
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('IMPLEMENTATION_NOTE_VERSION_REQUIRED', '확인한 기록 버전이 필요합니다.');
  return value;
}
function evidenceList(value, result = false) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) fail('IMPLEMENTATION_NOTE_EVIDENCE_REQUIRED', '정확한 원문 인용을 1~20개 연결하세요.');
  const entries = value.map(e => {
    object(e, result ? ['type', 'id', 'segment_id', 'quote'] : ['segment_id', 'quote']);
    if (result && e.type !== 'revision') fail('IMPLEMENTATION_NOTE_EVIDENCE_INVALID', '검토 결과의 문서 근거를 선택하세요.');
    return { ...(result ? { type: 'revision', id: id(e.id) } : {}), segment_id: text(e.segment_id, 200, true), quote: text(e.quote, 10000, true) };
  });
  if (new Set(entries.map(hash)).size !== entries.length) fail('IMPLEMENTATION_NOTE_EVIDENCE_INVALID', '같은 원문 인용을 중복하지 마세요.');
  return entries;
}
function parseNote(value) {
  object(value, ['request_id', 'kind', 'title', 'uncertainty', 'temporary_approach', 'rationale', 'impact', 'replacement_condition', 'source_revision_id', 'evidence', 'automation_task_id', 'task_draft_id', 'analysis_id']);
  if (!KINDS.includes(value.kind)) fail('IMPLEMENTATION_NOTE_KIND_INVALID', '임시 판단 또는 작업 공백을 선택하세요.');
  const input = { request_id: id(value.request_id), kind: value.kind, title: text(value.title, 300), uncertainty: text(value.uncertainty, 5000),
    temporary_approach: value.kind === 'temporary_decision' ? text(value.temporary_approach, 10000) : value.temporary_approach == null || value.temporary_approach === '' ? null : text(value.temporary_approach, 10000),
    rationale: text(value.rationale, 5000), impact: text(value.impact, 5000), replacement_condition: text(value.replacement_condition, 5000),
    source_revision_id: id(value.source_revision_id), evidence: evidenceList(value.evidence),
    automation_task_id: value.automation_task_id == null ? null : id(value.automation_task_id), task_draft_id: value.task_draft_id == null ? null : id(value.task_draft_id), analysis_id: value.analysis_id == null ? null : id(value.analysis_id) };
  if (Buffer.byteLength(JSON.stringify(input)) > 250000) fail('IMPLEMENTATION_NOTE_INPUT_TOO_LARGE', '원문 인용을 줄여 기록을 나누어 주세요.', 413);
  return input;
}
async function authorize(db, p, u, roles = WRITERS) {
  const role = (await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE', [p, id(u)])).rows[0]?.role;
  if (!roles.includes(role)) fail('FORBIDDEN', '이 프로젝트에서 기록을 변경할 권한이 없습니다.', 403);
}
async function requestLock(db, requestId) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-implementation-note-request:'||$1,0))", [requestId]);
}
async function getNote(db, p, noteId, lock = false) {
  const row = (await db.query('SELECT * FROM project_implementation_notes WHERE project_id=$1 AND id=$2' + (lock ? ' FOR UPDATE' : ''), [p, id(noteId)])).rows[0];
  if (!row) fail('IMPLEMENTATION_NOTE_NOT_FOUND', '이 프로젝트의 기록을 찾을 수 없습니다.', 404);
  return row;
}
function publicNote(row) {
  const { request_sha256, ...note } = row;
  return { ...note, source_refs: [{ type: 'revision', id: row.source_revision_id, document_id: row.source_document_id, sha256: row.source_sha256, title: row.source_title }] };
}
async function replay(db, p, u, requestId, fingerprint) {
  const old = (await db.query('SELECT * FROM project_implementation_note_history WHERE id=$1', [requestId])).rows[0];
  if (!old) return null;
  if (old.project_id !== p || old.actor_id !== u || old.request_sha256 !== fingerprint) fail('IMPLEMENTATION_NOTE_REQUEST_CONFLICT', '다른 내용에 사용된 요청 ID입니다.', 409);
  return { note: publicNote(await getNote(db, p, old.note_id)), replayed: true };
}
async function source(db, p, revisionId) {
  const row = (await db.query(`SELECT r.*,d.title,d.document_category FROM revisions r JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id
    WHERE r.project_id=$1 AND r.id=$2 FOR SHARE OF r,d`, [p, revisionId])).rows[0];
  if (!row) fail('IMPLEMENTATION_NOTE_SOURCE_NOT_FOUND', '이 프로젝트의 원문 문서를 선택하세요.', 404);
  return row;
}
function validateEvidence(revision, entries, policy = true) {
  const doc = revision.document_json;
  if (policy && revision.document_category !== 'policy') fail('IMPLEMENTATION_NOTE_POLICY_REQUIRED', '정책 문서를 근거로 선택하세요.', 409);
  if (revision.status !== 'ready' || doc?.project_id !== revision.project_id || doc?.revision_id !== revision.id || doc?.document_id !== revision.document_id || doc?.source?.sha256 !== revision.sha256 || doc?.extraction?.complete !== true || !Array.isArray(doc.segments) || !doc.segments.length) fail('IMPLEMENTATION_NOTE_SOURCE_NOT_READY', '원문 추출과 문서 연결을 먼저 확인하세요.', 409);
  const segments = new Map();
  for (const s of doc.segments) {
    if (!s || typeof s.segment_id !== 'string' || segments.has(s.segment_id) || typeof s.text !== 'string') fail('IMPLEMENTATION_NOTE_SOURCE_NOT_READY', '원문 구간을 확인할 수 없습니다.', 409);
    segments.set(s.segment_id, s);
  }
  return entries.map(e => {
    const s = segments.get(e.segment_id);
    if (!s || s.extraction_status !== 'ok' || !s.text.includes(e.quote)) fail('IMPLEMENTATION_NOTE_EVIDENCE_INVALID', '추출이 확인된 원문 구간의 정확한 인용이 필요합니다.', 409);
    return { ...e, locator: s.locator ?? null };
  });
}
async function linkedRecords(db, p, input, revisionId) {
  let analysisId = input.analysis_id;
  if (input.automation_task_id) {
    const row = (await db.query('SELECT analysis_id,input_snapshot FROM automation_tasks WHERE project_id=$1 AND id=$2 FOR SHARE', [p, input.automation_task_id])).rows[0];
    if (!row || row.input_snapshot?.source?.revision_id !== revisionId || analysisId && row.analysis_id !== analysisId) fail('IMPLEMENTATION_NOTE_LINK_INVALID', '같은 프로젝트와 원문 분석의 AI 작업을 연결하세요.', 409);
    analysisId = row.analysis_id;
  }
  if (input.task_draft_id) {
    const row = (await db.query('SELECT source_revision_id FROM project_task_drafts WHERE project_id=$1 AND id=$2 FOR SHARE', [p, input.task_draft_id])).rows[0];
    if (!row || row.source_revision_id !== revisionId) fail('IMPLEMENTATION_NOTE_LINK_INVALID', '같은 프로젝트와 원문의 작업 초안을 연결하세요.', 409);
  }
  if (analysisId) {
    const row = (await db.query('SELECT revision_id FROM task_automation_analyses WHERE project_id=$1 AND id=$2 FOR SHARE', [p, analysisId])).rows[0];
    if (!row || row.revision_id !== revisionId) fail('IMPLEMENTATION_NOTE_LINK_INVALID', '같은 프로젝트와 원문의 분석을 연결하세요.', 409);
  }
  return analysisId;
}
async function history(db, p, u, note, requestId, fingerprint, kind, detail) {
  await db.query(`INSERT INTO project_implementation_note_history(id,project_id,note_id,kind,version,request_sha256,detail,actor_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [requestId, p, note.id, kind, kind === 'created' ? 1 : note.version + 1, fingerprint, detail, u]);
  await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)',
    [p, u, 'implementation_note.' + kind, note.id, { request_id: requestId, note_kind: note.kind, title: note.title, version: kind === 'created' ? 1 : note.version + 1 }]);
  return { note: publicNote(await getNote(db, p, note.id)), replayed: false };
}
async function insertNote(db, { projectId: p, actorId: u, input, origin, traceId, executionContext = null }) {
  const fingerprint = hash({ input, origin, trace_id: traceId, ...(executionContext?{execution_context:executionContext}:{}) });
  const prior = await replay(db, p, u, input.request_id, fingerprint);
  if (prior) return prior;
  const revision = await source(db, p, input.source_revision_id), evidence = validateEvidence(revision, input.evidence);
  const analysisId = await linkedRecords(db, p, input, revision.id);
  const row = (await db.query(`INSERT INTO project_implementation_notes(id,project_id,kind,origin,trace_id,title,uncertainty,temporary_approach,rationale,impact,replacement_condition,evidence,
    source_revision_id,source_document_id,source_sha256,source_title,automation_task_id,task_draft_id,analysis_id,request_sha256,created_by,execution_context)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
  [input.request_id,p,input.kind,origin,traceId,input.title,input.uncertainty,input.temporary_approach,input.rationale,input.impact,input.replacement_condition,JSON.stringify(evidence),
    revision.id,revision.document_id,revision.sha256,revision.title,input.automation_task_id,input.task_draft_id,analysisId,fingerprint,u,executionContext])).rows[0];
  return history(db,p,u,row,input.request_id,fingerprint,'created',{ origin, trace_id: traceId, source_revision_id: revision.id, source_sha256: revision.sha256, ...(executionContext?{execution_context:executionContext}:{}) });
}

// These helpers join the caller's transaction; they never contact Nora or dispatch work.
async function appendNoraNotes(db, { projectId, actorId, sourceRevisionId, analysisId = null, notes, traceId, executionContexts = {} }) {
  if (typeof traceId !== 'string' || !/^trc_[A-Za-z0-9_-]{1,200}$/.test(traceId)) fail('IMPLEMENTATION_NOTE_TRACE_REQUIRED', '실제 Nora 실행 추적 ID가 필요합니다.');
  if (!Array.isArray(notes) || notes.length > 100) fail('IMPLEMENTATION_NOTE_INPUT_INVALID', '한 분석의 기록은 100개 이하여야 합니다.');
  const inputs = notes.map(note => parseNote({ ...note, source_revision_id: sourceRevisionId, analysis_id: note.analysis_id ?? analysisId }));
  if (new Set(inputs.map(n => n.request_id)).size !== inputs.length) fail('IMPLEMENTATION_NOTE_REQUEST_CONFLICT', '분석의 기록 요청 ID가 중복되었습니다.', 409);
  await authorize(db, projectId, actorId);
  // Global ordering avoids deadlocks when two workers retry the same note set.
  for (const requestId of inputs.map(n => n.request_id).sort()) await requestLock(db, requestId);
  const results = [];
  for (const input of inputs) results.push(await insertNote(db, { projectId, actorId, input, origin: 'nora', traceId, executionContext: executionContexts[input.request_id] || null }));
  return results.map(r => ({ ...r.note, replayed: r.replayed }));
}
function assertVersion(row, expectedVersion) {
  if (row.version !== version(expectedVersion)) fail('IMPLEMENTATION_NOTE_VERSION_CONFLICT', '기록이 변경되었습니다. 최신 기록과 피드백을 확인하세요.', 409);
}
async function getFollowupInput(db, { projectId, noteId, actorId, expectedVersion }) {
  await authorize(db, projectId, actorId);
  const row = await getNote(db, projectId, noteId, true);
  assertVersion(row, expectedVersion);
  if (row.status !== 'feedback_received') fail('IMPLEMENTATION_NOTE_FEEDBACK_REQUIRED', '새 피드백을 기록한 후 후속 분석을 요청하세요.', 409);
  const feedback = (await db.query("SELECT id,detail FROM project_implementation_note_history WHERE project_id=$1 AND note_id=$2 AND version=$3 AND kind='feedback'", [projectId,row.id,row.version])).rows[0];
  if (!feedback) fail('IMPLEMENTATION_NOTE_FEEDBACK_REQUIRED', '후속 분석의 피드백을 확인할 수 없습니다.', 409);
  const note = Object.fromEntries(['kind','title','uncertainty','temporary_approach','rationale','impact','replacement_condition','evidence'].map(key => [key,row[key]]));
  let originalTask = null;
  if (row.automation_task_id) {
    const task = (await db.query('SELECT id,title,description,acceptance_criteria,evidence,artifact FROM automation_tasks WHERE project_id=$1 AND id=$2 FOR SHARE',[projectId,row.automation_task_id])).rows[0];
    const artifact=task.artifact;
    const code=artifact?.kind==='git_commit'&&artifact.evidence_status==='verified'
      ? Object.fromEntries(['kind','head_sha','base_sha','target_branch','preview_url'].map(k=>[k,artifact[k]]))
      : Number.isSafeInteger(artifact?.pr_number)&&artifact.pr_number>0
        ? Object.fromEntries(['pr_url','pr_number','head_sha','base_sha','target_branch','preview_url'].map(k=>[k,artifact[k]])) : null;
    originalTask = { ...task,kind:'automation_task',artifact:code };
  } else if (row.task_draft_id) {
    const task = (await db.query('SELECT id,title,description,acceptance_criteria,evidence FROM project_task_drafts WHERE project_id=$1 AND id=$2 FOR SHARE',[projectId,row.task_draft_id])).rows[0];
    originalTask = { ...task,kind:'task_draft',artifact:null };
  }
  return { sourceRevisionId: row.source_revision_id, automationTaskId: row.automation_task_id, taskDraftId: row.task_draft_id, analysisId: row.analysis_id,
    feedback: { note_id: row.id, note_version: row.version, feedback_id: feedback.id, feedback_text: feedback.detail.text, feedback_sha256: hash(feedback.detail.text), note,original_task:originalTask } };
}
async function recordFollowup(db, { projectId: p, noteId, requestId, actorId: u, expectedVersion, analysisId, taskId = null, taskDraftId = null }) {
  const input = { note_id: id(noteId), request_id: id(requestId), expected_version: version(expectedVersion), analysis_id: id(analysisId), automation_task_id: taskId == null ? null : id(taskId), task_draft_id: taskDraftId == null ? null : id(taskDraftId) };
  const fingerprint = hash({ kind: 'followup_created', input });
  await authorize(db, p, u); await requestLock(db, input.request_id);
  const prior = await replay(db,p,u,input.request_id,fingerprint); if (prior) return prior;
  const frozen = await getFollowupInput(db,{projectId:p,noteId:input.note_id,actorId:u,expectedVersion});
  await linkedRecords(db,p,input,frozen.sourceRevisionId);
  const analysis = (await db.query('SELECT input_snapshot FROM task_automation_analyses WHERE project_id=$1 AND id=$2', [p,input.analysis_id])).rows[0];
  if (!analysis?.input_snapshot?.feedback || hash(analysis.input_snapshot.feedback) !== hash(frozen.feedback)) fail('IMPLEMENTATION_NOTE_FOLLOWUP_MISMATCH', '이 기록의 최신 피드백을 고정한 후속 분석만 연결할 수 있습니다.', 409);
  const row = await getNote(db,p,input.note_id);
  return history(db,p,u,row,input.request_id,fingerprint,'followup_created',{ analysis_id: input.analysis_id, automation_task_id: input.automation_task_id, task_draft_id: input.task_draft_id, feedback_id: frozen.feedback.feedback_id, feedback_sha256: frozen.feedback.feedback_sha256 });
}
function page(query, key = 'offset') {
  const limit = query.limit === undefined ? 50 : Number(query.limit), offset = query[key] === undefined ? 0 : Number(query[key]);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) fail('IMPLEMENTATION_NOTE_PAGE_INVALID', '기록 조회 범위를 확인하세요.');
  return { limit, offset };
}
function createImplementationNotes({ pool }) {
  return {
    async list(p,u,query={}) {
      await membership(pool,p,u);
      const { limit, offset } = page(query), values = [p], clauses = ['project_id=$1'];
      if (query.related_task_id !== undefined && query.related_task_id !== '') {
        const related = (await pool.query('SELECT id,analysis_id FROM automation_tasks WHERE project_id=$1 AND id=$2',[p,id(query.related_task_id)])).rows[0];
        if (!related) fail('IMPLEMENTATION_NOTE_LINK_INVALID','이 프로젝트의 AI 작업을 선택하세요.',404);
        values.push(related.id,related.analysis_id);
        clauses.push(`(automation_task_id=$${values.length-1} OR (analysis_id=$${values.length} AND automation_task_id IS NULL))`);
      }
      for (const key of ['status','kind','automation_task_id','task_draft_id','analysis_id','source_revision_id']) {
        if (query[key] === undefined || query[key] === '') continue;
        let value = query[key];
        if (key === 'status' || key === 'kind') { if (!(key === 'status' ? STATUSES : KINDS).includes(value)) fail('IMPLEMENTATION_NOTE_FILTER_INVALID', '기록 조회 조건을 확인하세요.'); }
        else value = id(value);
        values.push(value); clauses.push(key + '=$' + values.length);
      }
      const where = clauses.join(' AND ');
      const result = (await pool.query(`WITH matched AS (SELECT * FROM project_implementation_notes WHERE ${where})
        SELECT (SELECT count(*)::int FROM matched) total,COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM
        (SELECT * FROM matched ORDER BY created_at DESC,id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}) page),'[]'::jsonb) notes`, [...values,limit,offset])).rows[0];
      const more = offset + result.notes.length < result.total;
      return { notes: result.notes.map(publicNote), total: result.total, limit, offset, has_more: more, next_offset: more ? offset + result.notes.length : null };
    },
    async get(p,u,noteId,query={}) {
      await membership(pool,p,u);
      const row = await getNote(pool,p,noteId), { limit, offset } = page(query,'history_offset');
      const entries = (await pool.query(`SELECT id,kind,actor_id,version,detail,created_at FROM project_implementation_note_history
        WHERE project_id=$1 AND note_id=$2 AND version<=$3 ORDER BY version DESC LIMIT $4 OFFSET $5`,[p,row.id,row.version,limit,offset])).rows;
      return { note: publicNote(row), history: entries, history_total: row.version, history_offset: offset, history_has_more: offset + entries.length < row.version };
    },
    async create(p,u,value) {
      const input = parseNote(value);
      return transaction(pool,async db => {
        await authorize(db,p,u); await requestLock(db,input.request_id);
        return insertNote(db,{ projectId:p,actorId:u,input,origin:'manual',traceId:null });
      });
    },
    async feedback(p,u,noteId,value) {
      object(value,['request_id','expected_version','text']);
      const input = { note_id: id(noteId), request_id: id(value.request_id), expected_version: version(value.expected_version), text: text(value.text,10000) };
      const fingerprint = hash({kind:'feedback',input});
      return transaction(pool,async db => {
        await authorize(db,p,u); await requestLock(db,input.request_id);
        const prior = await replay(db,p,u,input.request_id,fingerprint); if (prior) return prior;
        const row = await getNote(db,p,input.note_id,true); assertVersion(row,input.expected_version);
        return history(db,p,u,row,input.request_id,fingerprint,'feedback',{text:input.text});
      });
    },
    async review(p,u,noteId,value) {
      object(value,['request_id','expected_version','status','note','result_evidence']);
      if (!['accepted','resolved'].includes(value.status)) fail('IMPLEMENTATION_NOTE_REVIEW_INVALID', '임시 판단 수용 또는 작업 공백 해소를 선택하세요.');
      const input = { note_id:id(noteId),request_id:id(value.request_id),expected_version:version(value.expected_version),status:value.status,note:text(value.note,10000),result_evidence:evidenceList(value.result_evidence,true) };
      const fingerprint = hash({kind:'review',input});
      return transaction(pool,async db => {
        await authorize(db,p,u,REVIEWERS); await requestLock(db,input.request_id);
        const prior = await replay(db,p,u,input.request_id,fingerprint); if (prior) return prior;
        const row = await getNote(db,p,input.note_id,true); assertVersion(row,input.expected_version);
        if (row.kind !== (input.status === 'accepted' ? 'temporary_decision' : 'work_gap') || ['accepted','resolved'].includes(row.status)) fail('IMPLEMENTATION_NOTE_REVIEW_INVALID', '기록 유형과 현재 상태에 맞는 검토를 선택하세요.',409);
        const sources = new Map();
        for (const revisionId of [...new Set(input.result_evidence.map(e=>e.id))].sort()) sources.set(revisionId,await source(db,p,revisionId));
        const evidence = input.result_evidence.map(e => {
          const revision=sources.get(e.id), checked=validateEvidence(revision,[e],false)[0];
          return {...checked,sha256:revision.sha256,document_id:revision.document_id,title:revision.title};
        });
        return history(db,p,u,row,input.request_id,fingerprint,input.status,{note:input.note,result_evidence:evidence});
      });
    },
  };
}
module.exports = { createImplementationNotes, appendNoraNotes, getFollowupInput, recordFollowup, parseNote, validateEvidence, publicNote, WRITERS, REVIEWERS };
