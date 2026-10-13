'use strict';
/** Server-only adapter. Approval IDs and decide URLs are capability credentials. */
const manifest = require('./manifest.json');
const { isDeepStrictEqual } = require('node:util');
const { validateRequest, validateApproval, normalizeApproval, extractApprovalRequest } = require('./contract');
const ORIGIN = 'https://platform.nora.my';
const APPROVAL_ROOT = ORIGIN + '/api/v1/' + manifest.workspace_id + '/approvals/';
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function approvalUrl(id, decide = false) {
  if (typeof id !== 'string' || !/^apv_[A-Za-z0-9_-]{16,128}$/.test(id)) fail('CONTEXT_APPROVAL_ID_INVALID', 'Invalid native approval identity');
  return APPROVAL_ROOT + encodeURIComponent(id) + (decide ? '/decide' : '');
}
async function parseResponse(response, code) {
  try { return await response.json(); } catch { fail(code, 'Nora returned a non-JSON response'); }
}
/**
 * Native approval keeps this request open. Persist the request before starting;
 * the webhook handler records the gate while this worker awaits completion.
 * A timeout or restart is an UNKNOWN outcome, never permission to auto-replay.
 * This returns a raw run; validateCompletedResult requires the saved approval.
 */
async function startContextReview(request, { expectedProjectId, token, fetchImpl = fetch, timeoutMs = 240000, signal } = {}) {
  validateRequest(request, expectedProjectId);
  if (!token || typeof token !== 'string' || !token.trim()) fail('CONTEXT_AUTH_REQUIRED', 'Set the server-side Context flow token');
  const frozen = structuredClone(request);
  const form = new FormData(); form.set('input', JSON.stringify(frozen)); form.set('variables', JSON.stringify({ context_request: frozen }));
  let response;
  try { response = await fetchImpl(manifest.api.url, { method: 'POST', redirect: 'error', signal: signal ?? AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json', Authorization: token }, body: form }); }
  catch { fail('CONTEXT_TRANSPORT_UNKNOWN', 'Nora completion is unknown; reconcile the recorded native execution before retrying'); }
  if (!response.ok) fail('CONTEXT_HTTP_' + response.status, 'Nora rejected the Context request (HTTP ' + response.status + ')');
  return parseResponse(response, 'CONTEXT_RESPONSE_INVALID');
}
/** Construct the known Nora endpoint; NEVER fetch a URL supplied in a webhook. */
async function getApproval(id, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const url = approvalUrl(id); let response;
  try { response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } }); }
  catch { fail('CONTEXT_APPROVAL_LOOKUP_FAILED', 'Could not verify the native approval'); }
  if (!response.ok) fail('CONTEXT_APPROVAL_HTTP_' + response.status, 'Native approval lookup failed (HTTP ' + response.status + ')');
  const row = await parseResponse(response, 'CONTEXT_APPROVAL_RESPONSE_INVALID');
  if (row?.id !== id) fail('CONTEXT_APPROVAL_RESPONSE_INVALID', 'Native approval identity differs from the requested ticket');
  // Hosted HTTP rows omit tenantId; the fixed tenant-scoped endpoint binds it.
  return normalizeApproval({ tenantId: manifest.workspace_id, ...row });
}
/**
 * Call only after authenticating/authorizing the AINS user and checking current
 * context/source versions. The native record, not the incoming webhook, is truth.
 */
async function verifyApprovalWebhook(payload, request, { expectedProjectId, expectedTraceId, fetchImpl = fetch } = {}) {
  if (!payload || typeof payload !== 'object') fail('CONTEXT_WEBHOOK_INVALID', 'A native approval notification is required');
  const row = await getApproval(payload.id, { fetchImpl });
  for (const [camel, snake] of [['traceId','trace_id'],['graphSlug','graph_slug'],['agentId','agent_id'],['tenantId','tenant_id'],['kind','kind'],['message','message']]) {
    const a = payload[camel], b = payload[snake];
    if ((a !== undefined && a !== row[camel]) || (b !== undefined && b !== row[camel])) fail('CONTEXT_WEBHOOK_MISMATCH', 'Webhook differs from the native approval record');
  }
  return validateApproval(row, request, expectedProjectId, { expectedTraceId });
}
async function decideApproval(id, decision, { request, expectedProjectId, expectedTraceId, reason = '', decidedByExternal, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  if (!['approved','rejected'].includes(decision)) fail('CONTEXT_DECISION_INVALID', 'Approval decision must be approved or rejected');
  if (typeof reason !== 'string' || reason.length > 4000 || typeof decidedByExternal !== 'string' || !decidedByExternal.trim() || decidedByExternal.length > 160) fail('CONTEXT_DECIDER_REQUIRED', 'An authenticated reviewer and a bounded note are required');
  const existing = await getApproval(id, { fetchImpl, timeoutMs });
  function validateDecisionRow(row) {
    if (decision === 'approved') return validateApproval(row, request, expectedProjectId, { expectedTraceId });
    // A malformed candidate must still be rejectable. Bind the immutable original
    // request and execution, but do not require valid candidate content to reject.
    validateRequest(request, expectedProjectId);
    if ((expectedTraceId && row.traceId !== expectedTraceId) || !isDeepStrictEqual(extractApprovalRequest(row.message), request)) fail('CONTEXT_APPROVAL_MESSAGE_INVALID', 'Cannot reject an unrelated native approval');
  }
  validateDecisionRow(existing);
  if (existing.status !== 'pending') {
    if (existing.status === decision && existing.decidedByExternal === decidedByExternal && (existing.reason ?? '') === reason) return { approval: existing, alreadyDecided: true };
    fail('CONTEXT_APPROVAL_ALREADY_DECIDED', 'Another decision already won the native approval');
  }
  let response;
  try { response = await fetchImpl(approvalUrl(id, true), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason, decidedByExternal }) }); }
  catch { fail('CONTEXT_DECISION_UNKNOWN', 'Decision delivery is unknown; read the native approval before retrying'); }
  if (!response.ok && response.status !== 409) fail('CONTEXT_DECISION_HTTP_' + response.status, 'Native decision failed (HTTP ' + response.status + ')');
  const row = normalizeApproval({ tenantId: manifest.workspace_id, ...await parseResponse(response, 'CONTEXT_DECISION_RESPONSE_INVALID') });
  validateDecisionRow(row);
  if (row.id !== id || row.status !== decision || row.decidedByExternal !== decidedByExternal || (row.reason ?? '') !== reason) fail('CONTEXT_APPROVAL_ALREADY_DECIDED', 'Native decision conflicts with the requested decision');
  return { approval: row, alreadyDecided: response.status === 409 };
}
module.exports = { startContextReview, getApproval, verifyApprovalWebhook, decideApproval, approvalUrl };
