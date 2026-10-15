'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/task-areas-state.mjs');
const members = [{ id: 'm1', name: 'Kailey', role: 'owner' }, { id: 'm2', name: 'Vara', role: 'member' }, { id: 'm3', name: 'Reviewer', role: 'reviewer' }, { id: 'm4', name: 'Viewer', role: 'viewer' }];

test('task areas always expose three independently tracked domains without assuming AI completion', async () => {
  const { taskAreaRows, taskAreaProgress, taskAreaProgressLabel } = await state();
  assert.deepEqual(taskAreaRows().map(({ area, status, version }) => [area, status, version]), [['screen', 'todo', 0], ['server', 'todo', 0], ['database', 'todo', 0]]);
  assert.deepEqual(taskAreaProgress([{ area: 'screen', status: 'done' }, { area: 'server', status: 'review' }, { area: 'database', status: 'not_applicable' }]), { completed: 1, total: 2, percent: 50 });
  assert.deepEqual(taskAreaProgress([{ area: 'screen', status: 'done' }]), { completed: 1, total: 3, percent: 33 });
  const none = taskAreaProgress(['screen', 'server', 'database'].map(area => ({ area, status: 'not_applicable' })));
  assert.deepEqual(none, { completed: 0, total: 0, percent: 0 });
  assert.equal(taskAreaProgressLabel(none), '작업 대상 없음');
});

test('assignee selection supports multiple project writers but excludes viewers', async () => {
  const { taskAreaMembers, taskAreaPayload, taskAreaDraft } = await state();
  const row = { area: 'screen', status: 'todo', description: '', reference: '', assignee_ids: [], version: 0 };
  assert.deepEqual(taskAreaMembers(members).map(member => member.id), ['m1', 'm2', 'm3']);
  const payload = taskAreaPayload(row, { ...taskAreaDraft(row), assignee_ids: ['m2', 'm1', 'm2'] }, members);
  assert.deepEqual(payload.assignee_ids, ['m2', 'm1']);
  assert.equal(payload.expected_version, 0);
  assert.throws(() => taskAreaPayload(row, { ...taskAreaDraft(row), assignee_ids: ['m4'] }, members), /담당자/);
  assert.throws(() => taskAreaPayload(row, { ...taskAreaDraft(row), assignee_ids: ['outside-project'] }, members), /담당자/);
});

test('saving an area only writes its independent version, never starts AI or merges a task', async () => {
  const { saveTaskArea, taskAreaDraft } = await state(), calls = [];
  const row = { area: 'server', status: 'todo', description: '', reference: '', assignee_ids: [], version: 2 };
  const result = { task_id: 'task-one', areas: [{ ...row, status: 'done', version: 3 }] };
  assert.equal(await saveTaskArea({ request: async (...args) => { calls.push(args); return result; }, taskPath: '/api/projects/project-one/task-automation/tasks/task-one', row, draft: { ...taskAreaDraft(row), status: 'done', assignee_ids: ['m1', 'm2'] }, members, canWrite: true }), result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/projects/project-one/task-automation/tasks/task-one/areas/server');
  assert.deepEqual(calls[0][1], { method: 'PATCH', body: { expected_version: 2, description: '', reference: '', assignee_ids: ['m1', 'm2'], status: 'done' } });
});

test('read-only views and navigation cancellation cannot change area status', async () => {
  const { saveTaskArea, taskAreaDraft } = await state();
  const row = { area: 'screen', status: 'todo', version: 0 };
  const args = { request: async () => assert.fail('No write'), taskPath: '/tasks/one', row, draft: taskAreaDraft(row), members };
  await assert.rejects(saveTaskArea({ ...args, canWrite: false }), /권한/);
  assert.equal(await saveTaskArea({ ...args, canWrite: true, isActive: () => false }), null);
  const controller = new AbortController(); controller.abort();
  assert.equal(await saveTaskArea({ ...args, canWrite: true, signal: controller.signal }), null);
});

test('concurrent edits are surfaced without automatically retrying a stale write', async () => {
  const { saveTaskArea, taskAreaDraft } = await state();
  const row = { area: 'database', status: 'todo', version: 7 }, stale = Object.assign(new Error('다른 사용자가 수정했습니다.'), { status: 409 });
  let writes = 0;
  await assert.rejects(saveTaskArea({ request: async () => { writes++; throw stale; }, taskPath: '/tasks/one', row, draft: taskAreaDraft(row), members, canWrite: true }), error => error === stale);
  assert.equal(writes, 1);
});

test('status, field lengths and versions fail closed while text stays plain data', async () => {
  const { taskAreaPayload, taskAreaDraft } = await state();
  const row = { area: 'server', status: 'todo', version: 0 }, draft = taskAreaDraft(row);
  for (const patch of [{ status: 'merged' }, { description: 'x'.repeat(10001) }, { reference: 'x'.repeat(2001) }]) assert.throws(() => taskAreaPayload(row, { ...draft, ...patch }, members));
  assert.throws(() => taskAreaPayload({ ...row, version: -1 }, draft, members));
  assert.throws(() => taskAreaPayload({ ...row, area: '../approve-merge' }, draft, members));
  assert.equal(taskAreaPayload(row, { ...draft, description: ' <script>alert(1)</script> ', reference: 'javascript:alert(1)' }, members).description, '<script>alert(1)</script>');
});

test('assignment order does not mark an edit dirty and persisted names survive read-only views', async () => {
  const { taskAreaIsDirty, taskAreaDraft, taskAreaAssigneeNames, taskAreaHistoryChanges } = await state();
  const row = { area: 'screen', status: 'todo', assignee_ids: ['m1', 'm2'], assignees: [{ id: 'm1', name: 'Kailey' }, { id: 'm2', name: 'Vara' }] };
  assert.equal(taskAreaIsDirty(row, { ...taskAreaDraft(row), assignee_ids: ['m2', 'm1'] }), false);
  assert.equal(taskAreaIsDirty(row, { ...taskAreaDraft(row), status: 'review' }), true);
  assert.deepEqual(taskAreaAssigneeNames(row), ['Kailey', 'Vara']);
  assert.match(taskAreaHistoryChanges({ before_state: { status: 'todo', assignee_ids: ['m1'] }, after_state: { status: 'in_progress', assignee_ids: ['m1', 'm2'] } }), /할 일 → 진행 중.*담당자 변경/);
});

test('finished assignment history can retain former writers, but reopening or changing assignees requires current writers', async () => {
  const { taskAreaPayload, taskAreaDraft } = await state();
  const row = { area: 'screen', status: 'done', assignee_ids: ['m4'], version: 2 }, draft = { ...taskAreaDraft(row), description: '완료한 작업 설명 보완' };
  assert.deepEqual(taskAreaPayload(row, draft, members).assignee_ids, ['m4']);
  assert.throws(() => taskAreaPayload(row, { ...draft, status: 'in_progress' }, members), /담당자/);
  assert.throws(() => taskAreaPayload(row, { ...draft, assignee_ids: ['m4', 'm1'] }, members), /담당자/);
  assert.deepEqual(taskAreaPayload(row, { ...draft, status: 'in_progress', assignee_ids: ['m1'] }, members).assignee_ids, ['m1']);
});
