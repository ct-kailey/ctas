'use strict';

const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { validateDocumentSchema, validateRequestSchema, validateResultSchema } = require('./schema-validator');
const { validatePipelineInput, validatePipelineResponse } = require('./pipeline-contract');
const { validateRequest, finalizeReview, prepareReview } = require('../flow/review-core');
const pipeline = require('../pipeline/manifest.json');
const flow = require('../flow/manifest.json');

const PIPELINE_URL = 'https://platform.nora.my/api/v1/' + pipeline.workspace_id + '/foundry/ains-sism-document-intake-v1';
const FLOW_SLUG = flow.slug;
const FLOW_URL = flow.api && flow.api.url;
function fail(code, message, traceId) {
  const e = new Error(message); e.code = code; if (traceId) e.traceId = traceId; throw e;
}

/** Server-side only. expectedProjectId must be resolved from authenticated access. */
function checkRequest(request, expectedProjectId) {
  validateRequestSchema(request);
  if (!expectedProjectId || request.project_id !== expectedProjectId) fail('PROJECT_MISMATCH', 'Trusted project context is required');
  return validateRequest(request);
}

/** No automatic replay after timeouts; callers reconcile the recorded run before retry. */
async function runDocumentPipeline(document, { expectedProjectId, token, fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  validateDocumentSchema(document);
  validatePipelineInput(document, expectedProjectId);
  if (!token || typeof token !== 'string') fail('PIPELINE_AUTH_REQUIRED', 'Set the server-side pipeline token');
  const frozen = structuredClone(document);
  const identity = [pipeline.workspace_id, pipeline.pipeline_id, pipeline.publication_version, frozen];
  const idempotencyKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  let response;
  try {
    response = await fetchImpl(PIPELINE_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ input: frozen, idempotency_key: idempotencyKey })
    });
  } catch (error) {
    // Do not print credentials or assume the server did not execute.
    fail('PIPELINE_TRANSPORT_UNKNOWN', 'Transport failed; completion is unknown. Reconcile before retry.');
  }
  if (!response.ok) fail('PIPELINE_HTTP_' + response.status, 'Nora rejected the pipeline request (HTTP ' + response.status + ')');
  let envelope;
  try { envelope = await response.json(); } catch { fail('PIPELINE_RESPONSE_INVALID', 'Nora returned non-JSON'); }
  try {
    const result = validatePipelineResponse(envelope, frozen, { expectedProjectId });
    validateDocumentSchema(result);
    return { runId: envelope.runId, document: result, idempotencyKey };
  } catch (error) {
    if (typeof envelope?.runId === 'string') error.runId = envelope.runId;
    throw error;
  }
}

/** Validate an observed MCP run_flow envelope. Unknown/success-shape changes fail closed. */
function validateFlowResponse(envelope, request, expectedProjectId, { expectedFlowSlug = FLOW_SLUG } = {}) {
  checkRequest(request, expectedProjectId);
  const run = envelope && envelope.run;
  const traceId = run && run.traceId;
  if (!run || envelope.kind !== 'flowRun' || envelope.slug !== expectedFlowSlug) fail('FLOW_RESPONSE_INVALID', 'Unexpected run_flow envelope', traceId);
  if (envelope.ok !== true || !['ok', 'succeeded'].includes(envelope.status) || !['ok', 'succeeded'].includes(run.status) || run.failure || run.error || typeof traceId !== 'string' || !traceId.trim()) {
    fail('FLOW_RUN_NOT_SUCCEEDED', 'Nora review did not complete successfully; partial/approval-pending output is not accepted', traceId);
  }
  let result = run.output;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { fail('FLOW_OUTPUT_INVALID', 'Final output must be JSON', traceId); }
  }
  try {
    validateResultSchema(result);
    // The source supplied by the caller is authoritative; never trust an LLM-copied request.
    const verified = finalizeReview(request, structuredClone(result));
    validateResultSchema(verified);
    return { traceId, review: verified };
  } catch (error) {
    error.traceId = traceId;
    throw error;
  }
}

/**
 * Transport injection keeps Nora MCP authentication outside this module.
 * invokeFlow must call Nora run_flow with the supplied exact argument object and
 * return its parsed JSON envelope (not MCP content[]). The successful envelope
 * is covered by recorded OpenAI acceptance runs as well as failure fixtures.
 */
async function runChangeReview(request, { expectedProjectId, invokeFlow, test = false } = {}) {
  checkRequest(request, expectedProjectId);
  if (typeof invokeFlow !== 'function') fail('FLOW_TRANSPORT_REQUIRED', 'An authenticated Nora MCP transport is required');
  const frozen = structuredClone(request);
  prepareReview(frozen); // Invalid requests fail before any model cost.
  const response = await invokeFlow({ workspace: flow.workspace_id, slug: FLOW_SLUG,
    input: JSON.stringify(frozen), variables: { review_request: structuredClone(frozen) }, test });
  return validateFlowResponse(response, frozen, expectedProjectId);
}

/** The published REST endpoint returns the flattened MCP `run` object. */
function validatePublishedFlowResponse(envelope, request, expectedProjectId) {
  const verified = validateFlowResponse({
    kind: 'flowRun', slug: FLOW_SLUG, ok: true, status: envelope && envelope.status, run: envelope,
  }, request, expectedProjectId);
  const expectedAgents = [flow.agents.analysis, flow.agents.impact_questions, flow.agents.evidence_gate];
  if (envelope.rawStatus !== 'completed' || !Array.isArray(envelope.outputs) ||
      envelope.outputs.length !== expectedAgents.length ||
      envelope.outputs.some((output, index) => !output || output.agentId !== expectedAgents[index] || typeof output.text !== 'string')) {
    fail('FLOW_OUTPUTS_INCOMPLETE', 'All three published review agents must complete in order', verified.traceId);
  }
  let finalAgentOutput;
  let result;
  try {
    finalAgentOutput = JSON.parse(envelope.outputs.at(-1).text);
    result = typeof envelope.output === 'string' ? JSON.parse(envelope.output) : envelope.output;
  } catch { fail('FLOW_OUTPUT_INVALID', 'Final agent output must be JSON', verified.traceId); }
  if (!isDeepStrictEqual(finalAgentOutput, result)) {
    fail('FLOW_OUTPUT_MISMATCH', 'Final output differs from the evidence-gate agent output', verified.traceId);
  }
  return verified;
}

/** Published only: no draft selector and no automatic replay after an uncertain call. */
async function runPublishedChangeReview(request, { expectedProjectId, token, fetchImpl = fetch, timeoutMs = 240000 } = {}) {
  checkRequest(request, expectedProjectId);
  if (!token || typeof token !== 'string' || !token.trim()) fail('FLOW_AUTH_REQUIRED', 'Set the server-side flow token');
  if (!FLOW_URL || flow.publication_status !== 'published') fail('FLOW_NOT_PUBLISHED', 'A published flow endpoint is required');
  const frozen = structuredClone(request);
  prepareReview(frozen);
  const body = new FormData();
  body.set('input', JSON.stringify(frozen));
  body.set('variables', JSON.stringify({ review_request: frozen }));
  let response;
  try {
    response = await fetchImpl(FLOW_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      // Nora flow header-token auth uses the raw token, unlike pipeline Bearer auth.
      // fetch supplies the multipart boundary; setting Content-Type would break it.
      headers: { Accept: 'application/json', Authorization: token }, body,
    });
  } catch {
    fail('FLOW_TRANSPORT_UNKNOWN', 'Transport failed; completion is unknown. Reconcile before retry.');
  }
  if (!response.ok) fail('FLOW_HTTP_' + response.status, 'Nora rejected the flow request (HTTP ' + response.status + ')');
  let envelope;
  try { envelope = await response.json(); } catch { fail('FLOW_RESPONSE_INVALID', 'Nora returned non-JSON'); }
  return validatePublishedFlowResponse(envelope, frozen, expectedProjectId);
}

/** Preserve both immutable documents through normalization before model execution. */
async function runDocumentReview(request, { expectedProjectId, pipelineToken, flowToken, fetchImpl = fetch } = {}) {
  checkRequest(request, expectedProjectId);
  // Reject missing credentials before creating either pipeline run.
  if (!pipelineToken || typeof pipelineToken !== 'string' || !pipelineToken.trim()) fail('PIPELINE_AUTH_REQUIRED', 'Set the server-side pipeline token');
  if (!flowToken || typeof flowToken !== 'string' || !flowToken.trim()) fail('FLOW_AUTH_REQUIRED', 'Set the server-side flow token');
  const frozen = structuredClone(request);
  const options = { expectedProjectId, token: pipelineToken, fetchImpl };
  const baseline = await runDocumentPipeline(frozen.baseline, options);
  const current = await runDocumentPipeline(frozen.current, options);
  const normalized = { ...frozen, baseline: baseline.document, current: current.document };
  const result = await runPublishedChangeReview(normalized, { expectedProjectId, token: flowToken, fetchImpl });
  return { pipelineRuns: { baseline: baseline.runId, current: current.runId }, ...result };
}

module.exports = { PIPELINE_URL, FLOW_SLUG, FLOW_URL, checkRequest, runDocumentPipeline, validateFlowResponse,
  runChangeReview, validatePublishedFlowResponse, runPublishedChangeReview, runDocumentReview };
