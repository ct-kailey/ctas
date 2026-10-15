'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {createApp}=require('../server/server');
const {sha256}=require('../server/auth');
const {createTaskActivity,eventItem,jobItems,boundedItems}=require('../server/task-activity');

test('task activity projections exclude source data and do not invent execution timestamps',()=>{
  const at=new Date('2026-10-15T01:00:00Z');
  const event=eventItem({id:'e',kind:'task_automation.execution_failed',created_at:at,operation:'develop',error_code:'NORA_SERVICE_UNAVAILABLE',trace_id:'trc_actual',prompt:'PRIVATE_PROMPT',detail:{token:'PRIVATE_TOKEN'},stack:'PRIVATE_STACK'});
  assert.deepEqual(event,{id:'event:e',kind:'task_automation.execution_failed',title:'실행 실패 기록',at,status:'failed',summary:'개발 실행 기록',error_code:'NORA_SERVICE_UNAVAILABLE',trace_id:'trc_actual'});
  assert.equal(eventItem({kind:'unknown',detail:'PRIVATE'}),null);
  const invalid=eventItem({id:'bad',kind:'task_automation.execution_failed',created_at:at,error_code:'TOKEN:12345',trace_id:'https://private.example/token'});
  assert.equal(invalid.error_code,undefined);assert.equal(invalid.trace_id,undefined);
  const [registered,state]=jobItems({id:'j',kind:'develop',status:'running',created_at:at,updated_at:at,payload:{token:'PRIVATE'}});
  assert.equal(registered.kind,'job.registered');assert.equal(state.kind,'job.state');assert.equal(state.at,at);
  assert.match(state.summary,/정확한 시작·종료 시각은 아닙니다/);assert.equal(state.started_at,undefined);assert.equal(state.completed_at,undefined);
  assert.equal(jobItems({id:'j',kind:'develop',status:'queued',created_at:at,updated_at:at}).length,1);
  assert.deepEqual(jobItems({kind:'unknown',status:'running'}),[]);
  const area=eventItem({id:'a',kind:'task_area.updated',created_at:at,area:'screen',before_status:'todo',after_status:'in_progress',changed_fields:['assignee_ids','description','PRIVATE_FIELD'],description:'PRIVATE'});
  assert.equal(area.summary,'화면 · 할 일 → 진행 중 · 담당자 변경 · 작업 내용 수정');
});
test('activity retains the newest bounded records and displays them chronologically',()=>{
  const source=[1,3,2].map(n=>({id:String(n),at:new Date(n*1000),title:String(n)}));
  const output=boundedItems(source,2);
  assert.deepEqual(output.items.map(item=>item.id),['2','3']);assert.equal(output.has_more,true);assert.equal(output.order,'asc');assert.equal(output.limit,2);
  assert.deepEqual(source.map(item=>item.id),['1','3','2']);
});

test('task activity reads exact task evidence with bounded history, permissions and shared projection', {skip:!process.env.TEST_DATABASE_URL},async t=>{
  const schema='task_activity_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);let pool,server;
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
  const users={},sessions={},origin='https://task-activity.test';
  for(const role of ['owner','member','viewer','outsider']){
    users[role]=(await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,'PRIVATE_PASSWORD') RETURNING id",[role,role+'@task-activity.test'])).rows[0].id;
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
    await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sha256(token),users[role],csrf]);
    sessions[role]={Cookie:'ains_session='+token,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};
  }
  const ledger=createLedger(pool),service=createTaskActivity({pool});
  async function fixture(){
    const p=(await ledger.createProject(users.owner,{name:'실행 이력'})).id;
    for(const role of ['member','viewer'])await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,users[role],role]);
    const record=await ledger.createRecord(p,users.owner,{title:'정책',document_category:'policy',text:'로그인 정책 PRIVATE_SOURCE',history:{source_type:'other',channel:'테스트'}});
    const aid=randomUUID(),tid=randomUUID();
    await pool.query('INSERT INTO task_automation_analyses(id,project_id,revision_id,request_sha256,input_snapshot,input_sha256,dedup_sha256,created_by) VALUES($1,$2,$3,$4,$5,$4,$6,$7)',[aid,p,record.revision_id,'a'.repeat(64),{prompt:'PRIVATE_ANALYSIS_PROMPT'},aid,users.owner]);
    await pool.query('INSERT INTO automation_tasks(id,project_id,analysis_id,title,description,acceptance_criteria,evidence,input_snapshot,input_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[tid,p,aid,'PRIVATE_TASK_TITLE','PRIVATE_TASK_DESCRIPTION','[]','[]',{token:'PRIVATE_INPUT'},'b'.repeat(64),users.owner]);
    return{p,aid,tid,record};
  }
  const f=await fixture(),other=await fixture();
  async function audit(kind,entity=f.tid,{project=f.p,at='2026-10-15T01:00:00Z',...detail}={}){
    const id=randomUUID();await pool.query('INSERT INTO events(id,project_id,actor_id,kind,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,project,users.owner,kind,entity,{prompt:'PRIVATE_EVENT_PROMPT',token:'PRIVATE_EVENT_TOKEN',stack:'PRIVATE_STACK',raw_input:'PRIVATE_RAW',...detail},at]);return id;
  }
  const allowed=await audit('task_automation.development_requested',f.tid,{provisional_authorized:true});
  const analysisEvent=await audit('task_automation.analysis_requested',f.aid,{at:'2026-10-15T00:00:00Z'});
  const unknown=await audit('task_automation.secret_dump');
  const foreign=await audit('task_automation.execution_failed',f.tid,{project:other.p,error_code:'NORA_AUTH_REQUIRED'});
  const wrongTask=await audit('task_automation.execution_failed',other.tid);
  const wrongAnalysis=await audit('task_automation.analysis_requested',other.aid);
  const privateMetadata=await audit('task_automation.execution_failed',f.tid,{error_code:'Token PRIVATE_CODE',trace_id:'https://private.example/PRIVATE_TRACE',kind:'develop'});
  const artifactSaved=await audit('task_automation.review_ready');
  await pool.query("UPDATE automation_tasks SET execution_trace_id='trc_saved_development' WHERE id=$1",[f.tid]);
  const job=(await pool.query(`INSERT INTO task_automation_jobs(project_id,kind,task_id,created_by,payload,status,error_code,trace_id,created_at,updated_at)
    VALUES($1,'develop',$2,$3,$4,'awaiting_connection','TASK_CONNECTION_REQUIRED','trc_saved_job','2026-10-15T01:01:00Z','2026-10-15T01:02:00Z') RETURNING id`,[f.p,f.tid,users.owner,{token:'PRIVATE_JOB_TOKEN',prompt:'PRIVATE_JOB_PROMPT'}])).rows[0].id;
  await pool.query("INSERT INTO task_automation_jobs(project_id,kind,analysis_id,created_by,payload,status,created_at) VALUES($1,'risk',$2,$3,$4,'succeeded','2026-10-15T00:00:30Z')",[f.p,f.aid,users.owner,{input:'PRIVATE_RISK_INPUT'}]);
  const note=randomUUID();
  await pool.query(`INSERT INTO project_implementation_notes(id,project_id,kind,origin,trace_id,title,uncertainty,temporary_approach,rationale,impact,replacement_condition,evidence,source_revision_id,source_document_id,source_sha256,source_title,automation_task_id,analysis_id,request_sha256,created_by)
    VALUES($1,$2,'temporary_decision','nora','trc_saved_note','PRIVATE_NOTE_TITLE','PRIVATE_UNCERTAINTY','PRIVATE_APPROACH','PRIVATE_RATIONALE','PRIVATE_IMPACT','PRIVATE_REPLACEMENT','[{}]',$3,$4,$5,'PRIVATE_SOURCE_TITLE',$6,$7,$5,$8)`,[note,f.p,f.record.revision_id,f.record.document_id,'c'.repeat(64),f.tid,f.aid,users.owner]);
  await t.test('only allowlisted exact task and related analysis records are projected',async()=>{
    const data=await service.get(f.p,users.viewer,f.tid);
    assert.equal(data.limit,100);assert.equal(data.has_more,false);assert.equal(data.order,'asc');
    const ids=new Set(data.items.map(item=>item.id));
    for(const id of [allowed,analysisEvent,privateMetadata])assert.ok(ids.has('event:'+id));
    for(const id of [unknown,foreign,wrongTask,wrongAnalysis])assert.equal(ids.has('event:'+id),false);
    assert.ok(ids.has('task:'+f.tid+':created'));assert.ok(ids.has('job:'+job+':registered'));assert.ok(ids.has('note:'+note+':created'));
    assert.equal(data.items.find(item=>item.id==='job:'+job+':state').trace_id,'trc_saved_job');
    assert.equal(data.items.find(item=>item.id==='note:'+note+':created').trace_id,'trc_saved_note');
    assert.equal(data.items.find(item=>item.id==='event:'+artifactSaved).trace_id,'trc_saved_development');
    assert.doesNotMatch(JSON.stringify(data),/PRIVATE_|payload|raw_input|password|prompt|lease_token|sdk_working_folder/);
    assert.ok(data.items.every((item,index)=>!index||new Date(data.items[index-1].at)<=new Date(item.at)));
    const client=await pool.connect();try{await client.query('BEGIN READ ONLY');assert.deepEqual(await createTaskActivity({pool:client}).get(f.p,users.member,f.tid),data);}finally{await client.query('ROLLBACK');client.release();}
  });
  await t.test('task IDs and membership cannot cross project boundaries',async()=>{
    await assert.rejects(service.get(f.p,users.outsider,f.tid),{code:'FORBIDDEN'});
    await assert.rejects(service.get(f.p,users.owner,other.tid),{code:'TASK_NOT_FOUND',status:404});
    await assert.rejects(service.get(f.p,users.owner,randomUUID()),{code:'TASK_NOT_FOUND'});
    await assert.rejects(service.get(f.p,users.owner,'invalid'),{code:'TASK_ACTIVITY_ID_INVALID',status:400});
  });
  server=createApp({pool,appOrigin:origin}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port,path='/api/projects/'+f.p+'/task-automation/tasks/'+f.tid+'/activity';
  async function request(route=path,{as='owner',headers,method='GET',body,status=200}={}){
    const res=await fetch(base+route,{method,headers:headers??sessions[as],body:body===undefined?undefined:JSON.stringify(body)});
    const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));assert.equal(res.headers.get('cache-control'),'no-store');return{data,res};
  }
  await t.test('HTTP activity is available to project readers without remote execution',async()=>{
    const before=(await pool.query('SELECT count(*)::int n FROM task_automation_jobs')).rows[0].n;
    assert.ok((await request(path,{as:'viewer'})).data.items.length);
    await request(path,{headers:{},status:401});await request(path,{as:'outsider',status:404});
    await request(path.replace(f.tid,other.tid),{status:404});
    await request(path,{method:'POST',body:{},status:404});
    assert.equal((await pool.query('SELECT count(*)::int n FROM task_automation_jobs')).rows[0].n,before);
    assert.deepEqual((await pool.query('SELECT status,execution_status FROM automation_tasks WHERE id=$1',[f.tid])).rows[0],{status:'todo',execution_status:'idle'});
  });
  await t.test('anonymous share permits the minimal activity projection only',async()=>{
    const {data:share}=await request('/api/shared-views',{method:'POST',body:{project_ids:[f.p],label:'실행 이력 공유',expires_in_hours:1},status:201});
    const token=new URL(share.share_url).hash.slice('#share='.length);
    const {res}=await request('/api/auth/shared-view',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:{token}});
    const cookie=res.headers.getSetCookie().filter(value=>value.startsWith('ains_shared_session=')||value.startsWith('ains_view_mode=')).map(value=>value.split(';')[0]).join('; ');
    const {data}=await request(path,{headers:{Cookie:cookie}});
    assert.ok(data.items.length);assert.doesNotMatch(JSON.stringify(data),/PRIVATE_|@task-activity|token|prompt|payload/);
    await request(path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:{},status:403});
    await request('/api/projects/'+other.p+'/task-automation/tasks/'+other.tid+'/activity',{headers:{Cookie:cookie},status:404});
  });
  await t.test('latest one hundred records are retained with an explicit truncation flag',async()=>{
    await pool.query(`INSERT INTO events(project_id,actor_id,kind,entity_id,detail,created_at)
      SELECT $1,$2,'task_automation.artifact_verification_updated',$3,'{"raw_output":"PRIVATE_OUTPUT"}',now()+n*interval '1 second' FROM generate_series(1,105) n`,[f.p,users.owner,f.tid]);
    const data=await service.get(f.p,users.viewer,f.tid);
    assert.equal(data.items.length,100);assert.equal(data.has_more,true);assert.ok(data.items.every(item=>item.kind==='task_automation.artifact_verification_updated'));
    assert.ok(data.items.every((item,index)=>!index||new Date(data.items[index-1].at)<=new Date(item.at)));
  });
});
