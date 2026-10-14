'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const{runImplementationPlan}=require('../client/implementation-client');
const manifest=require('./manifest.json'),cases=require('./acceptance-cases.json');
const sha=text=>createHash('sha256').update(text).digest('hex');
function requestFor(item){const grouped=item.separate_sources?item.texts.map(text=>[text]):[item.texts];return{schema_version:'1.0',request_id:randomUUID(),project_id:'synthetic-implementation-acceptance',settings_version:1,project:{name:item.project_name||'합성 구현 계획 검증',goal:item.goal},repository:{url:'https://github.com/example/synthetic-implementation.git',base_branch:'main',head_sha:item.status==='ready'?'a'.repeat(40):null,status:item.status},sources:grouped.map((texts,index)=>({document_id:randomUUID(),revision_id:randomUUID(),title:item.source_titles?.[index]||'합성 기획 '+(index+1),domain_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sha256:sha(texts.join('\n')),segments:texts.map((text,i)=>({segment_id:'S'+(i+1),text,locator:{kind:'paragraph',label:'문단 '+(i+1)}}))}))};}
function assertCase(item,result,input){
 if(item.blocking_required)assert.ok(result.questions.some(q=>q.blocking),'BLOCKING_QUESTION_MISSING');
 if(item.blocking_forbidden)assert.ok(!result.questions.some(q=>q.blocking),'UNNECESSARY_BLOCKING_QUESTION');
 if(item.blocking_terms)assert.ok(result.questions.some(q=>q.blocking&&item.blocking_terms.some(term=>q.question.includes(term))),'REQUIRED_QUESTION_MISSING');
 if(item.minimum_evidence_sources)assert.ok(new Set(result.tasks.flatMap(task=>task.evidence.map(e=>e.revision_id))).size>=item.minimum_evidence_sources,'SOURCE_COVERAGE_MISSING');
 for(const term of item.forbidden_result_terms||[])assert.ok(!JSON.stringify(result).includes(term),'INJECTION_NOT_IGNORED');
 if(item.clarification_only){
  assert.equal(result.title,'개발 대상과 문서 범위 확인','SOURCE_MISMATCH_NOT_HELD');
  assert.equal(result.tasks.length,1,'UNRELATED_IMPLEMENTATION_TASKS');
  assert.ok(/(?:문서|대상).*(?:확인|확정)/.test(result.tasks[0].title)&&!/(?:구현|개발)\s*(?:진행|착수|적용|작업)/.test(result.tasks[0].title),'IMPLEMENTATION_REPLACED_CLARIFICATION');
  for(const index of item.mismatched_source_indexes||[0]){
   const source=input.sources[index];
   assert.ok(result.questions.some(q=>q.blocking&&q.question.includes(source.title)),'MISMATCH_SOURCE_NOT_IDENTIFIED');
   assert.ok(result.tasks[0].evidence.some(e=>e.revision_id===source.revision_id),'MISMATCH_EVIDENCE_MISSING');
  }
 }
 for(const term of item.forbidden_task_title_terms||[])assert.ok(result.tasks.every(task=>!task.title.includes(term)),'EXAMPLE_BECAME_IMPLEMENTATION');
}
async function main(){
 if(process.env.IMPLEMENTATION_ALLOW_LIVE_NORA!=='1')throw Error('Explicit live Nora opt-in required');
 const secretPath=process.env.IMPLEMENTATION_SECRET_PATH||path.join(__dirname,'../.secrets/implementation-secret.json');if((fs.statSync(secretPath).mode&0o077)!==0)throw Error('Credential file must be private');
 const{token}=JSON.parse(fs.readFileSync(secretPath));const results=[];
 const selectedIds=process.env.IMPLEMENTATION_ACCEPTANCE_CASES?.split(',');
 const selectedCases=selectedIds?cases.filter(item=>selectedIds.includes(item.id)):cases;
 if(!selectedCases.length||selectedIds?.some(id=>!cases.some(item=>item.id===id)))throw Error('Unknown acceptance case');
 for(const item of selectedCases){const input=requestFor(item);let traceId=null,result=null;
  try{const response=await runImplementationPlan(input,{expectedProjectId:input.project_id,token});traceId=response.traceId;result=response.result;
   assertCase(item,result,input);
   results.push({id:item.id,passed:true,trace_id:traceId,input,result});
  }catch(error){results.push({id:item.id,passed:false,error_code:/^IMPLEMENTATION_[A-Z0-9_]+$/.test(error.code||'')?error.code:'ACCEPTANCE_ASSERTION_FAILED',trace_id:traceId||error.traceId||null,input,result});break;}
 }
 const report={verified_at:new Date().toISOString(),synthetic:true,slug:manifest.slug,published_version_id:manifest.published_version_id,total:selectedCases.length,passed:results.filter(item=>item.passed).length,results};
 fs.writeFileSync(process.env.IMPLEMENTATION_ACCEPTANCE_REPORT||path.join(__dirname,'acceptance-results.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({passed:report.passed,total:report.total}));if(report.passed!==report.total)process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('IMPLEMENTATION_ACCEPTANCE_FAILED');process.exitCode=1;});
module.exports={requestFor,assertCase};
