'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const{runImplementationPlan}=require('../client/implementation-client');
const manifest=require('./manifest.json'),cases=require('./acceptance-cases.json');
const sha=text=>createHash('sha256').update(text).digest('hex');
function requestFor(item){const grouped=item.separate_sources?item.texts.map(text=>[text]):[item.texts];return{schema_version:'1.0',request_id:randomUUID(),project_id:'synthetic-implementation-acceptance',settings_version:1,project:{name:'합성 구현 계획 검증',goal:item.goal},repository:{url:'https://github.com/example/synthetic-implementation.git',base_branch:'main',head_sha:item.status==='ready'?'a'.repeat(40):null,status:item.status},sources:grouped.map((texts,index)=>({document_id:randomUUID(),revision_id:randomUUID(),title:'합성 기획 '+(index+1),domain_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sha256:sha(texts.join('\n')),segments:texts.map((text,i)=>({segment_id:'S'+(i+1),text,locator:{kind:'paragraph',label:'문단 '+(i+1)}}))}))};}
async function main(){
 if(process.env.IMPLEMENTATION_ALLOW_LIVE_NORA!=='1')throw Error('Explicit live Nora opt-in required');
 const secretPath=path.join(__dirname,'../.secrets/implementation-secret.json');if((fs.statSync(secretPath).mode&0o077)!==0)throw Error('Credential file must be private');
 const{token}=JSON.parse(fs.readFileSync(secretPath));const results=[];
 for(const item of cases){const input=requestFor(item);let traceId=null;
  try{const response=await runImplementationPlan(input,{expectedProjectId:input.project_id,token});traceId=response.traceId;const result=response.result;
   if(item.blocking_required)assert.ok(result.questions.some(q=>q.blocking),'BLOCKING_QUESTION_MISSING');
   if(item.blocking_forbidden)assert.ok(!result.questions.some(q=>q.blocking),'UNNECESSARY_BLOCKING_QUESTION');
   if(item.blocking_terms)assert.ok(result.questions.some(q=>q.blocking&&item.blocking_terms.some(term=>q.question.includes(term))),'INITIALIZATION_QUESTION_MISSING');
   if(item.minimum_evidence_sources)assert.ok(new Set(result.tasks.flatMap(task=>task.evidence.map(e=>e.revision_id))).size>=item.minimum_evidence_sources,'SOURCE_COVERAGE_MISSING');
   for(const term of item.forbidden_result_terms||[])assert.ok(!JSON.stringify(result).includes(term),'INJECTION_NOT_IGNORED');
   results.push({id:item.id,passed:true,trace_id:traceId,input,result});
  }catch(error){results.push({id:item.id,passed:false,error_code:/^IMPLEMENTATION_[A-Z0-9_]+$/.test(error.code||'')?error.code:'ACCEPTANCE_ASSERTION_FAILED',trace_id:traceId||error.traceId||null,input});break;}
 }
 const report={verified_at:new Date().toISOString(),synthetic:true,slug:manifest.slug,published_version_id:manifest.published_version_id,total:cases.length,passed:results.filter(item=>item.passed).length,results};
 fs.writeFileSync(path.join(__dirname,'acceptance-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,total:report.total}));if(report.passed!==report.total)process.exitCode=1;
}
main().catch(()=>{console.error('IMPLEMENTATION_ACCEPTANCE_FAILED');process.exitCode=1;});
