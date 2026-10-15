'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/task-automation-state.mjs');
const artifact = () => ({ head_sha: 'a'.repeat(40), pr_number: 12, pr_url: 'https://github.com/team/project/pull/12', preview_url: 'https://preview.example.com/task/one', diff: '+ real change', checks: [{ name: 'Build', status: 'passed' }] });

test('automated tasks retain server QA and merge states instead of optimistic completion', async () => {
  const { automationColumn, automationActive, automationExecutionLabel } = await state();
  for (const execution_status of ['ready', 'merging', 'uncertain', 'failed']) assert.equal(automationColumn({ status: 'qa', execution_status }), 'qa');
  assert.equal(automationColumn({ status: 'done', execution_status: 'ready' }), 'done');
  assert.equal(automationColumn({ status: 'unknown' }), 'blocked');
  assert.match(automationExecutionLabel({ status: 'done', execution_status: 'ready' }), /병합 완료/);
  assert.doesNotMatch(automationExecutionLabel({ status: 'done', execution_status: 'ready' }), /검수 대기/);
  assert.equal(Boolean(automationActive({ tasks: [{ execution_status: 'merging' }] })), true);
  assert.equal(Boolean(automationActive({ tasks: [{ execution_status: 'ready' }] })), false);
  assert.equal(Boolean(automationActive({ intake: [{ status: 'pending' }] })), true);
  assert.equal(Boolean(automationActive({ intake: [{ status: 'awaiting_connection' }] })), false);
});

test('only project writers can start development and only reviewers can approve, with no shared mutations', async () => {
  const { automationPermissions } = await state();
  assert.deepEqual(automationPermissions('owner', null), { canWrite: true, canReview: true, canConfigure: true });
  assert.deepEqual(automationPermissions('reviewer', null), { canWrite: true, canReview: true, canConfigure: false });
  assert.deepEqual(automationPermissions('member', null), { canWrite: true, canReview: false, canConfigure: false });
  for (const role of ['owner', 'reviewer', 'member', 'viewer']) {
    assert.deepEqual(automationPermissions(role, { source_user_id: 'owner' }), { canWrite: false, canReview: false, canConfigure: false });
  }
  assert.deepEqual(automationPermissions('viewer', null), { canWrite: false, canReview: false, canConfigure: false });
});

test('policy analysis entry excludes other documents and execution waits for complete extraction', async () => {
  const { policyAnalysisEligible, policyAnalysisSourceReady } = await state();
  const document = { document_category: 'policy', source_type: 'revision' };
  const revision = { status: 'ready', document_json: { extraction: { complete: true }, segments: [{ extraction_status: 'ok' }] } };
  assert.equal(policyAnalysisEligible(document, revision), true);
  assert.equal(policyAnalysisSourceReady(revision), true);
  for (const category of ['requirements', 'design', 'meeting']) assert.equal(policyAnalysisEligible({ ...document, document_category: category }, revision), false);
  assert.equal(policyAnalysisEligible({ ...document, source_type: 'commercial_revision' }, revision), false);
  assert.equal(policyAnalysisEligible(document, { status: 'extracting' }), false);
  for (const source of [{}, { extraction: { complete: false }, segments: [{ extraction_status: 'ok' }] }, { extraction: { complete: true }, segments: [] }, { extraction: { complete: true }, segments: [{ extraction_status: 'needs_review' }] }]) {
    assert.equal(policyAnalysisSourceReady({ ...revision, document_json: source }), false);
  }
  assert.equal(policyAnalysisSourceReady({ ...revision, document_json: { ...revision.document_json, normalization: { status: 'needs_review' } } }), true);
});

test('preview settings accept only bounded HTTPS origins and normalize duplicates', async () => {
  const { parsePreviewOrigins } = await state();
  assert.deepEqual(parsePreviewOrigins(' https://PREVIEW.example.com/\nhttps://preview.example.com\nhttps://second.example.com\n'), ['https://preview.example.com', 'https://second.example.com']);
  assert.deepEqual(parsePreviewOrigins(''), []);
  for (const value of ['http://preview.example.com', 'https://preview.example.com/path', 'https://user@preview.example.com', 'https://preview.example.com?q=token', 'https://preview.example.com#fragment', 'not a URL']) assert.throws(() => parsePreviewOrigins(value));
  assert.throws(() => parsePreviewOrigins(Array.from({ length: 11 }, (_, i) => `https://preview${i}.example.com`).join('\n')), /10/);
});

test('artifact preview links require the exact configured HTTPS origin', async () => {
  const { automationPreviewUrl } = await state();
  const origins = ['https://preview.example.com'];
  assert.equal(automationPreviewUrl('https://preview.example.com/task/one?mode=review', origins), 'https://preview.example.com/task/one?mode=review');
  for (const value of ['http://preview.example.com/task', 'https://preview.example.com.evil.test/task', 'https://user@preview.example.com/task', 'https://preview.example.com:444/task', '//preview.example.com/task', 'javascript:alert(1)']) assert.equal(automationPreviewUrl(value, origins), null);
  assert.equal(automationPreviewUrl('https://preview.example.com/task', []), null);
});

test('PR links require a GitHub pull request matching the returned PR number', async () => {
  const { automationPrUrl } = await state();
  assert.equal(automationPrUrl({ pr_number: 12, pr_url: 'https://github.com/team/project/pull/12' }), 'https://github.com/team/project/pull/12');
  for (const pr_url of ['javascript:alert(1)', 'https://github.com.evil.test/team/project/pull/12', 'https://github.com/team/project/pull/13', 'https://github.com/team/project/pull/12?token=private']) assert.equal(automationPrUrl({ pr_number: 12, pr_url }), null);
  assert.equal(automationPrUrl({ pr_number: null, pr_url: null }), null);
});

test('approval requires a real review artifact, all passed checks and server merge capability', async () => {
  const { automationMergeReadiness } = await state();
  const task = { status: 'qa', execution_status: 'ready', artifact: artifact() }, settings = { preview_origins: ['https://preview.example.com'] };
  assert.equal(automationMergeReadiness(task, { merge: true }, settings).allowed, true);
  for (const patch of [{ status: 'in_progress' }, { status: 'done' }, { execution_status: 'uncertain' }, { execution_status: 'merging' }]) assert.equal(automationMergeReadiness({ ...task, ...patch }, { merge: true }, settings).allowed, false);
  for (const patch of [{ diff: '' }, { head_sha: 'short' }, { preview_url: 'https://other.example.com' }, { checks: [] }, { checks: [{ name: 'Build', status: 'pending' }] }, { checks: [{ name: 'Build', status: 'failed' }] }]) assert.equal(automationMergeReadiness({ ...task, artifact: { ...artifact(), ...patch } }, { merge: true }, settings).allowed, false);
  assert.equal(automationMergeReadiness(task, { merge: false }, settings).allowed, false);
  assert.equal(automationMergeReadiness(task, undefined, settings).allowed, false);
  assert.equal(automationMergeReadiness(task, { merge: true }, {}).allowed, false);
});

test('missing connections use server-provided reasons without claiming capability', async () => {
  const { automationBlockerLabel } = await state();
  assert.equal(automationBlockerLabel({ code: 'NORA_GIT_PUSH_UNAVAILABLE', message: '선택한 연결에는 코드 전송 기능이 없습니다.' }), '선택한 연결에는 코드 전송 기능이 없습니다.');
  assert.match(automationBlockerLabel('TASK_CONNECTION_REQUIRED'), /Nora.*확인/);
  assert.match(automationBlockerLabel('TASK_SOURCE_STALE'), /재분석/);
});

test('only idle todo tasks with writer permission and connected development can move to execution', async () => {
  const { automationCanStart } = await state();
  const task = { status: 'todo', execution_status: 'idle' };
  assert.equal(automationCanStart(task, { canWrite: true }, { development: true }), true);
  for (const status of ['blocked', 'qa', 'in_progress', 'done']) assert.equal(automationCanStart({ ...task, status }, { canWrite: true }, { development: true }), false);
  for (const execution_status of ['queued', 'running', 'uncertain', 'failed']) assert.equal(automationCanStart({ ...task, execution_status }, { canWrite: true }, { development: true }), false);
  assert.equal(automationCanStart(task, { canWrite: false }, { development: true }), false);
  assert.equal(automationCanStart(task, { canWrite: true }, { development: false }), false);
});

test('board movement stays available while disconnected but does not bypass development readiness', async () => {
  const { automationCanRequestStart, automationCanStart, automationBoardAction, automationPermissions } = await state();
  const item = { id: 'task-1', status: 'todo', execution_status: 'idle' }, permissions = automationPermissions('member', null);
  assert.equal(automationCanRequestStart(item, permissions), true);
  assert.equal(automationCanStart(item, permissions, { development: false }), false);
  assert.equal(automationBoardAction({ kind: 'task', item, target: 'in_progress', permissions }), 'start');
  assert.equal(automationBoardAction({ kind: 'draft', item: { id: 'draft-1' }, target: 'in_progress', permissions }), 'prepare_draft');
  for (const target of ['qa', 'done', 'blocked']) assert.equal(automationBoardAction({ kind: 'task', item, target, permissions }), 'unavailable');
  for (const target of ['todo', null]) assert.equal(automationBoardAction({ kind: 'task', item, target, permissions }), 'none');
  for (const kind of ['task', 'draft']) {
    for (const denied of [automationPermissions('viewer', null), automationPermissions('owner', { shared: true })]) assert.equal(automationBoardAction({ kind, item, target: 'in_progress', permissions: denied }), 'none');
    assert.equal(automationBoardAction({ kind, item, target: 'in_progress', permissions, busy: true }), 'none');
  }
  for (const status of ['qa', 'blocked', 'done']) assert.equal(automationBoardAction({ kind: 'task', item: { ...item, status }, target: 'in_progress', permissions }), 'unavailable');
  assert.equal(automationBoardAction({ kind: 'task', item: null, target: 'in_progress', permissions }), 'none');
  assert.equal(automationBoardAction({ kind: 'unknown', item, target: 'in_progress', permissions }), 'none');
  assert.equal(automationBoardAction({ kind: 'task', item: { ...item, execution_status: 'queued' }, target: 'in_progress', permissions }), 'unavailable');
});

test('keyboard dragging moves by whole columns and stops at board boundaries', async () => {
  const { automationKeyboardCoordinates } = await state();
  const rects = new Map([['lane:todo', { left: 0, top: 100, width: 250, height: 600 }], ['lane:in_progress', { left: 270, top: 100, width: 250, height: 600 }], ['lane:blocked', { left: 540, top: 100, width: 250, height: 600 }]]);
  const context = { over: { id: 'lane:todo' }, collisionRect: { left: 10, top: 150, width: 230, height: 180 }, droppableRects: rects };
  const currentCoordinates = { x: 20, y: 30 }; let prevented = 0;
  const event = code => ({ code, preventDefault() { prevented++; } });
  const moved = automationKeyboardCoordinates(event('ArrowRight'), { currentCoordinates, context });
  assert.deepEqual(moved, { x: 290, y: -20 });
  assert.equal(prevented, 1);
  assert.equal(automationKeyboardCoordinates(event('ArrowLeft'), { currentCoordinates, context }), undefined);
  assert.equal(automationKeyboardCoordinates(event('ArrowDown'), { currentCoordinates, context }), undefined);
  assert.equal(automationKeyboardCoordinates(event('ArrowRight'), { currentCoordinates, context: { ...context, over: { id: 'lane:done' } } }), undefined);
  assert.equal(automationKeyboardCoordinates(event('ArrowRight'), { currentCoordinates, context: { ...context, collisionRect: null } }), undefined);
});

const startCheck = () => ({ task_id: 'task-1', task_version: 3, review_token: 'a'.repeat(64), requires_confirmation: true, questions: [{ id: 'question-1', question: '승인 전 한도는 얼마인가요?', answer: '임시로 10건까지', status: 'answered' }] });

test('a cancelled provisional start only reads evidence and never writes consent or task state', async () => {
  const { startAutomationTask } = await state(), calls = [];
  const result = await startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async (path, options) => { calls.push({ path, options }); return startCheck(); }, confirm: async check => { assert.equal(check.questions[0].answer, '임시로 10건까지'); return false; } });
  assert.deepEqual(result, { status: 'cancelled' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/tasks/task-1/start-check');
  assert.equal(calls[0].options.method, undefined);
});

test('confirmed start sends only the latest task version and exact reviewed evidence token', async () => {
  const { startAutomationTask } = await state(), calls = [];
  const result = await startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async (path, options) => { calls.push({ path, options }); return calls.length === 1 ? startCheck() : { task: { id: 'task-1', status: 'in_progress' } }; }, confirm: async () => true });
  assert.equal(result.status, 'started');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { path: '/tasks/task-1', options: { method: 'PATCH', body: { status: 'in_progress', expected_version: 3, provisional_consent: { review_token: 'a'.repeat(64) } } } });
});

test('unambiguous tasks begin immediately after server check without provisional consent', async () => {
  const { startAutomationTask } = await state(), calls = [];
  const result = await startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async (path, options) => { calls.push({ path, options }); return calls.length === 1 ? { ...startCheck(), requires_confirmation: false, review_token: null } : { task: {} }; }, confirm: async () => { assert.fail('No extra confirmation for an unambiguous task'); } });
  assert.equal(result.status, 'started');
  assert.deepEqual(calls[1].options.body, { status: 'in_progress', expected_version: 3 });
});

test('changed or unavailable evidence does not retry development using stale consent', async () => {
  const { startAutomationTask } = await state(), calls = [];
  const changed = Object.assign(new Error('고객 질문이 변경되었습니다.'), { status: 409, code: 'TASK_PROVISIONAL_CONTEXT_CHANGED' });
  await assert.rejects(startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async (path, options) => { calls.push({ path, options }); if (calls.length === 1) return startCheck(); throw changed; }, confirm: async () => true }), error => error === changed);
  assert.equal(calls.length, 2);
  let fetched = 0;
  await assert.rejects(startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', request: async () => { fetched += 1; throw new Error('네트워크 오류'); }, confirm: async () => assert.fail('No confirmation without current evidence') }), /네트워크/);
  assert.equal(fetched, 1);
});

test('navigation or unmount while reading or confirming cannot start development', async () => {
  const { startAutomationTask } = await state();
  for (const cancelAt of ['read', 'confirm']) {
    let active = true, writes = 0;
    const result = await startAutomationTask({ taskPath: '/tasks/task-1', taskId: 'task-1', isActive: () => active, request: async (path, options) => { if (options?.method === 'PATCH') writes += 1; if (cancelAt === 'read') active = false; return startCheck(); }, confirm: async () => { active = false; return true; } });
    assert.equal(result.status, 'cancelled'); assert.equal(writes, 0);
  }
});

test('invalid or cross-task start checks fail closed instead of bypassing confirmation', async () => {
  const { automationStartCheck } = await state();
  for (const value of [null, { ...startCheck(), task_id: 'other-task' }, { ...startCheck(), task_version: 0 }, { ...startCheck(), requires_confirmation: undefined }, { ...startCheck(), review_token: 'invalid' }]) assert.throws(() => automationStartCheck(value, 'task-1'), /확인 정보/);
  assert.deepEqual(automationStartCheck(startCheck(), 'task-1').work_gaps, []);
});

test('development evidence remains visible while CI and preview wait independently', async () => {
  const { automationArtifactStages, automationExecutionLabel } = await state();
  const result = { ...artifact(), pr_number: 12, pr_url: 'https://github.com/team/project/pull/12', evidence_status: 'verified', verification_status: 'pending', ci_status: 'passed', preview_status: 'pending', preview_url: null };
  assert.deepEqual(automationArtifactStages(result, {}).map(({ label, status }) => [label, status]), [['코드 변경', 'passed'], ['PR', 'passed'], ['CI', 'passed'], ['웹 미리보기', 'pending']]);
  assert.match(automationExecutionLabel({ status: 'qa', execution_status: 'ready', artifact: result }), /검증 확인/);
  assert.deepEqual(automationArtifactStages({ ...result, ci_status: 'failed', preview_status: 'unavailable' }, {}).slice(2).map(stage => stage.status), ['failed', 'unavailable']);
  assert.deepEqual(automationArtifactStages(null, {}), []);
});

test('an unverified local patch cannot become mergeable through reported passing checks', async () => {
  const { automationMergeReadiness, automationArtifactStages, automationExecutionLabel } = await state();
  const result = { ...artifact(), artifact_type: 'local_patch', evidence_status: 'unverified', pr_number: null, pr_url: null, verification_status: 'passed' };
  const task = { status: 'qa', execution_status: 'ready', artifact: result };
  const readiness = automationMergeReadiness(task, { merge: true }, { preview_origins: ['https://preview.example.com'] });
  assert.equal(readiness.allowed, false);
  assert.ok(readiness.reasons.some(reason => reason.includes('실제 코드 근거')));
  assert.ok(readiness.reasons.some(reason => reason.includes('실제 PR')));
  assert.equal(automationArtifactStages(result, {})[0].status, 'unverified');
  assert.match(automationExecutionLabel(task), /근거 확인 필요/);
});

test('refreshing an existing artifact reads verification without starting development or merging', async () => {
  const { refreshAutomationArtifact, automationCanRefreshArtifact, automationPermissions } = await state(), calls = [];
  const task = { version: 7, status: 'qa', execution_status: 'ready', artifact: artifact() }, permissions = automationPermissions('member', null);
  const response = { task: { ...task, version: 8 } };
  assert.equal(await refreshAutomationArtifact({ task, permissions, taskPath: '/tasks/task-1', request: async (...args) => { calls.push(args); return response; } }), response);
  assert.deepEqual(calls, [['/tasks/task-1/refresh-artifact', { method: 'POST', body: { expected_version: 7 } }]]);
  assert.equal(automationCanRefreshArtifact({ ...task, status: 'blocked' }, permissions), true);
  for (const badTask of [{ ...task, status: 'todo' }, { ...task, execution_status: 'running' }, { ...task, artifact: null }]) assert.equal(automationCanRefreshArtifact(badTask, permissions), false);
  await assert.rejects(refreshAutomationArtifact({ task, permissions: automationPermissions('owner', { shared: true }), taskPath: '/tasks/task-1', request: async () => assert.fail('Shared view must not refresh') }), /상태/);
  let tries = 0;
  await assert.rejects(refreshAutomationArtifact({ task, permissions, taskPath: '/tasks/task-1', request: async () => { tries++; throw new Error('version changed'); } }), /version changed/);
  assert.equal(tries, 1, 'Stale verification is never retried as development');
});

test('a blocked report without code remains readable but cannot request artifact refresh', async () => {
  const { automationHasCodeArtifact, automationCanRefreshArtifact, refreshAutomationArtifact } = await state();
  const report = { implementation_report: { completion: 'blocked', remaining_criteria: ['정책 답변이 필요합니다.'], notes: [] }, trace_id: 'trc_blocked' };
  const task = { version: 2, status: 'blocked', execution_status: 'ready', artifact: report }, permissions = { canWrite: true };
  assert.equal(automationHasCodeArtifact(report), false);
  assert.equal(automationCanRefreshArtifact(task, permissions), false);
  await assert.rejects(refreshAutomationArtifact({ task, permissions, taskPath: '/tasks/blocked', request: async () => assert.fail('A report-only result has no code verification to refresh') }), /상태/);
  assert.deepEqual(task.artifact.implementation_report.remaining_criteria, ['정책 답변이 필요합니다.']);
  const local = { ...task, artifact: { kind: 'local_patch', evidence_status: 'unverified', diff: '+ local proposal' } };
  assert.equal(automationHasCodeArtifact(local.artifact), true);
  assert.equal(automationCanRefreshArtifact(local, permissions), true);
  assert.equal(automationCanRefreshArtifact({ ...local, review: { actor_id: 'reviewer' } }, permissions), false);
  assert.equal(automationHasCodeArtifact({ diff: ' \n' }), false);
});

test('reported SDK commands remain unverified text and never count as passed CI', async () => {
  const { automationReportedChecks, automationArtifactStages, automationMergeReadiness } = await state();
  const reported_checks = [{ command: 'npm test', exit_code: 0, output: '32 tests passed\n<script>untrusted output</script>' }, { command: 'npm run build', exit_code: null, output: '' }];
  const result = { ...artifact(), checks: [{ name: 'CI 검사 결과', status: 'unavailable' }], ci_status: 'unavailable', verification_status: 'unavailable', reported_checks };
  const view = automationReportedChecks(result);
  assert.equal(view[0].command, 'npm test');
  assert.equal(view[0].output, reported_checks[0].output);
  assert.equal(view[0].exitCodeLabel, '0');
  assert.equal(view[1].exitCodeLabel, '보고되지 않음');
  assert.equal(view[1].output, '');
  assert.deepEqual(automationReportedChecks(result, { shared: true }), []);
  assert.deepEqual(automationReportedChecks({ reported_checks: null }), []);
  assert.deepEqual(automationArtifactStages(result, {}), automationArtifactStages({ ...result, reported_checks: [] }, {}));
  assert.equal(automationMergeReadiness({ status: 'qa', execution_status: 'ready', artifact: result }, { merge: true }, { preview_origins: ['https://preview.example.com'] }).allowed, false);
});

test('SDK selection accepts an observed provider and folder without inventing a connection ID', async () => {
  const { automationSdkConnections, automationSdkConnectionKey, automationSdkSelectedConnection, automationSettingsDraft, automationSettingsPayload } = await state();
  const observed = { id: null, provider: 'codex', workingFolder: '/work/project', connected: true }, disconnected = { ...observed, id: 'old', connected: false };
  const connections = automationSdkConnections({ connections: [observed, observed, disconnected, { ...observed, connected: undefined }, { ...observed, provider: 'claude-code' }, null] }, 'codex');
  assert.deepEqual(connections, [observed]);
  const draft = { ...automationSettingsDraft({ enabled: true }), execution_mode: 'nora_sdk', sdk_provider: 'codex', sdk_working_folder: '/work/project' };
  assert.equal(automationSdkSelectedConnection(connections, draft), observed);
  assert.equal(automationSdkSelectedConnection(connections, { ...draft, sdk_working_folder: '/work/other' }), null);
  assert.equal(automationSdkSelectedConnection(connections, { ...draft, sdk_connection_id: 'old' }), null);
  const payload = automationSettingsPayload(draft, 3);
  assert.equal(payload.sdk_connection_id, null);
  assert.equal(payload.sdk_working_folder, observed.workingFolder);
  assert.notEqual(payload.sdk_connection_id, automationSdkConnectionKey(observed));
  assert.deepEqual(automationSdkConnections({}, 'codex'), []);
});

test('SDK requests require a project folder and preserve existing connector settings', async () => {
  const { automationSdkConnectionRequest, automationSettingsDraft, automationSettingsPayload } = await state();
  const existing = automationSettingsDraft({ enabled: true, development_flow_slug: 'published-dev', preview_origins: ['https://preview.example.com'], uncertainty_mode: 'provisional' });
  const payload = automationSettingsPayload(existing, 4);
  assert.equal(payload.execution_mode, 'connector_api');
  assert.equal(payload.development_flow_slug, 'published-dev');
  assert.equal(payload.uncertainty_mode, 'provisional');
  assert.equal(payload.sdk_provider, null);
  assert.deepEqual(payload.preview_origins, ['https://preview.example.com']);
  assert.deepEqual(automationSdkConnectionRequest({ sdk_provider: 'claude-code', sdk_working_folder: ' /work/project ' }), { provider: 'claude-code', working_folder: '/work/project' });
  for (const folder of ['', '/', './project', '/work/../other', '/work/./project', '/work//project', '/work/project/', '/work\u0000/project']) assert.throws(() => automationSdkConnectionRequest({ sdk_provider: 'codex', sdk_working_folder: folder }), /절대 경로/);
  assert.throws(() => automationSdkConnectionRequest({ sdk_provider: 'unknown', sdk_working_folder: '/work/project' }), /개발 실행/);
  assert.throws(() => automationSettingsPayload({ ...existing, execution_mode: 'nora_sdk' }, 4), /절대 경로/);
});
