'use strict';
const Ajv = require('ajv');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const manifest = require('./manifest.json');
const ajv = new Ajv({ allErrors: true, strict: true });
const requestValidator = ajv.compile(require('./request.schema.json'));
const resultValidator = ajv.compile(require('./result.schema.json'));
const APPROVAL_MARKER = '\n\n# Upstream output (업무 근거 분석)\n';
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function check(validate, value, code) { if (!validate(value)) fail(code, 'Context schema validation failed: ' + ajv.errorsText(validate.errors)); return value; }
function validateRequest(request,expectedProjectId){
 check(requestValidator,request,'WORK_AI_REQUEST_INVALID');
 if(!expectedProjectId||request.project_id!==expectedProjectId)fail('WORK_AI_PROJECT_MISMATCH','Trusted project identity required');
 if(JSON.stringify(request).length>500000)fail('WORK_AI_REQUEST_TOO_LARGE','Reduce analysis scope');
 for(const [key,values]of [['sources',request.sources.map(s=>s.source_id)],['coverage',request.coverage.map(s=>s.id)],['member_ids',request.member_ids]])if(new Set(values).size!==values.length)fail('WORK_AI_DUPLICATE','Duplicate '+key);
 return request;
}
function validateCandidate(candidate,request,expectedProjectId){
 validateRequest(request,expectedProjectId);check(resultValidator,candidate,'WORK_AI_CANDIDATE_INVALID');
 for(const key of ['schema_version','request_id','project_id','context_version','target_type','target_id','input_sha256'])if(candidate[key]!==request[key])fail('WORK_AI_IDENTITY_MISMATCH','Analysis identity changed');
 // Validate the fields that AINS will persist before a human approves the native gate.
 // The published JSON schema is intentionally only the transport shape.
 if(!candidate.summary.trim())fail('WORK_AI_APPLY_FORMAT_INVALID','Analysis summary must not be blank');
 for(const item of candidate.findings)if(!item.source_ids.length)fail('WORK_AI_FINDING_EVIDENCE_REQUIRED','Every finding must cite supplied evidence');
 for(const item of candidate.resources){
   const key=item.key.trim();
   if(item.kind!=='path'&&(!key||item.key.length>300))fail('WORK_AI_RESOURCE_INVALID','Feature and policy keys must be 1–300 characters');
   if(item.kind==='path'){
     const path=key.replaceAll('\\','/').replace(/\/+$/,'');
     if(!path||path.startsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..')||/[\x00-\x1f*?\[\]{}]/.test(path))fail('WORK_AI_RESOURCE_INVALID','Use a relative repository path without wildcard or traversal');
   }
 }
 const persistable=[candidate.summary,...candidate.findings.flatMap(x=>[x.code,x.message,x.question]),...candidate.resources.flatMap(x=>[x.key,x.reason]),...candidate.coverage.map(x=>x.reason)];
 if(persistable.some(x=>!x.isWellFormed()||x.includes('\0')))fail('WORK_AI_APPLY_FORMAT_INVALID','Unsupported characters in analysis result');
 const sources=new Set(request.sources.map(s=>s.source_id)),requirements=new Set(request.coverage.map(x=>x.id));
 for(const item of [...candidate.findings,...candidate.resources,...candidate.coverage])if(item.source_ids.some(s=>!sources.has(s)))fail('WORK_AI_EVIDENCE_INVALID','Unknown source citation');
 for(const item of candidate.findings)if(item.code==='POLICY_CONFLICT'&&new Set(item.source_ids).size<2)fail('WORK_AI_CONFLICT_EVIDENCE_REQUIRED','Two policy sources required');
 for(const item of candidate.coverage)if(!requirements.has(item.requirement_id)||(item.status==='satisfied'&&!item.source_ids.length))fail('WORK_AI_COVERAGE_INVALID','Coverage must cite a known criterion and evidence');
 if(candidate.assignee_id!==null&&!request.member_ids.includes(candidate.assignee_id))fail('WORK_AI_ASSIGNEE_INVALID','Unknown project member');
 if(new Set(candidate.coverage.map(x=>x.requirement_id)).size!==candidate.coverage.length)fail('WORK_AI_COVERAGE_INVALID','Duplicate criterion');
 return candidate;
}
function field(row, camel, snake = camel) {
  if (row[camel] !== undefined && row[snake] !== undefined && row[camel] !== row[snake]) fail('WORK_AI_APPROVAL_INVALID', 'Approval field aliases disagree');
  return row[camel] ?? row[snake];
}
function normalizeApproval(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('WORK_AI_APPROVAL_INVALID', 'An approval row is required');
  const value = { id: row.id, tenantId: field(row, 'tenantId', 'tenant_id'), traceId: field(row, 'traceId', 'trace_id'), graphSlug: field(row, 'graphSlug', 'graph_slug'), agentId: field(row, 'agentId', 'agent_id'), kind: row.kind, status: row.status, message: row.message, reason: row.reason ?? null, decidedByExternal: field(row, 'decidedByExternal', 'decided_by_external') ?? null, createdAt: field(row, 'createdAt', 'created_at'), decidedAt: field(row, 'decidedAt', 'decided_at') ?? null };
  if (typeof value.id !== 'string' || !/^apv_[A-Za-z0-9_-]{16,128}$/.test(value.id) || typeof value.traceId !== 'string' || !/^trc_[A-Za-z0-9_-]{8,128}$/.test(value.traceId) || value.tenantId !== manifest.workspace_id || value.graphSlug !== manifest.slug || value.agentId !== manifest.agents.finalize || value.kind !== 'agent' || !['pending','approved','rejected','expired'].includes(value.status) || typeof value.message !== 'string' || value.message.length > 1000000) fail('WORK_AI_APPROVAL_INVALID', 'Approval does not belong to this hosted Context gate');
  return value;
}
function parseReviewedCandidate(message, request, expectedProjectId) {
  if (typeof message !== 'string') fail('WORK_AI_APPROVAL_MESSAGE_INVALID', 'Missing reviewed candidate');
  let candidate;
  try { candidate = JSON.parse(message); }
  catch {
    // Parse the JSON user request before selecting the fixed handoff boundary;
    // untrusted source text may itself contain delimiter-like text.
    const prefix = '# Original user request\n';
    if (!message.startsWith(prefix)) fail('WORK_AI_APPROVAL_MESSAGE_INVALID', 'Unexpected Nora approval message format');
    const candidates = []; let start = prefix.length;
    while ((start = message.indexOf(APPROVAL_MARKER, start)) !== -1) {
      try {
        const original = JSON.parse(message.slice(prefix.length, start));
        const output = JSON.parse(message.slice(start + APPROVAL_MARKER.length));
        if (isDeepStrictEqual(original, request)) candidates.push(output);
      } catch {}
      start += APPROVAL_MARKER.length;
    }
    if (candidates.length !== 1) fail('WORK_AI_APPROVAL_MESSAGE_INVALID', 'Approval is not bound to the exact source request');
    candidate = candidates[0];
  }
  return validateCandidate(candidate, request, expectedProjectId);
}
/** For server-side job correlation only, never an authorization decision. */
function extractApprovalRequest(message) {
  const prefix = '# Original user request\n';
  if (typeof message !== 'string' || !message.startsWith(prefix) || message.length > 1000000) fail('WORK_AI_APPROVAL_MESSAGE_INVALID', 'Missing native request envelope');
  const matches = []; let start = prefix.length;
  while ((start = message.indexOf(APPROVAL_MARKER, start)) !== -1) {
    try { const request = JSON.parse(message.slice(prefix.length, start)); if (requestValidator(request)) matches.push(request); } catch {}
    start += APPROVAL_MARKER.length;
  }
  if (matches.length !== 1) fail('WORK_AI_APPROVAL_MESSAGE_INVALID', 'Could not correlate native approval request');
  return matches[0];
}
function validateApproval(row, request, expectedProjectId, { expectedTraceId, expectedStatus } = {}) {
  const approval = normalizeApproval(row);
  if (expectedTraceId && approval.traceId !== expectedTraceId) fail('WORK_AI_TRACE_MISMATCH', 'Approval belongs to a different execution');
  if (expectedStatus && approval.status !== expectedStatus) fail('WORK_AI_APPROVAL_NOT_' + expectedStatus.toUpperCase(), 'Native approval has not reached the expected state');
  const candidate = parseReviewedCandidate(approval.message, request, expectedProjectId);
  return { approval, candidate };
}
function validateCompletedResult(envelope, request, expectedProjectId, { approval, reviewedCandidate } = {}) {
  validateRequest(request, expectedProjectId);
  const run = envelope?.kind === 'flowRun' ? envelope.run : envelope;
  if (envelope?.kind === 'flowRun' && (envelope.slug !== manifest.slug || envelope.ok !== true)) fail('WORK_AI_RUN_INVALID', 'Unexpected flow response');
  if (!run || !['ok','succeeded'].includes(run.status) || run.rawStatus !== 'completed' || run.failure || run.error || typeof run.traceId !== 'string') fail('WORK_AI_RUN_NOT_COMPLETED', 'Only a completed native-gated run may be merged');
  const reviewed = validateApproval(approval, request, expectedProjectId, { expectedTraceId: run.traceId, expectedStatus: 'approved' });
  if (!reviewedCandidate || !isDeepStrictEqual(reviewed.candidate, reviewedCandidate)) fail('WORK_AI_REVIEWED_CANDIDATE_MISMATCH', 'Saved candidate differs from the candidate at native approval');
  if (!Array.isArray(run.outputs) || run.outputs.length !== 2 || run.outputs[0]?.agentId !== manifest.agents.analyze || run.outputs[1]?.agentId !== manifest.agents.finalize) fail('WORK_AI_RUN_OUTPUTS_INVALID', 'Both configured agents must finish in order');
  function parse(v) { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { fail('WORK_AI_RESULT_INVALID', 'Context final output must be JSON'); } }
  const result = parse(run.output), first = parse(run.outputs[0].text), last = parse(run.outputs[1].text);
  validateCandidate(result, request, expectedProjectId);
  if (!isDeepStrictEqual(result, reviewedCandidate) || !isDeepStrictEqual(first, reviewedCandidate) || !isDeepStrictEqual(last, reviewedCandidate)) fail('WORK_AI_APPROVED_CONTENT_CHANGED', 'Agent changed content after review; obtain a fresh review');
  return { traceId: run.traceId, candidate: structuredClone(result), approvalId: reviewed.approval.id };
}
function requestFingerprint(request, expectedProjectId) { validateRequest(request, expectedProjectId); return createHash('sha256').update(JSON.stringify(request)).digest('hex'); }
module.exports = { validateRequest, validateCandidate, normalizeApproval, parseReviewedCandidate, extractApprovalRequest, validateApproval, validateCompletedResult, requestFingerprint, APPROVAL_MARKER };
