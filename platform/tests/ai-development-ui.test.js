'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/ai-development-state.mjs');

test('development list includes policy Tasks and older plan executions without treating preparation as execution', async () => {
  const { developmentGroups } = await state();
  const groups = developmentGroups([
    { id: 'task-running', title: '실행 중', status: 'in_progress', execution_status: 'running' },
    { id: 'task-todo', status: 'todo', execution_status: 'idle' },
    { id: 'task-qa', status: 'qa', execution_status: 'ready', artifact: { diff: '+ change' } },
    { id: 'task-done', status: 'done', execution_status: 'ready' },
    { id: 'task-uncertain', status: 'in_progress', execution_status: 'uncertain' },
  ], [
    { id: 'legacy-running', status: 'running', input_snapshot: { plan_result: { title: '기존 계획 작업' } } },
    { id: 'legacy-waiting', status: 'awaiting_runner' },
    { id: 'legacy-completed', status: 'succeeded' },
    { id: 'legacy-cancelled', status: 'failed', error_code: 'EXECUTION_CANCELLED' },
  ]);
  assert.equal(groups.all.length, 9);
  assert.deepEqual(groups.active.map(item => item.id).sort(), ['legacy-running', 'task-running']);
  assert.deepEqual(groups.prepared.map(item => item.id).sort(), ['legacy-waiting', 'task-todo']);
  assert.equal(groups.history.length, 5);
  assert.equal(groups.active.find(item => item.kind === 'legacy').title, '기존 계획 작업');
  assert.equal(groups.history.find(item => item.id === 'legacy-cancelled').state.label, '취소됨');
});

test('polling follows active and resumable waiting jobs without treating a settings blocker as execution', async () => {
  const { developmentOverviewActive, developmentLegacyActive, developmentTaskRefreshing, developmentTaskActive } = await state();
  assert.equal(Boolean(developmentOverviewActive({ tasks: [{ execution_status: 'running' }] })), true);
  assert.equal(Boolean(developmentOverviewActive({ analyses: [{ status: 'queued' }] })), true);
  assert.equal(Boolean(developmentOverviewActive({ intake: [{ status: 'pending' }] })), true);
  assert.equal(Boolean(developmentOverviewActive({ tasks: [{ execution_status: 'uncertain' }] })), false);
  assert.equal(Boolean(developmentOverviewActive({ capabilities: { development: false } })), false);
  assert.equal(Boolean(developmentOverviewActive({ intake: [{ status: 'awaiting_connection' }] })), true);
  assert.equal(Boolean(developmentOverviewActive({ analyses: [{ status: 'awaiting_connection' }] })), true);
  assert.equal(Boolean(developmentOverviewActive({ tasks: [{ execution_status: 'awaiting_connection' }] })), true);
  assert.equal(developmentTaskRefreshing({ execution_status: 'awaiting_connection' }), true);
  assert.equal(developmentTaskActive({ execution_status: 'awaiting_connection' }), false);
  assert.equal(Boolean(developmentLegacyActive({ requests: [{ status: 'awaiting_runner' }] })), true);
  assert.equal(Boolean(developmentLegacyActive({ requests: [{ status: 'claimed' }] })), true);
});

test('task selection survives new tasks arriving and cannot select another project after remount', async () => {
  const { developmentGroups, developmentSelection } = await state();
  const groups = developmentGroups([{ id: 'first', status: 'todo' }, { id: 'running', status: 'in_progress', execution_status: 'running' }]);
  assert.equal(developmentSelection(groups, 'first').id, 'first');
  assert.equal(developmentSelection(groups, 'missing').id, 'running');
  assert.equal(developmentSelection(developmentGroups([], [{ id: 'legacy', status: 'running' }]), 'first'), null);
  assert.equal(developmentSelection(developmentGroups(), 'first'), null);
});

test('next action is navigation to existing consent and approval, never automatic execution', async () => {
  const { developmentNextAction } = await state();
  const todo = { status: 'todo', execution_status: 'idle' }, options = { canWrite: true, canReview: true, capabilities: { development: false } };
  assert.deepEqual(developmentNextAction(todo, options), { target: 'settings', label: '개발 연결 확인' });
  assert.deepEqual(developmentNextAction(todo, { ...options, capabilities: { development: true } }), { target: 'work', label: '작업 확인·개발 시작' });
  assert.deepEqual(developmentNextAction({ status: 'qa' }, options), { target: 'work', label: '결과 검토·승인' });
  assert.deepEqual(developmentNextAction(todo, { ...options, sharedView: {} }), { target: 'work', label: '작업 상세 보기' });
  assert.deepEqual(developmentNextAction(todo, { canWrite: false, canReview: false }), { target: 'work', label: '작업 상세 보기' });
});

test('activity contains only returned records with actual timestamps and preserves backend ordering', async () => {
  const { developmentActivity } = await state();
  const items = [{ id: 'a', title: '개발 요청 등록', at: '2026-10-15T01:00:00Z', kind: 'audit' }, { id: 'b', title: '실행 결과 저장', at: '2026-10-15T01:05:00Z', summary: '변경 파일 2개' }];
  assert.deepEqual(developmentActivity({ items }).map(item => item.id), ['a', 'b']);
  assert.deepEqual(developmentActivity({ items: [{ id: 'missing-time', title: '추정된 시작' }, { id: 'bad-time', title: '불명확', at: 'invalid' }] }), []);
  assert.deepEqual(developmentActivity(null), []);
});

test('notes use the existing related task filter and scope the path to the project', async () => {
  const { developmentNotesPath } = await state();
  const path = developmentNotesPath('/api/projects/project-1', 'task-1');
  assert.equal(path, '/api/projects/project-1/implementation-notes?related_task_id=task-1&limit=10');
});

test('a new project or task read invalidates late responses even when fetch ignores cancellation', async () => {
  const { createDevelopmentReadSession } = await state();
  const session = createDevelopmentReadSession(), resolvers = {}, signals = {};
  const request = (path, { signal }) => { signals[path] = signal; return new Promise(resolve => { resolvers[path] = resolve; }); };
  const old = session.read(request, '/old'), recent = session.read(request, '/new');
  assert.equal(signals['/old'].aborted, true);
  resolvers['/new']({ project: 'new' }); assert.deepEqual(await recent, { data: { project: 'new' } });
  resolvers['/old']({ project: 'old' }); assert.deepEqual(await old, { ignored: true });
  const pending = session.read(request, '/unmount'); session.close(); resolvers['/unmount']({ sensitive: 'old project' });
  assert.deepEqual(await pending, { ignored: true });
  assert.deepEqual(await session.read(() => assert.fail('Disposed read must not fetch'), '/closed'), { ignored: true });
});

test('quiet polling does not repeatedly abort slow reads and network errors stay visible', async () => {
  const { createDevelopmentReadSession } = await state();
  const session = createDevelopmentReadSession(); let finish, calls = 0;
  const request = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = session.read(request, '/tasks');
  assert.deepEqual(await session.read(request, '/tasks', { skipIfPending: true }), { ignored: true });
  assert.equal(calls, 1); finish({ tasks: [] }); assert.deepEqual(await first, { data: { tasks: [] } });
  const error = new Error('조회 실패'); assert.deepEqual(await session.read(async () => { throw error; }, '/tasks'), { error });
  session.close(); session.open(); assert.deepEqual(await session.read(async () => ({ tasks: ['fresh'] }), '/tasks'), { data: { tasks: ['fresh'] } });
});

test('an accepted execution waiting for connection stays in history and points to connection setup', async () => {
  const { developmentGroups, developmentState, developmentNextAction, developmentNextStep } = await state();
  const task = { id: 'waiting', status: 'in_progress', execution_status: 'awaiting_connection' };
  assert.equal(developmentGroups([task]).history[0].id, 'waiting');
  assert.equal(developmentState(task).label, '연결 대기');
  assert.equal(developmentNextAction(task, { canWrite: true }).target, 'settings');
  assert.match(developmentNextStep(task), /이미 접수한 작업/);
  assert.deepEqual(developmentNextAction(task, { canWrite: true, sharedView: {} }), { target: 'work', label: '작업 상세 보기' });
  assert.match(developmentNextStep({ status: 'in_progress', execution_status: 'uncertain' }), /실제 변경 결과를 먼저 확인/);
  assert.match(developmentNextStep({ status: 'done' }), /병합 결과/);
});
