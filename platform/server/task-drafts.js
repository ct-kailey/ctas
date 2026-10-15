'use strict';
const { randomUUID } = require('node:crypto');
const { transaction } = require('./db');
const { hash } = require('./context-contract');
const { membership } = require('./context-ledger');

const WRITERS = ['owner', 'reviewer', 'member'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
function fail(code, message, status = 400) { throw Object.assign(new Error(message), { code, status }); }
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('TASK_DRAFT_INPUT_INVALID', '작업 초안의 입력 항목을 확인하세요.');
}
function id(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('TASK_DRAFT_ID_INVALID', '올바른 요청·문서·작업 ID가 필요합니다.'); return value.toLowerCase(); }
function text(value, max, { exact = false } = {}) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0') || !value.isWellFormed()) fail('TASK_DRAFT_INPUT_INVALID', '작업 초안의 텍스트 형식과 길이를 확인하세요.');
  return exact ? value : value.trim();
}
function key(value) { if (typeof value !== 'string' || !KEY.test(value)) fail('TASK_DRAFT_KEY_INVALID', '작업 키는 영문·숫자·밑줄·하이픈 1~80자로 입력하세요.'); return value; }
function list(value, max, fn, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail('TASK_DRAFT_INPUT_INVALID', '작업 초안의 항목 수를 확인하세요.');
  return value.map(fn);
}
function parseBatch(value) {
  object(value, ['request_id', 'revision_id', 'tasks']);
  const result = { request_id: id(value.request_id), revision_id: id(value.revision_id), tasks: list(value.tasks, 50, task => {
    object(task, ['key', 'title', 'description', 'acceptance_criteria', 'evidence', 'priority', 'depends_on', 'question_notes']);
    const priority = task.priority ?? 'normal';
    if (!['high', 'normal', 'low'].includes(priority)) fail('TASK_DRAFT_PRIORITY_INVALID', '작업 우선순위를 확인하세요.');
    const evidence = list(task.evidence, 20, entry => {
      object(entry, ['segment_id', 'quote']);
      return { segment_id: text(entry.segment_id, 200, { exact: true }), quote: text(entry.quote, 10000, { exact: true }) };
    }, 1);
    if (new Set(evidence.map(e => hash(e))).size !== evidence.length) fail('TASK_DRAFT_EVIDENCE_INVALID', '동일한 원문 인용이 중복되었습니다.');
    return { key: key(task.key), title: text(task.title, 300), description: text(task.description, 10000),
      acceptance_criteria: list(task.acceptance_criteria, 30, v => text(v, 2000), 1), evidence, priority,
      depends_on: list(task.depends_on ?? [], 49, key), question_notes: list(task.question_notes ?? [], 30, v => text(v, 2000)) };
  }, 1) };
  if (Buffer.byteLength(JSON.stringify(result)) > 500000) fail('TASK_DRAFT_INPUT_TOO_LARGE', '작업 초안을 여러 요청으로 나누어 주세요.', 413);
  const tasks = new Map(result.tasks.map(t => [t.key, t]));
  if (tasks.size !== result.tasks.length) fail('TASK_DRAFT_KEY_DUPLICATE', '배치 안의 작업 키가 중복되었습니다.');
  for (const task of result.tasks) if (new Set(task.depends_on).size !== task.depends_on.length || task.depends_on.some(k => k === task.key || !tasks.has(k))) fail('TASK_DRAFT_DEPENDENCY_INVALID', '의존 작업은 같은 배치의 다른 작업을 중복 없이 지정하세요.');
  const visiting = new Set(), visited = new Set();
  function visit(k) {
    if (visiting.has(k)) fail('TASK_DRAFT_DEPENDENCY_CYCLE', '작업 간 순환 의존을 제거하세요.');
    if (visited.has(k)) return;
    visiting.add(k); for (const dependency of tasks.get(k).depends_on) visit(dependency); visiting.delete(k); visited.add(k);
  }
  for (const k of tasks.keys()) visit(k);
  return result;
}
function sourceUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function sourceEvidence(revision, tasks) {
  const doc = revision.document_json;
  if (revision.document_category !== 'policy') fail('TASK_DRAFT_POLICY_REQUIRED', '정책 문서를 근거로 선택하세요.', 409);
  if (revision.status !== 'ready' || doc?.project_id !== revision.project_id || doc?.revision_id !== revision.id || doc?.document_id !== revision.document_id || doc?.source?.sha256 !== revision.sha256 || doc?.extraction?.complete !== true || !Array.isArray(doc.segments) || !doc.segments.length) fail('TASK_DRAFT_SOURCE_NOT_READY', '프로젝트 정책 문서의 추출 완료와 원문 연결을 먼저 확인하세요.', 409);
  const segments = new Map();
  for (const segment of doc.segments) {
    if (!segment || typeof segment.segment_id !== 'string' || segments.has(segment.segment_id) || typeof segment.text !== 'string') fail('TASK_DRAFT_SOURCE_NOT_READY', '원문 구간 식별자를 확인할 수 없습니다.', 409);
    segments.set(segment.segment_id, segment);
  }
  return tasks.map(task => task.evidence.map(evidence => {
    const segment = segments.get(evidence.segment_id);
    if (!segment || segment.extraction_status !== 'ok' || !segment.text.includes(evidence.quote)) fail('TASK_DRAFT_EVIDENCE_INVALID', '확인된 원문 구간과 정확히 일치하는 인용이 필요합니다.', 409);
    return { ...evidence, locator: segment.locator ?? null };
  }));
}
const DEPENDENCIES = `COALESCE((SELECT jsonb_agg(jsonb_build_object('id',parent.id,'key',parent.task_key,'title',parent.title) ORDER BY parent.position)
  FROM project_task_draft_dependencies edge JOIN project_task_drafts parent ON parent.id=edge.dependency_id AND parent.project_id=edge.project_id
  WHERE edge.task_id=d.id AND edge.project_id=d.project_id),'[]'::jsonb) AS dependencies`;
function publicDraft(row, detail = false) {
  const result = { id: row.id, project_id: row.project_id, batch_id: row.batch_id, key: row.task_key, origin: row.origin, status: row.status,
    execution_status: row.execution_status, execution_blocker: row.execution_blocker, title: row.title,
    description: detail ? row.description : row.description.slice(0, 400), description_truncated: !detail && row.description.length > 400,
    priority: row.priority, source_revision_id: row.source_revision_id, source_document_id: row.source_document_id,
    source_sha256: row.source_sha256, source_title: row.source_title, source_url: row.source_url,
    source_refs: [{ type: 'revision', id: row.source_revision_id, document_id: row.source_document_id, sha256: row.source_sha256, title: row.source_title, url: row.source_url }],
    depends_on: row.dependencies.map(v => v.key), dependencies: row.dependencies,
    created_by: row.created_by, created_at: row.created_at };
  if (detail) Object.assign(result, { acceptance_criteria: row.acceptance_criteria, evidence: row.evidence, question_notes: row.question_notes });
  return result;
}
async function batchItems(db, p, batchId) {
  return (await db.query(`SELECT d.*,${DEPENDENCIES} FROM project_task_drafts d WHERE d.project_id=$1 AND d.batch_id=$2 ORDER BY d.position`, [p, batchId])).rows.map(r => publicDraft(r, true));
}
function createTaskDrafts({ pool }) {
  return {
    async list(p, u, query = {}) {
      await membership(pool, p, u);
      const limit = query.limit === undefined ? 100 : Number(query.limit), offset = query.offset === undefined ? 0 : Number(query.offset);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) fail('TASK_DRAFT_PAGE_INVALID', '작업 초안 조회 범위를 확인하세요.');
      const [rows, count] = await Promise.all([
        pool.query(`SELECT d.*,${DEPENDENCIES} FROM project_task_drafts d WHERE d.project_id=$1 ORDER BY d.created_at DESC,d.batch_id,d.position LIMIT $2 OFFSET $3`, [p, limit, offset]),
        pool.query('SELECT count(*)::int total FROM project_task_drafts WHERE project_id=$1', [p]),
      ]);
      const total = count.rows[0].total;
      return { items: rows.rows.map(r => publicDraft(r)), total, limit, offset, has_more: offset + rows.rows.length < total };
    },
    async get(p, u, draftId) {
      await membership(pool, p, u);
      const row = (await pool.query(`SELECT d.*,${DEPENDENCIES} FROM project_task_drafts d WHERE d.project_id=$1 AND d.id=$2`, [p, id(draftId)])).rows[0];
      if (!row) fail('TASK_DRAFT_NOT_FOUND', '이 프로젝트의 작업 초안을 찾을 수 없습니다.', 404);
      const history = (await pool.query("SELECT id,kind,actor_id,detail,created_at FROM events WHERE project_id=$1 AND entity_id=$2 AND kind='task_draft.created' ORDER BY created_at,id LIMIT 20", [p, row.id])).rows;
      return { ...publicDraft(row, true), history };
    },
    async create(p, u, value) {
      const input = parseBatch(value), fingerprint = hash(input);
      return transaction(pool, async db => {
        // Retain the role lock through insertion, including replay authorization.
        const role = (await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE', [p, id(u)])).rows[0]?.role;
        if (!WRITERS.includes(role)) fail('FORBIDDEN', '작업 초안을 등록할 프로젝트 권한이 없습니다.', 403);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-task-draft-request:' || $1,0))", [input.request_id]);
        const prior = (await db.query('SELECT * FROM project_task_draft_batches WHERE id=$1', [input.request_id])).rows[0];
        if (prior) {
          if (prior.project_id !== p || prior.created_by !== u || prior.request_sha256 !== fingerprint) fail('TASK_DRAFT_REQUEST_CONFLICT', '다른 작업 초안에 사용된 요청 ID입니다.', 409);
          return { items: await batchItems(db, p, input.request_id), replayed: true };
        }
        const revision = (await db.query(`SELECT r.*,d.title,d.document_category FROM revisions r JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id
          WHERE r.project_id=$1 AND r.id=$2 FOR SHARE OF r,d`, [p, input.revision_id])).rows[0];
        if (!revision) fail('TASK_DRAFT_SOURCE_NOT_FOUND', '이 프로젝트의 정책 문서를 선택하세요.', 404);
        const evidence = sourceEvidence(revision, input.tasks), url = sourceUrl(revision.history?.url);
        await db.query('INSERT INTO project_task_draft_batches(id,project_id,source_revision_id,request_sha256,request_payload,created_by) VALUES($1,$2,$3,$4,$5,$6)', [input.request_id, p, revision.id, fingerprint, input, u]);
        const ids = new Map(input.tasks.map(t => [t.key, randomUUID()]));
        for (const [position, task] of input.tasks.entries()) {
          const draftId = ids.get(task.key);
          await db.query(`INSERT INTO project_task_drafts(id,project_id,batch_id,task_key,position,source_revision_id,source_document_id,source_sha256,source_title,source_url,title,description,acceptance_criteria,evidence,priority,question_notes,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [draftId,p,input.request_id,task.key,position,revision.id,revision.document_id,revision.sha256,revision.title,url,task.title,task.description,JSON.stringify(task.acceptance_criteria),JSON.stringify(evidence[position]),task.priority,JSON.stringify(task.question_notes),u]);
          await db.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,'task_draft.created',$3,$4)", [p,u,draftId,{ batch_id: input.request_id, key: task.key, title: task.title, origin: 'manual', source_revision_id: revision.id, source_sha256: revision.sha256, execution_blocker: 'NORA_ANALYSIS_REQUIRED' }]);
        }
        for (const task of input.tasks) for (const dependency of task.depends_on) await db.query('INSERT INTO project_task_draft_dependencies(project_id,batch_id,task_id,dependency_id) VALUES($1,$2,$3,$4)', [p,input.request_id,ids.get(task.key),ids.get(dependency)]);
        return { items: await batchItems(db, p, input.request_id), replayed: false };
      });
    },
  };
}
module.exports = { createTaskDrafts, parseBatch, sourceEvidence, publicDraft, WRITERS };
