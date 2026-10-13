'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { prepareReview, finalizeReview } = require('../../nora/flow/review-core');
const dbUrl = process.env.TEST_DATABASE_URL;
const suite = dbUrl ? test : test.skip;
let admin, pool, ledger, owner, member, viewer, reviewer, schema;
before(async () => {
  if (!dbUrl) return;
  schema = 'ledger_' + randomUUID().replaceAll('-', '');
  admin = createPool(dbUrl);
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: dbUrl, options: `-c search_path=${schema}` });
  await migrate(pool);
  ledger = createLedger(pool);
  const users = (await pool.query("INSERT INTO users(email,name,password_hash) VALUES ('owner@example.test','Owner','unused'),('member@example.test','Member','unused'),('viewer@example.test','Viewer','unused'),('reviewer@example.test','Reviewer','unused') RETURNING id,email")).rows;
  owner = users.find(user => user.email.startsWith('owner')).id;
  member = users.find(user => user.email.startsWith('member')).id;
  viewer = users.find(user => user.email.startsWith('viewer')).id;
  reviewer = users.find(user => user.email.startsWith('reviewer')).id;
});
after(async () => {
  if (!dbUrl) return;
  if (pool) await pool.end();
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});
async function project() {
  const p = await ledger.createProject(owner, { name: '테스트 프로젝트' });
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'viewer'),($1,$4,'reviewer')", [p.id, member, viewer, reviewer]);
  return p;
}
async function readyUpload(p, text, documentId) {
  const upload = await ledger.upload(p.id, member, { filename: '요구사항.txt', title: '처리 기준', document_id: documentId, content: Buffer.from(text) });
  const rev = await ledger.getRevision(p.id, upload.revision_id);
  const doc = { schema_version: '1.0', project_id: p.id, document_id: upload.document_id, revision_id: upload.revision_id, source: { filename: rev.filename, mime_type: rev.mime_type, sha256: rev.sha256 }, segments: [{ segment_id: 's1', requirement_key: 'REQ-001', text, locator: { kind: 'text', label: '1행' }, extraction_status: 'ok' }], extraction: { complete: true, warnings: [] }, normalization: { status: 'ready', warnings: [], segment_count: 1 } };
  await pool.query("UPDATE revisions SET status='ready',document_json=$1 WHERE id=$2", [JSON.stringify(doc), upload.revision_id]);
  await pool.query("UPDATE jobs SET status='succeeded' WHERE id=$1", [upload.job_id]);
  return upload;
}
async function pair(p, value = '처리 건수가 50건 이상이면 추가 승인을 요청한다.') {
  const baseline = await readyUpload(p, '처리 건수가 5건 이상이면 추가 승인을 요청한다.');
  await ledger.publishInitial(p.id, baseline.revision_id, reviewer, { reason: '원문 확인', acknowledge_extraction: true });
  const current = await readyUpload(p, value, baseline.document_id);
  return { baseline, current };
}
async function complete(p, reviewId, questions = false) {
  const review = await ledger.getReview(p.id, reviewId), prepared = prepareReview(review.request);
  const result = finalizeReview(review.request, { schema_version: '1.0', project_id: p.id, request_id: reviewId, status: 'needs_review', changes: prepared.candidates.map(c => ({ change_id: c.change_id, requirement_key: c.requirement_key, change_type: c.change_type, risk: c.risk, before: c.before, after: c.after, reason: '원문 변경 확인', summary: '처리 기준 변경', impacts: [] })), questions: questions ? [{ question_id: 'q1', question: '변경 기준을 확정했나요?', related_change_ids: prepared.candidates.map(c => c.change_id), options: [], requires_customer_decision: true }] : [], warnings: [], approval: { status: 'not_requested', baseline_publication_allowed: false } });
  await pool.query('UPDATE reviews SET status=$1,result=$2 WHERE id=$3', [result.status, JSON.stringify(result), reviewId]);
  await pool.query("UPDATE jobs SET status='succeeded' WHERE review_id=$1", [reviewId]);
  return result;
}
const approve = { decision: 'approved', reason: '고객 합의 확인', evidence: '회의록 2026-09-26 / 안건 1', acknowledge_extraction: true };
function code(expected) { return error => error.code === expected; }

suite('upload enforces membership and scope; listing excludes private original bytes', async () => {
  const p = await project(), other = await project();
  await assert.rejects(ledger.upload(p.id, viewer, { filename: 'spec.txt', content: Buffer.from('text') }), code('FORBIDDEN'));
  const created = await readyUpload(p, '요구사항');
  await assert.rejects(ledger.getRevision(other.id, created.revision_id), code('NOT_FOUND'));
  await assert.rejects(ledger.upload(other.id, member, { filename: 'spec.txt', document_id: created.document_id, content: Buffer.from('new') }), code('NOT_FOUND'));
  assert.equal(Object.hasOwn(await ledger.getRevision(p.id, created.revision_id), 'content'), false);
  assert.equal((await ledger.getRevision(p.id, created.revision_id, { includeContent: true })).content.toString(), '요구사항');
  const listed = await ledger.listDocuments(p.id);
  assert.equal(listed.length, 1); assert.equal(Object.hasOwn(listed[0].revisions[0], 'content'), false);
  await assert.rejects(pool.query('UPDATE revisions SET project_id=$1 WHERE id=$2', [other.id, created.revision_id]), code('23514'));
});
suite('upload rejects empty, unsupported, traversing and malformed filenames', async () => {
  const p = await project();
  for (const [filename, content, expected] of [['ok.txt', Buffer.alloc(0), 'INVALID_FILE_SIZE'], ['a.exe', Buffer.from('x'), 'UNSUPPORTED_FILE_TYPE'], ['../a.txt', Buffer.from('x'), 'INVALID_FILENAME'], ['a\n.txt', Buffer.from('x'), 'INVALID_FILENAME']]) await assert.rejects(ledger.upload(p.id, owner, { filename, content }), code(expected));
});
suite('initial baseline is explicit, role guarded, immutable and idempotent', async () => {
  const p = await project(), uploaded = await readyUpload(p, '초기');
  await assert.rejects(ledger.publishInitial(p.id, uploaded.revision_id, owner, { reason: '확인' }), code('EXTRACTION_ACK_REQUIRED'));
  await assert.rejects(ledger.publishInitial(p.id, uploaded.revision_id, member, { reason: '확인', acknowledge_extraction: true }), code('FORBIDDEN'));
  const body = { reason: '확인', acknowledge_extraction: true };
  const first = await ledger.publishInitial(p.id, uploaded.revision_id, reviewer, body), again = await ledger.publishInitial(p.id, uploaded.revision_id, reviewer, body);
  assert.deepEqual(again, first);
  const second = await readyUpload(p, '다음', uploaded.document_id);
  await assert.rejects(ledger.publishInitial(p.id, second.revision_id, reviewer, body), code('BASELINE_EXISTS'));
  assert.equal((await ledger.feed(p.id)).filter(e => e.kind === 'baseline.initial_published').length, 1);
});
suite('ready snapshots and cross-project baseline references cannot be rewritten in SQL', async () => {
  const p = await project(), other = await project(), a = await readyUpload(p, '가'), b = await readyUpload(other, '나');
  await assert.rejects(pool.query("UPDATE revisions SET document_json='{}'::jsonb WHERE id=$1", [a.revision_id]), code('23514'));
  await assert.rejects(pool.query('UPDATE documents SET baseline_revision_id=$1 WHERE id=$2', [b.revision_id, a.document_id]), code('23503'));
});
suite('concurrent review creation deduplicates the immutable baseline/current pair', async () => {
  const p = await project(), { baseline, current } = await pair(p);
  const results = await Promise.all(Array.from({ length: 6 }, () => ledger.createReview(p.id, member, { revision_id: current.revision_id })));
  assert.equal(new Set(results.map(row => row.review_id)).size, 1);
  assert.equal(new Set(results.map(row => row.job_id)).size, 1);
  const result = await ledger.getReview(p.id, results[0].review_id);
  assert.equal(result.request.baseline.revision_id, baseline.revision_id);
  assert.equal(result.request.current.revision_id, current.revision_id);
  await assert.rejects(pool.query("UPDATE reviews SET request='{}'::jsonb WHERE id=$1", [result.id]), code('23514'));
  await assert.rejects(ledger.createReview(p.id, owner, { revision_id: baseline.revision_id }), code('SAME_REVISION'));
});
suite('approval requires actual result, answer evidence and extraction acknowledgment; publication is separate', async () => {
  const p = await project(), { current } = await pair(p), created = await ledger.createReview(p.id, member, { revision_id: current.revision_id });
  await assert.rejects(ledger.decideReview(p.id, created.review_id, owner, approve), code('REVIEW_NOT_READY'));
  await complete(p, created.review_id, true);
  await assert.rejects(ledger.decideReview(p.id, created.review_id, owner, approve), code('UNANSWERED_QUESTIONS'));
  await assert.rejects(ledger.answerReview(p.id, created.review_id, member, { question_id: 'q1', answer: '확정', evidence: ' ' }), code('INVALID_INPUT'));
  await assert.rejects(ledger.answerReview(p.id, created.review_id, member, { question_id: 'q2', answer: '확정', evidence: '회의록' }), code('UNKNOWN_QUESTION'));
  await ledger.answerReview(p.id, created.review_id, member, { question_id: 'q1', answer: '확정', evidence: '고객 회의록 #1' });
  await assert.rejects(ledger.decideReview(p.id, created.review_id, member, approve), code('FORBIDDEN'));
  await assert.rejects(ledger.decideReview(p.id, created.review_id, owner, { ...approve, acknowledge_extraction: false }), code('EXTRACTION_ACK_REQUIRED'));
  const approved = await ledger.decideReview(p.id, created.review_id, reviewer, approve);
  assert.equal(approved.status, 'approved'); assert.equal(approved.decision.answers[0].evidence, '고객 회의록 #1');
  await assert.rejects(pool.query("UPDATE answers SET evidence='tampered' WHERE review_id=$1", [created.review_id]), code('23514'));
  await assert.rejects(pool.query('DELETE FROM reviews WHERE id=$1', [created.review_id]), code('23514'));
  assert.notEqual((await ledger.listDocuments(p.id))[0].baseline_revision_id, current.revision_id);
  await assert.rejects(ledger.answerReview(p.id, created.review_id, owner, { question_id: 'q1', answer: '변경', evidence: '근거' }), code('REVIEW_NOT_READY'));
  await assert.rejects(ledger.decideReview(p.id, created.review_id, owner, { ...approve, decision: 'rejected' }), code('DECISION_IMMUTABLE'));
  const results = await Promise.all([ledger.publishReview(p.id, created.review_id, reviewer, { reason: '발행' }), ledger.publishReview(p.id, created.review_id, reviewer, { reason: '발행' })]);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await ledger.getReview(p.id, created.review_id)).status, 'published');
  assert.equal((await ledger.listDocuments(p.id))[0].baseline_revision_id, current.revision_id);
  assert.equal((await ledger.feed(p.id)).filter(e => e.kind === 'baseline.published').length, 1);
});
suite('parallel approved reviews cannot publish over a newer baseline', async () => {
  const p = await project(), { baseline, current } = await pair(p), extra = await readyUpload(p, '처리 건수가 100건 이상이면 추가 승인을 요청한다.', baseline.document_id);
  const a = await ledger.createReview(p.id, owner, { revision_id: current.revision_id }), b = await ledger.createReview(p.id, owner, { revision_id: extra.revision_id });
  await complete(p, a.review_id); await complete(p, b.review_id);
  await ledger.decideReview(p.id, a.review_id, owner, approve); await ledger.decideReview(p.id, b.review_id, owner, approve);
  const result = await Promise.allSettled([ledger.publishReview(p.id, a.review_id, owner, { reason: 'A' }), ledger.publishReview(p.id, b.review_id, owner, { reason: 'B' })]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(result.find(r => r.status === 'rejected').reason.code, 'STALE_BASELINE');
  const losingCurrent = result[0].status === 'rejected' ? current : extra;
  const fresh = await ledger.createReview(p.id, owner, { revision_id: losingCurrent.revision_id });
  assert.notEqual(fresh.review_id, result[0].status === 'rejected' ? a.review_id : b.review_id);
});
suite('stale pending approval is blocked and rejected reviews never publish', async () => {
  const p = await project(), { baseline, current } = await pair(p), extra = await readyUpload(p, '처리 건수가 100건 이상이면 추가 승인을 요청한다.', baseline.document_id);
  const a = await ledger.createReview(p.id, owner, { revision_id: current.revision_id }), b = await ledger.createReview(p.id, owner, { revision_id: extra.revision_id });
  await complete(p, a.review_id); await complete(p, b.review_id, true);
  await ledger.decideReview(p.id, a.review_id, owner, approve); await ledger.publishReview(p.id, a.review_id, owner, { reason: '발행' });
  await assert.rejects(ledger.decideReview(p.id, b.review_id, owner, approve), code('STALE_BASELINE'));
  const rejected = await ledger.decideReview(p.id, b.review_id, owner, { decision: 'rejected', reason: '기준선이 바뀜', evidence: '최근 발행' });
  assert.equal(rejected.status, 'rejected');
  await assert.rejects(ledger.publishReview(p.id, b.review_id, owner, { reason: '발행' }), code('APPROVAL_REQUIRED'));
});
suite('uncertain jobs require actual owner and explicit duplicate-risk acknowledgment', async () => {
  const p = await project(), created = await ledger.upload(p.id, member, { filename: 'spec.txt', content: Buffer.from('요구사항') });
  await pool.query("UPDATE jobs SET status='uncertain',stage='pipeline_intent',attempt=1,lease_token=$1,error_code='PIPELINE_TRANSPORT_UNKNOWN' WHERE id=$2", [randomUUID(), created.job_id]);
  await pool.query("UPDATE revisions SET status='uncertain' WHERE id=$1", [created.revision_id]);
  await assert.rejects(ledger.retryJob(p.id, created.job_id, member, { reason: '확인', acknowledge_duplicate_risk: true }, 'owner'), code('UNCERTAIN_RETRY_REQUIRES_OWNER'));
  await assert.rejects(ledger.retryJob(p.id, created.job_id, owner, { reason: '확인' }, 'owner'), code('UNCERTAIN_RETRY_REQUIRES_OWNER'));
  const job = await ledger.retryJob(p.id, created.job_id, owner, { reason: 'Nora 실행 내역 확인 후 재시도', acknowledge_duplicate_risk: true }, 'owner');
  assert.equal(job.status, 'queued'); assert.equal(job.attempt, 1); assert.equal(Object.hasOwn(job, 'lease_token'), false);
  assert.equal((await pool.query('SELECT lease_token FROM jobs WHERE id=$1', [created.job_id])).rows[0].lease_token, null);
  await assert.rejects(ledger.retryJob(p.id, created.job_id, owner, { reason: '재시도' }, 'owner'), code('JOB_NOT_RETRYABLE'));
});
suite('no_change still requires explicit approval and original confirmation', async () => {
  const p = await project(), { current } = await pair(p, '처리 건수가 5건 이상이면 추가 승인을 요청한다.'), created = await ledger.createReview(p.id, member, { revision_id: current.revision_id });
  await complete(p, created.review_id);
  assert.equal((await ledger.getReview(p.id, created.review_id)).status, 'no_change');
  await assert.rejects(ledger.publishReview(p.id, created.review_id, owner, { reason: '발행' }), code('APPROVAL_REQUIRED'));
  await ledger.decideReview(p.id, created.review_id, owner, approve);
  assert.equal((await ledger.publishReview(p.id, created.review_id, owner, { reason: '파일 기준선 갱신' })).revision_id, current.revision_id);
});
suite('audit events cannot be rewritten or deleted and overview never includes blob bytes', async () => {
  const p = await project(); await readyUpload(p, '감사 로그');
  const event = (await ledger.feed(p.id))[0];
  await assert.rejects(pool.query("UPDATE events SET detail='{}' WHERE id=$1", [event.id]), code('23514'));
  await assert.rejects(pool.query('DELETE FROM events WHERE id=$1', [event.id]), code('23514'));
  const overview = await ledger.overview(p.id);
  assert.equal(overview.counts.documents, 1); assert.equal(JSON.stringify(overview).includes('"content"'), false);
});

suite('malformed JSON bodies fail as controlled client errors', async () => {
  await assert.rejects(ledger.createProject(owner, null), code('INVALID_INPUT'));
  await assert.rejects(ledger.createReview('any', owner, []), code('INVALID_INPUT'));
  await assert.rejects(ledger.decideReview('any', randomUUID(), owner, null), code('INVALID_INPUT'));
});
suite('forged source evidence and incomplete execution cannot be approved', async () => {
  const p = await project(), { current } = await pair(p), created = await ledger.createReview(p.id, member, { revision_id: current.revision_id });
  const result = await complete(p, created.review_id);
  await pool.query("UPDATE jobs SET status='running' WHERE id=$1", [created.job_id]);
  await assert.rejects(ledger.decideReview(p.id, created.review_id, owner, approve), code('REVIEW_NOT_READY'));
  await pool.query("UPDATE jobs SET status='succeeded' WHERE id=$1", [created.job_id]);
  result.changes[0].after.text = '모델이 만든 잘못된 원문';
  await pool.query('UPDATE reviews SET result=$1 WHERE id=$2', [JSON.stringify(result), created.review_id]);
  await assert.rejects(ledger.decideReview(p.id, created.review_id, owner, approve), code('INVALID_REVIEW_RESULT'));
});
