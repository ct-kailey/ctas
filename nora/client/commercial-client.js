'use strict';
const Ajv2020=require('ajv/dist/2020').default;
const {isDeepStrictEqual}=require('node:util');
const {createHash}=require('node:crypto');
const manifest=require('../commercial-drafting/manifest.json');
const ajv=new Ajv2020({strict:true,allErrors:true,ownProperties:true,coerceTypes:false,removeAdditional:false,useDefaults:false});
const requestSchema=ajv.compile(require('../commercial-drafting/request.schema.json'));
const resultSchema=ajv.compile(require('../commercial-drafting/result.schema.json'));
const FLOW_URL=manifest.api.url,FLOW_SLUG=manifest.slug,MAX_REQUEST_BYTES=512*1024;
function fail(code,message,traceId){const error=Object.assign(new Error(message||code),{code});if(typeof traceId==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(traceId))error.traceId=traceId;throw error;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function commercialInputHash(value){return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function contentStrings(content){return [...content.sections.flatMap(s=>[s.title,s.body]),...content.tables.flatMap(t=>[t.title,...t.columns,...t.rows.flat()])];}
function validateContentShape(content,code){
 if(new Set([...content.sections,...content.tables].map(s=>s.id)).size!==content.sections.length+content.tables.length)fail(code,'Section and table identities must be unique');
 if(content.sections.some(s=>!s.title.trim())||content.tables.some(t=>t.columns.some(c=>!c.trim())||t.rows.some(r=>r.length!==t.columns.length)))fail(code,'Every table row must match its columns');
 if(content.sections.reduce((sum,s)=>sum+s.body.length,0)>40000)fail(code,'Section text exceeds 40,000 characters');
}
function validateCommercialRequest(request,expectedProjectId){
 if(typeof expectedProjectId!=='string'||!expectedProjectId.trim())fail('COMMERCIAL_PROJECT_CONTEXT_REQUIRED','A trusted project context is required');
 if(!requestSchema(request))fail('COMMERCIAL_REQUEST_INVALID','Drafting input does not match its schema');
 if(request.project_id!==expectedProjectId)fail('PROJECT_MISMATCH','Drafting input does not belong to the trusted project');
 if(Buffer.byteLength(JSON.stringify(request),'utf8')>MAX_REQUEST_BYTES)fail('COMMERCIAL_REQUEST_TOO_LARGE','Drafting context exceeds the total size limit');
 validateContentShape(request.document.content,'COMMERCIAL_REQUEST_INVALID');
 if(request.template.sections.some(s=>request.document.content.tables.some(t=>t.id===s.id))||request.template.kind!==request.document.kind||new Set(request.template.sections.map(s=>s.id)).size!==request.template.sections.length||!request.document.title.trim()||!request.template.name.trim()||request.template.sections.some(s=>!s.title.trim()))fail('COMMERCIAL_TEMPLATE_MISMATCH','Document and template kind and section identities must be valid');
 return request;
}
function numberTokens(text){return text.match(/\d+(?:[,.]\d+)*/g)||[];}
function normalized(value){return value.replace(/\s+/g,' ').trim();}
function validateCommercialResult(result,request,expectedProjectId){
 validateCommercialRequest(request,expectedProjectId);
 if(!resultSchema(result))fail('COMMERCIAL_RESULT_INVALID','Drafting result does not match its schema');
 validateContentShape(result.content,'COMMERCIAL_RESULT_INVALID');
 if(result.content.sections.length!==request.template.sections.length||result.content.sections.some((s,i)=>s.id!==request.template.sections[i].id||s.title!==request.template.sections[i].title))fail('COMMERCIAL_TEMPLATE_MISMATCH','The registered template section IDs, titles and order must be preserved');
 if(commercialInputHash(result.content.tables)!==commercialInputHash(request.document.content.tables))fail('COMMERCIAL_TABLES_CHANGED','Source table cells and structure cannot change during a prose rewrite');
 const output=result.content.sections.map(s=>s.body).join('\n');
 const factSources=[...contentStrings(request.document.content),...Object.values(request.profile),request.source?.text||''].join('\n');
 const allowedNumbers=new Set(numberTokens(factSources));
 if(numberTokens(output).some(token=>!allowedNumbers.has(token)))fail('COMMERCIAL_FACTS_CHANGED','The rewrite introduced an unsupported number');
 // Keep whole lines with numeric facts, not merely the number set, to prevent exchanging amounts or dates between obligations.
 const protectedLines=request.document.content.sections.flatMap(s=>s.body.split(/\r?\n/)).filter(line=>/\d|계약\s*당사자|발주(?:사|자|처)|수급인|공급(?:사|자)|수행사|(?:^|\s)[갑을]\s*[:：]/.test(line)&&line.trim());
 const protectedValues=[...protectedLines,request.profile.schedule,request.profile.budget,request.profile.client_name].filter(value=>value.trim());
 const normalizedOutput=normalized(output);
 if(protectedValues.some(value=>!normalizedOutput.includes(normalized(value))))fail('COMMERCIAL_FACTS_CHANGED','A protected numeric statement, party identity, schedule or budget changed or disappeared');
 const legalTerms=['위약','손해배상','지체상금','관할','보증','해지','지식재산','저작권','면책','자동갱신','날인','서명','penalty','indemnity','jurisdiction','warranty','termination','intellectual property','liability waiver','signed'];
 if(legalTerms.some(term=>output.toLowerCase().includes(term)&&!factSources.toLowerCase().includes(term)))fail('COMMERCIAL_TERMS_INVENTED','The rewrite added an unsupported legal term or signature assertion');
 const strings=[result.summary,...result.changes,...result.warnings,...result.questions.map(q=>q.question)];
 if(strings.some(s=>!s.trim())||result.warnings.length===0)fail('COMMERCIAL_RESULT_INVALID','Review guidance and nonblank explanation are required');
 if((!request.profile.client_name.trim()||!request.profile.project_scope.trim())&&!result.questions.some(q=>q.blocking))fail('COMMERCIAL_BLOCKING_QUESTION_REQUIRED','Missing client or scope requires a blocking question');
 return structuredClone(result);
}
function validateCommercialResponse(envelope,request,expectedProjectId){
 validateCommercialRequest(request,expectedProjectId);const traceId=envelope?.traceId;
 if(!envelope||!['ok','succeeded'].includes(envelope.status)||envelope.rawStatus!=='completed'||envelope.failure||envelope.error||typeof traceId!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(traceId))fail('COMMERCIAL_RUN_NOT_SUCCEEDED','Drafting run has not completed successfully',traceId);
 if(!Array.isArray(envelope.outputs)||envelope.outputs.length!==1||!manifest.agent_id||envelope.outputs[0]?.agentId!==manifest.agent_id||typeof envelope.outputs[0]?.text!=='string')fail('COMMERCIAL_OUTPUTS_INCOMPLETE','The published drafting agent must complete exactly once',traceId);
 let result,agentOutput;try{result=typeof envelope.output==='string'?JSON.parse(envelope.output):envelope.output;agentOutput=JSON.parse(envelope.outputs[0].text);}catch{fail('COMMERCIAL_OUTPUT_INVALID','Final drafting output must be JSON',traceId);}
 if(!isDeepStrictEqual(result,agentOutput))fail('COMMERCIAL_OUTPUT_MISMATCH','Final output differs from the published agent output',traceId);
 try{return{traceId,result:validateCommercialResult(result,request,expectedProjectId)};}catch(error){error.traceId=traceId;throw error;}
}
async function runCommercialRewrite(request,{expectedProjectId,token,timeoutMs=45000,fetchImpl=fetch}={}){
 validateCommercialRequest(request,expectedProjectId);
 if(manifest.publication_status!=='published'||!manifest.published_version_id||!manifest.agent_id)fail('COMMERCIAL_NOT_PUBLISHED','The Nora drafting flow has not been published');
 if(typeof token!=='string'||!token.trim())fail('COMMERCIAL_AUTH_REQUIRED','A server-side drafting token is required');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>90000)fail('COMMERCIAL_TIMEOUT_INVALID','Timeout must be between 1000 and 90000 milliseconds');
 const frozen=structuredClone(request),body=new FormData(),signal=AbortSignal.timeout(timeoutMs);
 body.set('input',JSON.stringify(frozen));body.set('variables',JSON.stringify({commercial_request:frozen}));
 let response;try{response=await fetchImpl(FLOW_URL,{method:'POST',redirect:'error',signal,headers:{Accept:'application/json',Authorization:token},body});}catch{fail('COMMERCIAL_TRANSPORT_UNKNOWN','Transport failed; completion is unknown. No automatic retry was performed.');}
 if(!response.ok)fail('COMMERCIAL_HTTP_'+response.status,'Nora rejected the drafting request (HTTP '+response.status+')');
 let envelope;try{envelope=await response.json();}catch(error){if(signal.aborted||['AbortError','TimeoutError'].includes(error?.name))fail('COMMERCIAL_TRANSPORT_UNKNOWN','Transport failed; completion is unknown. No automatic retry was performed.');fail('COMMERCIAL_RESPONSE_INVALID','Nora returned non-JSON');}
 return validateCommercialResponse(envelope,frozen,expectedProjectId);
}
module.exports={FLOW_URL,FLOW_SLUG,MAX_REQUEST_BYTES,commercialInputHash,validateCommercialRequest,validateCommercialResult,validateCommercialResponse,runCommercialRewrite};
