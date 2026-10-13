'use strict';
const Ajv2020 = require('ajv/dist/2020').default;
const { isDeepStrictEqual } = require('node:util');
const manifest = require('../implementation-plan/manifest.json');
const ajv = new Ajv2020({ strict:true, allErrors:true, ownProperties:true, coerceTypes:false, removeAdditional:false, useDefaults:false });
const requestSchema = ajv.compile(require('../implementation-plan/request.schema.json'));
const resultSchema = ajv.compile(require('../implementation-plan/result.schema.json'));
const FLOW_URL=manifest.api.url, FLOW_SLUG=manifest.slug, MAX_REQUEST_BYTES=512*1024;
function fail(code,message,traceId) { const error=Object.assign(new Error(message),{code}); if(typeof traceId==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(traceId))error.traceId=traceId; throw error; }
function repositoryValid(repository) {
  let url; try{url=new URL(repository.url);}catch{return false;}
  const parts=url.pathname.split('/').filter(Boolean);
  const branch=repository.base_branch;
  return url.protocol==='https:'&&url.hostname==='github.com'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&parts.length===2&&
    parts.every(part=>/^[A-Za-z0-9_.-]+$/.test(part)&&!['.','..'].includes(part))&&!url.pathname.endsWith('/')&&
    !/^[.-]|[.\/]$|\.\.|@\{|[\\\s~^:?*\[]|\.lock(?:\/|$)|\/\//.test(branch)&&!branch.split('/').some(part=>part.startsWith('.'))&&branch!=='@';
}
function validateImplementationRequest(request,expectedProjectId) {
  if(typeof expectedProjectId!=='string'||!expectedProjectId.trim())fail('IMPLEMENTATION_PROJECT_CONTEXT_REQUIRED','A trusted project context is required');
  if(!requestSchema(request))fail('IMPLEMENTATION_REQUEST_INVALID','Planning input does not match its schema');
  if(request.project_id!==expectedProjectId)fail('PROJECT_MISMATCH','Planning input does not belong to the trusted project');
  if(!request.project.name.trim()||!repositoryValid(request.repository))fail('IMPLEMENTATION_REQUEST_INVALID','Project and GitHub repository identity must be valid');
  if(request.repository.status==='ready'&&!request.repository.head_sha)fail('IMPLEMENTATION_REPOSITORY_INVALID','A ready repository requires a verified commit');
  if(Buffer.byteLength(JSON.stringify(request),'utf8')>MAX_REQUEST_BYTES)fail('IMPLEMENTATION_REQUEST_TOO_LARGE','Planning context exceeds the total size limit');
  const revisions=new Set(),documents=new Set(); let length=0;
  for(const source of request.sources) {
    if(revisions.has(source.revision_id.toLowerCase())||documents.has(source.document_id.toLowerCase()))fail('IMPLEMENTATION_SOURCES_INVALID','Select one immutable revision per document');
    revisions.add(source.revision_id.toLowerCase()); documents.add(source.document_id.toLowerCase());
    if(!source.title.trim())fail('IMPLEMENTATION_SOURCES_INVALID','Source title cannot be blank');
    const segments=new Set();
    for(const segment of source.segments) {
      if(segments.has(segment.segment_id)||![segment.segment_id,segment.text,segment.locator.kind,segment.locator.label].every(value=>value.trim()))fail('IMPLEMENTATION_SOURCES_INVALID','Every source segment needs unique identity and evidence');
      segments.add(segment.segment_id); length+=segment.text.length;
    }
  }
  if(length>40000)fail('IMPLEMENTATION_REQUEST_TOO_LARGE','Source text exceeds 40,000 characters');
  return request;
}
function validateImplementationResult(result,request,expectedProjectId) {
  validateImplementationRequest(request,expectedProjectId);
  if(!resultSchema(result))fail('IMPLEMENTATION_RESULT_INVALID','Planning result does not match its schema');
  const strings=[result.title,result.summary,...result.assumptions,...result.test_strategy,...result.questions.map(item=>item.question)];
  const ids=new Set(result.tasks.map(task=>task.id));
  if(ids.size!==result.tasks.length)fail('IMPLEMENTATION_DEPENDENCIES_INVALID','Task IDs must be unique');
  const evidence=new Set(request.sources.flatMap(source=>source.segments.map(segment=>JSON.stringify([source.revision_id,segment.segment_id]))));
  for(const task of result.tasks) {
    strings.push(task.title,task.description,...task.acceptance_criteria);
    if(task.evidence.some(item=>!evidence.has(JSON.stringify([item.revision_id,item.segment_id]))))fail('IMPLEMENTATION_EVIDENCE_MISMATCH','Every task must cite segments from the supplied project snapshot');
    if(task.depends_on.some(id=>id===task.id||!ids.has(id)))fail('IMPLEMENTATION_DEPENDENCIES_INVALID','Dependencies must reference other tasks in this plan');
  }
  if(strings.some(value=>!value.trim()))fail('IMPLEMENTATION_RESULT_INVALID','Planning text cannot be blank');
  // Plans are prose. Executable payload fields are absent from the schema; common fenced/command-line payloads are rejected as well.
  if(strings.some(value=>/```|(?:^|\n)\s*(?:\$\s+|(?:git\s+(?:clone|push|checkout|commit)|npm\s+(?:run|install|ci)|pnpm\s+|yarn\s+|curl\s+|bash\s+|sh\s+-|rm\s+-))/.test(value)))fail('IMPLEMENTATION_EXECUTABLE_OUTPUT','Planning output must not contain executable commands');
  const tasks=new Map(result.tasks.map(task=>[task.id,task])),visiting=new Set(),done=new Set();
  function visit(id){if(visiting.has(id))fail('IMPLEMENTATION_DEPENDENCIES_INVALID','Task dependencies must be acyclic');if(done.has(id))return;visiting.add(id);for(const dependency of tasks.get(id).depends_on)visit(dependency);visiting.delete(id);done.add(id);}
  for(const id of ids)visit(id);
  if((request.repository.status!=='ready'||!request.project.goal.trim())&&!result.questions.some(item=>item.blocking))fail('IMPLEMENTATION_BLOCKING_QUESTION_REQUIRED','Unverified repository or missing project goal requires a blocking question');
  return structuredClone(result);
}
function validateImplementationResponse(envelope,request,expectedProjectId) {
  validateImplementationRequest(request,expectedProjectId); const traceId=envelope?.traceId;
  if(!envelope||!['ok','succeeded'].includes(envelope.status)||envelope.rawStatus!=='completed'||envelope.failure||envelope.error||typeof traceId!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(traceId))fail('IMPLEMENTATION_RUN_NOT_SUCCEEDED','Planning run has not completed successfully',traceId);
  if(!Array.isArray(envelope.outputs)||envelope.outputs.length!==1||!manifest.agent_id||envelope.outputs[0]?.agentId!==manifest.agent_id||typeof envelope.outputs[0]?.text!=='string')fail('IMPLEMENTATION_OUTPUTS_INCOMPLETE','The published planning agent must complete exactly once',traceId);
  let result,agentOutput;try{result=typeof envelope.output==='string'?JSON.parse(envelope.output):envelope.output;agentOutput=JSON.parse(envelope.outputs[0].text);}catch{fail('IMPLEMENTATION_OUTPUT_INVALID','Final planning output must be JSON',traceId);}
  if(!isDeepStrictEqual(result,agentOutput))fail('IMPLEMENTATION_OUTPUT_MISMATCH','Final output differs from the published agent output',traceId);
  try{return {traceId,result:validateImplementationResult(result,request,expectedProjectId)};}catch(error){error.traceId=traceId;throw error;}
}
async function runImplementationPlan(request,{expectedProjectId,token,timeoutMs=45000,fetchImpl=fetch}={}) {
  validateImplementationRequest(request,expectedProjectId);
  if(manifest.publication_status!=='published'||!manifest.published_version_id||!manifest.agent_id)fail('IMPLEMENTATION_NOT_PUBLISHED','The Nora implementation planning flow has not been published');
  if(typeof token!=='string'||!token.trim())fail('IMPLEMENTATION_AUTH_REQUIRED','A server-side planning token is required');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>90000)fail('IMPLEMENTATION_TIMEOUT_INVALID','Timeout must be between 1000 and 90000 milliseconds');
  const frozen=structuredClone(request),body=new FormData(),signal=AbortSignal.timeout(timeoutMs);
  body.set('input',JSON.stringify(frozen));body.set('variables',JSON.stringify({implementation_request:frozen}));
  let response;try{response=await fetchImpl(FLOW_URL,{method:'POST',redirect:'error',signal,headers:{Accept:'application/json',Authorization:token},body});}catch{fail('IMPLEMENTATION_TRANSPORT_UNKNOWN','Transport failed; completion is unknown. No automatic retry was performed.');}
  if(!response.ok)fail('IMPLEMENTATION_HTTP_'+response.status,'Nora rejected the planning request (HTTP '+response.status+')');
  let envelope;try{envelope=await response.json();}catch(error){if(signal.aborted||['AbortError','TimeoutError'].includes(error?.name))fail('IMPLEMENTATION_TRANSPORT_UNKNOWN','Transport failed; completion is unknown. No automatic retry was performed.');fail('IMPLEMENTATION_RESPONSE_INVALID','Nora returned non-JSON');}
  return validateImplementationResponse(envelope,frozen,expectedProjectId);
}
module.exports={FLOW_URL,FLOW_SLUG,MAX_REQUEST_BYTES,validateImplementationRequest,validateImplementationResult,validateImplementationResponse,runImplementationPlan};
