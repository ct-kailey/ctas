'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate, transaction } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { createContextLedger } = require('../server/context-ledger');
const { validateGuide } = require('../../nora/domain-guide/contract');

const databaseUrl = process.env.TEST_DATABASE_URL;

// These integration tests create and remove only a uniquely named local schema.
// Do not permit an inherited production DATABASE_URL to become a test target.
function assertLocalDatabase(url) {
  const host = new URL(url).hostname;
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'Domain guide tests require a local PostgreSQL server');
}

function generatedGuide(snapshot) {
  const source = snapshot.sources.find(row => row.authority === 'confirmed') || snapshot.sources[0];
  return validateGuide({
    schema_version: '1.0', project_id: snapshot.project_id,
    title: snapshot.project.name + ' 도메인 가이드',
    summary: source.body, summary_evidence_ids: [source.id],
    sections: [{ id: 'overview', title: '업무 이해', body: source.body,
      status: source.authority, evidence_ids: [source.id] }],
    glossary: [], workflows: [], changes: [], questions: [],
  }, snapshot);
}

async function fixture(t) {
  assertLocalDatabase(databaseUrl);
  const schema = 'domain_guide_' + randomUUID().replaceAll('-', '');
  const admin = createPool(databaseUrl);
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: databaseUrl, options: `-c search_path=${schema},public`, application_name: schema });
  await migrate(pool);
  const users = {};
  for (const role of ['owner', 'reviewer', 'member', 'viewer', 'outsider']) {
    users[role] = (await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id', [role + '@guide.test', role, 'unused'])).rows[0].id;
  }
  const ledger = createLedger(pool), context = createContextLedger(pool);
  async function project(name = '검사 관리 프로젝트', { bound = true } = {}) {
    return transaction(pool, async db => {
      const p = (await db.query('INSERT INTO projects(name) VALUES($1) RETURNING id', [name])).rows[0].id;
      for (const role of ['owner', 'reviewer', 'member', 'viewer']) await db.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [p, users[role], role]);
      if (bound) await db.query(`INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name,space_id,status,stage)
        VALUES($1,$2,$3,$4,$5,'ready','complete')`, [p, 't_' + randomUUID().replaceAll('-', ''), users.owner, name, 'space_' + randomUUID().replaceAll('-', '')]);
      return p;
    });
  }
  async function document(p, text = '검사 요청 후 결과를 확인한다.', extra = {}) {
    const { ready = true, ...input } = extra;
    const created = await ledger.createRecord(p, users.owner, { title: '검사 관리 기획', text, ...input });
    if (ready) await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1", [created.revision_id, {
      schema_version: '1.0', project_id: p, document_id: created.document_id, revision_id: created.revision_id,
      segments: [{ segment_id: 's1', text, locator: { kind: 'text', label: '본문' }, extraction_status: 'ok' }],
      extraction: { complete: true, warnings: [] },
    }]);
    await pool.query("UPDATE jobs SET status='succeeded' WHERE id=$1", [created.job_id]);
    return created;
  }
  async function note(p, title, extra = {}) {
    const version = Number((await pool.query('SELECT version FROM context_heads WHERE project_id=$1', [p])).rows[0]?.version || 0);
    const c = await context.createCandidate(p, users.owner, {
      request_id: randomUUID(), expected_context_version: version, kind: 'decision', title, body: title,
      occurred_at: '2026-10-15T09:00:00+09:00', rationale: '검토한 업무 결정', ...extra,
    });
    return (await context.decideCandidate(p, c.id, users.reviewer, {
      decision: 'merged', reason: '근거 확인 완료', expected_context_version: version, expected_candidate_sha256: c.content_sha256,
    })).record;
  }
  function provider(overrides = {}) {
    const calls = [];
    return {
      calls,
      async generate(args) {
        assert.equal(Number((await pool.query("SELECT count(*) n FROM pg_stat_activity WHERE application_name=$1 AND state='idle in transaction'", [schema])).rows[0].n), 0, 'Remote generation must not hold a database transaction');
        calls.push(args);
        if (overrides.generate) return overrides.generate(args);
        return { guide: generatedGuide(args.snapshot), traceId: 'trace_' + args.requestId, flowSlug: 'ains-guide-test', publishedVersionId: 'published_test_v1' };
      },
    };
  }
  return { pool, users, project, document, note, ledger, context, provider };
}

test('domain guide integration tests refuse a remote PostgreSQL server', () => {
  assert.throws(() => assertLocalDatabase('postgresql://unused:unused@production.example/ains'), /local PostgreSQL/);
  assert.doesNotThrow(() => assertLocalDatabase('postgresql://unused:unused@127.0.0.1:55432/ains'));
});

test('domain guides preserve project scope, reviewed history and durable execution', { skip: !databaseUrl }, async t => {
  const { createDomainGuide } = require('../server/domain-guide');
  const { createDomainGuideWorker } = require('../server/domain-guide-worker');
  const f = await fixture(t), { pool, users, project, document, note, ledger, context, provider } = f;
  const service = createDomainGuide({ pool });
  const args = (p, user = 'owner') => ({ projectId: p, userId: users[user] });
  const runs = p => pool.query('SELECT * FROM domain_guide_runs WHERE project_id=$1 ORDER BY created_at,id', [p]).then(r => r.rows);
  const versions = p => pool.query('SELECT * FROM domain_guide_versions WHERE project_id=$1 ORDER BY number', [p]).then(r => r.rows);
  async function generate(p, connector = provider()) {
    const requested = await service.requestRefresh(args(p));
    assert.ok(requested.run?.id);
    await createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 }).tick();
    const created = (await versions(p)).at(-1);
    assert.ok(created, 'A valid result creates a draft version');
    return { requested, created, connector };
  }

  await t.test('project access and reviewer gates apply to every operation', async () => {
    const p = await project(), other = await project('다른 프로젝트');
    await document(p);
    const first = await service.overview(args(p, 'viewer'));
    assert.equal(first.can_edit, false); assert.equal(first.can_review, false);
    for (const operation of [
      () => service.overview(args(p, 'outsider')),
      () => service.getVersion({ ...args(p, 'outsider'), versionId: randomUUID() }),
      () => service.requestRefresh(args(p, 'viewer')),
      () => service.updateSettings({ ...args(p, 'reviewer'), autoRefresh: true }),
      () => service.updateSettings({ ...args(p, 'outsider'), autoRefresh: true }),
    ]) await assert.rejects(operation, { code: 'FORBIDDEN' });
    const { created } = await generate(p);
    await assert.rejects(service.review({ ...args(p, 'member'), versionId: created.id, decision: 'approve', comment: '승인 시도' }), { code: 'FORBIDDEN' });
    await assert.rejects(service.getVersion({ ...args(other), versionId: created.id }), error => error.status === 404);
    const detail = await service.getVersion({ ...args(p, 'viewer'), versionId: created.id });
    assert.equal(detail.version.id, created.id);
    assert.equal(detail.version.guide.project_id, p);
    assert.ok(!JSON.stringify(detail).includes('lease_token'));
  });

  await t.test('only latest ready revisions and current confirmed context enter a project/domain-scoped snapshot', async () => {
    const p = await project(), other = await project('기밀 프로젝트');
    const domain = await ledger.createDomain(p, users.owner, { name: '검사 접수' });
    const old = await document(p, '이전 문서 내용', { domain_id: domain.id });
    const latest = await document(p, '접수 후 검체를 확인한다.', { document_id: old.document_id });
    await document(p, '아직 추출되지 않은 새 파일', { document_id: old.document_id, ready: false });
    await document(other, '다른 프로젝트의 비공개 데이터');
    const previous = await note(p, '폐기된 결정', { domain_id: domain.id });
    const current = await note(p, '접수 담당자가 검체를 확인한다.', { domain_id: domain.id, supersedes_id: previous.id });
    await context.createCandidate(p, users.owner, { request_id: randomUUID(), expected_context_version: 2,
      kind: 'note', title: '아직 검토하지 않은 의견', body: '아직 확정되지 않은 정책', rationale: '검토 필요', occurred_at: '2026-10-15T09:00:00+09:00' });
    const { connector, created } = await generate(p);
    assert.equal(connector.calls.length, 1);
    const snapshot = connector.calls[0].snapshot;
    assert.equal(snapshot.project_id, p); assert.equal(snapshot.schema_version, '1.0');
    assert.equal(connector.calls[0].workspaceId, (await pool.query('SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1', [p])).rows[0].workspace_id);
    assert.ok(snapshot.sources.some(s => s.id.endsWith(latest.revision_id) && s.domain_id === domain.id && s.domain_name === '검사 접수'));
    assert.ok(snapshot.sources.some(s => s.id.endsWith(current.id) && s.authority === 'confirmed'));
    assert.ok(!snapshot.sources.some(s => s.id.endsWith(old.revision_id) || s.id.endsWith(previous.id)));
    assert.ok(!JSON.stringify(snapshot).includes('아직 확정되지 않은 정책'));
    assert.ok(!JSON.stringify(snapshot).includes('다른 프로젝트의 비공개 데이터'));
    assert.equal(created.source_fingerprint, snapshot.fingerprint);
    assert.deepEqual(created.snapshot, snapshot);
  });

  await t.test('reviewed context whose original approved document changed is excluded as current knowledge', async () => {
    const p = await project(), original = await document(p, '이전 승인 기준');
    await pool.query('UPDATE documents SET baseline_revision_id=$2 WHERE id=$1', [original.document_id, original.revision_id]);
    const derived = await note(p, '이전 승인 기준에 근거한 결정', { source_refs: [{ type: 'revision', id: original.revision_id }] });
    const revised = await document(p, '수정된 승인 기준', { document_id: original.document_id });
    await pool.query('UPDATE documents SET baseline_revision_id=$2 WHERE id=$1', [original.document_id, revised.revision_id]);
    const { connector } = await generate(p);
    assert.ok(connector.calls[0].snapshot.sources.some(s => s.id.endsWith(revised.revision_id)));
    assert.ok(!connector.calls[0].snapshot.sources.some(s => s.id.endsWith(derived.id)), 'Stale provenance cannot become a confirmed guide source');
  });

  await t.test('approval keeps a published version while newer drafts await review, and stale drafts cannot publish', async () => {
    const p = await project(), source = await document(p, '첫 번째 기획');
    const first = (await generate(p)).created;
    await service.review({ ...args(p, 'reviewer'), versionId: first.id, decision: 'approve', comment: '첫 버전 확인' });
    let overview = await service.overview(args(p));
    assert.equal(overview.published.id, first.id);
    await document(p, '두 번째 기획', { document_id: source.document_id });
    const second = (await generate(p)).created;
    overview = await service.overview(args(p));
    assert.equal(overview.published.id, first.id);
    assert.equal(overview.draft.id, second.id);
    await document(p, '세 번째 기획', { document_id: source.document_id });
    overview = await service.overview(args(p));
    assert.equal(overview.source.changed, true);
    assert.equal(overview.draft.stale, true);
    await assert.rejects(service.review({ ...args(p), versionId: second.id, decision: 'approve', comment: '오래된 초안' }), { code: 'GUIDE_SOURCE_STALE' });
    await service.review({ ...args(p), versionId: second.id, decision: 'reject', comment: '최신 기획으로 다시 검토' });
    overview = await service.overview(args(p));
    assert.equal(overview.published.id, first.id);
    assert.equal((await versions(p))[0].status, 'approved');
    assert.equal((await versions(p))[1].status, 'rejected');
    const third = (await generate(p)).created;
    await service.review({ ...args(p), versionId: third.id, decision: 'approve', comment: '최신 기획 반영 확인' });
    assert.equal((await service.overview(args(p))).published.id, third.id);
    assert.equal((await versions(p)).length, 3);
    await assert.rejects(pool.query("UPDATE domain_guide_versions SET guide='{}'::jsonb WHERE id=$1", [first.id]), { code: '23514' });
  });

  await t.test('concurrent refresh requests coalesce and an unchanged fingerprint is not generated twice', async () => {
    const p = await project(); await document(p);
    const requests = await Promise.all(Array.from({ length: 5 }, () => service.requestRefresh(args(p))));
    assert.equal(new Set(requests.map(row => row.run.id)).size, 1);
    assert.equal((await runs(p)).length, 1);
    const connector = provider(), worker = createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 });
    await Promise.all([worker.tick(), worker.tick()]);
    const repeated = await service.requestRefresh(args(p));
    assert.equal(repeated.unchanged, true);
    await worker.tick();
    assert.equal(connector.calls.length, 1);
    assert.equal((await versions(p)).length, 1);
  });

  await t.test('enabling automation during refresh is owner-only and omitted settings preserve the first opt-in', async () => {
    const p = await project(); await document(p);
    await assert.rejects(service.requestRefresh({ ...args(p, 'member'), enableAuto: true }), { code: 'FORBIDDEN' });
    assert.equal((await service.overview(args(p))).settings.auto_refresh, false);
    assert.equal((await runs(p)).length, 0);
    const first = await service.requestRefresh({ ...args(p), enableAuto: true });
    const repeated = await service.requestRefresh(args(p));
    assert.equal(repeated.run.id, first.run.id);
    assert.equal(repeated.coalesced, true);
    assert.equal((await service.overview(args(p))).settings.auto_refresh, true);
    const connector = provider(), worker = createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 });
    await worker.tick(); await worker.tick();
    assert.equal(connector.calls.length, 1);
    assert.equal((await runs(p)).length, 1);
    assert.equal((await service.overview(args(p))).settings.auto_refresh, true);
  });

  await t.test('revoking the auto-refresh owner stops generation and exposes a stable actionable error', async () => {
    const p = await project(), source = await document(p, '권한 회수 전 기획');
    await service.updateSettings({ ...args(p), autoRefresh: true });
    await document(p, '권한 회수 시 확인할 최신 기획', { document_id: source.document_id });
    await pool.query('DELETE FROM memberships WHERE project_id=$1 AND user_id=$2', [p, users.owner]);
    await pool.query("UPDATE domain_guide_settings SET dirty_at=now()-interval '3 minutes' WHERE project_id=$1", [p]);
    const connector = provider(), worker = createDomainGuideWorker({ pool, provider: connector, debounceMs: 120000 });
    await worker.tick();
    const settings = (await pool.query('SELECT * FROM domain_guide_settings WHERE project_id=$1', [p])).rows[0];
    assert.equal(settings.last_error_code, 'FORBIDDEN');
    assert.equal(settings.processed_generation, settings.dirty_generation);
    const overview = await service.overview(args(p, 'viewer'));
    assert.equal(overview.source.error, null, 'A valid source snapshot is separate from an automation permission error');
    assert.equal(overview.settings.last_error_code, 'FORBIDDEN');
    assert.ok(overview.settings.last_error_message);
    await worker.tick(); await worker.tick();
    const after = (await pool.query('SELECT * FROM domain_guide_settings WHERE project_id=$1', [p])).rows[0];
    assert.equal(after.processed_generation, settings.processed_generation);
    assert.equal(after.dirty_generation, settings.dirty_generation);
    assert.equal(connector.calls.length, 0);
    assert.equal((await runs(p)).length, 0);
    assert.equal((await versions(p)).length, 0);
  });

  await t.test('automatic updates debounce bursts and turning automation off preserves approved history', async () => {
    const p = await project(), source = await document(p, '자동 갱신 전 기획');
    const initial = (await generate(p)).created;
    await service.review({ ...args(p), versionId: initial.id, decision: 'approve', comment: '초기 검토' });
    await service.updateSettings({ ...args(p), autoRefresh: true });
    await document(p, '변경 사항 하나', { document_id: source.document_id });
    await document(p, '변경 사항 최종', { document_id: source.document_id });
    const settings = (await pool.query('SELECT * FROM domain_guide_settings WHERE project_id=$1', [p])).rows[0];
    assert.ok(Number(settings.dirty_generation) > Number(settings.processed_generation));
    const connector = provider(), worker = createDomainGuideWorker({ pool, provider: connector, debounceMs: 120000 });
    await worker.tick();
    assert.equal(connector.calls.length, 0, 'Newly changed sources wait for the debounce window');
    await pool.query("UPDATE domain_guide_settings SET dirty_at=now()-interval '3 minutes' WHERE project_id=$1", [p]);
    await worker.tick();
    assert.equal(connector.calls.length, 1);
    assert.ok(connector.calls[0].snapshot.sources.some(s => s.body.includes('변경 사항 최종')));
    assert.ok(!connector.calls[0].snapshot.sources.some(s => s.body.includes('변경 사항 하나')));
    assert.equal((await service.overview(args(p))).published.id, initial.id);
    await service.updateSettings({ ...args(p), autoRefresh: false });
    await document(p, '자동 갱신 중지 후 내용', { document_id: source.document_id });
    await pool.query("UPDATE domain_guide_settings SET dirty_at=now()-interval '3 minutes' WHERE project_id=$1", [p]);
    await worker.tick();
    assert.equal(connector.calls.length, 1);
    assert.equal((await service.overview(args(p))).settings.auto_refresh, false);
  });

  await t.test('expired running work becomes uncertain and neither worker nor manual refresh blindly replays it', async () => {
    const p = await project(); await document(p);
    const { run } = await service.requestRefresh(args(p));
    await pool.query("UPDATE domain_guide_runs SET status='running',lease_token=$2,lease_expires_at=now()-interval '1 minute',dispatch_started_at=now()-interval '2 minutes' WHERE id=$1", [run.id, randomUUID()]);
    const connector = provider(), worker = createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 });
    await worker.tick(); await worker.tick();
    assert.equal(connector.calls.length, 0);
    assert.equal((await runs(p))[0].status, 'uncertain');
    await assert.rejects(service.requestRefresh(args(p)), { code: 'GUIDE_RUN_UNCERTAIN' });
    assert.equal((await versions(p)).length, 0);
  });

  await t.test('a response lost after dispatch is uncertain and preserves the exact request identity', async () => {
    const p = await project(); await document(p);
    const { run } = await service.requestRefresh(args(p));
    const connector = provider({ generate: async () => { throw new Error('connection reset after remote acceptance'); } });
    const worker = createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 });
    await worker.tick(); await worker.tick();
    assert.equal(connector.calls.length, 1);
    assert.equal(connector.calls[0].requestId, run.id);
    assert.equal((await runs(p))[0].status, 'uncertain');
    assert.equal((await versions(p)).length, 0);
  });

  await t.test('an explicit reviewer-authorized retry preserves the uncertain attempt and creates a fresh request once', async () => {
    const p = await project(), source = await document(p, '불확실 실행의 원본');
    const originalRequest = await service.requestRefresh(args(p));
    await createDomainGuideWorker({ pool, provider: provider({ generate: async () => { throw new Error('remote response lost'); } }), debounceMs: 0 }).tick();
    const original = (await runs(p))[0];
    assert.equal(original.status, 'uncertain');
    for (const role of ['viewer', 'member']) await assert.rejects(service.retry({ ...args(p, role), runId: original.id, acknowledge: true, reason: '확인 후 재요청' }), { code: 'FORBIDDEN' });
    await assert.rejects(service.retry({ ...args(p, 'reviewer'), runId: original.id, acknowledge: false }), { code: 'GUIDE_RETRY_ACK_REQUIRED', status: 409 });
    assert.equal(Number((await pool.query('SELECT count(*) n FROM domain_guide_run_retries WHERE project_id=$1', [p])).rows[0].n), 0);
    await document(p, '재요청 시점의 최신 기획', { document_id: source.document_id });
    const retried = await service.retry({ ...args(p, 'reviewer'), runId: original.id, acknowledge: true, reason: '기존 결과 확인 후 최신 기획으로 새 실행 승인' });
    assert.ok(retried.run.id); assert.notEqual(retried.run.id, originalRequest.run.id);
    const attempts = await runs(p);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts.find(row => row.id === original.id), original, 'The old uncertain state and source snapshot remain unchanged');
    const next = attempts.find(row => row.id === retried.run.id);
    assert.ok(next.snapshot.sources.some(s => s.body.includes('재요청 시점의 최신 기획')));
    assert.notEqual(next.source_fingerprint, original.source_fingerprint);
    const authorization = (await pool.query('SELECT * FROM domain_guide_run_retries WHERE run_id=$1 AND project_id=$2', [original.id, p])).rows[0];
    assert.equal(authorization.authorized_by, users.reviewer);
    assert.equal(authorization.reason, '기존 결과 확인 후 최신 기획으로 새 실행 승인');
    await assert.rejects(service.retry({ ...args(p, 'reviewer'), runId: original.id, acknowledge: true, reason: '반복 요청' }), { code: 'GUIDE_RETRY_ALREADY_AUTHORIZED' });
    const connector = provider();
    await createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 }).tick();
    assert.equal(connector.calls.length, 1); assert.equal(connector.calls[0].requestId, retried.run.id);
    assert.equal((await versions(p)).length, 1);
    assert.equal((await runs(p)).find(row => row.id === original.id).status, 'uncertain');
    await assert.rejects(pool.query("UPDATE domain_guide_run_retries SET reason='changed' WHERE run_id=$1", [original.id]), { code: '23514' });
  });

  await t.test('stopping a worker promptly fences a provider that ignores abort and later returns success', async () => {
    const p = await project(); await document(p);
    await service.requestRefresh(args(p));
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const pendingResult = new Promise(resolve => { release = resolve; });
    const connector = provider({ generate: async input => { entered(input); return pendingResult; } });
    const worker = createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 });
    const tick = worker.tick();
    const dispatched = await started;
    let deadline;
    try {
      await Promise.race([worker.stop(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Worker stop must not await an uncooperative provider')), 5000); })]);
      await tick;
      assert.equal(dispatched.signal.aborted, true);
      assert.equal((await runs(p))[0].status, 'uncertain');
      assert.equal((await versions(p)).length, 0);
    } finally {
      clearTimeout(deadline);
      release({ guide: generatedGuide(dispatched.snapshot), traceId: 'trace_stopped', flowSlug: 'ains-guide-test', publishedVersionId: 'published_test_v1' });
    }
    await new Promise(resolve => setImmediate(resolve));
    await createDomainGuideWorker({ pool, provider: provider(), debounceMs: 0 }).tick();
    assert.equal((await runs(p))[0].status, 'uncertain');
    assert.equal((await versions(p)).length, 0);
  });

  await t.test('a late successful provider response cannot overwrite an expired lease marked uncertain', async () => {
    const p = await project(); await document(p);
    const { run } = await service.requestRefresh(args(p));
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const pendingResult = new Promise(resolve => { release = resolve; });
    const connector = provider({ generate: async input => { entered(input); return pendingResult; } });
    const worker = createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 });
    const pendingTick = worker.tick();
    const dispatched = await started;
    await pool.query("UPDATE domain_guide_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [run.id]);
    await createDomainGuideWorker({ pool, provider: provider(), debounceMs: 0 }).tick();
    assert.equal((await runs(p))[0].status, 'uncertain');
    release({ guide: generatedGuide(dispatched.snapshot), traceId: 'trace_late', flowSlug: 'ains-guide-test', publishedVersionId: 'published_test_v1' });
    await pendingTick;
    assert.equal((await runs(p))[0].status, 'uncertain');
    assert.equal((await versions(p)).length, 0);
  });

  await t.test('unbound projects and fabricated output evidence cannot become a guide', async () => {
    const unbound = await project('미연결 프로젝트', { bound: false }); await document(unbound);
    await assert.rejects(service.requestRefresh(args(unbound)), { code: 'GUIDE_NORA_NOT_READY' });
    assert.equal((await runs(unbound)).length, 0);
    const p = await project(); await document(p);
    await service.requestRefresh(args(p));
    const connector = provider({ generate: async input => {
      const guide = generatedGuide(input.snapshot);
      guide.summary_evidence_ids = ['revision:' + randomUUID()];
      return { guide, traceId: 'trace_invalid', flowSlug: 'ains-guide-test', publishedVersionId: 'published_test_v1' };
    } });
    await createDomainGuideWorker({ pool, provider: connector, debounceMs: 0 }).tick();
    assert.equal(connector.calls.length, 1);
    assert.equal((await runs(p))[0].status, 'failed');
    assert.equal((await versions(p)).length, 0);
    assert.equal((await service.overview(args(p))).published, null);
  });

  await t.test('source changes during remote generation retain the result as stale draft without publishing', async () => {
    const p = await project(), source = await document(p, '실행 시점 기획');
    const connector = provider({ generate: async input => {
      await document(p, '실행 중 변경된 기획', { document_id: source.document_id });
      return { guide: generatedGuide(input.snapshot), traceId: 'trace_race', flowSlug: 'ains-guide-test', publishedVersionId: 'published_test_v1' };
    } });
    const { created } = await generate(p, connector);
    const overview = await service.overview(args(p));
    assert.equal(overview.draft.id, created.id); assert.equal(overview.draft.stale, true);
    assert.equal(overview.published, null);
    await assert.rejects(service.review({ ...args(p), versionId: created.id, decision: 'approve', comment: '변경 중인 자료' }), { code: 'GUIDE_SOURCE_STALE' });
  });

  await t.test('source limits fail explicitly without truncating or dispatching partial evidence', async () => {
    const empty = await project();
    await assert.rejects(service.requestRefresh(args(empty)), { code: 'GUIDE_NO_SOURCES' });
    const oversized = await project();
    await document(oversized, '본문', { title: '큰 원문' });
    // Use a fresh revision because ready extracted source snapshots are immutable.
    const large = await document(oversized, '원문 크기 검증', { ready: false });
    await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1", [large.revision_id, { segments: [{ text: '가'.repeat(250000) }] }]);
    await assert.rejects(service.requestRefresh(args(oversized)), { code: 'GUIDE_SOURCE_TOO_LARGE' });
    assert.equal((await runs(oversized)).length, 0);
    const crowded = await project();
    await transaction(pool, async db => {
      for (let i = 0; i < 201; i++) {
        const d = (await db.query('INSERT INTO documents(project_id,title) VALUES($1,$2) RETURNING id', [crowded, '원문 ' + i])).rows[0].id;
        await db.query(`INSERT INTO revisions(project_id,document_id,filename,mime_type,sha256,content,status,document_json,created_by)
          VALUES($1,$2,'record.md','text/markdown',$3,$4,'ready',$5,$6)`, [crowded, d, i.toString(16).padStart(64, '0'), Buffer.from('원문'), { segments: [{ text: '원문 ' + i }] }, users.owner]);
      }
    });
    await assert.rejects(service.requestRefresh(args(crowded)), { code: 'GUIDE_SOURCE_LIMIT' });
    assert.equal((await runs(crowded)).length, 0);
  });
});
