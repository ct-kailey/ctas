'use strict';

const Ajv2020 = require('ajv/dist/2020').default;
const { isDeepStrictEqual } = require('node:util');
const manifest = require('../channel-triage/manifest.json');
const ajv = new Ajv2020({ strict: true, allErrors: true, ownProperties: true, coerceTypes: false, removeAdditional: false, useDefaults: false });
const requestSchema = ajv.compile(require('../channel-triage/request.schema.json'));
const resultSchema = ajv.compile(require('../channel-triage/result.schema.json'));
const FLOW_URL = manifest.api.url;
const FLOW_SLUG = manifest.slug;
const MAX_REQUEST_BYTES = 256 * 1024;
const KINDS = { decision: 'decision', action_item: 'work_item', requirement_change: 'conversation', discussion: 'conversation', noise: 'note' };

function fail(code, message, traceId) {
  const error = Object.assign(new Error(message), { code });
  if (typeof traceId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(traceId)) error.traceId = traceId;
  throw error;
}
function validTime(value) {
  if (value === null) return true;
  const matched = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!matched || !Number.isFinite(Date.parse(value))) return false;
  const date = new Date(matched[1] + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === matched[1];
}
function validateChannelTriageRequest(request, expectedProjectId) {
  if (typeof expectedProjectId !== 'string' || !expectedProjectId.trim()) fail('TRIAGE_PROJECT_CONTEXT_REQUIRED', 'A trusted project context is required');
  if (!requestSchema(request)) fail('TRIAGE_REQUEST_INVALID', 'Channel input does not match its schema');
  if (request.project_id !== expectedProjectId) fail('PROJECT_MISMATCH', 'Channel input does not belong to the trusted project');
  if (![request.request_id, request.conversation_key, request.source.name, request.source.external_channel_id].every(value => value.trim())) fail('TRIAGE_REQUEST_INVALID', 'Channel identifiers cannot be blank');
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_REQUEST_BYTES || request.messages.reduce((total, item) => total + item.text.length, 0) > 20000) fail('TRIAGE_REQUEST_TOO_LARGE', 'Channel context exceeds the total size limit');
  const events = new Set(), messages = new Set();
  for (const item of request.messages) {
    if (events.has(item.event_id.toLowerCase()) || messages.has(item.message_id)) fail('TRIAGE_MESSAGES_INVALID', 'Each current message and evidence ID must be unique');
    events.add(item.event_id.toLowerCase()); messages.add(item.message_id);
    if (!item.message_id.trim() || !validTime(item.sent_at) || !validTime(item.changed_at)) fail('TRIAGE_MESSAGES_INVALID', 'Message identifiers and zoned dates must be valid');
    if (item.kind === 'deleted' && item.text !== '') fail('TRIAGE_MESSAGES_INVALID', 'Deleted messages cannot supply active evidence text');
    if (item.url !== null) {
      let url; try { url = new URL(item.url); } catch { fail('TRIAGE_MESSAGES_INVALID', 'Source URL must be HTTP(S)'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail('TRIAGE_MESSAGES_INVALID', 'Source URL must be HTTP(S) without credentials');
    }
  }
  return request;
}
function validateChannelTriageResult(result, request, expectedProjectId) {
  validateChannelTriageRequest(request, expectedProjectId);
  if (!resultSchema(result) || ![result.title, result.summary, result.reason].every(value => value.trim())) fail('TRIAGE_RESULT_INVALID', 'Channel analysis does not match its schema');
  if (KINDS[result.classification] !== result.record_kind) fail('TRIAGE_KIND_MISMATCH', 'Record kind does not match its classification');
  const allowed = new Set(request.messages.filter(item => item.kind !== 'deleted').map(item => item.event_id));
  if (result.evidence_event_ids.some(id => !allowed.has(id)) || new Set(result.evidence_event_ids.map(id => id.toLowerCase())).size !== result.evidence_event_ids.length ||
      (result.classification !== 'noise' && result.evidence_event_ids.length === 0)) fail('TRIAGE_EVIDENCE_MISMATCH', 'Analysis requires evidence from active messages in this project snapshot');
  return structuredClone(result);
}
function validateChannelTriageResponse(envelope, request, expectedProjectId) {
  validateChannelTriageRequest(request, expectedProjectId);
  const traceId = envelope?.traceId;
  if (!envelope || !['ok', 'succeeded'].includes(envelope.status) || envelope.rawStatus !== 'completed' || envelope.failure || envelope.error ||
      typeof traceId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(traceId)) fail('TRIAGE_RUN_NOT_SUCCEEDED', 'Channel run has not completed successfully', traceId);
  if (!Array.isArray(envelope.outputs) || envelope.outputs.length !== 1 || !manifest.agent_id ||
      envelope.outputs[0]?.agentId !== manifest.agent_id || typeof envelope.outputs[0]?.text !== 'string') fail('TRIAGE_OUTPUTS_INCOMPLETE', 'The published channel agent must complete exactly once', traceId);
  let result, agentOutput;
  try { result = typeof envelope.output === 'string' ? JSON.parse(envelope.output) : envelope.output; agentOutput = JSON.parse(envelope.outputs[0].text); }
  catch { fail('TRIAGE_OUTPUT_INVALID', 'Final channel output must be JSON', traceId); }
  if (!isDeepStrictEqual(result, agentOutput)) fail('TRIAGE_OUTPUT_MISMATCH', 'Final output differs from the published agent output', traceId);
  try { return { traceId, result: validateChannelTriageResult(result, request, expectedProjectId) }; }
  catch (error) { error.traceId = traceId; throw error; }
}

/** Analysis only. This client never sends channel messages or replays uncertain requests. */
async function runChannelTriage(request, { expectedProjectId, token, timeoutMs = 45000, fetchImpl = fetch } = {}) {
  validateChannelTriageRequest(request, expectedProjectId);
  if (manifest.publication_status !== 'published' || !manifest.published_version_id || !manifest.agent_id) fail('TRIAGE_NOT_PUBLISHED', 'The Nora channel flow has not been published');
  if (typeof token !== 'string' || !token.trim()) fail('TRIAGE_AUTH_REQUIRED', 'A server-side channel token is required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 90000) fail('TRIAGE_TIMEOUT_INVALID', 'Timeout must be between 1000 and 90000 milliseconds');
  const frozen = structuredClone(request), body = new FormData(), signal = AbortSignal.timeout(timeoutMs);
  body.set('input', JSON.stringify(frozen)); body.set('variables', JSON.stringify({ channel_request: frozen }));
  let response;
  try { response = await fetchImpl(FLOW_URL, { method: 'POST', redirect: 'error', signal, headers: { Accept: 'application/json', Authorization: token }, body }); }
  catch { fail('TRIAGE_TRANSPORT_UNKNOWN', 'Transport failed; completion is unknown. No automatic retry was performed.'); }
  if (!response.ok) fail('TRIAGE_HTTP_' + response.status, 'Nora rejected the channel request (HTTP ' + response.status + ')');
  let envelope;
  try { envelope = await response.json(); }
  catch (error) {
    if (signal.aborted || ['AbortError', 'TimeoutError'].includes(error?.name)) fail('TRIAGE_TRANSPORT_UNKNOWN', 'Transport failed; completion is unknown. No automatic retry was performed.');
    fail('TRIAGE_RESPONSE_INVALID', 'Nora returned non-JSON');
  }
  return validateChannelTriageResponse(envelope, frozen, expectedProjectId);
}

module.exports = { FLOW_URL, FLOW_SLUG, MAX_REQUEST_BYTES, validateChannelTriageRequest, validateChannelTriageResult, validateChannelTriageResponse, runChannelTriage };
