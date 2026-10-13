'use strict';

const Ajv2020 = require('ajv/dist/2020').default;
const { isDeepStrictEqual } = require('node:util');
const manifest = require('../registration/manifest.json');
const ajv = new Ajv2020({ strict: true, allErrors: true, ownProperties: true, coerceTypes: false, removeAdditional: false, useDefaults: false });
const requestSchema = ajv.compile(require('../registration/request.schema.json'));
const suggestionSchema = ajv.compile(require('../registration/suggestion.schema.json'));
const FLOW_URL = manifest.api.url;
const FLOW_SLUG = manifest.slug;
const MAX_REQUEST_BYTES = 256 * 1024;

function fail(code, message, traceId) {
  const error = Object.assign(new Error(message), { code });
  if (typeof traceId === 'string' && traceId.length <= 200) error.traceId = traceId;
  throw error;
}

function validateRegistrationRequest(request, expectedProjectId) {
  if (typeof expectedProjectId !== 'string' || !expectedProjectId.trim()) fail('REGISTRATION_PROJECT_CONTEXT_REQUIRED', 'A trusted project context is required');
  if (!requestSchema(request)) fail('REGISTRATION_REQUEST_INVALID', 'Registration request does not match its schema');
  if (request.project_id !== expectedProjectId) fail('PROJECT_MISMATCH', 'Registration request does not belong to the trusted project');
  if (!request.title.trim() || !request.request_id.trim()) fail('REGISTRATION_REQUEST_INVALID', 'Title and request ID cannot be blank');
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_REQUEST_BYTES) fail('REGISTRATION_REQUEST_TOO_LARGE', 'Registration context exceeds the total size limit');
  const domainIds = new Set(request.domains.map(domain => domain.id));
  const documentIds = new Set(request.documents.map(document => document.id));
  if (domainIds.size !== request.domains.length || documentIds.size !== request.documents.length) fail('REGISTRATION_CANDIDATES_INVALID', 'Candidate IDs must be unique');
  if (request.domains.some(domain => !domain.name.trim()) || request.documents.some(document => !document.title.trim() || !domainIds.has(document.domain_id))) fail('REGISTRATION_CANDIDATES_INVALID', 'Every candidate document must belong to a supplied domain');
  if (request.selected_domain_id != null && !domainIds.has(request.selected_domain_id)) fail('REGISTRATION_DOMAIN_MISMATCH', 'Selected domain is outside the project context');
  return request;
}

function validateRegistrationSuggestion(suggestion, request, expectedProjectId) {
  validateRegistrationRequest(request, expectedProjectId);
  if (!suggestionSchema(suggestion) || !suggestion.reason.trim()) fail('REGISTRATION_SUGGESTION_INVALID', 'Registration suggestion does not match its schema');
  if (suggestion.record_kind !== request.record_kind) fail('REGISTRATION_KIND_MISMATCH', 'The model cannot change the explicitly selected record type');
  if (suggestion.domain_id !== null && !request.domains.some(domain => domain.id === suggestion.domain_id)) fail('REGISTRATION_DOMAIN_MISMATCH', 'Suggested domain is outside the supplied project context');
  if (request.selected_domain_id != null && suggestion.domain_id !== request.selected_domain_id) fail('REGISTRATION_DOMAIN_MISMATCH', 'The model cannot override the selected domain');
  if (!request.text.trim() && (suggestion.action !== 'new_document' || suggestion.confidence > 0.5)) fail('REGISTRATION_CONTENT_REQUIRED', 'Metadata alone cannot establish revision identity or high confidence');
  if (suggestion.action === 'new_document') {
    if (suggestion.document_id !== null) fail('REGISTRATION_DOCUMENT_MISMATCH', 'A new document cannot point at an existing document');
  } else {
    const document = request.documents.find(item => item.id === suggestion.document_id);
    if (!document || !suggestion.domain_id || document.domain_id !== suggestion.domain_id) fail('REGISTRATION_DOCUMENT_MISMATCH', 'A revision must belong to an existing document in the same domain');
    if (document.record_kind !== request.record_kind) fail('REGISTRATION_KIND_MISMATCH', 'A revision must preserve its logical record type');
  }
  return structuredClone(suggestion);
}

function validateRegistrationResponse(envelope, request, expectedProjectId) {
  validateRegistrationRequest(request, expectedProjectId);
  const traceId = envelope?.traceId;
  if (!envelope || !['ok', 'succeeded'].includes(envelope.status) || envelope.rawStatus !== 'completed' || envelope.failure || envelope.error ||
      typeof traceId !== 'string' || !traceId.trim() || traceId.length > 200) fail('REGISTRATION_RUN_NOT_SUCCEEDED', 'Registration run has not completed successfully', traceId);
  if (!Array.isArray(envelope.outputs) || envelope.outputs.length !== 1 ||
      !manifest.agent_id || envelope.outputs[0]?.agentId !== manifest.agent_id || typeof envelope.outputs[0]?.text !== 'string') {
    fail('REGISTRATION_OUTPUTS_INCOMPLETE', 'The published registration agent must complete exactly once', traceId);
  }
  let suggestion, agentOutput;
  try {
    suggestion = typeof envelope.output === 'string' ? JSON.parse(envelope.output) : envelope.output;
    agentOutput = JSON.parse(envelope.outputs[0].text);
  } catch { fail('REGISTRATION_OUTPUT_INVALID', 'Final registration output must be JSON', traceId); }
  if (!isDeepStrictEqual(suggestion, agentOutput)) fail('REGISTRATION_OUTPUT_MISMATCH', 'Final output differs from the published agent output', traceId);
  try { return { traceId, suggestion: validateRegistrationSuggestion(suggestion, request, expectedProjectId) }; }
  catch (error) { error.traceId = traceId; throw error; }
}

/** Published classification only. No registration, baseline update or automatic replay. */
async function runRegistrationSuggestion(request, { expectedProjectId, token, fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  validateRegistrationRequest(request, expectedProjectId);
  if (manifest.publication_status !== 'published' || !manifest.published_version_id || !manifest.agent_id) fail('REGISTRATION_NOT_PUBLISHED', 'The Nora registration flow has not been published');
  if (typeof token !== 'string' || !token.trim()) fail('REGISTRATION_AUTH_REQUIRED', 'A server-side registration token is required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) fail('REGISTRATION_TIMEOUT_INVALID', 'Timeout must be between 1000 and 120000 milliseconds');
  const frozen = structuredClone(request);
  const body = new FormData();
  body.set('input', JSON.stringify(frozen));
  body.set('variables', JSON.stringify({ registration_request: frozen }));
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(FLOW_URL, { method: 'POST', redirect: 'error', signal,
      headers: { Accept: 'application/json', Authorization: token }, body });
  } catch { fail('REGISTRATION_TRANSPORT_UNKNOWN', 'Transport failed; completion is unknown. No automatic retry was performed.'); }
  if (!response.ok) fail('REGISTRATION_HTTP_' + response.status, 'Nora rejected the registration request (HTTP ' + response.status + ')');
  let envelope;
  try { envelope = await response.json(); }
  catch (error) {
    if (signal.aborted || ['AbortError', 'TimeoutError'].includes(error?.name)) {
      fail('REGISTRATION_TRANSPORT_UNKNOWN', 'Transport failed; completion is unknown. No automatic retry was performed.');
    }
    fail('REGISTRATION_RESPONSE_INVALID', 'Nora returned non-JSON');
  }
  return validateRegistrationResponse(envelope, frozen, expectedProjectId);
}

module.exports = { FLOW_URL, FLOW_SLUG, MAX_REQUEST_BYTES, validateRegistrationRequest, validateRegistrationSuggestion,
  validateRegistrationResponse, runRegistrationSuggestion };
