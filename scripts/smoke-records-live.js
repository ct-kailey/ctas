'use strict';
// Explicit opt-in: synthetic records only. Uses production credentials from a private local file.
const fs=require('node:fs'),assert=require('node:assert/strict');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  if(process.env.SMOKE_ALLOW_LIVE_NORA!=='1')throw new Error('Explicit live Nora opt-in required');
  const access=JSON.parse(fs.readFileSync(process.env.SMOKE_ACCESS_FILE||'.local/production-access.json','utf8'));
  const base=access.url.replace(/\/$/, '');let cookie,csrf;
  async function call(route,{method='GET',body,expected=200}={}){
    const headers={Accept:'application/json',...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:base,'X-CSRF-Token':csrf||''}:{})};
    if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
    const response=await fetch(base+route,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const data=await response.json();assert.equal(response.status,expected,`${route}: ${data.error?.code||response.status}`);
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return data;
  }
  const login=await call('/api/auth/login',{method:'POST',body:{email:access.email,password:access.password}});csrf=login.csrfToken;
  const originalPrefix='/api/projects/45fa29a8-584f-47d0-8c89-9849b74e11ef';
  const original=await call(originalPrefix+'/reviews/0cafd937-665c-4ea5-b6ca-647109c90a8a');assert.equal(original.review.status,'published');
  const beforeHash=require('node:crypto').createHash('sha256').update(JSON.stringify({request:original.review.request,result:original.review.result,decision:original.review.decision})).digest('hex');
  const {project}=await call('/api/projects',{method:'POST',body:{name:'합성 검증 · 업무 영역과 기록 '+new Date().toISOString().slice(0,16)},expected:201});const prefix='/api/projects/'+project.id;
  const pack={id:'qa-settlement',version:'1.0',glossary:[{term:'정산 한도',definition:'승인 없이 처리할 수 있는 정산 건수'}]};
  const {domain}=await call(prefix+'/domains',{method:'POST',body:{name:'정산',description:'합성 정산 업무',domain_pack:pack},expected:201});
  const {domain:otherDomain}=await call(prefix+'/domains',{method:'POST',body:{name:'회원',description:'합성 회원 업무'},expected:201});
  const history={source_type:'azure_devops',occurred_on:'2026-09-18',decided_on:'2026-09-20',source_created_at:'2026-09-18T10:00:00+09:00',channel:'Sprint QA',url:'https://example.test/devops/synthetic-42',external_id:'QA-42',participants:['합성 담당자'],tags:['합성 검증','정산']};
  const baselineText='# 합성 검증\n실제 고객의 결정이 아닙니다.\n정산 한도는 5건입니다.\n';
  async function ready(uploaded){
    for(let attempt=0;attempt<80;attempt++){
      const {revision}=await call(prefix+'/revisions/'+uploaded.revision_id);
      if(revision.status==='ready')return revision;
      if(['failed','uncertain'].includes(revision.status))throw new Error('Intake '+revision.error_code);
      await delay(1200);
    }throw new Error('Intake wait exceeded');
  }
  const first=await call(prefix+'/records',{method:'POST',expected:202,body:{title:'합성 정산 정책',text:baselineText,domain_id:domain.id,record_kind:'specification',history}});
  const baseline=await ready(first);assert.equal(baseline.source_text,baselineText);assert.deepEqual(baseline.history,history);
  const overview=await call(prefix+'/overview');assert.equal(overview.domains.length,3);assert.equal(overview.documents[0].baseline_revision_id,null);
  await call(prefix+'/revisions/'+first.revision_id+'/publish-initial',{method:'POST',body:{reason:'합성 기준선 검증',acknowledge_extraction:true}});
  const current=await call(prefix+'/records',{method:'POST',expected:202,body:{title:'합성 정산 정책',text:baselineText.replace('5건','50건'),domain_id:domain.id,document_id:first.document_id,record_kind:'specification',history:{...history,source_type:'slack',decided_on:'2026-09-22',channel:'#qa-settlement'}}});
  const currentRevision=await ready(current);assert.equal(currentRevision.domain_id,domain.id);assert.equal(currentRevision.history.decided_on,'2026-09-22');
  await call(prefix+'/records',{method:'POST',expected:409,body:{title:'잘못된 업무 영역',text:'합성',document_id:first.document_id,domain_id:otherDomain.id,record_kind:'specification'}});
  const originalAgain=(await call(prefix+'/revisions/'+first.revision_id)).revision;assert.equal(originalAgain.source_text,baselineText);assert.deepEqual(originalAgain.history,history);
  const requested=await call(prefix+'/reviews',{method:'POST',expected:202,body:{revision_id:current.revision_id}});
  let review,last;
  for(let count=0;count<160;count++){
    ({review}=await call(prefix+'/reviews/'+requested.review_id));
    if(review.status!==last){console.log('Review '+review.status);last=review.status;}
    if(['needs_review','no_change'].includes(review.status))break;
    if(['failed','uncertain','blocked'].includes(review.status))throw new Error('Review '+(review.job?.error_code||review.status));
    await delay(1500);
  }
  assert.equal(review.status,'needs_review');assert.deepEqual(review.request.domain_pack,pack);assert.equal(review.decision,null);
  assert.equal((await call(prefix+'/documents')).documents[0].baseline_revision_id,first.revision_id);
  const registrationPublished=require('../nora/registration/manifest.json').publication_status==='published';
  const suggestion=await call(prefix+'/registration-suggestions',{method:'POST',expected:registrationPublished?200:503,body:{title:'정산 정책 v2',text:'합성',record_kind:'specification'}});
  if(registrationPublished)assert.equal(suggestion.status,'suggested');
  const preserved=(await call(originalPrefix+'/reviews/0cafd937-665c-4ea5-b6ca-647109c90a8a')).review;
  assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify({request:preserved.request,result:preserved.result,decision:preserved.decision})).digest('hex'),beforeHash);
  const report={verified_at:new Date().toISOString(),url:base,synthetic:true,project_id:project.id,domain_id:domain.id,document_id:first.document_id,revisions:[first.revision_id,current.revision_id],review_id:review.id,trace_id:review.job?.execution?.trace_id,status:review.status,checks:['legacy published review preserved','domain creation','Azure DevOps editor source exact bytes','date-only and zoned source timestamp preservation','source metadata on revision','real published intake and change review','owning domain pack snapshot','cross-domain revision rejected','old revision immutable after edit','declared decision date does not auto-approve',registrationPublished?'published classification validated':'unpublished classification honest503']};
  fs.writeFileSync('platform/domain-records-production-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await call('/api/auth/logout',{method:'POST',body:{}});
}
main().catch(err=>{console.error('Record smoke failed: '+err.message);process.exitCode=1;});
