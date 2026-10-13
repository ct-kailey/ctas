'use strict';
// Legacy behavior tests isolate pre-existing state rules; mandatory governance is covered by work-execution HTTP tests.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { sha256 } = require('../server/auth');
const { createLedger } = require('../server/ledger');
const { createImplementationLedger } = require('../server/implementation-ledger');
const { createApp } = require('../server/server');

// Use an isolated schema and synthetic, already analyzed plan. These tests never
// invoke Nora, a repository check, or an implementation runner.
test('work item HTTP workflow requires human import and preserves project and review boundaries', {
  skip: !process.env.TEST_DATABASE_URL,
}, async t => {
  const schema = 'work_item_http_' + randomUUID().replaceAll('-', '');
  const admin = createPool(process.env.TEST_DATABASE_URL);
  let pool, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  await migrate(pool);
  const ledger = createLedger(pool), implementation = createImplementationLedger(pool,{requireGovernance:false});
  const users = {};
  for (const role of ['owner', 'reviewer', 'member', 'otherMember', 'viewer', 'outsider']) {
    users[role] = (await pool.query(
      'INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',
      [`${role.toLowerCase()}@work-item-http.test`, role, 'unused'],
    )).rows[0].id;
  }
  const origin = 'https://work-items.example.test';
  server = createApp({governance:{enforce:false}, pool, appOrigin: origin, production: false }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const sessions = {};
  for (const [role, user] of Object.entries(users)) {
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [sha256(token), user, csrf]);
    sessions[role] = { Cookie: 'ains_session=' + token, Origin: origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
  }
  async function request(path, { method = 'GET', body, as = 'owner', headers, status = 200, code } = {}) {
    const response = await fetch(base + path, {
      method, headers: headers ?? sessions[as], body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    if (code) assert.equal(data.error?.code, code);
    return data;
  }
  async function project(name) {
    const p = await ledger.createProject(users.owner, { name });
    for (const role of ['reviewer', 'member', 'otherMember', 'viewer']) {
      await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [p.id, users[role], role === 'otherMember' ? 'member' : role]);
    }
    return p;
  }
  async function analyzedPlan(p) {
    const saved = await implementation.saveSettings(p.id, users.owner, {
      expected_version: 1, goal: '승인한 회원 가입 기획을 구현합니다.',
      repository_url: 'https://github.com/ct-kailey/nora-flow.git', base_branch: 'main',
    });
    await implementation.recordRepositoryCheck(p.id, users.owner, saved.version, {
      status: 'ready', head_sha: 'a'.repeat(40), checked_at: new Date().toISOString(),
    });
    const text = '회원 가입 시 이메일 인증을 하고 인증 결과를 화면에 표시한다.';
    const source = await ledger.createRecord(p.id, users.member, { title: '회원 가입 기획', text, record_kind: 'specification' });
    const revision = await ledger.getRevision(p.id, source.revision_id);
    const document = {
      schema_version: '1.0', project_id: p.id, document_id: source.document_id, revision_id: source.revision_id,
      source: { filename: revision.filename, mime_type: revision.mime_type, sha256: revision.sha256 },
      segments: [{ segment_id: 's1', requirement_key: 'REQ-001', text, locator: { kind: 'text', label: '본문' }, extraction_status: 'ok' }],
      extraction: { complete: true, warnings: [] }, normalization: { status: 'ready', warnings: [], segment_count: 1 },
    };
    await pool.query("UPDATE revisions SET status='ready',document_json=$1 WHERE id=$2", [JSON.stringify(document), source.revision_id]);
    await pool.query("UPDATE jobs SET status='succeeded' WHERE id=$1", [source.job_id]);
    await ledger.publishInitial(p.id, source.revision_id, users.reviewer, { reason: '원문과 추출 결과를 확인했습니다.', acknowledge_extraction: true });
    const plan = await implementation.createPlan(p.id, users.member, { request_id: randomUUID(), revision_ids: [source.revision_id] });
    const evidence = [{ revision_id: source.revision_id, segment_id: 's1' }];
    const result = {
      title: '회원 가입 구현', summary: '인증 기능과 결과 화면을 구현합니다.',
      tasks: [
        { id: 'TASK-1', title: '이메일 인증 구현', description: '가입 시 이메일 인증을 요구합니다.', acceptance_criteria: ['미인증 계정은 가입을 완료할 수 없다.'], evidence, depends_on: [] },
        { id: 'TASK-2', title: '인증 결과 표시', description: '인증 성공과 실패를 화면에 표시합니다.', acceptance_criteria: ['성공과 실패 결과가 구분되어 표시된다.'], evidence, depends_on: ['TASK-1'] },
      ],
      questions: [], assumptions: [], test_strategy: ['인증 성공과 실패 통합 테스트'],
    };
    await pool.query("UPDATE implementation_plans SET status='needs_review',result=$1,trace_id='trc_work_item_http_synthetic',completed_at=now() WHERE project_id=$2 AND id=$3", [JSON.stringify(result), p.id, plan.id]);
    return { plan, source, result };
  }
  const p = await project('작업 보드 HTTP 검증'), q = await project('격리 검증 프로젝트');
  const prefix = '/api/projects/' + p.id, otherPrefix = '/api/projects/' + q.id;
  const fixture = await analyzedPlan(p), importPath = prefix + '/implementation-plans/' + fixture.plan.id + '/work-items';
  const acknowledge = { acknowledge_tasks: true };

  await t.test('all endpoints enforce sessions, Origin, CSRF, membership and reviewer import permission', async () => {
    await request(prefix + '/work-items', { headers: {}, status: 401, code: 'UNAUTHENTICATED' });
    await request(prefix + '/work-items', { as: 'outsider', status: 404, code: 'NOT_FOUND' });
    await request(importPath, { method: 'POST', body: acknowledge, headers: { ...sessions.owner, Origin: 'https://foreign.example.test' }, status: 403, code: 'ORIGIN_REJECTED' });
    await request(importPath, { method: 'POST', body: acknowledge, headers: { ...sessions.owner, 'X-CSRF-Token': 'forged' }, status: 403, code: 'CSRF_REJECTED' });
    await request(importPath, { method: 'POST', body: acknowledge, as: 'member', status: 403, code: 'FORBIDDEN' });
    await request(importPath, { method: 'POST', body: acknowledge, as: 'viewer', status: 403, code: 'FORBIDDEN' });
    await request(importPath, { method: 'POST', body: acknowledge, as: 'outsider', status: 404, code: 'NOT_FOUND' });
    await request(otherPrefix + '/implementation-plans/' + fixture.plan.id + '/work-items', { method: 'POST', body: acknowledge, status: 404, code: 'NOT_FOUND' });
    assert.deepEqual((await request(prefix + '/work-items', { as: 'viewer' })).items, []);
  });

  let first, second;
  await t.test('approval and explicit acknowledgement register immutable task snapshots exactly once', async () => {
    await request(importPath, { method: 'POST', body: acknowledge, as: 'reviewer', status: 409, code: 'IMPLEMENTATION_APPROVAL_REQUIRED' });
    await request(prefix + '/implementation-plans/' + fixture.plan.id + '/decision', {
      method: 'POST', as: 'reviewer', body: { decision: 'approved', reason: '작업 범위와 기획 근거를 확인했습니다.', acknowledge_sources: true },
    });
    assert.equal((await request(prefix + '/work-items')).items.length, 0, 'approval alone must not import work');
    await request(importPath, { method: 'POST', body: { acknowledge_tasks: false }, status: 400, code: 'WORK_ITEM_ACK_REQUIRED' });
    const imported = await request(importPath, { method: 'POST', body: acknowledge, as: 'reviewer', status: 201 });
    assert.equal(imported.replayed, false);
    assert.equal(imported.items.length, 2);
    [first, second] = ['TASK-1', 'TASK-2'].map(id => imported.items.find(item => item.source_task_id === id));
    assert.deepEqual(first.source_task, fixture.result.tasks[0]);
    assert.deepEqual(second.source_task, fixture.result.tasks[1]);
    assert.equal(first.status, 'todo');
    assert.equal(first.version, 1);
    assert.equal(first.assignee_id, null);
    assert.equal(first.due_on, null);
    assert.deepEqual(second.dependencies, [{ id: first.id, source_task_id: 'TASK-1', title: first.source_task.title, status: 'todo' }]);
    const replay = await request(importPath, { method: 'POST', body: acknowledge, status: 201 });
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.items.map(item => item.id).sort(), imported.items.map(item => item.id).sort());
    const listing = await request(prefix + '/work-items', { as: 'viewer' });
    assert.equal(listing.items.length, 2);
    assert.deepEqual(listing.members.map(user => user.id).sort(), [users.owner, users.reviewer, users.member, users.otherMember].sort());
    assert.ok(listing.members.every(user => !Object.hasOwn(user, 'email') && !Object.hasOwn(user, 'password_hash')));
    const { item } = await request(prefix + '/work-items/' + first.id, { as: 'viewer' });
    assert.equal(item.history.length, 1);
    assert.equal(item.history[0].kind, 'imported');
    assert.equal(item.history[0].actor_id, users.reviewer);
    assert.equal(item.history[0].before, null);
    assert.equal(item.evidence_context[0].revision_id, fixture.source.revision_id);
    assert.equal(item.evidence_context[0].text, '회원 가입 시 이메일 인증을 하고 인증 결과를 화면에 표시한다.');
    assert.equal((await pool.query('SELECT count(*)::int n FROM implementation_requests')).rows[0].n, 0, 'task import is not authorization to run code');
  });

  await t.test('detail and updates cannot cross project, role, source-snapshot or CSRF boundaries', async () => {
    const path = prefix + '/work-items/' + first.id;
    const patch = { expected_version: 1, status: 'in_progress', note: '작업을 시작합니다.' };
    await request(path, { headers: {}, status: 401, code: 'UNAUTHENTICATED' });
    await request(path, { as: 'outsider', status: 404, code: 'NOT_FOUND' });
    await request(otherPrefix + '/work-items/' + first.id, { status: 404, code: 'NOT_FOUND' });
    await request(otherPrefix + '/work-items/' + first.id, { method: 'PATCH', body: patch, status: 404, code: 'NOT_FOUND' });
    await request(path, { method: 'PATCH', body: patch, as: 'viewer', status: 403, code: 'FORBIDDEN' });
    await request(path, { method: 'PATCH', body: patch, as: 'member', status: 403, code: 'FORBIDDEN' });
    await request(path, { method: 'PATCH', body: patch, headers: { ...sessions.owner, 'X-CSRF-Token': '' }, status: 403, code: 'CSRF_REJECTED' });
    await request(path, { method: 'PATCH', body: patch, headers: { ...sessions.owner, Origin: 'https://foreign.example.test' }, status: 403, code: 'ORIGIN_REJECTED' });
    await request(path, { method: 'PATCH', body: { ...patch, source_task: { title: '변경한 범위' } }, status: 400, code: 'INVALID_WORK_ITEM_INPUT' });
    for (const assignee_id of [users.outsider, users.viewer]) {
      await request(path, { method: 'PATCH', body: { expected_version: 1, assignee_id, note: '담당자 지정' }, status: 400, code: 'WORK_ITEM_ASSIGNEE_INVALID' });
    }
    await request(path, { method: 'PATCH', body: { expected_version: 1, due_on: '2026-02-30', note: '일정 지정' }, status: 400, code: 'INVALID_WORK_ITEM_DATE' });
    const { item } = await request(path);
    assert.equal(item.version, 1);
    assert.equal(item.history.length, 1, 'rejected changes must not add history');
    assert.deepEqual(item.source_task, fixture.result.tasks[0]);
  });

  await t.test('assigned members report progress; reviewer confirms QA with evidence and conflicts preserve history', async () => {
    const path = prefix + '/work-items/' + first.id;
    const assigned = (await request(path, { method: 'PATCH', as: 'reviewer', body: { expected_version: 1, assignee_id: users.member, due_on: '2026-10-16', note: '개발 담당자와 완료 예정일 확정' } })).item;
    assert.equal(assigned.version, 2);
    assert.equal(assigned.assignee_id, users.member);
    assert.equal(assigned.due_on, '2026-10-16');
    await request(path, { method: 'PATCH', as: 'otherMember', body: { expected_version: 2, status: 'in_progress', note: '다른 구성원의 시작 요청' }, status: 403, code: 'FORBIDDEN' });
    await request(path, { method: 'PATCH', as: 'member', body: { expected_version: 2, due_on: '2026-10-20', note: '일정 변경 시도' }, status: 403, code: 'FORBIDDEN' });
    await request(path, { method: 'PATCH', as: 'member', body: { expected_version: 2, assignee_id: users.otherMember, note: '담당자 변경 시도' }, status: 403, code: 'FORBIDDEN' });
    await request(path, { method: 'PATCH', body: { expected_version: 2, status: 'done', qa_evidence: '생략한 QA', note: '대기 상태에서 완료 시도' }, status: 409, code: 'WORK_ITEM_INVALID_TRANSITION' });
    const started = (await request(path, { method: 'PATCH', as: 'member', body: { expected_version: 2, status: 'in_progress', note: '이메일 인증 구현 시작' } })).item;
    assert.equal(started.version, 3);
    await request(path, { method: 'PATCH', body: { expected_version: 2, due_on: '2026-10-30', note: '이전 화면의 일정 저장' }, status: 409, code: 'WORK_ITEM_VERSION_CONFLICT' });
    await request(path, { method: 'PATCH', as: 'member', body: { expected_version: 3, status: 'blocked', note: '의존 자료 대기' }, status: 400, code: 'WORK_ITEM_BLOCKER_REQUIRED' });
    const blocked = (await request(path, { method: 'PATCH', as: 'member', body: { expected_version: 3, status: 'blocked', blocker: '메일 발송 계정 확인 대기', note: '외부 계정 확인 전까지 보류' } })).item;
    assert.equal(blocked.blocker, '메일 발송 계정 확인 대기');
    const resumed = (await request(path, { method: 'PATCH', as: 'member', body: { expected_version: 4, status: 'in_progress', note: '계정 확인 후 구현 재개' } })).item;
    assert.equal(resumed.blocker, '');
    const qa = (await request(path, { method: 'PATCH', as: 'member', body: { expected_version: 5, status: 'qa', note: '인증 성공·실패 구현 후 검토 요청' } })).item;
    assert.equal(qa.status, 'qa');
    const completion = { expected_version: 6, status: 'done', note: '검수 완료', qa_evidence: '이메일 인증 성공·실패 및 만료 링크의 통합 테스트 결과를 확인했습니다.' };
    await request(path, { method: 'PATCH', as: 'member', body: completion, status: 403, code: 'FORBIDDEN' });
    await request(path, { method: 'PATCH', as: 'reviewer', body: { expected_version: 6, status: 'done', note: '근거 없는 완료' }, status: 400, code: 'WORK_ITEM_QA_EVIDENCE_REQUIRED' });
    const done = (await request(path, { method: 'PATCH', as: 'reviewer', body: completion })).item;
    assert.equal(done.status, 'done');
    assert.equal(done.version, 7);
    const { item } = await request(path, { as: 'viewer' });
    assert.deepEqual(item.history.map(event => event.version), [7, 6, 5, 4, 3, 2, 1]);
    assert.equal(item.history[0].actor_id, users.reviewer);
    assert.equal(item.history[0].qa_evidence, completion.qa_evidence);
    assert.equal(item.history[0].before.status, 'qa');
    assert.equal(item.history[0].after.status, 'done');
    assert.equal(item.history.at(-1).actor_id, users.reviewer);
    assert.equal(item.due_on, '2026-10-16', 'stale writes must not replace the reviewed deadline');
    assert.deepEqual(item.source_task, fixture.result.tasks[0]);
  });

  await t.test('dependency checks block premature work and protect active dependent work on reopening', async () => {
    const firstPath = prefix + '/work-items/' + first.id, secondPath = prefix + '/work-items/' + second.id;
    // Temporarily reopen before any dependent work begins, then verify the gate.
    const reopened = (await request(firstPath, { method: 'PATCH', as: 'reviewer', body: { expected_version: 7, status: 'todo', note: '만료 링크 회귀 테스트 추가' } })).item;
    assert.equal(reopened.status, 'todo');
    await request(secondPath, { method: 'PATCH', as: 'reviewer', body: { expected_version: 1, assignee_id: users.otherMember, note: '후속 화면 담당자 지정' } });
    await request(secondPath, { method: 'PATCH', as: 'otherMember', body: { expected_version: 2, status: 'in_progress', note: '선행 작업 완료 전 시작 시도' }, status: 409, code: 'WORK_ITEM_DEPENDENCIES_PENDING' });
    await request(firstPath, { method: 'PATCH', as: 'member', body: { expected_version: 8, status: 'in_progress', note: '회귀 테스트 시작' } });
    await request(firstPath, { method: 'PATCH', as: 'member', body: { expected_version: 9, status: 'qa', note: '회귀 테스트 검토 요청' } });
    await request(firstPath, { method: 'PATCH', as: 'reviewer', body: { expected_version: 10, status: 'done', note: '추가 검수 완료', qa_evidence: '만료 링크 회귀 테스트 통과 확인' } });
    const dependent = (await request(secondPath, { method: 'PATCH', as: 'otherMember', body: { expected_version: 2, status: 'in_progress', note: '확정된 인증 결과를 화면에 연결' } })).item;
    assert.equal(dependent.dependencies[0].status, 'done');
    await request(firstPath, { method: 'PATCH', as: 'reviewer', body: { expected_version: 11, status: 'todo', note: '후속 작업 진행 중 재개 시도' }, status: 409, code: 'WORK_ITEM_REOPEN_BLOCKED' });
    assert.equal((await request(firstPath)).item.status, 'done');
  });

  await t.test('changed planning inputs block advancement while preserving read access, history and exact import replay', async () => {
    const current = await implementation.getSettings(p.id, users.owner);
    await implementation.saveSettings(p.id, users.owner, { expected_version: current.version, goal: '회원 가입 정책 범위를 다시 검토합니다.', repository_url: current.repository_url, base_branch: current.base_branch });
    const path = prefix + '/work-items/' + second.id;
    const { item } = await request(path, { as: 'viewer' });
    assert.ok(item.stale_reasons.includes('SETTINGS_CHANGED'));
    await request(path, { method: 'PATCH', as: 'otherMember', body: { expected_version: 3, status: 'qa', note: '변경 전 계획으로 검토 요청' }, status: 409, code: 'WORK_ITEM_PLAN_STALE' });
    const blocked = (await request(path, { method: 'PATCH', as: 'otherMember', body: { expected_version: 3, status: 'blocked', blocker: '변경한 기획의 재승인 필요', note: '새 기획이 확정될 때까지 보류' } })).item;
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.history.length, 4);
    const replay = await request(importPath, { method: 'POST', body: acknowledge, as: 'reviewer', status: 201 });
    assert.equal(replay.replayed, true);
    assert.equal(replay.items.length, 2);
    assert.ok(replay.items.every(value => value.stale_reasons.includes('SETTINGS_CHANGED')));
    assert.equal((await request(prefix + '/work-items')).items.length, 2);
    assert.equal((await pool.query('SELECT count(*)::int n FROM implementation_requests')).rows[0].n, 0);
  });
});
