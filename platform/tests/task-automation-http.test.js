'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createPool, migrate, transaction } = require('../server/db');
const { sha256 } = require('../server/auth');
const { createLedger } = require('../server/ledger');
const { queueBinding } = require('../server/project-nora');
const { createTaskAutomationWorker } = require('../server/task-automation-worker');
const { createApp } = require('../server/server');

const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), MERGE = 'c'.repeat(40);

// Synthetic provider results exercise real HTTP middleware, persistence and the
// queue worker. No OAuth, Nora, GitHub, model or deployment request is made.
test('task automation HTTP preserves role, project, shared-view and exact-commit approval boundaries', {
  skip: !process.env.TEST_DATABASE_URL,
}, async t => {
  const schema = 'task_auto_http_' + randomUUID().replaceAll('-', '');
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
  const users = {}, calls = [];
  for (const role of ['owner', 'reviewer', 'member', 'viewer', 'outsider']) {
    users[role] = (await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',
      [role + '@task-automation-http.test', role, 'unused'])).rows[0].id;
  }
  const provider = {
    async sdkConnections(input){return {connections:[],requests:[]};},
    async connectSdk(input){assert.equal(input.projectId,p);assert.equal(input.workspaceId,(await pool.query('SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1',[p])).rows[0].workspace_id);return {id:'request-synthetic',status:'pending'};},
    async refreshArtifact(input){return {...input.artifact,ci_status:'passed',preview_status:'passed',verification_status:'passed'};},
    async capabilities() { return { risk_analysis: true, development: true, merge: true, blockers: [] }; },
    async analyzeRisk(input) {
      calls.push(['risk', input]);
      return { schema_version: '3.0', temporary_decisions:[],work_gaps:[], project_id: input.projectId, request_id: input.requestId, input_sha256: input.snapshotHash,
        trace_id: 'trc_http_risk_synthetic', risks: [], questions: [], tasks: [{ title: '정책 구현', description: '승인 조건 구현',
          acceptance_criteria: ['승인 조건 검증'], evidence: [{ segment_id: 's1', quote: '승인 조건' }] }] };
    },
    async develop(input) {
      calls.push(['develop', input]);
      return { schema_version: '3.0',development_context_sha256:require('../server/context-contract').hash(input.developmentContext),implementation_report:{contract_version:'3.0',completion:'complete',remaining_criteria:[],notes:[],question_outcomes:[]}, project_id: input.projectId, task_id: input.taskId, input_sha256: input.snapshotHash,
        trace_id: 'trc_http_development_synthetic', artifact: { pr_number: 12, pr_url: 'https://github.com/acme/demo/pull/12',
          head_sha: HEAD, base_sha: BASE, target_branch: 'main', preview_url: 'https://preview.example.test/build/12',
          diff: 'diff --git a/policy b/policy\n+approved policy', checks: [{ name: 'policy test', status: 'passed' }] } };
    },
    async merge(input) {
      calls.push(['merge', input]);
      return { project_id: input.projectId, task_id: input.taskId, input_sha256: input.snapshotHash, pr_number: 12,
        head_sha: input.expectedHeadSha, target_branch: input.targetBranch, merged: true, merge_commit_sha: MERGE };
    },
    async reconcileMerge() { throw Error('Unexpected reconciliation dispatch'); },
  };
  const origin = 'https://task-automation.example.test';
  server = createApp({ pool, appOrigin: origin, nora: { tasks: provider } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port, sessions = {};
  for (const [role, user] of Object.entries(users)) {
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [sha256(token), user, csrf]);
    sessions[role] = { Cookie: 'ains_session=' + token, Origin: origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
  }
  async function request(path, { method = 'GET', body, as = 'owner', headers, status = 200, code } = {}) {
    const response = await fetch(base + path, { method, headers: headers ?? sessions[as], body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    if (code) assert.equal(data.error?.code, code);
    return data;
  }
  async function project() {
    return transaction(pool, async db => {
      const p = (await db.query("INSERT INTO projects(name) VALUES('HTTP 합성 정책 프로젝트') RETURNING id")).rows[0].id;
      for (const role of ['owner', 'reviewer', 'member', 'viewer']) await db.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [p, users[role], role]);
      await queueBinding(db, p, users.owner, 't_' + randomUUID().replaceAll('-', ''));
      await db.query("UPDATE project_nora_workspaces SET status='ready',stage='complete',space_id=$2,connector_id='synthetic_github' WHERE project_id=$1", [p, 'space_' + p]);
      await db.query("UPDATE project_settings SET goal='정책 구현',repository_url='https://github.com/acme/demo.git',base_branch='main',version=version+1 WHERE project_id=$1", [p]);
      await db.query('UPDATE project_settings SET repository_check=$2 WHERE project_id=$1', [p, { status: 'ready', head_sha: BASE, credential_source: 'nora' }]);
      return p;
    });
  }
  const p = await project(), other = await project();
  const path = '/api/projects/' + p + '/task-automation', otherPath = '/api/projects/' + other + '/task-automation';
  const config = { expected_version: 1, enabled: true, risk_flow_slug: null, development_flow_slug: 'project-development', preview_origins: ['https://preview.example.test'] };
  await t.test('only the owner configures automation, with normal session, origin and CSRF enforcement', async () => {
    await request(path, { headers: {}, status: 401, code: 'UNAUTHENTICATED' });
    await request(path, { as: 'outsider', status: 404, code: 'NOT_FOUND' });
    for (const as of ['reviewer', 'member', 'viewer']) await request(path + '/settings', { method: 'PUT', as, body: config, status: 403, code: 'FORBIDDEN' });
    await request(path + '/settings', { method: 'PUT', body: config, headers: { ...sessions.owner, Origin: 'https://foreign.example.test' }, status: 403, code: 'ORIGIN_REJECTED' });
    await request(path + '/settings', { method: 'PUT', body: config, headers: { ...sessions.owner, 'X-CSRF-Token': 'forged' }, status: 403, code: 'CSRF_REJECTED' });
    assert.equal((await request(path, { as: 'viewer' })).settings.version, 1);
    assert.equal((await request(path + '/settings', { method: 'PUT', body: config })).settings.version, 2);
    await request(otherPath + '/settings', { method: 'PUT', body: config });
    assert.equal(calls.length, 0, 'configuration does not dispatch remote work');
  });

  const ledger = createLedger(pool), worker = createTaskAutomationWorker({ pool, provider });
  const source = await ledger.createRecord(p, users.owner, { title: 'HTTP 정책', document_category: 'policy', text: '승인 조건을 만족해야 한다.' });
  const revision = (await pool.query('SELECT * FROM revisions WHERE id=$1', [source.revision_id])).rows[0];
  const document = { schema_version: '1.0', project_id: p, document_id: source.document_id, revision_id: revision.id,
    source: { filename: revision.filename, mime_type: revision.mime_type, sha256: revision.sha256 },
    segments: [{ segment_id: 's1', requirement_key: 'REQ-1', text: '승인 조건을 만족해야 한다.', normalized_text: '승인 조건을 만족해야 한다.', locator: { kind: 'text', label: '본문' }, extraction_status: 'ok' }],
    extraction: { complete: true, warnings: ['CONTENT_IS_UNTRUSTED', 'MOCK_DATA_UNVERIFIED'] },
    normalization: { status: 'needs_review', warnings: ['CONTENT_IS_UNTRUSTED', 'MOCK_DATA_UNVERIFIED'], segment_count: 1 } };
  await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1", [revision.id, document]);
  let task;
  await t.test('members request analysis; viewers cannot write and foreign project evidence is rejected', async () => {
    const body = { revision_id: revision.id, request_id: randomUUID() };
    await request(path + '/analyze', { method: 'POST', body, as: 'viewer', status: 403, code: 'FORBIDDEN' });
    await request(otherPath + '/analyze', { method: 'POST', body, status: 404, code: 'TASK_SOURCE_NOT_FOUND' });
    await request(path + '/analyze', { method: 'POST', body, as: 'member', status: 202 });
    assert.equal(calls.length, 0, 'HTTP analysis request only queues work');
    await worker.runOnce();
    const overview = await request(path, { as: 'viewer' });
    assert.equal(overview.tasks.length, 1);
    task = overview.tasks[0];
    assert.equal(task.status, 'todo');
    const check=await request(path+'/tasks/'+task.id+'/start-check',{as:'viewer'});assert.equal(check.task_id,task.id);assert.equal(check.requires_confirmation,false);
    await request(otherPath+'/tasks/'+task.id+'/start-check',{status:404,code:'TASK_NOT_FOUND'});
    assert.equal(task.input_snapshot, undefined);
    assert.equal(calls.filter(c => c[0] === 'risk').length, 1);
    await request(otherPath + '/tasks/' + task.id, { status: 404, code: 'TASK_NOT_FOUND' });
  });
  await t.test('SDK connection requests are owner-only, project-bound and reject caller-supplied workspace',async()=>{
    for(const as of ['reviewer','member','viewer']){await request(path+'/sdk-connections',{as,status:403,code:'FORBIDDEN'});await request(path+'/sdk-connections',{method:'POST',as,body:{provider:'codex',working_folder:'/tmp/http-sdk'},status:403,code:'FORBIDDEN'});}
    assert.deepEqual((await request(path+'/sdk-connections')).connections,[]);
    await request(path+'/sdk-connections',{method:'POST',body:{provider:'codex',working_folder:'/tmp/http-sdk',workspace:'t_foreign'},status:400});
    const response=await request(path+'/sdk-connections',{method:'POST',body:{provider:'codex',working_folder:'/tmp/http-sdk'},status:202});assert.equal(response.request.status,'pending');
  });
  await t.test('member start queues one development; rejected or direct completion requests dispatch nothing', async () => {
    const target = path + '/tasks/' + task.id, body = { expected_version: task.version, status: 'in_progress' };
    await request(target, { method: 'PATCH', body, as: 'viewer', status: 403, code: 'FORBIDDEN' });
    await request(target, { method: 'PATCH', body, headers: { ...sessions.member, 'X-CSRF-Token': '' }, status: 403, code: 'CSRF_REJECTED' });
    await request(otherPath + '/tasks/' + task.id, { method: 'PATCH', body, status: 404, code: 'TASK_NOT_FOUND' });
    await request(target, { method: 'PATCH', body: { ...body, status: 'done' }, as: 'member', status: 409, code: 'TASK_QA_APPROVAL_REQUIRED' });
    assert.equal((await pool.query("SELECT 1 FROM task_automation_jobs WHERE kind='develop'")).rowCount, 0);
    const started = (await request(target, { method: 'PATCH', body, as: 'member', status: 202 })).task;
    assert.equal(started.status, 'in_progress');
    await request(target, { method: 'PATCH', body, as: 'member', status: 202 });
    assert.equal((await pool.query("SELECT 1 FROM task_automation_jobs WHERE kind='develop'")).rowCount, 1);
    assert.equal(calls.filter(c => c[0] === 'develop').length, 0);
    await worker.runOnce();
    task = (await request(target, { as: 'reviewer' })).task;
    assert.equal(task.status, 'qa');
    assert.ok(task.artifact.diff);
    assert.equal((await request(path)).tasks[0].artifact.diff, undefined);
    assert.equal(calls.filter(c => c[0] === 'develop').length, 1);
  });
  await t.test('verification refresh is a member action with CSRF and never dispatches development',async()=>{
    const target=path+'/tasks/'+task.id+'/refresh-artifact',body={expected_version:task.version};
    await request(target,{method:'POST',as:'viewer',body,status:403,code:'FORBIDDEN'});await request(target,{method:'POST',body,headers:{...sessions.member,'X-CSRF-Token':'invalid'},status:403,code:'CSRF_REJECTED'});
    const count=calls.filter(c=>c[0]==='develop').length;task=(await request(target,{method:'POST',as:'member',body})).task;assert.equal(task.artifact.verification_status,'passed');assert.equal(calls.filter(c=>c[0]==='develop').length,count);
  });
  await t.test('shared view strips diff and never inherits writes from an existing owner session', async () => {
    const link = await request('/api/shared-views', { method: 'POST', body: { project_ids: [p], label: '합성 공유 검증', expires_in_hours: 1, source_user_id: users.owner }, status: 201 });
    const token = new URL(link.share_url).hash.slice('#share='.length);
    const response = await fetch(base + '/api/auth/shared-view', { method: 'POST', headers: sessions.owner, body: JSON.stringify({ token }) });
    const shared = await response.json();
    assert.equal(response.status, 200, JSON.stringify(shared));
    const cookie = response.headers.getSetCookie().find(v => v.startsWith('ains_shared_session=')).split(';')[0];
    const headers = { ...sessions.owner, Cookie: sessions.owner.Cookie + '; ' + cookie, 'X-CSRF-Token': shared.csrfToken };
    assert.equal((await request('/api/session', { headers })).user.id, shared.user.id);
    const overview = await request(path, { headers }), detail = await request(path + '/tasks/' + task.id, { headers });
    assert.equal(overview.tasks[0].artifact.diff, undefined);
    assert.equal(detail.task.artifact.diff, undefined);
    assert.equal(detail.task.artifact.pr_url, task.artifact.pr_url);
    await request(otherPath, { headers, status: 404, code: 'NOT_FOUND' });
    const jobsBefore = (await pool.query('SELECT count(*)::int n FROM task_automation_jobs')).rows[0].n;
    for (const [suffix, method, body] of [
      ['/settings', 'PUT', { ...config, expected_version: 2 }],
      ['/analyze', 'POST', { revision_id: revision.id, request_id: randomUUID() }],
      ['/analyses/' + task.analysis_id + '/retry', 'POST', { request_id: randomUUID(), expected_job_id: randomUUID() }],
      ['/tasks/' + task.id, 'PATCH', { expected_version: task.version, status: 'in_progress' }],
      ['/tasks/' + task.id + '/approve-merge', 'POST', { expected_version: task.version, head_sha: HEAD, note: '공유 세션 시도' }],
      ['/tasks/' + task.id + '/reconcile-merge', 'POST', { expected_version: task.version }],
    ]) await request(path + suffix, { method, body, headers, status: 403, code: 'SHARED_VIEW_READ_ONLY' });
    assert.equal((await pool.query('SELECT count(*)::int n FROM task_automation_jobs')).rows[0].n, jobsBefore);
    assert.equal(calls.filter(c => c[0] === 'merge').length, 0);
  });
  await t.test('only reviewer or owner can approve the current head; done requires the worker-confirmed merge', async () => {
    const target = path + '/tasks/' + task.id, body = { expected_version: task.version, head_sha: HEAD, note: '프리뷰와 변경 내역 검토 완료' };
    for (const as of ['member', 'viewer']) {
      await request(target + '/approve-merge', { method: 'POST', body, as, status: 403, code: 'FORBIDDEN' });
      await request(target + '/reconcile-merge', { method: 'POST', body: { expected_version: task.version }, as, status: 403, code: 'FORBIDDEN' });
    }
    await request(target + '/approve-merge', { method: 'POST', body: { ...body, head_sha: BASE }, status: 409, code: 'TASK_REVIEW_STALE' });
    await request(target + '/reconcile-merge', { method: 'POST', body: { expected_version: task.version }, as: 'reviewer', status: 409, code: 'TASK_RECONCILE_NOT_REQUIRED' });
    await request(target, { method: 'PATCH', body: { expected_version: task.version, status: 'done' }, status: 409, code: 'TASK_QA_APPROVAL_REQUIRED' });
    const approved = (await request(target + '/approve-merge', { method: 'POST', body, as: 'reviewer', status: 202 })).task;
    assert.equal(approved.status, 'qa');
    assert.equal(approved.execution_status, 'merging');
    assert.equal(approved.review.actor_id, users.reviewer);
    assert.equal(calls.filter(c => c[0] === 'merge').length, 0);
    await worker.runOnce();
    const done = (await request(target, { as: 'viewer' })).task;
    assert.equal(done.status, 'done');
    assert.equal(done.merge_result.merge_commit_sha, MERGE);
    const merges = calls.filter(c => c[0] === 'merge');
    assert.equal(merges.length, 1);
    assert.equal(merges[0][1].expectedHeadSha, HEAD);
    assert.equal(merges[0][1].targetBranch, 'main');
  });
  await t.test('risk retry HTTP enforces member, origin, CSRF and project scope and only queues a new attempt', async () => {
    const retryProject = await project(), retryPath = '/api/projects/' + retryProject + '/task-automation';
    const record = await ledger.createRecord(retryProject, users.owner, { title: '재시도 정책', document_category: 'policy', text: '승인 조건을 만족해야 한다.' });
    const rev = (await pool.query('SELECT * FROM revisions WHERE id=$1', [record.revision_id])).rows[0];
    const parsed = { ...document, project_id: retryProject, document_id: record.document_id, revision_id: rev.id, source: { filename: rev.filename, mime_type: rev.mime_type, sha256: rev.sha256 } };
    await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1", [rev.id, parsed]);
    const originalAnalyze = provider.analyzeRisk;
    provider.analyzeRisk = async () => { throw Object.assign(new Error('Synthetic risk rejection'), { code: 'NORA_RISK_RESULT_INVALID', noSideEffects: true, trace_id: 'trc_http_retry_failure' }); };
    try { await worker.runOnce(); } finally { provider.analyzeRisk = originalAnalyze; }
    const first = (await request(retryPath)).analyses[0], target = retryPath + '/analyses/' + first.id + '/retry';
    assert.equal(first.status, 'failed'); assert.equal(first.can_retry, true); assert.equal(first.trace_id, 'trc_http_retry_failure');
    const body = { request_id: randomUUID(), expected_job_id: first.execution.id };
    await request(target, { method: 'POST', body, as: 'viewer', status: 403, code: 'FORBIDDEN' });
    await request(target, { method: 'POST', body, as: 'outsider', status: 404, code: 'NOT_FOUND' });
    await request(target, { method: 'POST', body, headers: { ...sessions.member, Origin: 'https://foreign.example.test' }, status: 403, code: 'ORIGIN_REJECTED' });
    await request(target, { method: 'POST', body, headers: { ...sessions.member, 'X-CSRF-Token': '' }, status: 403, code: 'CSRF_REJECTED' });
    await request(otherPath + '/analyses/' + first.id + '/retry', { method: 'POST', body, status: 404, code: 'TASK_ANALYSIS_NOT_FOUND' });
    const before = calls.length;
    const queued = (await request(target, { method: 'POST', body, as: 'member', status: 202 })).analysis;
    assert.equal(queued.status, 'queued'); assert.notEqual(queued.execution.id, first.execution.id); assert.equal(calls.length, before);
    const replay = (await request(target, { method: 'POST', body, as: 'member', status: 202 })).analysis; assert.equal(replay.execution.id, queued.execution.id);
    await request(target, { method: 'POST', body: { ...body, request_id: randomUUID() }, as: 'member', status: 409, code: 'TASK_RETRY_STALE' });
    await worker.runOnce();
    const complete = await request(retryPath); assert.equal(complete.analyses[0].status, 'completed'); assert.equal(complete.tasks.length, 1); assert.equal(complete.tasks[0].created_by, users.member);
    assert.equal((await pool.query('SELECT status,trace_id FROM task_automation_jobs WHERE id=$1', [first.execution.id])).rows[0].trace_id, 'trc_http_retry_failure');
  });
});
