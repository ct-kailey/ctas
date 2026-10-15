'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createPool, migrate, transaction } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { createTaskDrafts } = require('../server/task-drafts');
const { createApp } = require('../server/server');
const { sha256 } = require('../server/auth');
const { hash } = require('../server/context-contract');
const { createImplementationNotes, parseNote, validateEvidence, appendNoraNotes, getFollowupInput, recordFollowup } = require('../server/implementation-notes');

function note(source = randomUUID(), kind = 'temporary_decision') {
  return { request_id:randomUUID(),kind,title:'보관 기간의 임시 선택',uncertainty:'정책의 보관 기간을 확인해야 한다.',
    temporary_approach:kind === 'temporary_decision' ? '기간은 설정값으로 분리하고 자동 삭제는 활성화하지 않는다.' : '',
    rationale:'현재 정책은 보관 기간을 확정하지 않았다.',impact:'추후 기간 변경에 따른 검증이 필요하다.',replacement_condition:'승인된 보관 정책을 근거로 교체한다.',
    source_revision_id:source,evidence:[{segment_id:'s1',quote:'보관 기간을 확인한다.'}] };
}
test('implementation note contracts cannot fabricate Nora provenance or shipment and require temporary reasoning', () => {
  assert.equal(parseNote(note()).kind,'temporary_decision');
  assert.equal(parseNote(note(undefined,'work_gap')).temporary_approach,null);
  for (const extra of [{origin:'nora'},{trace_id:'trc_invented'},{status:'resolved'},{approved:true},{version:9}]) assert.throws(()=>parseNote({...note(),...extra}),{code:'IMPLEMENTATION_NOTE_INPUT_INVALID'});
  for (const field of ['title','uncertainty','temporary_approach','rationale','impact','replacement_condition']) assert.throws(()=>parseNote({...note(),[field]:''}),{code:'IMPLEMENTATION_NOTE_INPUT_INVALID'});
  assert.throws(()=>parseNote({...note(),evidence:[]}),{code:'IMPLEMENTATION_NOTE_EVIDENCE_REQUIRED'});
  assert.throws(()=>parseNote({...note(),evidence:[...note().evidence,...note().evidence]}),{code:'IMPLEMENTATION_NOTE_EVIDENCE_INVALID'});
  assert.throws(()=>parseNote({...note(),title:'a'.repeat(301)}),{code:'IMPLEMENTATION_NOTE_INPUT_INVALID'});
});
test('implementation evidence stays exact to original text and extraction provenance', () => {
  const r={id:randomUUID(),document_id:randomUUID(),project_id:'p',sha256:'a'.repeat(64),document_category:'policy',status:'ready'};
  r.document_json={project_id:r.project_id,revision_id:r.id,document_id:r.document_id,source:{sha256:r.sha256},extraction:{complete:true,warnings:['CONTENT_IS_UNTRUSTED']},segments:[{segment_id:'s1',text:'보관 기간을 확인한다.',normalized_text:'보관 기간은 1년이다.',extraction_status:'ok',locator:{kind:'text',label:'정책'}}]};
  assert.equal(validateEvidence(r,note().evidence)[0].locator.label,'정책');
  assert.throws(()=>validateEvidence(r,[{segment_id:'s1',quote:'보관 기간은 1년이다.'}]),{code:'IMPLEMENTATION_NOTE_EVIDENCE_INVALID'});
  assert.throws(()=>validateEvidence({...r,document_json:{...r.document_json,project_id:'other'}},note().evidence),{code:'IMPLEMENTATION_NOTE_SOURCE_NOT_READY'});
  assert.throws(()=>validateEvidence({...r,document_json:{...r.document_json,extraction:{complete:false}}},note().evidence),{code:'IMPLEMENTATION_NOTE_SOURCE_NOT_READY'});
});

test('implementation archive preserves exact evidence, roles, CAS, idempotency and append-only review history', {skip:!process.env.TEST_DATABASE_URL}, async t=>{
  const schema='implementation_notes_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);
  let pool,server;
  t.after(async()=>{if(server)await new Promise(r=>server.close(r));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
  const users={};for(const role of ['owner','reviewer','member','viewer','outsider'])users[role]=(await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[role+'@implementation-notes.test',role,'unused'])).rows[0].id;
  const ledger=createLedger(pool),service=createImplementationNotes({pool});
  async function project(){const p=(await ledger.createProject(users.owner,{name:'임시 판단 테스트'})).id;for(const role of ['reviewer','member','viewer'])await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,users[role],role]);return p;}
  async function source(p,{ready=true,complete=true,category='policy'}={}){
    const record=await ledger.createRecord(p,users.owner,{title:'보관 정책 초안',document_category:category,text:'보관 기간을 확인한다. 자동 삭제는 아직 확정되지 않았다.',history:{source_type:'other',channel:'테스트'}}),r=await ledger.getRevision(p,record.revision_id);
    if(ready)await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1",[r.id,{schema_version:'1.0',project_id:p,revision_id:r.id,document_id:r.document_id,source:{sha256:r.sha256},extraction:{complete,warnings:['CONTENT_IS_UNTRUSTED','MOCK_DATA_UNVERIFIED']},segments:[{segment_id:'s1',text:'보관 기간을 확인한다. 자동 삭제는 아직 확정되지 않았다.',extraction_status:'ok',locator:{kind:'text',label:'보관 정책'}}]}]);
    return r;
  }
  async function analysis(p,rid,feedback=null,db=pool){const aid=randomUUID(),snapshot={source:{revision_id:rid},...(feedback?{feedback}:{})};await db.query('INSERT INTO task_automation_analyses(id,project_id,revision_id,request_sha256,input_snapshot,input_sha256,dedup_sha256,created_by) VALUES($1,$2,$3,$4,$5,$4,$6,$7)',[aid,p,rid,hash(snapshot),snapshot,hash(aid),users.owner]);return aid;}
  async function task(p,rid,aid,db=pool){const tid=randomUUID(),snapshot={source:{revision_id:rid}};await db.query('INSERT INTO automation_tasks(id,project_id,analysis_id,title,description,acceptance_criteria,evidence,input_snapshot,input_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[tid,p,aid,'설정값 표시','정책을 확인해 설정값을 표시한다.',JSON.stringify(['설정값 표시']),JSON.stringify(note().evidence),snapshot,hash(snapshot),users.owner]);return tid;}
  const p=await project(),other=await project(),policy=await source(p),foreign=await source(other);
  let input,created;
  await t.test('strict is the default and concurrent manual requests produce exactly one original record',async()=>{
    assert.equal((await pool.query('SELECT uncertainty_mode FROM task_automation_settings WHERE project_id=$1',[p])).rows[0].uncertainty_mode,'strict');
    input=note(policy.id);const outputs=await Promise.all([service.create(p,users.member,input),service.create(p,users.member,input)]);
    assert.deepEqual(outputs.map(o=>o.replayed).sort(),[false,true]);created=outputs[0].note;
    assert.equal(created.version,1);assert.equal(created.status,'open');assert.equal(created.origin,'manual');assert.equal(created.trace_id,null);
    assert.equal(created.source_sha256,policy.sha256);assert.equal(created.source_refs[0].id,policy.id);assert.equal(created.evidence[0].locator.label,'보관 정책');
    assert.equal((await pool.query('SELECT 1 FROM project_implementation_notes')).rowCount,1);
    assert.equal((await pool.query('SELECT 1 FROM project_implementation_note_history')).rowCount,1);
    for(const table of ['task_automation_analyses','task_automation_jobs','automation_tasks','work_items','implementation_plans','project_questions'])assert.equal((await pool.query(`SELECT 1 FROM ${table}`)).rowCount,0);
  });
  await t.test('creation enforces source readiness, exact evidence, immutable identity and current authorization',async()=>{
    await assert.rejects(service.create(p,users.viewer,note(policy.id)),{code:'FORBIDDEN'});
    await assert.rejects(service.create(p,users.outsider,note(policy.id)),{code:'FORBIDDEN'});
    await assert.rejects(service.create(p,users.member,note(foreign.id)),{code:'IMPLEMENTATION_NOTE_SOURCE_NOT_FOUND'});
    const incomplete=await source(p,{complete:false}),pending=await source(p,{ready:false}),meeting=await source(p,{category:'meeting'});
    for(const r of [incomplete,pending])await assert.rejects(service.create(p,users.member,note(r.id)),{code:'IMPLEMENTATION_NOTE_SOURCE_NOT_READY'});
    await assert.rejects(service.create(p,users.member,note(meeting.id)),{code:'IMPLEMENTATION_NOTE_POLICY_REQUIRED'});
    await assert.rejects(service.create(p,users.member,{...note(policy.id),evidence:[{segment_id:'s1',quote:'보관은 1년'}]}),{code:'IMPLEMENTATION_NOTE_EVIDENCE_INVALID'});
    await assert.rejects(service.create(p,users.owner,input),{code:'IMPLEMENTATION_NOTE_REQUEST_CONFLICT'});
    await assert.rejects(service.create(other,users.member,{...input,source_revision_id:foreign.id}),{code:'IMPLEMENTATION_NOTE_REQUEST_CONFLICT'});
    await assert.rejects(service.create(p,users.member,{...input,title:'변경'}),{code:'IMPLEMENTATION_NOTE_REQUEST_CONFLICT'});
    await assert.rejects(service.get(other,users.viewer,created.id),{code:'IMPLEMENTATION_NOTE_NOT_FOUND'});
    await assert.rejects(service.get(p,users.outsider,created.id),{code:'FORBIDDEN'});
  });
  await t.test('feedback CAS has one winner, exact replay and no source overwrite',async()=>{
    const a={request_id:randomUUID(),expected_version:1,text:'자동 삭제 없는 방향으로 검토해 주세요.'},b={...a,request_id:randomUUID(),text:'다른 피드백'};
    const results=await Promise.allSettled([service.feedback(p,users.member,created.id,a),service.feedback(p,users.member,created.id,b)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'IMPLEMENTATION_NOTE_VERSION_CONFLICT');
    const winner=results[0].status==='fulfilled'?a:b;
    const again=await service.feedback(p,users.member,created.id,winner);assert.equal(again.replayed,true);assert.equal(again.note.version,2);assert.equal(again.note.status,'feedback_received');assert.equal(again.note.uncertainty,input.uncertainty);
    await assert.rejects(service.feedback(p,users.member,created.id,{...winner,text:'바꾸기'}),{code:'IMPLEMENTATION_NOTE_REQUEST_CONFLICT'});
    await assert.rejects(service.feedback(p,users.viewer,created.id,{...winner,request_id:randomUUID(),expected_version:2}),{code:'FORBIDDEN'});
  });
  await t.test('review requires reviewer, correct kind, actual result evidence and may later reopen',async()=>{
    const body={request_id:randomUUID(),expected_version:2,status:'accepted',note:'임시 접근을 수용하며 정책 확정 후 교체한다.',result_evidence:[{type:'revision',id:policy.id,segment_id:'s1',quote:'자동 삭제는 아직 확정되지 않았다.'}]};
    await assert.rejects(service.review(p,users.member,created.id,body),{code:'FORBIDDEN'});
    await assert.rejects(service.review(p,users.reviewer,created.id,{...body,status:'resolved'}),{code:'IMPLEMENTATION_NOTE_REVIEW_INVALID'});
    await assert.rejects(service.review(p,users.reviewer,created.id,{...body,result_evidence:[{...body.result_evidence[0],id:foreign.id}]}),{code:'IMPLEMENTATION_NOTE_SOURCE_NOT_FOUND'});
    await assert.rejects(service.review(p,users.reviewer,created.id,{...body,result_evidence:[{...body.result_evidence[0],quote:'실제 배포됨'}]}),{code:'IMPLEMENTATION_NOTE_EVIDENCE_INVALID'});
    const accepted=await service.review(p,users.reviewer,created.id,body);assert.equal(accepted.note.status,'accepted');assert.equal(accepted.note.version,3);
    assert.equal((await service.review(p,users.reviewer,created.id,body)).replayed,true);
    await assert.rejects(service.review(p,users.reviewer,created.id,{...body,request_id:randomUUID(),expected_version:3}),{code:'IMPLEMENTATION_NOTE_REVIEW_INVALID'});
    const reopened=await service.feedback(p,users.owner,created.id,{request_id:randomUUID(),expected_version:3,text:'새로운 운영 제약을 확인하여 다시 검토해 주세요.'});assert.equal(reopened.note.status,'feedback_received');assert.equal(reopened.note.version,4);
    const detail=await service.get(p,users.viewer,created.id,{limit:'2'});assert.equal(detail.history_total,4);assert.equal(detail.history_has_more,true);assert.deepEqual(detail.history.map(h=>h.kind),['feedback','accepted']);assert.equal(detail.history[1].detail.result_evidence[0].sha256,policy.sha256);
    const older=await service.get(p,users.viewer,created.id,{limit:2,history_offset:2});assert.deepEqual(older.history.map(h=>h.kind),['feedback','created']);
    const gap=await service.create(p,users.owner,note(policy.id,'work_gap'));await assert.rejects(service.review(p,users.owner,gap.note.id,{...body,request_id:randomUUID(),expected_version:1}),{code:'IMPLEMENTATION_NOTE_REVIEW_INVALID'});
    const resolved=await service.review(p,users.owner,gap.note.id,{...body,request_id:randomUUID(),expected_version:1,status:'resolved'});assert.equal(resolved.note.status,'resolved');
    for(const table of ['automation_tasks','work_items','implementation_plans'])assert.equal((await pool.query(`SELECT 1 FROM ${table}`)).rowCount,0,'archive review must not imply shipped work');
  });
  await t.test('initial payload, append-only history and derived status cannot be overwritten at database boundary',async()=>{
    for(const sql of ["UPDATE project_implementation_notes SET title='변경'","UPDATE project_implementation_notes SET evidence='[]'","UPDATE project_implementation_notes SET status='accepted'","UPDATE project_implementation_notes SET version=version+1","DELETE FROM project_implementation_notes","UPDATE project_implementation_note_history SET detail='{}'","DELETE FROM project_implementation_note_history","UPDATE events SET detail='{}' WHERE kind LIKE 'implementation_note.%'"])await assert.rejects(pool.query(sql),{code:'23514'});
    assert.equal((await service.get(p,users.viewer,created.id)).note.version,4);
  });
  let linkedId,linkedTask,linkedAnalysis;
  await t.test('worker notes join atomic task transaction, require real trace, and enforce linked project/source',async()=>{
    linkedAnalysis=await analysis(p,policy.id);linkedTask=await task(p,policy.id,linkedAnalysis);
    const n={...note(policy.id),automation_task_id:linkedTask},args={projectId:p,actorId:users.owner,sourceRevisionId:policy.id,analysisId:linkedAnalysis,traceId:'trc_synthetic_run',notes:[n]};
    await assert.rejects(transaction(pool,db=>appendNoraNotes(db,{...args,traceId:null})),{code:'IMPLEMENTATION_NOTE_TRACE_REQUIRED'});
    const rows=await transaction(pool,db=>appendNoraNotes(db,args));linkedId=rows[0].id;assert.equal(rows[0].origin,'nora');assert.equal(rows[0].trace_id,'trc_synthetic_run');assert.equal(rows[0].analysis_id,linkedAnalysis);assert.equal(rows[0].automation_task_id,linkedTask);
    assert.equal((await transaction(pool,db=>appendNoraNotes(db,args)))[0].replayed,true);
    const count=(await pool.query('SELECT count(*)::int n FROM project_implementation_notes')).rows[0].n;
    await assert.rejects(transaction(pool,async db=>{const aid=await analysis(p,policy.id,null,db),tid=await task(p,policy.id,aid,db);await appendNoraNotes(db,{...args,analysisId:aid,notes:[{...note(policy.id),automation_task_id:tid},{...note(policy.id),evidence:[{segment_id:'s1',quote:'잘못된 인용'}]}]});}),{code:'IMPLEMENTATION_NOTE_EVIDENCE_INVALID'});
    assert.equal((await pool.query('SELECT count(*)::int n FROM project_implementation_notes')).rows[0].n,count);assert.equal((await pool.query('SELECT 1 FROM automation_tasks')).rowCount,1);
    const foreignAnalysis=await analysis(other,foreign.id),foreignTask=await task(other,foreign.id,foreignAnalysis),sameProjectOtherSource=await source(p),wrongAnalysis=await analysis(p,sameProjectOtherSource.id);
    for(const link of [{automation_task_id:foreignTask},{analysis_id:foreignAnalysis},{automation_task_id:linkedTask,analysis_id:wrongAnalysis}])await assert.rejects(service.create(p,users.owner,{...note(policy.id),...link}),{code:'IMPLEMENTATION_NOTE_LINK_INVALID'});
    assert.equal((await service.list(p,users.viewer,{automation_task_id:linkedTask})).total,1);
    const analysisNote=(await service.create(p,users.owner,{...note(policy.id,'work_gap'),analysis_id:linkedAnalysis})).note;
    const sibling=await task(p,policy.id,linkedAnalysis);await service.create(p,users.owner,{...note(policy.id),automation_task_id:sibling});
    const related=await service.list(p,users.viewer,{related_task_id:linkedTask});assert.equal(related.total,2);assert.deepEqual(new Set(related.notes.map(n=>n.id)),new Set([linkedId,analysisNote.id]));
    await assert.rejects(service.list(p,users.viewer,{related_task_id:foreignTask}),{code:'IMPLEMENTATION_NOTE_LINK_INVALID'});
  });
  await t.test('feedback snapshots retain original task, exact note and feedback; followup linking is atomic and idempotent',async()=>{
    const update=await service.feedback(p,users.member,linkedId,{request_id:randomUUID(),expected_version:1,text:'임시 접근에서 설정 화면도 보완해 주세요.'});
    const requestId=randomUUID();let frozen,followupId;
    const out=await transaction(pool,async db=>{
      frozen=await getFollowupInput(db,{projectId:p,noteId:linkedId,actorId:users.member,expectedVersion:2});
      assert.equal(frozen.feedback.feedback_text,'임시 접근에서 설정 화면도 보완해 주세요.');assert.equal(frozen.feedback.feedback_sha256,hash(frozen.feedback.feedback_text));assert.equal(frozen.feedback.original_task.id,linkedTask);assert.equal(frozen.feedback.original_task.kind,'automation_task');assert.equal(frozen.feedback.original_task.artifact,null);assert.equal(frozen.feedback.note.evidence[0].quote,note().evidence[0].quote);
      followupId=await analysis(p,policy.id,frozen.feedback,db);
      return recordFollowup(db,{projectId:p,noteId:linkedId,actorId:users.member,expectedVersion:2,requestId,analysisId:followupId});
    });
    assert.equal(out.note.status,'followup_created');assert.equal(out.note.version,3);
    const replay=await transaction(pool,db=>recordFollowup(db,{projectId:p,noteId:linkedId,actorId:users.member,expectedVersion:2,requestId,analysisId:followupId}));assert.equal(replay.replayed,true);assert.equal(replay.note.version,3);
    await assert.rejects(transaction(pool,db=>getFollowupInput(db,{projectId:p,noteId:linkedId,actorId:users.member,expectedVersion:2})),{code:'IMPLEMENTATION_NOTE_VERSION_CONFLICT'});
    await assert.rejects(transaction(pool,db=>getFollowupInput(db,{projectId:p,noteId:linkedId,actorId:users.member,expectedVersion:3})),{code:'IMPLEMENTATION_NOTE_FEEDBACK_REQUIRED'});
    await service.feedback(p,users.member,linkedId,{request_id:randomUUID(),expected_version:3,text:'다시 확인할 최신 피드백'});
    await assert.rejects(transaction(pool,db=>recordFollowup(db,{projectId:p,noteId:linkedId,actorId:users.member,expectedVersion:4,requestId:randomUUID(),analysisId:followupId})),{code:'IMPLEMENTATION_NOTE_FOLLOWUP_MISMATCH'});
    assert.equal((await service.get(p,users.viewer,linkedId)).note.status,'feedback_received');
    assert.equal(update.note.origin,'nora','human feedback does not change original provenance');
  });
  await t.test('feedback preserves verified code commits before a PR or preview exists',async()=>{
    const aid=await analysis(p,policy.id),tid=await task(p,policy.id,aid);
    const artifact={kind:'git_commit',evidence_status:'verified',head_sha:'b'.repeat(40),base_sha:'a'.repeat(40),target_branch:'main',preview_url:null,pr_number:null,pr_url:null,diff:'not included in the followup snapshot'};
    await pool.query('UPDATE automation_tasks SET artifact=$2 WHERE id=$1',[tid,artifact]);
    const row=(await service.create(p,users.owner,{...note(policy.id),automation_task_id:tid})).note;
    await service.feedback(p,users.member,row.id,{request_id:randomUUID(),expected_version:1,text:'임시 구현된 기간 설정을 보완해 주세요.'});
    const frozen=await transaction(pool,db=>getFollowupInput(db,{projectId:p,noteId:row.id,actorId:users.member,expectedVersion:2}));
    assert.deepEqual(frozen.feedback.original_task.artifact,{kind:'git_commit',head_sha:artifact.head_sha,base_sha:artifact.base_sha,target_branch:'main',preview_url:null});
    assert.equal((await service.get(p,users.viewer,row.id)).note.status,'feedback_received');
  });
  await t.test('manual draft associations preserve draft context and reject a different source',async()=>{
    const drafts=createTaskDrafts({pool}),batch=await drafts.create(p,users.member,{request_id:randomUUID(),revision_id:policy.id,tasks:[{key:'GAP',title:'설정 표시',description:'설정 표시를 검토한다.',acceptance_criteria:['설정이 표시된다.'],evidence:note().evidence}]});
    const row=(await service.create(p,users.member,{...note(policy.id),task_draft_id:batch.items[0].id})).note;
    await service.feedback(p,users.member,row.id,{request_id:randomUUID(),expected_version:1,text:'초안 후속 검토'});
    const frozen=await transaction(pool,db=>getFollowupInput(db,{projectId:p,noteId:row.id,actorId:users.member,expectedVersion:2}));assert.equal(frozen.feedback.original_task.kind,'task_draft');assert.equal(frozen.feedback.original_task.id,batch.items[0].id);
    await assert.rejects(service.create(other,users.owner,{...note(foreign.id),task_draft_id:batch.items[0].id}),{code:'IMPLEMENTATION_NOTE_LINK_INVALID'});
    assert.equal((await service.list(p,users.viewer,{task_draft_id:batch.items[0].id,kind:'temporary_decision',status:'feedback_received'})).total,1);
    await assert.rejects(service.list(p,users.viewer,{limit:101}),{code:'IMPLEMENTATION_NOTE_PAGE_INVALID'});
  });
  const origin='https://implementation-notes.example.test',sessions={};
  server=createApp({pool,appOrigin:origin}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  for(const [role,uid]of Object.entries(users)){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sha256(token),uid,csrf]);sessions[role]={Cookie:'ains_session='+token,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};}
  const base='http://127.0.0.1:'+server.address().port,path='/api/projects/'+p+'/implementation-notes';
  async function request(url,{method='GET',body,as='owner',headers,status=200,code}={}){const res=await fetch(base+url,{method,headers:headers??sessions[as],body:body===undefined?undefined:JSON.stringify(body)}),data=await res.json();assert.equal(res.status,status,JSON.stringify(data));if(code)assert.equal(data.error?.code,code);return data;}
  await t.test('mounted routes enforce authentication, role and CSRF without altering source or task state',async()=>{
    await request(path,{headers:{},status:401,code:'UNAUTHENTICATED'});await request(path,{as:'outsider',status:404,code:'NOT_FOUND'});
    await request(path,{method:'POST',as:'viewer',body:note(policy.id),status:403,code:'FORBIDDEN'});
    await request(path,{method:'POST',body:note(policy.id),headers:{...sessions.owner,'X-CSRF-Token':''},status:403,code:'CSRF_REJECTED'});
    const made=await request(path,{method:'POST',as:'member',body:note(policy.id),status:201});assert.equal(made.note.origin,'manual');
    assert.equal((await request(path+'/'+made.note.id,{as:'viewer'})).history.length,1);
    await request(path+'/'+made.note.id+'/feedback',{method:'POST',as:'viewer',body:{request_id:randomUUID(),expected_version:1,text:'피드백'},status:403,code:'FORBIDDEN'});
    await request(path+'/'+made.note.id+'/review',{method:'POST',as:'member',body:{},status:403,code:'FORBIDDEN'});
    await request(path+'/'+made.note.id+'/followup',{method:'POST',as:'member',body:{request_id:randomUUID(),expected_version:1},status:409,code:'IMPLEMENTATION_NOTE_FEEDBACK_REQUIRED'});
    await request(path+'/'+made.note.id+'/feedback',{method:'POST',as:'member',body:{request_id:randomUUID(),expected_version:1,text:'Nora 연결 후 보완 분석을 요청한다.'}});
    await request(path+'/'+made.note.id+'/followup',{method:'POST',as:'member',body:{request_id:randomUUID(),expected_version:2},status:409,code:'TASK_CONNECTION_REQUIRED'});
    assert.equal((await request(path+'/'+made.note.id,{as:'viewer'})).note.status,'feedback_received','unavailable connection must not consume feedback');
    await request('/api/projects/'+other+'/implementation-notes/'+made.note.id,{status:404,code:'IMPLEMENTATION_NOTE_NOT_FOUND'});
    const list=await request(path+'?limit=1',{as:'viewer'});assert.equal(list.notes.length,1);assert.equal(list.next_offset,1);
  });
});
