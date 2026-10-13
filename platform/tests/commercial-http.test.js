'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {sha256}=require('../server/auth');
const {createLedger}=require('../server/ledger');
const {createApp}=require('../server/server');

test('commercial HTTP workflow enforces auth, revision review, customer records and contract handoff', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const schema='commercial_http_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);let pool,server;
 t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
 await admin.query(`CREATE SCHEMA ${schema}`);pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
 const ledger=createLedger(pool),users={},sessions={},origin='https://commercial.example.test';
 for(const role of ['owner','reviewer','member','viewer','outsider']){users[role]=(await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[role+'@commercial-http.test',role,'unused'])).rows[0].id;const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sha256(token),users[role],csrf]);sessions[role]={Cookie:'ains_session='+token,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};}
 server=createApp({pool,appOrigin:origin,production:true}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 async function request(path,{method='GET',body,as='owner',headers,status=200,code}={}){const res=await fetch(base+path,{method,headers:headers??sessions[as],body:body===undefined?undefined:JSON.stringify(body)});const value=await res.json();assert.equal(res.status,status,`${method} ${path}: ${JSON.stringify(value)}`);if(code)assert.equal(value.error?.code,code);return value;}
 async function project(name){const p=await ledger.createProject(users.owner,{name});for(const role of ['reviewer','member','viewer'])await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p.id,users[role],role]);return p;}
 const p=await project('영업·계약 HTTP 검증'),q=await project('별도 프로젝트');const prefix='/api/projects/'+p.id+'/commercial',other='/api/projects/'+q.id+'/commercial';
 let template,document,profile;
 const content={sections:[{id:'intro',title:'계약 내용',body:'고객 업무 시스템의 회원 기능을 개발합니다.'}],tables:[{id:'costs',title:'견적 내역',columns:['항목','금액'],rows:[['회원 기능','1,000,000원']]}]};
 await t.test('sessions, membership, CSRF, Origin and roles guard all mutations',async()=>{
  await request(prefix,{headers:{},status:401,code:'UNAUTHENTICATED'});await request(prefix,{as:'outsider',status:404,code:'NOT_FOUND'});profile=(await request(prefix,{as:'viewer'})).profile;
  const body={expected_version:1,client_name:'고객 기업',reason:'고객 등록'};
  await request(prefix+'/profile',{method:'PATCH',body,as:'viewer',status:403,code:'FORBIDDEN'});
  await request(prefix+'/profile',{method:'PATCH',body,headers:{...sessions.owner,'X-CSRF-Token':'forged'},status:403,code:'CSRF_REJECTED'});
  await request(prefix+'/profile',{method:'PATCH',body,headers:{...sessions.owner,Origin:'https://other.example.test'},status:403,code:'ORIGIN_REJECTED'});
  await request(prefix+'/templates',{method:'POST',as:'member',body:{},status:403,code:'FORBIDDEN'});
  await request(prefix+'/stage',{method:'POST',as:'member',body:{expected_version:1,stage:'negotiating',reason:'진행'},status:403,code:'FORBIDDEN'});
 });
 await t.test('profile and reusable company template save before repository setup',async()=>{
  profile=(await request(prefix+'/profile',{method:'PATCH',as:'member',body:{expected_version:1,client_name:'고객 기업',company_info:'신규 고객',project_scope:'회원 기능 개발',schedule:'고객과 협의 후 확정',budget:'승인 예산 내 진행',reason:'계약 준비 정보 등록'}})).profile;assert.equal(profile.version,2);
  await request(prefix+'/profile',{method:'PATCH',body:{expected_version:1,client_name:'덮어쓰기',reason:'수정'},status:409,code:'COMMERCIAL_VERSION_CONFLICT'});
  template=(await request(prefix+'/templates',{method:'POST',as:'reviewer',status:201,body:{name:'회사 계약서 양식',kind:'contract',instructions:'합의한 조건을 유지하고 문체만 정리',sections:[{id:'intro',title:'계약 내용',guidance:'범위와 조건'}],company_name:'AINS',footer:'내부 검토용'}})).template;
  assert.equal(template.is_sample,false);assert.equal((await request(other+'/template-library',{as:'member'})).templates.find(r=>r.id===template.id).project_name,'영업·계약 HTTP 검증');
  assert.equal((await pool.query('SELECT repository_url FROM project_settings WHERE project_id=$1',[p.id])).rows[0].repository_url,null);
 });
 await t.test('section/table editor creates immutable revisions; cross-project IDs never resolve',async()=>{
  document=(await request(prefix+'/documents',{method:'POST',as:'member',status:201,body:{kind:'contract',title:'신규 사업 계약서',template_id:template.id,content,reason:'첫 초안'}})).document;assert.equal(document.version,1);assert.equal(document.latest_revision.approved,false);
  await request(other+'/documents/'+document.id,{status:404,code:'NOT_FOUND'});await request(prefix+'/documents/'+document.id,{as:'outsider',status:404,code:'NOT_FOUND'});
  await request(prefix+'/documents/'+document.id+'/revisions',{method:'POST',as:'viewer',body:{expected_version:1,title:document.title,content,reason:'수정'},status:403,code:'FORBIDDEN'});
  document=(await request(prefix+'/documents/'+document.id+'/revisions',{method:'POST',as:'member',status:201,body:{expected_version:1,title:document.title,content:{...content,sections:[{...content.sections[0],body:content.sections[0].body+' 고객 확인 내용을 보충했습니다.'}]},reason:'고객 확인사항 반영'}})).document;
  assert.equal(document.version,2);assert.equal(document.revisions.length,2);assert.equal(document.revisions[1].content.sections[0].body,content.sections[0].body);
  const path=prefix+'/documents/'+document.id+'/revisions/'+document.latest_revision_id+'/decision';
  await request(path,{method:'POST',as:'member',body:{expected_version:2,expected_profile_version:profile.version,decision:'approved',reason:'검토'},status:403,code:'FORBIDDEN'});
  await request(path,{method:'POST',as:'reviewer',body:{expected_version:2,decision:'approved',reason:'프로젝트 버전 누락'},status:400,code:'COMMERCIAL_VERSION_REQUIRED'});
  const reviewedProfileVersion=profile.version;
  profile=(await request(prefix+'/profile',{method:'PATCH',as:'member',body:{expected_version:profile.version,budget:'고객 재협의한 예산 조건',reason:'검토 중 예산 변경'}})).profile;
  await request(path,{method:'POST',as:'reviewer',body:{expected_version:2,expected_profile_version:reviewedProfileVersion,decision:'approved',reason:'이전 조건으로 검토'},status:409,code:'COMMERCIAL_VERSION_CONFLICT'});
  assert.equal((await request(prefix+'/documents/'+document.id)).document.latest_revision.approved,false);
  const data=await request(path,{method:'POST',as:'reviewer',body:{expected_version:2,expected_profile_version:profile.version,decision:'approved',reason:'현재 원문과 조건 검토'}});assert.equal((data.document||data.decision).latest_revision.approved,true);
  document=(await request(prefix+'/documents/'+document.id,{as:'viewer'})).document;assert.equal(document.latest_revision.approved,true);
 });
 await t.test('customer communication is recorded, never sent, and pending response blocks confirmation',async()=>{
  const feedback=(await request(prefix+'/feedback',{method:'POST',as:'member',status:201,body:{document_revision_id:document.latest_revision_id,request_text:'최종 범위를 확인해 주세요.',requested_on:'2026-09-29',channel:'고객 회의',reason:'전달한 질문 기록'}})).feedback;
  assert.equal(feedback.round,1);const confirm={expected_version:profile.version,stage:'contracted',contract_revision_id:document.latest_revision_id,agreement_evidence:'고객 회의록의 최종 합의 기록',agreed_on:'2026-09-30',reason:'고객 합의 기록'};
  await request(prefix+'/stage',{method:'POST',body:confirm,status:409,code:'COMMERCIAL_FEEDBACK_PENDING'});
  await request(other+'/feedback/'+feedback.id+'/answer',{method:'POST',body:{response_text:'동의',responded_on:'2026-09-30',reason:'기록'},status:404,code:'NOT_FOUND'});
  const answered=(await request(prefix+'/feedback/'+feedback.id+'/answer',{method:'POST',as:'member',body:{response_text:'회원 기능 범위에 동의합니다.',responded_on:'2026-09-30',reason:'고객 답변 기록'}})).feedback;assert.equal(answered.responded_on,'2026-09-30');
  profile=(await request(prefix+'/stage',{method:'POST',as:'reviewer',body:confirm})).profile;assert.equal(profile.stage,'contracted');assert.equal(profile.confirmation.contract_revision_id,document.latest_revision_id);
  profile=(await request(prefix+'/stage',{method:'POST',as:'reviewer',body:{expected_version:profile.version,stage:'handoff',reason:'개발팀에 승인 문서 이관'}})).profile;assert.equal(profile.stage,'handoff');
 });
 await t.test('Nora request freezes exact revision and is explicit; viewers cannot run or apply',async()=>{
  const path=prefix+'/documents/'+document.id+'/rewrites',body={request_id:randomUUID(),revision_id:document.latest_revision_id};
  await request(path,{method:'POST',as:'viewer',body,status:403,code:'FORBIDDEN'});
  const job=(await request(path,{method:'POST',as:'member',body,status:202})).rewrite;assert.equal(job.status,'queued');assert.equal(job.source_revision_id,document.latest_revision_id);
  assert.equal((await request(prefix+'/rewrites/'+job.id,{as:'viewer'})).rewrite.input_snapshot.document.id,document.id);
  await request(other+'/rewrites/'+job.id,{status:404,code:'NOT_FOUND'});
  await request(prefix+'/rewrites/'+job.id+'/apply',{method:'POST',as:'viewer',body:{expected_version:document.version,reason:'적용'},status:403,code:'FORBIDDEN'});
  await request(prefix+'/rewrites/'+job.id+'/apply',{method:'POST',as:'member',body:{expected_version:document.version,reason:'적용'},status:409,code:'COMMERCIAL_REWRITE_NOT_READY'});
 });
 await t.test('exports require project access and valid formats/UUIDs; viewers may download',async()=>{
  const path=prefix+'/documents/'+document.id+'/revisions/'+document.latest_revision_id+'/export';
  await request(path+'?format=docx',{headers:{},status:401,code:'UNAUTHENTICATED'});await request(path+'?format=pdf',{as:'outsider',status:404,code:'NOT_FOUND'});
  await request(path+'?format=html',{status:400,code:'INVALID_EXPORT_FORMAT'});await request(path+'?format=docx&format=pdf',{status:400,code:'INVALID_EXPORT_FORMAT'});
  await request(prefix+'/documents/not-a-uuid/revisions/'+document.latest_revision_id+'/export?format=docx',{status:400,code:'INVALID_ID'});
  await request(other+'/documents/'+document.id+'/revisions/'+document.latest_revision_id+'/export?format=docx',{status:404,code:'NOT_FOUND'});
  for(const format of ['docx','pdf']){const res=await fetch(base+path+'?format='+format,{headers:sessions.viewer});if(res.status!==200){assert.fail('Export '+format+': '+await res.text());}assert.match(res.headers.get('content-disposition'),/attachment; filename=/);const bytes=Buffer.from(await res.arrayBuffer());assert.ok(bytes.length>500);assert.equal(bytes.subarray(0,format==='pdf'?4:2).toString(),format==='pdf'?'%PDF':'PK');}
 });
});
