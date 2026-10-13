'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { history, editorText, MAX_TEXT_BYTES } = require('../server/record-contract');
const dbUrl = process.env.TEST_DATABASE_URL;
const suite = dbUrl ? test : test.skip;
const code = expected => error => error.code === expected;
let admin, pool, ledger, owner, member, viewer, reviewer, schema;

before(async () => {
  if (!dbUrl) return;
  schema = 'records_' + randomUUID().replaceAll('-', '');
  admin = createPool(dbUrl); await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: dbUrl, options: `-c search_path=${schema}` });
  await migrate(pool); ledger = createLedger(pool);
  const users = (await pool.query("INSERT INTO users(email,name,password_hash) VALUES ('owner@records.test','Owner','unused'),('member@records.test','Member','unused'),('viewer@records.test','Viewer','unused'),('reviewer@records.test','Reviewer','unused') RETURNING id,email")).rows;
  [owner, member, viewer, reviewer] = ['owner', 'member', 'viewer', 'reviewer'].map(prefix => users.find(u => u.email.startsWith(prefix + '@')).id);
});
after(async () => {
  if (!dbUrl) return;
  if (pool) await pool.end();
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});
async function project() {
  const p = await ledger.createProject(owner, { name: '도메인 기록 검증', domain_pack: { id: 'legacy-sism', version: '1.3', glossary: [] } });
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'viewer'),($1,$4,'reviewer')", [p.id, member, viewer, reviewer]);
  return p;
}
async function markReady(p, upload, text) {
  const r = await ledger.getRevision(p.id, upload.revision_id);
  const document = { schema_version: '1.0', project_id: p.id, document_id: upload.document_id, revision_id: upload.revision_id, source: { filename: r.filename, mime_type: r.mime_type, sha256: r.sha256 }, segments: [{ segment_id: 's1', requirement_key: 'REQ-001', text, locator: { kind: 'text', label: '1행' }, extraction_status: 'ok' }], extraction: { complete: true, warnings: [] }, normalization: { status: 'ready', warnings: [], segment_count: 1 } };
  await pool.query("UPDATE revisions SET status='ready',document_json=$1 WHERE id=$2", [JSON.stringify(document), r.id]);
  await pool.query("UPDATE jobs SET status='succeeded' WHERE id=$1", [upload.job_id]);
}
const richHistory = { source_type: 'slack', occurred_on: '2024-02-29', decided_on: '2026-09-27', source_created_at: '2026-09-27T09:30:00+09:00', channel: '#settlement', url: 'https://workspace.slack.com/archives/C001/p123', external_id: 'C001:123', participants: ['Kailey Kim', '개발 담당자'], tags: ['합의', '정산'] };

test('history validates calendar dates, timezone, allowlist, URL and bounded arrays', () => {
  assert.deepEqual(history(richHistory), richHistory);
  assert.equal(history({ occurred_on: '2000-02-29' }).occurred_on, '2000-02-29');
  for (const value of [{ occurred_on: '2026-02-29' }, { decided_on: '1900-02-29' }, { decided_on: '2026-04-31' }, { occurred_on: '0000-01-01' }, { created_at: '2026-09-27' }, { source_type: 'automatic_slack' }, { source_created_at: '2026-09-27T09:30:00' }, { source_created_at: '2026-02-30T09:30:00Z' }, { source_created_at: '2026-09-27T09:30:00+14:30' }, { source_created_at: '2026-09-27T24:30:00Z' }, { url: 'javascript:alert(1)' }, { url: 'https://user:password@example.test/' }, { participants: [''] }, { tags: Array(31).fill('tag') }, null, []]) {
    assert.throws(() => history(value), code('INVALID_HISTORY'));
  }
  assert.throws(() => history('{broken}', { allowJson: true }), code('INVALID_HISTORY'));
  assert.throws(() => history('{}'), code('INVALID_HISTORY'));
});
test('editor accepts exact UTF-8 bytes, counts bytes and rejects malformed text', () => {
  const original = '\uFEFF  # 결정\r\n\r\n오전 9시  \n';
  assert.equal(editorText(original).toString('utf8'), original);
  assert.equal(editorText('x'.repeat(MAX_TEXT_BYTES)).length, MAX_TEXT_BYTES);
  for (const invalid of [' ', '\0', '\ud800', '가'.repeat(Math.ceil(MAX_TEXT_BYTES / 3)), 'x'.repeat(MAX_TEXT_BYTES + 1)]) assert.throws(() => editorText(invalid), code('INVALID_RECORD_TEXT'));
});
suite('domain creation inherits project default pack, checks roles and scopes revisions', async () => {
  const p = await project(), q = await project();
  const defaults = await ledger.listDomains(p.id);
  assert.equal(defaults.length, 1); assert.equal(defaults[0].is_default, true); assert.equal(defaults[0].domain_pack.id, 'legacy-sism');
  await assert.rejects(ledger.createDomain(p.id, member, { name: '정산' }), code('FORBIDDEN'));
  await assert.rejects(ledger.createDomain(p.id, viewer, { name: '정산' }), code('FORBIDDEN'));
  const area = await ledger.createDomain(p.id, reviewer, { name: '정산', description: '결제 정산 정책', domain_pack: { id: 'settlement', version: '2.0', glossary: [] } });
  await assert.rejects(ledger.createDomain(p.id, owner, { name: '정산' }), code('DOMAIN_NAME_EXISTS'));
  await assert.rejects(ledger.createRecord(q.id, owner, { title: '잘못된 업무 영역', text: '기록', domain_id: area.id }), code('DOMAIN_NOT_FOUND'));
  const record = await ledger.createRecord(p.id, member, { title: '정산 결정', text: '정산일 합의', domain_id: area.id, record_kind: 'decision', history: richHistory });
  const r = await ledger.getRevision(p.id, record.revision_id, { includeContent: true });
  assert.equal(r.domain_id, area.id); assert.equal(r.domain_name, '정산'); assert.equal(r.record_kind, 'decision');
  assert.deepEqual(r.history, richHistory); assert.equal(r.content.toString(), '정산일 합의');
  assert.equal((await ledger.listDocuments(p.id))[0].baseline_revision_id, null, 'historical decided_on must not publish a baseline');
  await assert.rejects(ledger.createRecord(p.id, viewer, { title: '차단', text: '뷰어 기록' }), code('FORBIDDEN'));
  await assert.rejects(pool.query('INSERT INTO documents(project_id,title,domain_id) VALUES($1,$2,$3)', [q.id, '다른 프로젝트 영역', area.id]), code('23503'));
  assert.equal((await ledger.overview(p.id)).domains.length, 2);
});
suite('editor updates append versions and immutable metadata while preserving original bytes', async () => {
  const p = await project();
  const original = '\uFEFF  # 결정\r\n담당자: Kailey\r\n\r\n정산을 매주 시행한다.  \n';
  const created = await ledger.createRecord(p.id, member, { title: '주간 정산', text: original, record_kind: 'conversation', history: richHistory });
  const r = await ledger.getRevision(p.id, created.revision_id);
  assert.equal(r.source_text, original); assert.equal(r.content, undefined); assert.equal(r.filename, 'record.md');
  assert.equal(r.sha256, createHash('sha256').update(original).digest('hex'));
  const next = await ledger.createRecord(p.id, member, { document_id: created.document_id, title: '주간 정산', text: original + '최종 확인\n', history: { ...richHistory, decided_on: '2026-09-28' } });
  assert.equal(next.document_id, created.document_id); assert.notEqual(next.revision_id, created.revision_id);
  assert.equal((await ledger.getRevision(p.id, created.revision_id)).source_text, original);
  assert.equal((await ledger.getRevision(p.id, next.revision_id)).record_kind, 'conversation');
  const listed = await ledger.listDocuments(p.id); assert.equal(listed[0].revisions.length, 2); assert.deepEqual(listed[0].revisions.find(v => v.id === created.revision_id).history, richHistory);
  await assert.rejects(pool.query("UPDATE revisions SET history=history||'{\"decided_on\":\"2026-09-30\"}'::jsonb WHERE id=$1", [created.revision_id]), code('23514'));
  await assert.rejects(pool.query('UPDATE revisions SET created_at=now() WHERE id=$1', [created.revision_id]), code('23514'));
  await assert.rejects(pool.query("UPDATE documents SET record_kind='note' WHERE id=$1", [created.document_id]), code('23514'));
  const different = await ledger.createDomain(p.id, owner, { name: '회원' });
  await assert.rejects(ledger.createRecord(p.id, member, { title: '주간 정산', text: '수정', document_id: created.document_id, domain_id: different.id }), code('DOCUMENT_DOMAIN_CONFLICT'));
  await assert.rejects(ledger.createRecord(p.id, member, { title: '주간 정산', text: '수정', document_id: created.document_id, record_kind: 'note' }), code('DOCUMENT_KIND_CONFLICT'));
  await assert.rejects(pool.query('UPDATE documents SET domain_id=$1 WHERE id=$2', [different.id, created.document_id]), code('23514'));
  const before = (await pool.query('SELECT count(*)::int n FROM revisions WHERE project_id=$1', [p.id])).rows[0].n;
  await assert.rejects(ledger.createRecord(p.id, member, { title: '잘못된 기록', text: '기록', history: { decided_on: '2026-02-30' } }), code('INVALID_HISTORY'));
  assert.equal((await pool.query('SELECT count(*)::int n FROM revisions WHERE project_id=$1', [p.id])).rows[0].n, before);
});
suite('file uploads accept history JSON and review snapshots use the owning business domain', async () => {
  const p = await project(), pack = { id: 'settlement', version: '2.1', glossary: [{ term: '정산', definition: '매출 확정' }] };
  const area = await ledger.createDomain(p.id, owner, { name: '정산', domain_pack: pack });
  const a = await ledger.upload(p.id, member, { filename: '정산.txt', title: '정산 정책', content: Buffer.from('5건 이상 승인'), domain_id: area.id, history: JSON.stringify({ source_type: 'azure_devops', external_id: 'WI-51' }) });
  await markReady(p, a, '5건 이상 승인');
  await ledger.publishInitial(p.id, a.revision_id, reviewer, { reason: '확인', acknowledge_extraction: true });
  const b = await ledger.upload(p.id, member, { filename: '정산.txt', document_id: a.document_id, content: Buffer.from('10건 이상 승인') });
  await markReady(p, b, '10건 이상 승인');
  const review = await ledger.createReview(p.id, member, { revision_id: b.revision_id });
  assert.deepEqual((await ledger.getReview(p.id, review.review_id)).request.domain_pack, pack);
  await pool.query('UPDATE project_domains SET domain_pack=$1 WHERE id=$2', [JSON.stringify({ ...pack, version: '3.0' }), area.id]);
  assert.deepEqual((await ledger.getReview(p.id, review.review_id)).request.domain_pack, pack);
  assert.equal((await ledger.getRevision(p.id, a.revision_id)).history.external_id, 'WI-51');
  const big = await ledger.upload(p.id, owner, { filename: 'large.txt', content: Buffer.from('x'.repeat(MAX_TEXT_BYTES + 1)) });
  assert.equal((await ledger.getRevision(p.id, big.revision_id)).source_text, null);
});
suite('upgrade backfills domains and history without rewriting existing evidence', async () => {
  const legacySchema = 'legacyrecords_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${legacySchema}`);
  const legacy = createPool({ connectionString: dbUrl, options: `-c search_path=${legacySchema}` });
  try {
    await legacy.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = path.resolve(__dirname, '../server/migrations');
    for (const name of (await fs.readdir(dir)).filter(n => /^00[1-4]_.*\.sql$/.test(n)).sort()) {
      await legacy.query(await fs.readFile(path.join(dir, name), 'utf8'));
      await legacy.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
    const user = (await legacy.query("INSERT INTO users(email,name,password_hash) VALUES('legacy@test.example','Legacy','unused') RETURNING id")).rows[0];
    await legacy.query("INSERT INTO projects(id,name,domain_pack) VALUES('legacy','기존 프로젝트','{\"id\":\"legacy\",\"version\":\"7\",\"glossary\":[]}'::jsonb)");
    const document = (await legacy.query("INSERT INTO documents(project_id,title) VALUES('legacy','기존 문서') RETURNING id")).rows[0];
    const source = Buffer.from('legacy evidence\r\n'), hash = createHash('sha256').update(source).digest('hex');
    const old = (await legacy.query("INSERT INTO revisions(project_id,document_id,filename,mime_type,sha256,content,created_by) VALUES('legacy',$1,'old.txt','text/plain',$2,$3,$4) RETURNING *", [document.id, hash, source, user.id])).rows[0];
    await migrate(legacy); await migrate(legacy);
    const current = (await legacy.query('SELECT * FROM revisions WHERE id=$1', [old.id])).rows[0];
    for (const key of Object.keys(old)) assert.deepEqual(current[key], old[key], key + ' was modified');
    assert.equal(current.history.source_type, 'file');
    const domains = (await legacy.query('SELECT * FROM project_domains')).rows;
    assert.equal(domains.length, 1); assert.equal(domains[0].domain_pack.version, '7');
    assert.equal((await legacy.query('SELECT domain_id FROM documents WHERE id=$1', [document.id])).rows[0].domain_id, domains[0].id);
    await legacy.query("INSERT INTO projects(id,name) VALUES('new-bootstrap','신규 부트스트랩')");
    const newDoc = (await legacy.query("INSERT INTO documents(project_id,title) VALUES('new-bootstrap','호환성') RETURNING domain_id")).rows[0];
    assert.ok(newDoc.domain_id);
  } finally { await legacy.end(); await admin.query(`DROP SCHEMA ${legacySchema} CASCADE`); }
});
suite('record and domain HTTP endpoints enforce origin, CSRF, roles and preserve multipart history', async t => {
  const { createApp } = require('../server/server');
  const { sha256 } = require('../server/auth');
  const p = await project(), origin = 'https://records.example.test';
  const server = createApp({ pool, appOrigin: origin, production: true }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/projects/${p.id}`;
  async function session(userId) {
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''), csrf = randomUUID();
    await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [sha256(token), userId, csrf]);
    return { Cookie: 'ains_session=' + token, Origin: origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
  }
  const ownerHeaders = await session(owner), memberHeaders = await session(member), viewerHeaders = await session(viewer);
  const body = JSON.stringify({ title: '채널 합의', text: ' \r\n<script>텍스트로 보존</script>\r\n', record_kind: 'conversation', history: richHistory });
  assert.equal((await fetch(base + '/records', { method: 'POST', headers: { ...ownerHeaders, Origin: 'https://other.example' }, body })).status, 403);
  assert.equal((await fetch(base + '/records', { method: 'POST', headers: { ...ownerHeaders, 'X-CSRF-Token': 'invalid' }, body })).status, 403);
  assert.equal((await fetch(base + '/records', { method: 'POST', headers: viewerHeaders, body })).status, 403);
  assert.equal((await fetch(base + '/domains', { method: 'POST', headers: memberHeaders, body: '{"name":"정산"}' })).status, 403);
  const createArea = await fetch(base + '/domains', { method: 'POST', headers: ownerHeaders, body: '{"name":"정산"}' });
  assert.equal(createArea.status, 201);
  const { domain } = await createArea.json();
  const domains = await (await fetch(base + '/domains', { headers: viewerHeaders })).json();
  assert.equal(domains.domains.length, 2);
  const response = await fetch(base + '/records', { method: 'POST', headers: memberHeaders, body });
  assert.equal(response.status, 202);
  const created = await response.json();
  const { revision } = await (await fetch(base + '/revisions/' + created.revision_id, { headers: viewerHeaders })).json();
  assert.deepEqual(revision.history, richHistory); assert.equal(revision.source_text, JSON.parse(body).text); assert.equal(revision.content, undefined);
  const original = await fetch(base + '/revisions/' + created.revision_id + '/original', { headers: viewerHeaders });
  assert.equal(await original.text(), JSON.parse(body).text); assert.match(original.headers.get('content-disposition'), /attachment/);
  const form = new FormData();
  form.set('title', '업무 항목'); form.set('file', new Blob(['DevOps 작업 #123']), 'work.txt'); form.set('domain_id', domain.id); form.set('record_kind', 'work_item'); form.set('history', JSON.stringify({ source_type: 'azure_devops', decided_on: '2026-09-25', channel: 'Project/Sprint 1', external_id: '123' }));
  const { 'Content-Type': ignored, ...multipartHeaders } = memberHeaders;
  const upload = await fetch(base + '/documents', { method: 'POST', headers: multipartHeaders, body: form });
  assert.equal(upload.status, 202);
  const ids = await upload.json();
  const uploaded = await (await fetch(base + '/revisions/' + ids.revision_id, { headers: viewerHeaders })).json();
  assert.equal(uploaded.revision.domain_id, domain.id); assert.equal(uploaded.revision.record_kind, 'work_item'); assert.equal(uploaded.revision.history.source_type, 'azure_devops'); assert.equal(uploaded.revision.history.decided_on, '2026-09-25');
  assert.equal((await fetch(base + '/records', { method: 'POST', headers: memberHeaders, body: JSON.stringify({ title: '불완전 날짜', text: '기록', history: { decided_on: '2026-02-30' } }) })).status, 400);
  const suggestion = await fetch(base + '/registration-suggestions', { method: 'POST', headers: viewerHeaders, body: '{"title":"제목"}' });
  assert.equal(suggestion.status, 403);
});
