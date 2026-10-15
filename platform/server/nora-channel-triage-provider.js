'use strict';

const { isDeepStrictEqual } = require('node:util');
const { binding } = require('./project-nora');
const { validateChannelTriageRequest, validateChannelTriageResult } = require('../../nora/client/channel-triage-client');
const { buildChannelTriageFlow, defaultSlug } = require('../../nora/channel-triage/project-flow');

function fail(code, message, { dispatched = false, ...extra } = {}) {
  throw Object.assign(new Error(message), { code, status: 409, noSideEffects: !dispatched, dispatched, ...extra });
}
function parse(value) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!text || Buffer.byteLength(text) > 300000) throw new Error('invalid size');
    return JSON.parse(text);
  } catch { fail('TRIAGE_OUTPUT_INVALID', 'Nora 대화 분석 결과의 JSON 형식을 확인할 수 없습니다.'); }
}
function projection(value, key = '') {
  if (Array.isArray(value)) {
    const rows = value.map(item => projection(item));
    return ['agents', 'edges', 'toolBlocks', 'actionBlocks', 'triggerBlocks', 'variables'].includes(key)
      ? rows.sort((a, b) => String(a.id || a.name).localeCompare(String(b.id || b.name))) : rows;
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([name]) => !['x', 'y', 'width', 'height'].includes(name)).map(([name, item]) => [name, projection(item, name)]));
}

/** The provider never falls back to a global workspace or token. It verifies
 * the immutable flow, project binding and remote execution evidence separately. */
function createNoraChannelTriageProvider({ pool, provider }) {
  async function bound(input) {
    const row = await binding(pool, input.projectId);
    if (!row || row.project_id !== input.projectId || row.workspace_id !== input.workspaceId || row.status !== 'ready' || typeof provider?.callTool !== 'function') {
      fail('TRIAGE_CONNECTION_REQUIRED', '프로젝트의 Nora 워크스페이스 연결을 확인하세요.');
    }
    return row;
  }
  const call = (input, name, args = {}) => provider.callTool({ projectId: input.projectId, workspaceId: input.workspaceId, name, arguments: args, signal: input.signal });
  async function selected(input, template) {
    const value = await call(input, 'get_flow', { slug: template.slug });
    if (value?.id !== template.slug || !isDeepStrictEqual(projection(value.payload), projection(template.payload)) || value.memorySpaces?.length) {
      fail('TRIAGE_FLOW_CHANGED', '자동 생성 대화 분석 흐름이 변경되었습니다. 프로젝트의 전용 흐름을 확인하세요.');
    }
    return value;
  }
  return {
    async generate(input) {
      // Clone before any callback or transport can mutate the trusted evidence.
      const request = structuredClone(validateChannelTriageRequest(input.request, input.projectId));
      if (request.request_id !== input.requestId) fail('TRIAGE_RECORD_MISMATCH', '분석 요청과 대화 기록이 일치하지 않습니다.');
      await bound(input);
      const template = buildChannelTriageFlow({ projectId: input.projectId });
      const listed = await call(input, 'list_flows'), flows = Array.isArray(listed) ? listed : listed?.flows;
      if (!Array.isArray(flows)) fail('TRIAGE_FLOW_INVALID', 'Nora 대화 분석 흐름 목록을 확인할 수 없습니다.');
      if (!flows.some(flow => flow.id === template.slug)) await call(input, 'apply_flow', template);
      let flow = await selected(input, template);
      if (!flow.publishState?.publishedVersionId || flow.publishState.hasUnpublishedChanges) {
        await call(input, 'publish_flow', { slug: template.slug, note: 'AINS project channel triage v1' });
        flow = await selected(input, template);
      }
      if (!flow.publishState?.publishedVersionId || flow.publishState.hasUnpublishedChanges) fail('TRIAGE_FLOW_NOT_PUBLISHED', 'Nora 대화 분석 흐름의 발행을 확인할 수 없습니다.');
      await bound(input);
      const evidence = { flowSlug: template.slug, publishedVersionId: flow.publishState.publishedVersionId, agentId: template.payload.agents[0].id, workspaceId: input.workspaceId };
      // The durable worker rechecks the source and lease immediately before run.
      await input.beforeDispatch?.(structuredClone(evidence));
      let raw;
      try { raw = await call(input, 'run_flow', { slug: template.slug, input: JSON.stringify(request), variables: { channel_request: structuredClone(request) }, test: false }); }
      catch (error) { throw Object.assign(error, { dispatched: true }); }
      if (raw?.kind === 'flowRun') {
        if (raw.ok !== true || raw.status !== 'ok' || raw.slug !== template.slug) fail('TRIAGE_RUN_NOT_SUCCEEDED', 'Nora 대화 분석이 완료되지 않았습니다.', { dispatched: true, definiteFailure: raw.status === 'failed' });
        raw = raw.run;
      }
      if (raw?.status !== 'ok' || raw.failure || raw.error || (raw.rawStatus && raw.rawStatus !== 'completed') || !/^trc_[A-Za-z0-9_-]{8,128}$/.test(raw.traceId || '')) {
        fail('TRIAGE_RUN_NOT_SUCCEEDED', 'Nora 대화 분석 실행 결과를 확인하세요.', { dispatched: true, definiteFailure: raw?.status === 'failed' });
      }
      try {
        const after = await selected(input, template);
        if (after.publishState?.publishedVersionId !== flow.publishState.publishedVersionId || after.publishState.hasUnpublishedChanges) fail('TRIAGE_FLOW_CHANGED', '대화 분석 중 Nora 흐름이 변경되었습니다.');
        const result = parse(raw.output ?? raw.outputs?.at(-1)?.text);
        if (raw.outputs !== undefined && (!Array.isArray(raw.outputs) || raw.outputs.length !== 1 || raw.outputs[0]?.agentId !== evidence.agentId || !isDeepStrictEqual(parse(raw.outputs[0].text), result))) {
          fail('TRIAGE_OUTPUT_MISMATCH', '대화 분석 에이전트와 최종 결과가 일치하지 않습니다.');
        }
        const trace = await call(input, 'get_trace', { traceId: raw.traceId });
        if (trace?.traceId !== raw.traceId || trace.status !== 'completed' || trace.payload?.tenant_id !== input.workspaceId || trace.payload.graph_slug !== template.slug ||
          !isDeepStrictEqual(parse(trace.payload.flow_input), request) || !isDeepStrictEqual(parse(trace.payload.flow_output), result)) {
          fail('TRIAGE_TRACE_MISMATCH', '대화 분석의 워크스페이스·원문·결과가 일치하지 않습니다.');
        }
        await bound(input);
        return { result: validateChannelTriageResult(result, request, input.projectId), traceId: raw.traceId, ...evidence };
      } catch (error) { throw Object.assign(error, { dispatched: true, noSideEffects: false, definiteFailure: true, traceId: raw.traceId }); }
    },
  };
}

module.exports = { createNoraChannelTriageProvider, defaultSlug };
