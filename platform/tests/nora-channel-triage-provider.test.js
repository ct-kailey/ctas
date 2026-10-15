'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNoraChannelTriageProvider } = require('../server/nora-channel-triage-provider');
const { buildChannelTriageFlow } = require('../../nora/channel-triage/project-flow');
const projectId = 'channel-project', workspaceId = 't_channel_workspace', traceId = 'trc_channel_test_12345678';
const eventId = '11111111-1111-4111-8111-111111111111';
function request() {
  return { schema_version: '1.0', request_id: 'channel-request', project_id: projectId, conversation_key: 'thread-1',
    source: { id: '22222222-2222-4222-8222-222222222222', provider: 'slack', name: '#프로젝트', external_workspace_id: 'T1', external_channel_id: 'C1' },
    messages: [{ event_id: eventId, message_id: 'message-1', kind: 'created', author: '담당자', text: '인증 만료는 10분으로 확정합니다.', sent_at: '2026-10-15T01:00:00Z', changed_at: null, url: 'https://example.test/thread/1' }] };
}
function result() { return { classification: 'decision', title: '인증 정책 논의', summary: '인증 만료를 10분으로 확정한다는 대화가 있습니다.', record_kind: 'decision', confidence: 0.9, evidence_event_ids: [eventId], reason: '원문에 확정 표현이 있습니다. 프로젝트 정책 반영은 담당자 검토가 필요합니다.' }; }
function fixture(options = {}) {
  const input = { projectId, workspaceId, requestId: 'channel-request', request: request() }, calls = [], flows = new Map(); let submitted, completed = false;
  const pool = { query: async (sql, params) => {
    assert.equal(params[0], projectId);
    return { rows: options.missing ? [] : [{ project_id: projectId, workspace_id: options.foreign ? 't_another_workspace' : workspaceId, status: options.bindingLost && completed ? 'failed' : 'ready' }] };
  } };
  const provider = { callTool: async call => {
    calls.push(call); assert.equal(call.projectId, projectId); assert.equal(call.workspaceId, workspaceId); const a = call.arguments;
    switch (call.name) {
      case 'list_flows': return { flows: [...flows.values()].map(v => ({ id: v.id })) };
      case 'apply_flow': {
        const flow = { id: a.slug, payload: structuredClone(a.payload), publishState: {} }; options.tamper?.(flow); flows.set(a.slug, flow); return {};
      }
      case 'get_flow': {
        const flow = structuredClone(flows.get(a.slug));
        if (completed && options.versionChanged) flow.publishState.publishedVersionId = 'gv_different';
        return flow;
      }
      case 'publish_flow': if (!options.unpublished) flows.get(a.slug).publishState = { publishedVersionId: 'gv_channel_v1', hasUnpublishedChanges: false }; return {};
      case 'run_flow': {
        assert.equal(a.test, false); assert.deepEqual(JSON.parse(a.input), a.variables.channel_request);
        submitted = structuredClone(a.variables.channel_request);
        if (options.transport) throw Object.assign(new Error('secret-transport-detail'), { code: 'NORA_MCP_UNAVAILABLE', noSideEffects: false });
        if (options.mutateInput) a.variables.channel_request.messages[0].event_id = '33333333-3333-4333-8333-333333333333';
        completed = true; const output = result(); options.result?.(output);
        const run = { status: 'ok', rawStatus: 'completed', traceId, output: JSON.stringify(output) };
        options.run?.(run);
        return options.legacy ? run : { kind: 'flowRun', ok: true, slug: a.slug, status: 'ok', run };
      }
      case 'get_trace': {
        const output = result(); options.result?.(output);
        const trace = { traceId, status: 'completed', payload: { tenant_id: workspaceId, graph_slug: buildChannelTriageFlow({ projectId }).slug, flow_input: JSON.stringify(submitted), flow_output: JSON.stringify(output) } };
        options.trace?.(trace); return trace;
      }
      default: throw new Error('Unexpected ' + call.name);
    }
  } };
  return { input, calls, flows, service: createNoraChannelTriageProvider({ pool, provider }) };
}

test('managed channel draft flow publishes once per project and emits verified review data', async () => {
  const f = fixture(); let intents = 0;
  f.input.beforeDispatch = async evidence => {
    intents++; assert.equal(evidence.workspaceId, workspaceId); assert.equal(evidence.publishedVersionId, 'gv_channel_v1');
    assert.equal(f.calls.at(-1).name, 'get_flow'); assert.equal(f.calls.filter(c => c.name === 'run_flow').length, intents - 1);
  };
  const outcome = await f.service.generate(f.input); assert.deepEqual(outcome.result, result()); assert.equal(outcome.traceId, traceId);
  await f.service.generate(f.input); assert.equal(intents, 2); assert.equal(f.calls.filter(c => c.name === 'apply_flow').length, 1); assert.equal(f.calls.filter(c => c.name === 'publish_flow').length, 1);
  const flow = [...f.flows.values()][0]; const agent = flow.payload.agents[0];
  assert.equal(flow.payload.meta.ains_project_id, projectId); assert.equal(agent.requiresApproval, false); assert.equal(agent.forceFreshContext, true);
  for (const key of ['nativeTools', 'connectedMemoryIds', 'connectedMemorySpaceIds', 'connectedMcpServerIds', 'dataSources']) assert.deepEqual(agent[key], []);
  assert.equal(flow.payload.triggerBlocks[0].config.apiSlug, flow.id); assert.equal(flow.payload.edges[0].targetId, agent.id);
});
test('project and source mismatches are rejected before any remote operation', async () => {
  for (const options of [{ missing: true }, { foreign: true }]) {
    const f = fixture(options); await assert.rejects(f.service.generate(f.input), { code: 'TRIAGE_CONNECTION_REQUIRED' }); assert.equal(f.calls.length, 0);
  }
  const foreign = fixture(); foreign.input.request.project_id = 'other'; await assert.rejects(foreign.service.generate(foreign.input), { code: 'PROJECT_MISMATCH' }); assert.equal(foreign.calls.length, 0);
  const wrongRequest = fixture(); wrongRequest.input.requestId = 'other'; await assert.rejects(wrongRequest.service.generate(wrongRequest.input), { code: 'TRIAGE_RECORD_MISMATCH' }); assert.equal(wrongRequest.calls.length, 0);
});
test('changed managed flow cannot run or be overwritten', async () => {
  for (const tamper of [f => f.payload.agents[0].nativeTools.push('web'), f => f.payload.agents[0].prompt += 'changed', f => f.payload.meta.ains_project_id = 'other', f => f.memorySpaces = ['space']]) {
    const f = fixture({ tamper }); await assert.rejects(f.service.generate(f.input), { code: 'TRIAGE_FLOW_CHANGED' }); assert.equal(f.calls.filter(c => c.name === 'run_flow').length, 0); assert.equal(f.calls.filter(c => c.name === 'publish_flow').length, 0);
  }
});
test('publication failure cannot run an unpublished flow', async () => {
  const f = fixture({ unpublished: true }); await assert.rejects(f.service.generate(f.input), { code: 'TRIAGE_FLOW_NOT_PUBLISHED' }); assert.equal(f.calls.filter(c => c.name === 'run_flow').length, 0);
});
test('source changed during flow preparation cancels before dispatch', async () => {
  const f = fixture(); f.input.beforeDispatch = async () => { throw Object.assign(new Error('Source changed'), { code: 'EVIDENCE_CHANGED' }); };
  await assert.rejects(f.service.generate(f.input), { code: 'EVIDENCE_CHANGED' }); assert.equal(f.calls.filter(c => c.name === 'run_flow').length, 0);
});
test('trace must match the exact workspace, flow, input and output', async () => {
  for (const trace of [t => t.payload.tenant_id = 't_other_workspace', t => t.payload.graph_slug = 'foreign-flow', t => t.payload.flow_input = '{}', t => t.payload.flow_output = '{}', t => t.status = 'error']) {
    const f = fixture({ trace }); await assert.rejects(f.service.generate(f.input), { code: 'TRIAGE_TRACE_MISMATCH', dispatched: true, definiteFailure: true });
  }
});
test('foreign and deleted evidence are rejected even when run and trace agree', async () => {
  const foreign = fixture({ result: value => value.evidence_event_ids = ['33333333-3333-4333-8333-333333333333'] });
  await assert.rejects(foreign.service.generate(foreign.input), { code: 'TRIAGE_EVIDENCE_MISMATCH', definiteFailure: true });
  const deleted = fixture(); deleted.input.request.messages[0].kind = 'deleted'; deleted.input.request.messages[0].text = '';
  await assert.rejects(deleted.service.generate(deleted.input), { code: 'TRIAGE_EVIDENCE_MISMATCH' });
});
test('changed binding or publication during execution cannot produce an accepted result', async () => {
  const bindingLost = fixture({ bindingLost: true }); await assert.rejects(bindingLost.service.generate(bindingLost.input), { code: 'TRIAGE_CONNECTION_REQUIRED', dispatched: true, definiteFailure: true });
  const versionChanged = fixture({ versionChanged: true }); await assert.rejects(versionChanged.service.generate(versionChanged.input), { code: 'TRIAGE_FLOW_CHANGED', dispatched: true, definiteFailure: true });
});
test('unknown transport outcome is never retried by the provider', async () => {
  const f = fixture({ transport: true }); await assert.rejects(f.service.generate(f.input), { code: 'NORA_MCP_UNAVAILABLE', dispatched: true, noSideEffects: false }); assert.equal(f.calls.filter(c => c.name === 'run_flow').length, 1);
});
test('incomplete or inconsistent runtime results cannot be saved', async () => {
  for (const run of [r => r.rawStatus = 'running', r => r.failure = { code: 'failed' }, r => r.outputs = [{ agentId: 'wrong-agent', text: r.output }]]) {
    const f = fixture({ run }); await assert.rejects(f.service.generate(f.input));
  }
});
test('legacy envelope and transport mutation cannot change trusted source validation', async () => {
  for (const options of [{ legacy: true }, { mutateInput: true }]) { const f = fixture(options); assert.deepEqual((await f.service.generate(f.input)).result, result()); }
});
test('flow template is deterministic, project-specific, and never performs human approval', () => {
  const one = buildChannelTriageFlow({ projectId }); assert.deepEqual(one, buildChannelTriageFlow({ projectId }));
  assert.notEqual(one.slug, buildChannelTriageFlow({ projectId: 'another-project' }).slug);
  assert.match(one.payload.agents[0].prompt, /untrusted source data/); assert.match(one.payload.agents[0].prompt, /draft only/);
  assert.equal(one.payload.agents[0].retry.budget.maxTotalAttempts, 1);
});

module.exports = { request, result };
