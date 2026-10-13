'use strict';

// Root runs this explicitly after deployment. All writes stay in one new synthetic project.
// GitHub is read-only: the real Codex runner returns a private checkout and a patch, never a push.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { validateImplementationResult } = require('../nora/client/implementation-client');
const { run } = require('./run-implementation');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = value => createHash('sha256').update(value).digest('hex');
const safeCode = error => /^[A-Z][A-Z0-9_]{0,63}$/.test(error?.code || '') ? error.code : 'SMOKE_CHECK_FAILED';
const fail = code => { throw Object.assign(Error(code), { code }); };

function privateFile(filename, contents) {
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, contents); } finally { fs.closeSync(fd); }
}

async function runPrivateRunner(ticketFile, origin, logFile) {
  const log = fs.openSync(logFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve(__dirname, 'run-implementation.js'), '--ticket', ticketFile, '--origin', origin],
        { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', log, log], detached: process.platform !== 'win32' });
      let timedOut = false, killTimer;
      const timer = setTimeout(() => {
        timedOut = true;
        try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch {}
        killTimer = setTimeout(() => { try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
      }, 35 * 60 * 1000);
      child.once('error', () => { clearTimeout(timer); clearTimeout(killTimer); reject(Object.assign(Error('RUNNER_PROCESS_FAILED'), { code: 'RUNNER_PROCESS_FAILED' })); });
      child.once('close', code => { clearTimeout(timer); clearTimeout(killTimer); resolve({ exit_code: code, timed_out: timedOut }); });
    });
  } finally { fs.closeSync(log); }
}

function runnerCheckout(logFile) {
  const events = fs.readFileSync(logFile, 'utf8').split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const directories = [...new Set(events.map(event => event.work_directory).filter(value => typeof value === 'string'))];
  if (directories.length !== 1) fail('RUNNER_CHECKOUT_NOT_FOUND');
  const dir = fs.realpathSync(directories[0]), temp = fs.realpathSync(os.tmpdir());
  if (path.dirname(dir) !== temp || !path.basename(dir).startsWith('ains-implementation-')) fail('RUNNER_CHECKOUT_INVALID');
  const info = fs.lstatSync(dir);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) fail('RUNNER_CHECKOUT_INVALID');
  const checkout = fs.realpathSync(path.join(dir, 'checkout'));
  if (path.dirname(checkout) !== dir) fail('RUNNER_CHECKOUT_INVALID');
  return checkout;
}

async function main() {
  if (process.env.IMPLEMENTATION_SMOKE_ALLOW_LIVE !== '1') fail('LIVE_OPT_IN_REQUIRED');
  const root = path.resolve(__dirname, '..'), local = path.join(root, '.local');
  const accessFile = path.resolve(process.env.IMPLEMENTATION_SMOKE_ACCESS_FILE || path.join(local, 'production-access.json'));
  const accessInfo = fs.lstatSync(accessFile);
  if (!accessInfo.isFile() || accessInfo.isSymbolicLink() || (accessInfo.mode & 0o077) !== 0) fail('PRIVATE_ACCESS_FILE_REQUIRED');
  const access = JSON.parse(fs.readFileSync(accessFile, 'utf8')), parsed = new URL(access.url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) fail('INVALID_APP_ORIGIN');
  const base = parsed.origin, ticketFile = path.join(local, 'implementation-smoke-ticket.json'), logFile = path.join(local, 'implementation-smoke-runner.log');
  // Preserve any previous execution's credentials and evidence; never silently replay it.
  if (fs.existsSync(ticketFile) || fs.existsSync(logFile)) fail('SMOKE_PRIVATE_ARTIFACT_ALREADY_EXISTS');
  let cookie, csrf, loggedIn = false, failed = false, step = 'login', executionRoute;
  const report = { started_at: new Date().toISOString(), url: base, synthetic: true, remote_repository_written: false, status: 'running', checks: [] };
  async function call(route, { method = 'GET', body, expected = 200, text = false } = {}) {
    const response = await fetch(base + route, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Accept: text ? 'text/plain' : 'application/json', ...(cookie ? { Cookie: cookie } : {}),
        ...(method !== 'GET' ? { Origin: base, 'X-CSRF-Token': csrf || '' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { if (!text || response.status !== expected) fail('UNEXPECTED_HTTP_BODY'); }
    if (response.status !== expected) fail(/^[A-Z][A-Z0-9_]{0,63}$/.test(data?.error?.code || '') ? data.error.code : 'UNEXPECTED_HTTP_STATUS');
    const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
    return text ? raw : data;
  }
  async function waitItem(route, key, desired, terminal) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const value = (await call(route))[key];
      if (value.status === desired) return value;
      if (terminal.includes(value.status)) fail(safeCode({ code: value.error_code || 'UNEXPECTED_TERMINAL_STATE' }));
      await delay(1500);
    }
    fail('SMOKE_ASYNC_WAIT_EXCEEDED');
  }
  try {
    const login = await call('/api/auth/login', { method: 'POST', body: { email: access.email, password: access.password } }); csrf = login.csrfToken; loggedIn = true;
    step = 'create_synthetic_project';
    const { project } = await call('/api/projects', { method: 'POST', expected: 201, body: { name: '합성 검증 · 기획부터 코드 ' + new Date().toISOString().slice(0, 16) } });
    report.project_id = project.id; const prefix = '/api/projects/' + project.id;
    const { domain } = await call(prefix + '/domains', { method: 'POST', expected: 201, body: { name: '합성 정산 정책', description: '단일 함수와 테스트만 생성하는 실행 검증' } }); report.domain_id = domain.id;
    const goal = '합성 검증 전용. Node.js 22 호환 CommonJS와 Node 내장 테스트로 저장소 루트 새 파일 policy.js의 getSettlementLimit()가 숫자 50을 반환하고 policy.test.js가 이를 검증하도록 작성한다. 기존 README는 변경하지 않는다. UI/API/배포는 범위 밖이며 단일 함수와 테스트만 추가한다.';
    const current = (await call(prefix + '/settings')).settings;
    await call(prefix + '/settings', { method: 'PATCH', body: { expected_version: current.version, goal, repository_url: 'https://github.com/octocat/Hello-World.git', base_branch: 'master' } });
    step = 'verify_repository';
    const settings = (await call(prefix + '/settings/verify-repository', { method: 'POST', body: {} })).settings;
    assert.equal(settings.repository_check.status, 'ready'); assert.match(settings.repository_check.head_sha, /^[a-f0-9]{40}$/);
    report.repository_url = settings.repository_url; report.base_branch = settings.base_branch; report.base_commit_sha = settings.repository_check.head_sha;
    report.checks.push('server verified the public example repository and pinned a real base commit');

    step = 'register_editor_specification';
    const source = '# 합성 검증 전용 기획\n실제 고객이나 기존 제품 기능과 무관한 단일 함수 구현 검증이다.\n\n' +
      '업무 요구사항: 정산 건수 상한 정책을 읽는 getSettlementLimit() 함수를 새로 작성한다. 인자가 없으며 호출마다 엄격하게 숫자 50을 반환한다. 비즈니스 정책은 확정됐으며 추가 제품 결정이 필요하지 않다.\n\n' +
      '구현 범위: Node.js 22 호환 CommonJS. 저장소 루트에 policy.js와 policy.test.js 두 파일만 추가한다. policy.js는 getSettlementLimit을 이름으로 내보내며 사용 형태는 require("./policy.js").getSettlementLimit()이다. 기존 README와 기타 기존 파일은 변경하지 않는다. package.json이나 외부 패키지를 추가하지 않는다. 네트워크, 데이터베이스, UI, API, 배포, 원격 Git 수정은 범위 밖이다.\n\n' +
      '수용 기준: 함수는 숫자 50을 반환한다. 두 번 이상 호출해도 같은 값을 반환한다. policy.test.js는 Node 내장 node:test 및 node:assert/strict로 이 조건을 검증한다. Node 내장 테스트 러너로 모든 테스트가 통과해야 한다. 파일과 테스트의 실제 상태 확인은 구현 실행기가 수행한다.\n';
    const uploaded = await call(prefix + '/records', { method: 'POST', expected: 202, body: { title: '합성 정산 한도 단일 함수 기획', text: source, domain_id: domain.id, record_kind: 'specification', history: { source_type: 'editor', tags: ['합성 검증', '코드 실행'] } } });
    report.document_id = uploaded.document_id; report.revision_id = uploaded.revision_id;
    const revision = await waitItem(prefix + '/revisions/' + uploaded.revision_id, 'revision', 'ready', ['failed', 'uncertain']);
    assert.equal(revision.source_text, source); assert.equal(revision.history.source_type, 'editor'); assert.ok(revision.document_json.segments.length);
    step = 'publish_synthetic_baseline';
    await call(prefix + '/revisions/' + uploaded.revision_id + '/publish-initial', { method: 'POST', body: { reason: '합성 단일 함수 기획의 원문과 추출 결과를 대조한 전체 실행 경로 검증입니다.', acknowledge_extraction: true } });
    assert.equal((await call(prefix + '/documents')).documents[0].baseline_revision_id, uploaded.revision_id);
    report.checks.push('editor specification reached ready and only its synthetic initial baseline was published');

    step = 'plan_with_real_nora';
    const created = (await call(prefix + '/implementation-plans', { method: 'POST', expected: 202, body: { request_id: randomUUID(), revision_ids: [uploaded.revision_id] } })).plan;
    report.plan_id = created.id;
    const planRoute = prefix + '/implementation-plans/' + created.id;
    const plan = await waitItem(planRoute, 'plan', 'needs_review', ['failed', 'uncertain', 'approved', 'rejected']);
    assert.equal(plan.error_code, null); assert.match(plan.trace_id, /^trc_[A-Za-z0-9_-]+$/); assert.deepEqual(plan.stale_reasons, []);
    validateImplementationResult(plan.result, plan.input_snapshot, project.id);
    if (plan.result.questions.some(question => question.blocking)) fail('IMPLEMENTATION_BLOCKING_QUESTIONS');
    assert.equal(plan.decision, null); assert.equal((await call(prefix + '/implementation-requests')).requests.length, 0);
    report.trace_id = plan.trace_id; report.task_count = plan.result.tasks.length; report.blocking_question_count = 0;
    report.checks.push('real Nora plan has source evidence, no blocking questions, and no execution before review');

    step = 'approve_synthetic_plan_and_request_execution';
    const approved = (await call(planRoute + '/decision', { method: 'POST', body: { decision: 'approved', reason: '합성 기획 근거와 단일 함수·테스트 변경 범위를 검토했습니다. 원격 반영 없이 임시 체크아웃 변경안을 만드는 검증을 승인합니다.', acknowledge_sources: true } })).plan;
    assert.equal(approved.status, 'approved'); assert.equal(approved.decision.decision, 'approved');
    const execution = (await call(planRoute + '/execution-requests', { method: 'POST', expected: 202, body: { acknowledge_code_execution: true, reason: '명시적으로 승인한 합성 단일 함수와 테스트만 실제 Codex로 생성하고 검증합니다. 원격 저장소 변경은 수행하지 않습니다.' } })).request;
    assert.equal(execution.status, 'awaiting_runner'); report.request_id = execution.id;
    executionRoute = prefix + '/implementation-requests/' + execution.id;
    step = 'issue_private_runner_ticket';
    const downloadedRunner = await call(prefix + '/implementation-runner-script', { text: true });
    assert.equal(sha(downloadedRunner), sha(fs.readFileSync(path.join(__dirname, 'run-implementation.js'))));
    const { ticket } = await call(executionRoute + '/runner-ticket', { method: 'POST', body: {} });
    assert.equal(ticket.request_id, execution.id); assert.equal(ticket.url, base);
    privateFile(ticketFile, JSON.stringify(ticket, null, 2) + '\n');
    assert.equal(fs.statSync(ticketFile).mode & 0o077, 0);
    report.checks.push('approved execution received a private single-request ticket and deployed runner matches local runner');

    step = 'run_actual_codex';
    const runner = await runPrivateRunner(ticketFile, base, logFile);
    report.runner_exit_code = runner.exit_code;
    const completed = (await call(executionRoute)).request; report.execution_status = completed.status;
    if (runner.timed_out) fail('SMOKE_RUNNER_TIMEOUT_UNCERTAIN');
    if (completed.status !== 'patch_ready') fail(safeCode({ code: completed.error_code || 'RUNNER_NOT_PATCH_READY' }));
    if (runner.exit_code !== 0) fail('SMOKE_RUNNER_EXIT_FAILED');
    const result = completed.result;
    assert.equal(result.base_commit_sha, report.base_commit_sha); assert.equal(result.patch_sha256, sha(result.patch));
    assert.deepEqual([...result.changed_files].sort(), ['policy.js', 'policy.test.js']);
    assert.match(result.patch, /^diff --git /); assert.ok(result.patch.includes('getSettlementLimit'));
    const patch = await call(executionRoute + '/patch', { text: true }); assert.equal(patch, result.patch);
    const testCommands = result.observed_commands.filter(command => /\bnode(?:\.exe)?\b[^\n]*\s--test\b/.test(command.command));
    assert.ok(testCommands.some(command => command.exit_code === 0), 'Real runner must observe successful Node tests');
    report.patch_sha256 = result.patch_sha256; report.changed_files = [...result.changed_files].sort();
    report.tests = { observed_test_commands: testCommands.length, observed_successful_test_commands: testCommands.filter(command => command.exit_code === 0).length };
    report.checks.push('real Codex produced a patch for exactly two new files and the patch download matches its hash');

    step = 'independent_function_and_tests_check';
    const checkout = runnerCheckout(logFile), environment = { PATH: process.env.PATH, LANG: 'en_US.UTF-8' };
    const verify = await run(process.execPath, ['--test'], { cwd: checkout, env: environment, timeoutMs: 60000, maxBytes: 1024 * 1024 });
    fs.appendFileSync(logFile, '\nINDEPENDENT_TEST_RESULT\n' + verify.stdout + verify.stderr);
    assert.equal(verify.code, 0);
    const contract = await run(process.execPath, ['-e', 'const a=require("node:assert/strict");const p=require("./policy.js");a.equal(typeof p.getSettlementLimit,"function");a.equal(p.getSettlementLimit(),50);a.equal(p.getSettlementLimit(),50);'], { cwd: checkout, env: environment, timeoutMs: 10000, maxBytes: 65536 });
    fs.appendFileSync(logFile, '\nINDEPENDENT_CONTRACT_RESULT\n' + contract.stdout + contract.stderr);
    assert.equal(contract.code, 0);
    report.tests.independent_node_test_exit_code = verify.code; report.tests.independent_contract_exit_code = contract.code;
    report.checks.push('independent Node test run and repeated strict numeric50 contract checks passed in the retained private checkout');
    assert.equal((await call(executionRoute)).request.result.patch_sha256, report.patch_sha256);
    assert.equal((await call(prefix + '/implementation-requests')).requests.length, 1);
    assert.equal((await call(prefix + '/documents')).documents.length, 1);
    report.status = 'passed';
  } catch (error) {
    failed = true; report.status = 'failed'; report.failed_step = step; report.error_code = safeCode(error);
    if (executionRoute && !report.execution_status) { try { report.execution_status = (await call(executionRoute)).request.status; } catch {} }
  } finally {
    if (loggedIn) { try { await call('/api/auth/logout', { method: 'POST', body: {} }); report.logged_out = true; } catch { report.logged_out = false; report.status = 'failed'; report.error_code ||= 'SMOKE_LOGOUT_FAILED'; failed = true; } }
    report.completed_at = new Date().toISOString();
    fs.writeFileSync(path.join(root, 'platform/implementation-production-smoke.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
  if (failed) process.exitCode = 1;
}

if (require.main === module) main().catch(error => { console.error('Implementation smoke failed: ' + safeCode(error)); process.exitCode = 1; });
module.exports = { main };
