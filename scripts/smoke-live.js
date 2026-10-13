'use strict';
// Explicit opt-in: creates a clearly labelled synthetic project and invokes the published Nora flow.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  if(process.env.SMOKE_ALLOW_LIVE_NORA!=='1')throw new Error('Live smoke requires SMOKE_ALLOW_LIVE_NORA=1.');
  const base=process.env.SMOKE_URL||process.env.APP_ORIGIN;
  const email=process.env.SMOKE_EMAIL||process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password=process.env.SMOKE_PASSWORD||process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if(!base||!email||!password)throw new Error('Smoke URL/email/password required.');
  let cookie,csrf;
  async function call(route,{method='GET',body,expected=200}={}){
    const headers={Accept:'application/json',...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:base,'X-CSRF-Token':csrf||''}:{})};
    if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
    const response=await fetch(base+route,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const data=await response.json();
    assert.equal(response.status,expected,`${route}: ${data?.error?.code||response.status}`);
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return data;
  }
  const login=await call('/api/auth/login',{method:'POST',body:{email,password}});csrf=login.csrfToken;
  const {project}=await call('/api/projects',{method:'POST',body:{name:'합성 검증 · 문서 변경 흐름 '+new Date().toISOString().slice(0,16)},expected:201});
  const prefix='/api/projects/'+project.id;
  async function upload(text,document_id){
    const body=new FormData();body.set('file',new Blob([text]),'synthetic-requirements.txt');body.set('title','합성 예제 · 서비스 응답 시간');if(document_id)body.set('document_id',document_id);
    const uploaded=await call(prefix+'/documents',{method:'POST',body,expected:202});
    let last;
    for(let count=0;count<100;count++){
      const {revision}=await call(prefix+'/revisions/'+uploaded.revision_id);
      if(revision.status!==last){console.log('Document '+revision.status);last=revision.status;}
      if(revision.status==='ready')return uploaded;
      if(['failed','uncertain'].includes(revision.status))throw new Error('Intake '+revision.error_code);
      await delay(1500);
    }
    throw new Error('Intake wait limit exceeded');
  }
  const baseline=await upload('합성 테스트 문서입니다. 실제 계약 또는 고객 승인 자료가 아닙니다.\n서비스 응답 시간은 5초 이하여야 합니다.\n');
  await call(prefix+'/revisions/'+baseline.revision_id+'/publish-initial',{method:'POST',body:{reason:'합성 시나리오 최초 기준선 검증',acknowledge_extraction:true}});
  const current=await upload('합성 테스트 문서입니다. 실제 계약 또는 고객 승인 자료가 아닙니다.\n서비스 응답 시간은 50초 이하여야 합니다.\n',baseline.document_id);
  const requested=await call(prefix+'/reviews',{method:'POST',body:{revision_id:current.revision_id},expected:202});
  const duplicate=await call(prefix+'/reviews',{method:'POST',body:{revision_id:current.revision_id},expected:202});assert.equal(duplicate.review_id,requested.review_id);
  let review,last;
  for(let count=0;count<220;count++){
    ({review}=await call(prefix+'/reviews/'+requested.review_id));
    if(review.status!==last){console.log('Review '+review.status);last=review.status;}
    if(['needs_review','no_change'].includes(review.status))break;
    if(['failed','uncertain','blocked'].includes(review.status))throw new Error('Review '+(review.job?.error_code||review.status));
    await delay(1500);
  }
  assert.equal(review.status,'needs_review');assert.ok(review.result.changes.some(change=>change.risk==='high'));
  await call(prefix+'/reviews/'+review.id+'/publish',{method:'POST',body:{reason:'승인 전 발행 차단 검증'},expected:409});
  const decision={decision:'approved',reason:'합성 시나리오 승인 경로 검증',evidence:'자동화 통합 테스트의 합성 결정 기록. 실제 고객 승인이 아닙니다.',acknowledge_extraction:true};
  if(review.result.questions.length)await call(prefix+'/reviews/'+review.id+'/decision',{method:'POST',body:decision,expected:409});
  for(const question of review.result.questions)await call(prefix+'/reviews/'+review.id+'/answers',{method:'POST',body:{question_id:question.question_id,answer:'이 합성 시나리오에서는 응답 시간 한도를 50초 이하로 변경하는 것으로 확인합니다. 실제 업무 의사결정에는 사용하지 않습니다.',evidence:'합성 테스트 시나리오 v1. 실제 고객에게 질문 또는 메시지를 발송하지 않았습니다.'}});
  await call(prefix+'/reviews/'+review.id+'/decision',{method:'POST',body:decision});
  const published=await call(prefix+'/reviews/'+review.id+'/publish',{method:'POST',body:{reason:'합성 통합 검증 완료'}});
  assert.equal(published.baseline.revision_id,current.revision_id);
  const {documents}=await call(prefix+'/documents');assert.equal(documents[0].baseline_revision_id,current.revision_id);
  const {review:done}=await call(prefix+'/reviews/'+review.id);
  const record={tested_at:new Date().toISOString(),url:base,synthetic:true,project_id:project.id,document_id:baseline.document_id,baseline_revision_id:baseline.revision_id,current_revision_id:current.revision_id,review_id:review.id,trace_id:done.job?.execution?.trace_id,status:done.status,question_count:review.result.questions.length,checks:['upload and immutable source','published Nora document intake','published Nora OpenAI review','review deduplication','numeric high-risk detection','unapproved publication blocked',...(review.result.questions.length?['question evidence required']:[]),'explicit approval and baseline publication']};
  if(process.env.SMOKE_OUTPUT)fs.writeFileSync(process.env.SMOKE_OUTPUT,JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify(record,null,2));
  await call('/api/auth/logout',{method:'POST',body:{}});
}
main().catch(err=>{console.error('Smoke failed: '+err.message);process.exitCode=1;});
