'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/nora-workspace-state.mjs');
const workspace = (overrides = {}) => ({ mode: 'nora', workspace_id: 't_project123', status: 'ready', connector_id: null, capabilities: { verify: true, connectors: true }, ...overrides });

test('manual project registration sends only the named workspace and preserves the request ID', async () => {
  const { createProjectRequest, NORA_WORKSPACE_PATTERN } = await state();
  const input = { name: ' 고객 프로젝트 ', project_kind: 'client_project', nora_workspace_id: ' t_project123 ', role: 'owner', unrelated_workspace_id: 't_other123' };
  const payload = createProjectRequest(input, 'stable-request-id');
  assert.deepEqual(payload, { request_id: 'stable-request-id', name: '고객 프로젝트', project_kind: 'client_project', nora_workspace_id: 't_project123' });
  assert.deepEqual(createProjectRequest(input, 'stable-request-id'), payload);
  const pattern = new RegExp(`^${NORA_WORKSPACE_PATTERN}$`);
  assert.equal(pattern.test(payload.nora_workspace_id), true);
  for (const value of ['https://nora.example/t_project123', 't_short', 'workspace123', 't_project123/other']) assert.equal(pattern.test(value), false);
});

test('ambiguous project responses retain the same request while definite input errors allow correction', async () => {
  const { retainProjectRequest } = await state();
  for (const error of [new Error('Network response lost'), { status: 408 }, { status: 500 }, { status: 503 }]) assert.equal(retainProjectRequest(error), true);
  for (const status of [400, 401, 403, 409, 422]) assert.equal(retainProjectRequest({ status }), false);
});

test('an ID registered without a callable Nora service never appears verified', async () => {
  const { noraWorkspaceView } = await state();
  for (const status of ['pending', 'awaiting_service', 'ready']) {
    const view = noraWorkspaceView(workspace({ status, capabilities: { verify: false, connectors: true } }));
    assert.equal(view.registered, true);
    assert.equal(view.verified, false);
    assert.equal(view.canListConnectors, false);
    assert.match(view.description, /Nora 서비스 연결 필요/);
    assert.equal(view.action, null);
  }
});

test('workspace access confirmation does not imply that contexts or Git connectors are ready', async () => {
  const { noraWorkspaceView } = await state();
  const view = noraWorkspaceView(workspace({ capabilities: { verify: true, connectors: false }, context_sync: { failed: 2 } }));
  assert.equal(view.verified, true);
  assert.equal(view.label, '접근 확인됨');
  assert.equal(view.canListConnectors, false);
});

test('uncertain binding offers reconciliation and failed binding offers retry without replacing its ID', async () => {
  const { noraWorkspaceView } = await state();
  assert.equal(noraWorkspaceView(workspace({ status: 'uncertain' })).action, 'reconcile');
  assert.equal(noraWorkspaceView(workspace({ status: 'failed' })).action, 'retry');
  for (const status of ['pending', 'verifying', 'ready']) assert.equal(noraWorkspaceView(workspace({ status })).action, null);
  assert.equal(noraWorkspaceView(workspace({ status: 'awaiting_service' })).action, 'retry');
});

test('legacy and missing bindings have no verified state or connector access', async () => {
  const { noraWorkspaceView } = await state();
  for (const value of [null, { mode: 'legacy', status: 'legacy' }, workspace({ workspace_id: null })]) {
    const view = noraWorkspaceView(value);
    assert.equal(view.registered, false);
    assert.equal(view.verified, false);
    assert.equal(view.canListConnectors, false);
  }
});

test('connector selection requires an enabled GitHub connector returned for this workspace', async () => {
  const { selectableNoraConnectors, canSaveNoraConnector } = await state();
  const connectors = [{ id: 'git-one', provider: 'github', enabled: true }, { id: 'disabled-git', provider: 'github', enabled: false }, { id: 'drive-one', provider: 'drive', enabled: true }];
  assert.deepEqual(selectableNoraConnectors(connectors).map(item => item.id), ['git-one', 'disabled-git']);
  assert.equal(canSaveNoraConnector(workspace(), connectors, 'git-one'), true);
  for (const id of ['another-workspace-git', 'disabled-git', 'drive-one', '']) assert.equal(canSaveNoraConnector(workspace(), connectors, id), false);
  assert.equal(canSaveNoraConnector(workspace({ connector_id: 'git-one' }), connectors, 'git-one'), false);
  assert.equal(canSaveNoraConnector(workspace({ status: 'failed' }), connectors, 'git-one'), false);
  assert.equal(canSaveNoraConnector(workspace(), connectors, 'git-one', { connected: false }), false);
});

test('missing Nora login cannot be mistaken for verified access or connector availability', async () => {
  const { noraWorkspaceView } = await state();
  for (const value of [workspace({ status: 'awaiting_auth' }), workspace()]) {
    const view = noraWorkspaceView(value, { connected: false, can_connect: true });
    assert.equal(view.verified, false);
    assert.equal(view.canListConnectors, false);
    assert.equal(view.label, '로그인 연결 필요');
    assert.equal(view.action, null);
  }
  assert.equal(noraWorkspaceView(workspace({ status: 'awaiting_auth' }), { connected: true }).action, 'retry');
});

test('Nora authorization navigation accepts only the exact official OAuth endpoint', async () => {
  const { noraAuthorizeUrl } = await state();
  const allowed = 'https://platform.nora.my/api/v1/oauth/authorize?client_id=test&state=opaque';
  assert.equal(noraAuthorizeUrl(allowed), allowed);
  for (const url of ['https://platform.nora.my.evil.test/api/v1/oauth/authorize', 'https://evil.test/api/v1/oauth/authorize', 'https://platform.nora.my/api/v1/oauth/authorize/elsewhere', 'http://platform.nora.my/api/v1/oauth/authorize', 'https://user@platform.nora.my/api/v1/oauth/authorize', 'https://platform.nora.my/api/v1/oauth/authorize#token', 'javascript:alert(1)', '/api/v1/oauth/authorize']) assert.equal(noraAuthorizeUrl(url), null);
});

test('OAuth callback feedback uses fixed messages, clears the flag, and preserves project navigation', async () => {
  const { noraConnectionReturn } = await state();
  const location = { pathname: '/', search: '?project=project-one&tab=settings&nora_connection=connected', hash: '#nora-workspace-connection' };
  const result = noraConnectionReturn(location);
  assert.match(result.message, /Nora 로그인 연결을 완료했습니다/);
  assert.equal(result.href, '/?project=project-one&tab=settings#nora-workspace-connection');
  assert.match(noraConnectionReturn({ ...location, search: '?nora_connection=failed' }).message, /완료하지 못했습니다/);
  for (const value of ['raw-secret-value', '__proto__', 'constructor', '<script>']) assert.equal(noraConnectionReturn({ ...location, search: `?nora_connection=${encodeURIComponent(value)}` }).message, null);
  assert.equal(noraConnectionReturn({ ...location, search: '?project=project-one&tab=settings' }), null);
});

test('legacy blockers remain visible from workspace state without a transient error', async () => {
  const { noraLegacyRunsView, noraWorkspaceView } = await state();
  const data = { mode: 'legacy', status: 'legacy', version: 0, legacy_runs: {
    blocked: true, total: 3, counts: { uncertain: 2, waiting_approval: 1 }, reconcilable: true,
    items: [{ kind: 'context_ai_runs', id: 'internal-run-id', title: '프로젝트 자료 분석', status: 'uncertain', created_at: '2026-10-14T01:00:00Z', updated_at: '2026-10-15T01:00:00Z', approval_id: 'private-approval', trace_id: 'private-trace', error_code: 'PRIVATE_ERROR_DETAIL' }], has_more: true,
  } };
  const view = noraLegacyRunsView(data, { owner: true });
  assert.equal(view.blocked, true);
  assert.equal(view.total, 3);
  assert.equal(view.canReconcile, true);
  assert.equal(view.hasMore, true);
  assert.deepEqual(view.counts, [{ label: '결과 확인 필요', count: 2 }, { label: '검토 대기', count: 1 }]);
  assert.equal(view.items[0].statusLabel, '결과 확인 필요');
  assert.equal(view.items[0].timestamp, '2026-10-15T01:00:00Z');
  assert.equal(noraWorkspaceView(data).label, '기존 작업 확인 필요');
  assert.equal(noraWorkspaceView(data).verified, false);
  assert.deepEqual(noraLegacyRunsView(structuredClone(data), { owner: true }), view, 'refreshing the same server state preserves the blocker notice');
  for (const secret of ['internal-run-id', 'private-approval', 'private-trace', 'PRIVATE_ERROR_DETAIL']) assert.ok(!JSON.stringify(view).includes(secret));
});

test('registration stays blocked until refreshed evidence clears legacy runs and retains the entered ID', async () => {
  const { canRegisterNoraWorkspace, noraLegacyRunsView } = await state();
  const enteredId = ' t_entered_workspace ', owner = { owner: true };
  const blocked = { workspace_id: null, version: 0, legacy_runs: { blocked: true, total: 1, counts: { uncertain: 1 }, items: [], reconcilable: true } };
  assert.equal(canRegisterNoraWorkspace(blocked, enteredId, owner), false);
  // Refresh/reconciliation changes only server state, not the text being edited.
  const cleared = { ...blocked, legacy_runs: { blocked: false, total: 0, counts: {}, items: [], reconcilable: false } };
  assert.equal(noraLegacyRunsView(cleared, owner).blocked, false);
  assert.equal(noraLegacyRunsView(cleared, owner).canReconcile, false);
  assert.equal(canRegisterNoraWorkspace(cleared, enteredId, owner), true);
  assert.equal(enteredId, ' t_entered_workspace ');
  assert.equal(canRegisterNoraWorkspace(cleared, enteredId, { owner: false }), false);
  assert.equal(canRegisterNoraWorkspace(cleared, enteredId, { owner: true, busy: true }), false);
  assert.equal(canRegisterNoraWorkspace(cleared, enteredId, { owner: true, disabled: true }), false);
  assert.equal(canRegisterNoraWorkspace(cleared, 'https://platform.nora.my/t_entered_workspace', owner), false);
  assert.equal(canRegisterNoraWorkspace(null, enteredId, owner), false);
  assert.equal(canRegisterNoraWorkspace(workspace(), enteredId, owner), false);
});

test('legacy reconciliation requires an owner and an explicit server capability', async () => {
  const { noraLegacyRunsView } = await state();
  const blocked = { workspace_id: null, legacy_runs: { blocked: true, total: 1, reconcilable: true, items: [] } };
  assert.equal(noraLegacyRunsView(blocked, { owner: true }).canReconcile, true);
  assert.equal(noraLegacyRunsView(blocked).canReconcile, false);
  assert.equal(noraLegacyRunsView(blocked, { owner: false }).canReconcile, false);
  for (const value of [undefined, false, 'true', 1]) assert.equal(noraLegacyRunsView({ ...blocked, legacy_runs: { ...blocked.legacy_runs, reconcilable: value } }, { owner: true }).canReconcile, false);
  const registered = workspace({ legacy_runs: blocked.legacy_runs });
  assert.equal(noraLegacyRunsView(registered, { owner: true }).blocked, false);
  assert.equal(noraLegacyRunsView(registered, { owner: true }).items.length, 0);
});

test('all legacy dispatch statuses have Korean labels and unknown states do not expose raw values', async () => {
  const { noraLegacyRunsView } = await state();
  const statuses = { queued: '처리 대기', running: '처리 중', awaiting_runner: '실행기 대기', waiting_approval: '검토 대기', finalizing: '결과 반영 중', publishing: '발행 중', uncertain: '결과 확인 필요' };
  const view = noraLegacyRunsView({ legacy_runs: { blocked: true, items: Object.keys(statuses).map(status => ({ kind: 'jobs', status, title: '' })) } });
  assert.deepEqual(view.items.map(item => item.statusLabel), Object.values(statuses));
  assert.equal(view.total, 7);
  const unknown = noraLegacyRunsView({ legacy_runs: { blocked: true, total: -1, counts: { uncertain: -1 }, items: [null, { kind: '__proto__', status: 'private_status_identifier', created_at: 'not-a-date' }] } });
  assert.equal(unknown.items[0].title, '기존 작업');
  assert.equal(unknown.items[0].statusLabel, '상태 확인 필요');
  assert.equal(unknown.items[0].timestamp, null);
  assert.equal(unknown.total, 1);
  assert.ok(!JSON.stringify(unknown).includes('private_status_identifier'));
});

test('positive blockers in a partial response cannot accidentally enable registration', async () => {
  const { noraLegacyRunsView, canRegisterNoraWorkspace } = await state();
  for (const legacy_runs of [
    { blocked: true, total: 0, items: [] },
    { blocked: false, total: 2, items: [] },
    { blocked: false, counts: { uncertain: 2 }, items: [] },
    { blocked: false, items: [{ kind: 'jobs', status: 'queued' }] },
  ]) {
    const data = { workspace_id: null, legacy_runs };
    assert.equal(noraLegacyRunsView(data).blocked, true);
    assert.equal(canRegisterNoraWorkspace(data, 't_entered_workspace', { owner: true }), false);
  }
});
