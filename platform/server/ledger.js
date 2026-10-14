'use strict';
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { transaction } = require('./db');
const { history, recordKind, editorText, MAX_TEXT_BYTES } = require('./record-contract');
const { checkRequest } = require('../../nora/client/nora-client');
const { validateDocumentSchema, validateResultSchema } = require('../../nora/client/schema-validator');
const { validateDocument, finalizeReview } = require('../../nora/flow/review-core');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MIME = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt': 'text/plain', '.md': 'text/markdown' };
const WRITE_ROLES = ['owner', 'reviewer', 'member'];
const REVIEW_ROLES = ['owner', 'reviewer'];
const REVISION_FIELDS = 'id,project_id,document_id,filename,mime_type,sha256,status,document_json,error_code,created_by,created_at,history';
const JOB_FIELDS = "id,project_id,kind,revision_id,review_id,status,stage,error_code,attempt,created_at,updated_at,jsonb_strip_nulls(jsonb_build_object('run_id',stage_data->'run_id','trace_id',stage_data->'trace_id')) AS execution";

function problem(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
function fail(code, message, status) { throw problem(code, message, status); }
function id(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('INVALID_ID', '올바른 항목 ID가 필요합니다.'); return value; }
function text(value, label, max = 10000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || value.includes('\0')) fail('INVALID_INPUT', `${label}을(를) 1–${max}자로 입력하세요.`);
  return value.trim();
}
function bodyObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', 'JSON 객체 요청이 필요합니다.');
}
function jsonHash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function domain(value) {
  const pack = value === undefined ? { id: 'sism', version: '1.0', glossary: [] } : value;
  if (!pack || typeof pack !== 'object' || Array.isArray(pack) || Object.keys(pack).some(key => !['id', 'version', 'glossary'].includes(key)) || !Array.isArray(pack.glossary) || pack.glossary.some(item => !item || typeof item !== 'object' || Array.isArray(item)) || pack.glossary.length > 200 || Buffer.byteLength(JSON.stringify(pack)) > 50000) fail('INVALID_DOMAIN_PACK', '도메인 설정 형식이 올바르지 않습니다.');
  return { id: text(pack.id, '도메인 ID', 128), version: text(pack.version, '도메인 버전', 128), glossary: pack.glossary };
}
async function member(client, projectId, userId, allowed) {
  const row = (await client.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2', [projectId, id(userId)])).rows[0];
  if (!row || (allowed && !allowed.includes(row.role))) fail('FORBIDDEN', '이 작업을 수행할 프로젝트 권한이 없습니다.', 403);
  return row.role;
}
async function event(client, projectId, actor, kind, entity, detail = {}) {
  const result = await client.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5) RETURNING created_at', [projectId, actor, kind, entity, JSON.stringify(detail)]);
  return result.rows[0].created_at;
}
async function doc(client, projectId, documentId, lock = false) {
  const row = (await client.query(`SELECT * FROM documents WHERE project_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [projectId, id(documentId)])).rows[0];
  if (!row) fail('NOT_FOUND', '문서를 찾을 수 없습니다.', 404);
  return row;
}
async function revision(client, projectId, revisionId, includeContent = false) {
  const row = (await client.query(`SELECT ${REVISION_FIELDS}${includeContent ? ',content' : ''},CASE WHEN mime_type IN ('text/plain','text/markdown') AND octet_length(content)<=$3 THEN content END AS source_bytes FROM revisions WHERE project_id=$1 AND id=$2`, [projectId, id(revisionId), MAX_TEXT_BYTES])).rows[0];
  if (!row) fail('NOT_FOUND', '문서 버전을 찾을 수 없습니다.', 404);
  const document = (await client.query('SELECT d.title,d.domain_id,d.record_kind,p.name AS domain_name FROM documents d JOIN project_domains p ON p.id=d.domain_id AND p.project_id=d.project_id WHERE d.id=$1 AND d.project_id=$2', [row.document_id, projectId])).rows[0];
  Object.assign(row, document);
  if (row.source_bytes) {
    try { row.source_text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(row.source_bytes); } catch { row.source_text = null; }
  } else row.source_text = null;
  delete row.source_bytes;
  return row;
}
function ready(row) {
  if (row.status !== 'ready' || !row.document_json) fail('REVISION_NOT_READY', '문서 분석이 완료된 후 진행할 수 있습니다.', 409);
  try { validateDocumentSchema(row.document_json); validateDocument(row.document_json, row.project_id); }
  catch { fail('INVALID_DOCUMENT_SNAPSHOT', '문서 원장 검증에 실패했습니다.', 409); }
  const value = row.document_json;
  if (value.project_id !== row.project_id || value.document_id !== row.document_id || value.revision_id !== row.id || value.source.sha256 !== row.sha256 || value.source.filename !== row.filename || value.source.mime_type !== row.mime_type) fail('INVALID_DOCUMENT_SNAPSHOT', '문서 원본과 분석 결과가 일치하지 않습니다.', 409);
}
async function reviewRow(client, projectId, reviewId, lock = false) {
  const row = (await client.query(`SELECT * FROM reviews WHERE project_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [projectId, id(reviewId)])).rows[0];
  if (!row) fail('NOT_FOUND', '검토를 찾을 수 없습니다.', 404);
  return row;
}
async function reviewDetail(client, projectId, reviewId) {
  const row = await reviewRow(client, projectId, reviewId);
  row.answers = (await client.query('SELECT question_id,answer,evidence,actor_id,created_at FROM answers WHERE review_id=$1 ORDER BY question_id', [row.id])).rows;
  row.job = (await client.query(`SELECT ${JOB_FIELDS} FROM jobs WHERE project_id=$1 AND review_id=$2`, [projectId, row.id])).rows[0] || null;
  return row;
}
async function reviewWithDocumentLock(client, projectId, reviewId) {
  const initial = await reviewRow(client, projectId, reviewId);
  const document = await doc(client, projectId, initial.document_id, true);
  const review = await reviewRow(client, projectId, reviewId, true);
  return { document, review };
}
function verifyResult(row) {
  if (!['needs_review', 'no_change'].includes(row.status) || !row.result) fail('REVIEW_NOT_READY', '검토 결과가 준비된 후 결정할 수 있습니다.', 409);
  try {
    checkRequest(row.request, row.project_id);
    validateResultSchema(row.result);
    const checked = finalizeReview(row.request, structuredClone(row.result));
    if (checked.status !== row.status || !isDeepStrictEqual(checked, row.result)) fail('REVIEW_STATUS_MISMATCH', '검토 상태가 결과와 일치하지 않습니다.', 409);
  } catch (error) {
    if (error.status) throw error;
    fail('INVALID_REVIEW_RESULT', '검토 결과의 근거 검증에 실패했습니다.', 409);
  }
}
async function completedJob(client, projectId, reviewId) {
  const job = (await client.query('SELECT status FROM jobs WHERE project_id=$1 AND review_id=$2', [projectId, reviewId])).rows[0];
  if (!job || job.status !== 'succeeded') fail('REVIEW_NOT_READY', '검토 실행이 완료된 후 결정할 수 있습니다.', 409);
}
function ensureCurrentBaseline(document, review) {
  if (document.baseline_revision_id !== review.baseline_revision_id) fail('STALE_BASELINE', '기준선이 변경되었습니다. 최신 기준선으로 새 검토를 생성하세요.', 409);
}
function baselineResult(documentId, revisionId, time, reviewId) {
  return { document_id: documentId, revision_id: revisionId, ...(reviewId ? { review_id: reviewId } : {}), published_at: time };
}

function createLedger(pool) {
  const ledger = {
    async listProjects(userId) {
      return (await pool.query('SELECT p.*,m.role,s.project_kind FROM projects p JOIN memberships m ON m.project_id=p.id JOIN project_settings s ON s.project_id=p.id WHERE m.user_id=$1 ORDER BY p.created_at,p.id', [id(userId)])).rows;
    },
    async createProject(userId, body = {}) {
      bodyObject(body);
      const name = text(body.name, '프로젝트 이름', 200), pack = domain(body.domain_pack), projectKind = require('./implementation-source-review').projectKind(body.project_kind ?? 'unspecified');
      return transaction(pool, async client => {
        const project = (await client.query('INSERT INTO projects(name,domain_pack) VALUES($1,$2) RETURNING *', [name, JSON.stringify(pack)])).rows[0];
        if(projectKind!=='unspecified')await client.query('UPDATE project_settings SET project_kind=$1,version=version+1 WHERE project_id=$2',[projectKind,project.id]);
        await client.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')", [project.id, id(userId)]);
        await event(client, project.id, userId, 'project.created', project.id, { name, project_kind:projectKind });
        return { ...project, role: 'owner',project_kind:projectKind };
      });
    },
    async listDomains(projectId) {
      return (await pool.query('SELECT * FROM project_domains WHERE project_id=$1 ORDER BY is_default DESC,created_at,id', [projectId])).rows;
    },
    async createDomain(projectId, userId, body = {}) {
      bodyObject(body);
      const name = text(body.name, '업무 영역 이름', 200), pack = domain(body.domain_pack);
      const description = body.description === undefined || body.description === '' ? '' : text(body.description, '업무 영역 설명', 2000);
      return transaction(pool, async client => {
        await member(client, projectId, userId, REVIEW_ROLES);
        const result = await client.query('INSERT INTO project_domains(project_id,name,description,domain_pack) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,lower(name)) DO NOTHING RETURNING *', [projectId, name, description, JSON.stringify(pack)]);
        if (!result.rows[0]) fail('DOMAIN_NAME_EXISTS', '같은 이름의 업무 영역이 있습니다.', 409);
        const created = result.rows[0];
        await event(client, projectId, userId, 'domain.created', created.id, { name, description, domain_pack: pack });
        return created;
      });
    },
    async listDocuments(projectId) {
      return (await pool.query(`SELECT d.*,p.name AS domain_name, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'filename',r.filename,'status',r.status,'sha256',r.sha256,'created_at',r.created_at,'error_code',r.error_code,'history',r.history) ORDER BY r.created_at DESC,r.id) FROM revisions r WHERE r.project_id=d.project_id AND r.document_id=d.id),'[]'::jsonb) AS revisions FROM documents d JOIN project_domains p ON p.id=d.domain_id AND p.project_id=d.project_id WHERE d.project_id=$1 ORDER BY d.created_at DESC,d.id`, [projectId])).rows;
    },
    async overview(projectId) {
      const [documents, reviews, jobs, feed, counts, domains] = await Promise.all([
        ledger.listDocuments(projectId),
        pool.query('SELECT r.id,r.project_id,r.document_id,r.baseline_revision_id,r.current_revision_id,r.status,r.decision,r.created_by,r.created_at,d.title FROM reviews r JOIN documents d ON d.id=r.document_id WHERE r.project_id=$1 ORDER BY r.created_at DESC,r.id LIMIT 100', [projectId]).then(result => result.rows),
        pool.query(`SELECT ${JOB_FIELDS} FROM jobs WHERE project_id=$1 ORDER BY created_at DESC,id LIMIT 100`, [projectId]).then(result => result.rows),
        ledger.feed(projectId),
        pool.query(`SELECT (SELECT count(*)::int FROM documents WHERE project_id=$1) AS documents,(SELECT count(*)::int FROM reviews WHERE project_id=$1 AND status IN ('needs_review','no_change')) AS pending_reviews,(SELECT count(*)::int FROM jobs WHERE project_id=$1 AND status IN ('queued','running')) AS active_jobs,(SELECT count(*)::int FROM jobs WHERE project_id=$1 AND status IN ('failed','uncertain')) AS failed_jobs,(SELECT count(*)::int FROM documents WHERE project_id=$1 AND baseline_revision_id IS NOT NULL) AS baselines`, [projectId]).then(result => result.rows[0]),
        ledger.listDomains(projectId),
      ]);
      return { documents, reviews, jobs, feed, counts, domains };
    },
    async upload(projectId, userId, body = {}) {
      bodyObject(body);
      if (!Buffer.isBuffer(body.content) || !body.content.length || body.content.length > 20 * 1024 * 1024) fail('INVALID_FILE_SIZE', '1바이트 이상 20 MiB 이하의 파일을 선택하세요.');
      const filename = text(body.filename, '파일 이름', 255);
      if (filename.includes('/') || filename.includes('\\') || /[\x00-\x1f\x7f]/.test(filename)) fail('INVALID_FILENAME', '파일 이름에는 경로나 제어 문자를 사용할 수 없습니다.');
      const mimeType = MIME[path.extname(filename).toLowerCase()];
      if (!mimeType) fail('UNSUPPORTED_FILE_TYPE', 'PDF, DOCX, PPTX, XLSX, TXT, MD 파일을 지원합니다.', 415);
      const content = Buffer.from(body.content), sha = createHash('sha256').update(content).digest('hex');
      const metadata = history(body.history, { defaultSource: 'file', allowJson: true });
      const kind = recordKind(body.record_kind);
      const selectedDomainId = body.domain_id === undefined ? undefined : id(body.domain_id).toLowerCase();
      return transaction(pool, async client => {
        await member(client, projectId, userId, WRITE_ROLES);
        let document;
        if (body.document_id) {
          document = await doc(client, projectId, body.document_id, true);
          if (selectedDomainId !== undefined && selectedDomainId !== document.domain_id) fail('DOCUMENT_DOMAIN_CONFLICT', '새 버전은 기존 기록의 업무 영역에 등록해야 합니다.', 409);
          if (body.record_kind !== undefined && kind !== document.record_kind) fail('DOCUMENT_KIND_CONFLICT', '새 버전은 기존 기록과 같은 유형이어야 합니다.', 409);
        } else {
          const area = (await client.query(`SELECT id FROM project_domains WHERE project_id=$1 AND ${selectedDomainId ? 'id=$2' : 'is_default'}`, selectedDomainId ? [projectId, selectedDomainId] : [projectId])).rows[0];
          if (!area) fail('DOMAIN_NOT_FOUND', '프로젝트의 업무 영역을 찾을 수 없습니다.', 404);
          document = (await client.query('INSERT INTO documents(project_id,title,domain_id,record_kind) VALUES($1,$2,$3,$4) RETURNING *', [projectId, text(body.title || filename, '문서 제목', 300), area.id, kind])).rows[0];
        }
        const rev = (await client.query('INSERT INTO revisions(project_id,document_id,filename,mime_type,sha256,content,created_by,history) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [projectId, document.id, filename, mimeType, sha, content, userId, JSON.stringify(metadata)])).rows[0];
        const job = (await client.query("INSERT INTO jobs(project_id,kind,revision_id) VALUES($1,'intake',$2) RETURNING id", [projectId, rev.id])).rows[0];
        await event(client, projectId, userId, 'revision.uploaded', rev.id, { document_id: document.id, domain_id: document.domain_id, record_kind: document.record_kind, filename, sha256: sha, job_id: job.id, history: metadata });
        return { document_id: document.id, revision_id: rev.id, job_id: job.id };
      });
    },
    async createRecord(projectId, userId, body = {}) {
      bodyObject(body);
      const content = editorText(body.text);
      const metadata = history(body.history, { defaultSource: 'editor' });
      return ledger.upload(projectId, userId, { ...body, title: text(body.title, '기록 제목', 300), filename: 'record.md', content, history: metadata });
    },
    async getRevision(projectId, revisionId, { includeContent = false } = {}) { return revision(pool, projectId, revisionId, includeContent); },
    async publishInitial(projectId, revisionId, userId, body = {}) {
      bodyObject(body);
      const reason = text(body.reason, '기준선 발행 사유');
      if (body.acknowledge_extraction !== true) fail('EXTRACTION_ACK_REQUIRED', '원문과 추출 결과를 확인해야 기준선을 발행할 수 있습니다.');
      return transaction(pool, async client => {
        await member(client, projectId, userId, REVIEW_ROLES);
        const rev = await revision(client, projectId, revisionId), document = await doc(client, projectId, rev.document_id, true);
        ready(rev);
        if (document.baseline_revision_id) {
          if (document.baseline_revision_id !== rev.id) fail('BASELINE_EXISTS', '이미 기준선이 있습니다. 변경 검토를 진행하세요.', 409);
          const prior = (await client.query("SELECT created_at FROM events WHERE project_id=$1 AND kind='baseline.initial_published' AND entity_id=$2 ORDER BY created_at LIMIT 1", [projectId, rev.id])).rows[0];
          if (!prior) fail('BASELINE_EXISTS', '이미 변경 검토로 발행된 기준선입니다.', 409);
          return baselineResult(document.id, rev.id, prior.created_at);
        }
        await client.query('UPDATE documents SET baseline_revision_id=$1 WHERE id=$2 AND project_id=$3', [rev.id, document.id, projectId]);
        const time = await event(client, projectId, userId, 'baseline.initial_published', rev.id, { document_id: document.id, reason, acknowledge_extraction: true, sha256: rev.sha256 });
        return baselineResult(document.id, rev.id, time);
      });
    },
    async createReview(projectId, userId, body = {}) {
      bodyObject(body);
      return transaction(pool, async client => {
        await member(client, projectId, userId, WRITE_ROLES);
        const current = await revision(client, projectId, body.revision_id), document = await doc(client, projectId, current.document_id, true);
        ready(current);
        if (!document.baseline_revision_id) fail('BASELINE_REQUIRED', '먼저 최초 기준선을 발행하세요.', 409);
        if (document.baseline_revision_id === current.id) fail('SAME_REVISION', '현재 기준선과 다른 문서 버전을 선택하세요.', 409);
        const prior = (await client.query('SELECT r.id AS review_id,j.id AS job_id FROM reviews r JOIN jobs j ON j.review_id=r.id WHERE r.project_id=$1 AND r.document_id=$2 AND r.baseline_revision_id=$3 AND r.current_revision_id=$4', [projectId, document.id, document.baseline_revision_id, current.id])).rows[0];
        if (prior) return prior;
        const baseline = await revision(client, projectId, document.baseline_revision_id); ready(baseline);
        const project = (await client.query('SELECT domain_pack FROM project_domains WHERE project_id=$1 AND id=$2', [projectId, document.domain_id])).rows[0];
        const reviewId = randomUUID();
        const request = { schema_version: '1.0', request_id: reviewId, project_id: projectId, baseline: baseline.document_json, current: current.document_json, domain_pack: project.domain_pack, impact_map: [] };
        try { checkRequest(request, projectId); } catch { fail('INVALID_REVIEW_REQUEST', '검토 입력 검증에 실패했습니다.', 409); }
        await client.query('INSERT INTO reviews(id,project_id,document_id,baseline_revision_id,current_revision_id,request,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [reviewId, projectId, document.id, baseline.id, current.id, JSON.stringify(request), userId]);
        const job = (await client.query("INSERT INTO jobs(project_id,kind,review_id) VALUES($1,'review',$2) RETURNING id", [projectId, reviewId])).rows[0];
        await event(client, projectId, userId, 'review.requested', reviewId, { document_id: document.id, baseline_revision_id: baseline.id, current_revision_id: current.id, job_id: job.id });
        return { review_id: reviewId, job_id: job.id };
      });
    },
    async getReview(projectId, reviewId) { return reviewDetail(pool, projectId, reviewId); },
    async answerReview(projectId, reviewId, userId, body = {}) {
      bodyObject(body);
      const questionId = text(body.question_id, '질문 ID', 200), answer = text(body.answer, '답변'), evidence = text(body.evidence, '답변 근거');
      return transaction(pool, async client => {
        await member(client, projectId, userId, WRITE_ROLES);
        const review = await reviewRow(client, projectId, reviewId, true); verifyResult(review);
        if (!review.result.questions.some(question => question.question_id === questionId)) fail('UNKNOWN_QUESTION', '이 검토에 포함된 질문이 아닙니다.');
        const prior = (await client.query('SELECT answer,evidence FROM answers WHERE review_id=$1 AND question_id=$2', [reviewId, questionId])).rows[0];
        await client.query('INSERT INTO answers(review_id,question_id,answer,evidence,actor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(review_id,question_id) DO UPDATE SET answer=excluded.answer,evidence=excluded.evidence,actor_id=excluded.actor_id,created_at=now()', [reviewId, questionId, answer, evidence, userId]);
        await event(client, projectId, userId, 'review.question_answered', reviewId, { question_id: questionId, answer, evidence, previous: prior || null });
        return reviewDetail(client, projectId, reviewId);
      });
    },
    async decideReview(projectId, reviewId, userId, body = {}) {
      bodyObject(body);
      if (!['approved', 'rejected'].includes(body.decision)) fail('INVALID_DECISION', '승인 또는 반려를 선택하세요.');
      const reason = text(body.reason, '결정 사유'), evidence = text(body.evidence, '결정 근거');
      if (body.decision === 'approved' && body.acknowledge_extraction !== true) fail('EXTRACTION_ACK_REQUIRED', '원문과 추출 결과를 확인해야 승인할 수 있습니다.');
      return transaction(pool, async client => {
        await member(client, projectId, userId, REVIEW_ROLES);
        const { document, review } = await reviewWithDocumentLock(client, projectId, reviewId);
        if (review.decision) {
          if (review.decision.decision === body.decision && review.decision.reason === reason && review.decision.evidence === evidence) return reviewDetail(client, projectId, reviewId);
          fail('DECISION_IMMUTABLE', '이미 확정된 결정을 변경할 수 없습니다.', 409);
        }
        verifyResult(review);
        await completedJob(client, projectId, reviewId);
        if (body.decision === 'approved') ensureCurrentBaseline(document, review);
        const answers = (await client.query('SELECT question_id,answer,evidence,actor_id,created_at FROM answers WHERE review_id=$1 ORDER BY question_id', [reviewId])).rows;
        if (body.decision === 'approved' && review.result.questions.some(question => !answers.some(answer => answer.question_id === question.question_id && answer.answer.trim() && answer.evidence.trim()))) fail('UNANSWERED_QUESTIONS', '모든 질문에 답변과 근거를 기록해야 승인할 수 있습니다.', 409);
        const decision = { decision: body.decision, reason, evidence, acknowledge_extraction: body.acknowledge_extraction === true, actor_id: userId, decided_at: new Date().toISOString(), request_sha256: jsonHash(review.request), result_sha256: jsonHash(review.result), answers };
        await client.query('UPDATE reviews SET status=$1,decision=$2 WHERE id=$3', [body.decision, JSON.stringify(decision), reviewId]);
        await event(client, projectId, userId, `review.${body.decision}`, reviewId, decision);
        return reviewDetail(client, projectId, reviewId);
      });
    },
    async publishReview(projectId, reviewId, userId, body = {}) {
      bodyObject(body);
      const reason = text(body.reason, '발행 사유');
      return transaction(pool, async client => {
        await member(client, projectId, userId, REVIEW_ROLES);
        const { document, review } = await reviewWithDocumentLock(client, projectId, reviewId);
        if (review.status === 'published') {
          const prior = (await client.query("SELECT created_at FROM events WHERE project_id=$1 AND kind='baseline.published' AND entity_id=$2 ORDER BY created_at LIMIT 1", [projectId, reviewId])).rows[0];
          return baselineResult(document.id, review.current_revision_id, prior?.created_at || review.decision.decided_at, review.id);
        }
        if (review.status !== 'approved' || review.decision?.decision !== 'approved') fail('APPROVAL_REQUIRED', '담당자 승인 후 기준선을 발행할 수 있습니다.', 409);
        ensureCurrentBaseline(document, review);
        if (review.decision.request_sha256 !== jsonHash(review.request) || review.decision.result_sha256 !== jsonHash(review.result)) fail('DECISION_SNAPSHOT_MISMATCH', '승인된 검토와 현재 검토가 일치하지 않습니다.', 409);
        await client.query('UPDATE documents SET baseline_revision_id=$1 WHERE id=$2 AND project_id=$3', [review.current_revision_id, document.id, projectId]);
        await client.query("UPDATE reviews SET status='published' WHERE id=$1", [reviewId]);
        const time = await event(client, projectId, userId, 'baseline.published', reviewId, { document_id: document.id, previous_revision_id: review.baseline_revision_id, revision_id: review.current_revision_id, reason, decision: review.decision });
        return baselineResult(document.id, review.current_revision_id, time, review.id);
      });
    },
    async retryJob(projectId, jobId, userId, body = {}, role) {
      bodyObject(body);
      const reason = text(body.reason, '재시도 사유');
      return transaction(pool, async client => {
        const actualRole = await member(client, projectId, userId, WRITE_ROLES);
        const job = (await client.query('SELECT * FROM jobs WHERE project_id=$1 AND id=$2 FOR UPDATE', [projectId, id(jobId)])).rows[0];
        if (!job) fail('NOT_FOUND', '작업을 찾을 수 없습니다.', 404);
        if (!['failed', 'uncertain'].includes(job.status)) fail('JOB_NOT_RETRYABLE', '실패 또는 결과 미확인 작업만 재시도할 수 있습니다.', 409);
        if (job.status === 'uncertain' && (actualRole !== 'owner' || body.acknowledge_duplicate_risk !== true)) fail('UNCERTAIN_RETRY_REQUIRES_OWNER', '결과 미확인 작업은 소유자가 중복 실행 위험을 확인한 후 재시도할 수 있습니다.', 403);
        if (job.kind === 'intake') {
          const rev = await revision(client, projectId, job.revision_id);
          if (!['failed', 'uncertain'].includes(rev.status)) fail('JOB_RECORD_CONFLICT', '문서 상태가 재시도 작업과 일치하지 않습니다.', 409);
        } else {
          const review = await reviewRow(client, projectId, job.review_id, true);
          if (review.decision || !['failed', 'uncertain', 'blocked'].includes(review.status)) fail('JOB_RECORD_CONFLICT', '검토 상태가 재시도 작업과 일치하지 않습니다.', 409);
        }
        const stageData = { ...job.stage_data, retry_history: [...(Array.isArray(job.stage_data.retry_history) ? job.stage_data.retry_history : []), { attempt: job.attempt, status: job.status, stage: job.stage, error_code: job.error_code, execution: job.stage_data.external_call || null, actor_id: userId, reason, acknowledged: body.acknowledge_duplicate_risk === true, retried_at: new Date().toISOString() }] };
        await client.query("UPDATE jobs SET status='queued',stage='queued',stage_data=$1,error_code=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$2", [JSON.stringify(stageData), jobId]);
        if (job.kind === 'intake') await client.query("UPDATE revisions SET status='queued',error_code=NULL WHERE id=$1 AND project_id=$2", [job.revision_id, projectId]);
        else await client.query("UPDATE reviews SET status='queued',result=NULL WHERE id=$1 AND project_id=$2 AND decision IS NULL", [job.review_id, projectId]);
        await event(client, projectId, userId, 'job.retry_requested', jobId, { reason, previous_status: job.status, attempt: job.attempt, acknowledge_duplicate_risk: body.acknowledge_duplicate_risk === true });
        return (await client.query(`SELECT ${JOB_FIELDS} FROM jobs WHERE id=$1`, [jobId])).rows[0];
      });
    },
    async feed(projectId) {
      return (await pool.query('SELECT e.*,u.name AS actor_name FROM events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.project_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 100', [projectId])).rows;
    },
  };
  return ledger;
}
module.exports = { createLedger, problem };
