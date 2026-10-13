'use strict';
const Ajv = require('ajv');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const manifest = require('./manifest.json');
const ajv = new Ajv({ allErrors: true, strict: true });
const requestValidator = ajv.compile(require('./request.schema.json'));
const resultValidator = ajv.compile(require('./result.schema.json'));
const APPROVAL_MARKER = '\n\n# Upstream output (근거 분석 · Context 후보 작성)\n';
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function check(validate, value, code) { if (!validate(value)) fail(code, 'Context schema validation failed: ' + ajv.errorsText(validate.errors)); return value; }
function validateRequest(request, expectedProjectId) {
  check(requestValidator, request, 'CONTEXT_REQUEST_INVALID');
  if (!expectedProjectId || request.project_id !== expectedProjectId) fail('CONTEXT_PROJECT_MISMATCH', 'Trusted project identity is required');
  if (JSON.stringify(request).length > 400000) fail('CONTEXT_REQUEST_TOO_LARGE', 'Choose a smaller set of source evidence');
  const ids = new Set();
  for (const source of request.sources) {
    if (ids.has(source.source_id)) fail('CONTEXT_SOURCE_DUPLICATE', 'Source identifiers must be unique');
    ids.add(source.source_id);
    if (source.occurred_at !== null && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(source.occurred_at) || !Number.isFinite(Date.parse(source.occurred_at)))) fail('CONTEXT_SOURCE_TIME_INVALID', 'Source times must be timezone-qualified ISO timestamps');
  }
  if (new Set(request.current_items.map(x => x.item_id)).size !== request.current_items.length) fail('CONTEXT_ITEM_DUPLICATE', 'Existing context identifiers must be unique');
  return request;
}
function validateCandidate(candidate, request, expectedProjectId) {
  validateRequest(request, expectedProjectId);
  check(resultValidator, candidate, 'CONTEXT_CANDIDATE_INVALID');
  for (const key of ['schema_version', 'request_id', 'project_id', 'context_version']) if (candidate[key] !== request[key]) fail('CONTEXT_IDENTITY_MISMATCH', 'Candidate identity or context version changed');
  const sources = new Map(request.sources.map(x => [x.source_id, x.content]));
  const items = new Set(request.current_items.map(x => x.item_id));
  for (const item of candidate.items) {
    for (const evidence of item.evidence) if (!sources.has(evidence.source_id) || !evidence.quote.trim() || !sources.get(evidence.source_id).includes(evidence.quote)) fail('CONTEXT_EVIDENCE_INVALID', 'Candidate evidence must exactly quote the supplied source');
    for (const id of item.conflicts_with) if (!items.has(id)) fail('CONTEXT_CONFLICT_REFERENCE_INVALID', 'Conflict references must identify existing context');
    if (item.kind === 'conflict' && !item.conflicts_with.length) fail('CONTEXT_CONFLICT_REFERENCE_REQUIRED', 'Conflict candidates must identify affected existing context');
  }
  return candidate;
}
function field(row, camel, snake = camel) {
  if (row[camel] !== undefined && row[snake] !== undefined && row[camel] !== row[snake]) fail('CONTEXT_APPROVAL_INVALID', 'Approval field aliases disagree');
  return row[camel] ?? row[snake];
}
function normalizeApproval(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('CONTEXT_APPROVAL_INVALID', 'An approval row is required');
  const value = { id: row.id, tenantId: field(row, 'tenantId', 'tenant_id'), traceId: field(row, 'traceId', 'trace_id'), graphSlug: field(row, 'graphSlug', 'graph_slug'), agentId: field(row, 'agentId', 'agent_id'), kind: row.kind, status: row.status, message: row.message, reason: row.reason ?? null, decidedByExternal: field(row, 'decidedByExternal', 'decided_by_external') ?? null, createdAt: field(row, 'createdAt', 'created_at'), decidedAt: field(row, 'decidedAt', 'decided_at') ?? null };
  if (typeof value.id !== 'string' || !/^apv_[A-Za-z0-9_-]{16,128}$/.test(value.id) || typeof value.traceId !== 'string' || !/^trc_[A-Za-z0-9_-]{8,128}$/.test(value.traceId) || value.tenantId !== manifest.workspace_id || value.graphSlug !== manifest.slug || value.agentId !== manifest.agents.finalize || value.kind !== 'agent' || !['pending','approved','rejected','expired'].includes(value.status) || typeof value.message !== 'string' || value.message.length > 1000000) fail('CONTEXT_APPROVAL_INVALID', 'Approval does not belong to this hosted Context gate');
  return value;
}
function parseReviewedCandidate(message, request, expectedProjectId) {
  if (typeof message !== 'string') fail('CONTEXT_APPROVAL_MESSAGE_INVALID', 'Missing reviewed candidate');
  let candidate;
  try { candidate = JSON.parse(message); }
  catch {
    // Parse the JSON user request before selecting the fixed handoff boundary;
    // untrusted source text may itself contain delimiter-like text.
    const prefix = '# Original user request\n';
    if (!message.startsWith(prefix)) fail('CONTEXT_APPROVAL_MESSAGE_INVALID', 'Unexpected Nora approval message format');
    const candidates = []; let start = prefix.length;
    while ((start = message.indexOf(APPROVAL_MARKER, start)) !== -1) {
      try {
        const original = JSON.parse(message.slice(prefix.length, start));
        const output = JSON.parse(message.slice(start + APPROVAL_MARKER.length));
        if (isDeepStrictEqual(original, request)) candidates.push(output);
      } catch {}
      start += APPROVAL_MARKER.length;
    }
    if (candidates.length !== 1) fail('CONTEXT_APPROVAL_MESSAGE_INVALID', 'Approval is not bound to the exact source request');
    candidate = candidates[0];
  }
  return validateCandidate(candidate, request, expectedProjectId);
}
/** For server-side job correlation only, never an authorization decision. */
function extractApprovalRequest(message) {
  const prefix = '# Original user request\n';
  if (typeof message !== 'string' || !message.startsWith(prefix) || message.length > 1000000) fail('CONTEXT_APPROVAL_MESSAGE_INVALID', 'Missing native request envelope');
  const matches = []; let start = prefix.length;
  while ((start = message.indexOf(APPROVAL_MARKER, start)) !== -1) {
    try { const request = JSON.parse(message.slice(prefix.length, start)); if (requestValidator(request)) matches.push(request); } catch {}
    start += APPROVAL_MARKER.length;
  }
  if (matches.length !== 1) fail('CONTEXT_APPROVAL_MESSAGE_INVALID', 'Could not correlate native approval request');
  return matches[0];
}
function validateApproval(row, request, expectedProjectId, { expectedTraceId, expectedStatus } = {}) {
  const approval = normalizeApproval(row);
  if (expectedTraceId && approval.traceId !== expectedTraceId) fail('CONTEXT_TRACE_MISMATCH', 'Approval belongs to a different execution');
  if (expectedStatus && approval.status !== expectedStatus) fail('CONTEXT_APPROVAL_NOT_' + expectedStatus.toUpperCase(), 'Native approval has not reached the expected state');
  const candidate = parseReviewedCandidate(approval.message, request, expectedProjectId);
  return { approval, candidate };
}
function validateCompletedResult(envelope, request, expectedProjectId, { approval, reviewedCandidate } = {}) {
  validateRequest(request, expectedProjectId);
  const run = envelope?.kind === 'flowRun' ? envelope.run : envelope;
  if (envelope?.kind === 'flowRun' && (envelope.slug !== manifest.slug || envelope.ok !== true)) fail('CONTEXT_RUN_INVALID', 'Unexpected flow response');
  if (!run || !['ok','succeeded'].includes(run.status) || run.rawStatus !== 'completed' || run.failure || run.error || typeof run.traceId !== 'string') fail('CONTEXT_RUN_NOT_COMPLETED', 'Only a completed native-gated run may be merged');
  const reviewed = validateApproval(approval, request, expectedProjectId, { expectedTraceId: run.traceId, expectedStatus: 'approved' });
  if (!reviewedCandidate || !isDeepStrictEqual(reviewed.candidate, reviewedCandidate)) fail('CONTEXT_REVIEWED_CANDIDATE_MISMATCH', 'Saved candidate differs from the candidate at native approval');
  if (!Array.isArray(run.outputs) || run.outputs.length !== 2 || run.outputs[0]?.agentId !== manifest.agents.analyze || run.outputs[1]?.agentId !== manifest.agents.finalize) fail('CONTEXT_RUN_OUTPUTS_INVALID', 'Both configured agents must finish in order');
  function parse(v) { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { fail('CONTEXT_RESULT_INVALID', 'Context final output must be JSON'); } }
  const result = parse(run.output), first = parse(run.outputs[0].text), last = parse(run.outputs[1].text);
  validateCandidate(result, request, expectedProjectId);
  if (!isDeepStrictEqual(result, reviewedCandidate) || !isDeepStrictEqual(first, reviewedCandidate) || !isDeepStrictEqual(last, reviewedCandidate)) fail('CONTEXT_APPROVED_CONTENT_CHANGED', 'Agent changed content after review; obtain a fresh review');
  return { traceId: run.traceId, candidate: structuredClone(result), approvalId: reviewed.approval.id };
}
function requestFingerprint(request, expectedProjectId) { validateRequest(request, expectedProjectId); return createHash('sha256').update(JSON.stringify(request)).digest('hex'); }
module.exports = { validateRequest, validateCandidate, normalizeApproval, parseReviewedCandidate, extractApprovalRequest, validateApproval, validateCompletedResult, requestFingerprint, APPROVAL_MARKER };
