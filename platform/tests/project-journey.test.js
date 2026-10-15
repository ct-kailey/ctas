'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { randomUUID }=require('node:crypto');
const express=require('express');
const { createPool,migrate }=require('../server/db');
const { createLedger }=require('../server/ledger');
const { createTaskDrafts }=require('../server/task-drafts');
const { createImplementationNotes }=require('../server/implementation-notes');
const { hash }=require('../server/context-contract');
const { createProjectJourney,parseMilestone,parseFilters,EVENT_SQL }=require('../server/project-journey');
const { mountProjectJourneyRoutes }=require('../server/project-journey-routes');
const milestone=(extra={})=>({request_id:randomUUID(),kind:'planning_started',title:'기획 시작 기록',occurred_at:'2023-01-01T09:00:00+09:00',...extra});

test('journey input contracts preserve full-range dates and reject ambiguous writes',()=>{
  assert.equal(parseFilters({from:'2020-01-01T00:00:00Z',to:'2026-01-01T00:00:00Z'}).limit,50);
  assert.equal(parseMilestone(milestone()).stage,'planning');
  for(const q of [{limit:0},{limit:101},{type:'bad'},{stage:'done'},{from:'2024-02-30T00:00:00Z'},{from:'2024-01-01'},{from:'2024-01-02T00:00:00Z',to:'2024-01-01T00:00:00Z'},{cursor:[]}]) {
    if(q.cursor)continue;
    assert.throws(()=>parseFilters(q));
  }
  for(const extra of [{kind:'done'},{kind:'custom'},{kind:'contract_signed',stage:'closure'},{title:''},{title:'x'.repeat(301)},{occurred_at:'2100-01-01T00:00:00Z'},{approved:true},{source_refs:[{type:'analysis',id:randomUUID()}]},{source_refs:[{type:'revision',id:'wrong'}]}])assert.throws(()=>parseMilestone(milestone(extra)));
  const ref={type:'revision',id:randomUUID()};assert.throws(()=>parseMilestone(milestone({source_refs:[ref,ref]})),{code:'JOURNEY_REFERENCES_INVALID'});
});

test('project journey aggregates real histories, honest progress and immutable manual milestones', {skip:!process.env.TEST_DATABASE_URL},async t=>{
  const schema='journey_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);let pool,server;
  t.after(async()=>{if(server)await new Promise(r=>server.close(r));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  await admin.query(`CREATE SCHEMA ${schema}`);pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
  const users={};for(const role of ['owner','reviewer','member','viewer','outsider'])users[role]=(await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[role+'@journey.test',role,'unused'])).rows[0].id;
  async function project(){const p=randomUUID();await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)',[p,'여정 테스트']);for(const role of ['owner','reviewer','member','viewer'])await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,users[role],role]);return p;}
  const service=createProjectJourney({pool}),ledger=createLedger(pool),notes=createImplementationNotes({pool}),p=await project(),other=await project();
  async function source(projectId=p){const record=await ledger.createRecord(projectId,users.owner,{title:'타임라인 정책',document_category:'policy',text:'기록은 보존한다. 기간은 확인한다.',history:{source_type:'other',occurred_on:'2020-01-01',channel:'검증'}});const r=await ledger.getRevision(projectId,record.revision_id);await pool.query("UPDATE revisions SET status='ready',document_json=$2 WHERE id=$1",[r.id,{project_id:projectId,revision_id:r.id,document_id:r.document_id,source:{sha256:r.sha256},extraction:{complete:true},segments:[{segment_id:'s1',text:'기록은 보존한다. 기간은 확인한다.',extraction_status:'ok'}]}]);return r;}
  async function audit(kind,entity,detail={},projectId=p,at=null){return (await pool.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,clock_timestamp())) RETURNING id',[projectId,users.owner,kind,entity,detail,at])).rows[0].id;}
  async function analysis(r,projectId=p){const aid=randomUUID();await pool.query('INSERT INTO task_automation_analyses(id,project_id,revision_id,request_sha256,input_snapshot,input_sha256,dedup_sha256,created_by,result) VALUES($1,$2,$3,$4,$5,$4,$6,$7,$8)',[aid,projectId,r.id,hash(aid),{source:{revision_id:r.id},secret:'PRIVATE-SNAPSHOT'},hash(randomUUID()),users.owner,{summary:'정책 위험 검토',risks:[{description:'보관 기간 미확정',severity:'review'}],tasks:[{title:'기간 표시',description:'기간을 설정으로 표시한다.'}],secret:'PRIVATE-RESULT'}]);return aid;}
  async function task(aid,{status='todo',execution_status='idle',partial=false}={}){const tid=randomUUID();await pool.query('INSERT INTO automation_tasks(id,project_id,analysis_id,title,description,acceptance_criteria,evidence,input_snapshot,input_sha256,status,execution_status,artifact,review,merge_result,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[tid,p,aid,'기간 표시','기간을 표시한다.',JSON.stringify(['기간 표시']),JSON.stringify([{quote:'기간은 확인한다.'}]),{source:{revision_id:policy.id}},hash(tid),status,execution_status,['qa','done'].includes(status)?{implementation_report:{completion:partial?'partial':'complete'}}:null,status==='done'?{}:null,status==='done'?{merged:true}:null,users.owner]);return tid;}
  const initial=await service.overview(p,users.viewer);assert.equal(initial.progress.percent,null);assert.equal(initial.summary.event_count,0);assert.equal(initial.permissions.record_milestone,false);
  const policy=await source(),foreign=await source(other),aid=await analysis(policy);
  let plan,work,qaTask,doneTask,gap,temporary,contractRevision,contractDocument,requestId,preflight,validation;
  await t.test('execution task denominator excludes draft/analysis/plan/request records and preserves genuine followups',async()=>{
    const draft=await createTaskDrafts({pool}).create(p,users.member,{request_id:randomUUID(),revision_id:policy.id,tasks:[{key:'PERIOD',title:'기간 표시',description:'기간을 표시한다.',acceptance_criteria:['기간 표시'],priority:'normal',depends_on:[],question_notes:[],evidence:[{segment_id:'s1',quote:'기간은 확인한다.'}]}]});assert.equal(draft.items.length,1);
    plan=randomUUID();await pool.query("INSERT INTO implementation_plans(id,project_id,requested_revision_ids,request_sha256,input_snapshot,input_sha256,status,result,trace_id,decision,created_by) VALUES($1,$2,$3,$4,$5,$4,'approved',$6,'trc_fixture',$7,$8)",[plan,p,[policy.id],hash(plan),{secret:'PRIVATE-SNAPSHOT'},{title:'실행 계획',summary:'정책 구현 검토',tasks:[{id:'TASK-1',title:'기간 표시',description:'기간 설정 표시'}],secret:'PRIVATE-RESULT'},{reason:'검토 승인'},users.owner]);
    work=randomUUID();await pool.query("INSERT INTO work_items(id,project_id,plan_id,source_task_id,source_task,status,created_by) VALUES($1,$2,$3,'TASK-1',$4,'done',$5)",[work,p,plan,{id:'TASK-1',title:'기간 표시',description:'기간 설정'},users.owner]);
    requestId=randomUUID();await pool.query("INSERT INTO implementation_requests(id,project_id,plan_id,input_snapshot,input_sha256,status,error_code,created_by,result) VALUES($1,$2,$3,$4,$5,'failed','EXECUTION_CANCELLED',$6,$7)",[requestId,p,plan,{secret:'PRIVATE-SNAPSHOT'},hash(plan),users.owner,{summary:'실행 요청 취소',patch:'PRIVATE-PATCH'}]);
    qaTask=await task(aid,{status:'qa',execution_status:'ready'});doneTask=await task(aid,{status:'done',execution_status:'ready',partial:true});await task(aid,{status:'blocked',execution_status:'ready'});
    await task(aid); // A new followup ID remains a real additional task, even with the same title.
    const result=await service.overview(p,users.viewer);
    assert.equal(result.progress.total,5);assert.equal(result.progress.done,2);assert.equal(result.progress.qa,1);assert.equal(result.progress.blocked,1);assert.equal(result.progress.todo,1);assert.equal(result.progress.percent,40);assert.equal(result.progress.unvalidated_drafts,1);assert.equal(result.progress.completed_partial_tasks,1);assert.equal(result.progress.cancelled_excluded,0);assert.equal(result.progress.rejected_excluded,0);
  });
  await t.test('open archives remain visible beside completion and review does not imply shipment',async()=>{
    const input=kind=>({request_id:randomUUID(),kind,title:'보관 기간 확인',uncertainty:'기간은 미정',temporary_approach:kind==='temporary_decision'?'자동 삭제를 활성화하지 않는다.':'',rationale:'원문에서 기간은 확인 대상',impact:'정책 후속 확인',replacement_condition:'승인된 기간 근거',source_revision_id:policy.id,automation_task_id:doneTask,evidence:[{segment_id:'s1',quote:'기간은 확인한다.'}]});
    gap=(await notes.create(p,users.member,input('work_gap'))).note;temporary=(await notes.create(p,users.member,input('temporary_decision'))).note;
    assert.equal((await service.overview(p,users.viewer)).progress.open_work_gaps,1);assert.equal((await service.overview(p,users.viewer)).progress.open_temporary_decisions,1);
    await notes.review(p,users.reviewer,temporary.id,{request_id:randomUUID(),expected_version:1,status:'accepted',note:'임시 방식 수용',result_evidence:[{type:'revision',id:policy.id,segment_id:'s1',quote:'기간은 확인한다.'}]});
    assert.equal((await service.overview(p,users.viewer)).progress.open_temporary_decisions,0);
    await notes.feedback(p,users.member,temporary.id,{request_id:randomUUID(),expected_version:2,text:'새 정책 확인'});
    assert.equal((await service.overview(p,users.viewer)).progress.open_temporary_decisions,1);
    const list=await service.events(p,users.viewer,{type:'implementation_note_event'});
    assert.equal(list.total,4);assert.equal(list.events.some(e=>e.type==='audit'),false);
    assert.equal((await service.getSource(p,users.viewer,'automation_task',doneTask)).fields.find(f=>f.label==='현재 상태').value,'done');
  });
  await t.test('timeline uses immutable event states, includes actual contract/review records and omits audit duplicates',async()=>{
    const wid=(await pool.query("INSERT INTO work_item_events(project_id,work_item_id,version,kind,actor_id,note,after_state,created_at) VALUES($1,$2,1,'imported',$3,'작업 등록',$4,'2021-01-01') RETURNING id",[p,work,users.owner,{status:'todo'}])).rows[0].id;
    await audit('work_item.imported',work,{status:'done'});await audit('task_draft.created',randomUUID());
    const past=await service.detail(p,users.viewer,'work_item_event',wid);assert.equal(past.event.stage,'implementation');assert.equal(past.detail.fields.find(f=>f.label==='기록 당시 상태').value,'todo');
    contractDocument=(await pool.query("INSERT INTO commercial_documents(project_id,kind,title,created_by) VALUES($1,'contract','계약 초안',$2) RETURNING id",[p,users.owner])).rows[0].id;
    contractRevision=(await pool.query("INSERT INTO commercial_document_revisions(project_id,document_id,sequence,title,content,origin,reason,created_by) VALUES($1,$2,1,'계약 원문',$3,'editor','본문 등록',$4) RETURNING id",[p,contractDocument,{sections:[{id:'scope',title:'범위',body:'범위 원문'}],tables:[{id:'price',title:'견적',columns:['항목','비용'],rows:[['구현','협의']]}]},users.owner])).rows[0].id;
    await pool.query("INSERT INTO commercial_decisions(project_id,document_id,revision_id,profile_version,profile_sha256,decision,reason,actor_id) VALUES($1,$2,$3,1,$4,'approved','승인 근거',$5)",[p,contractDocument,contractRevision,hash('profile'),users.reviewer]);
    await audit('commercial.revision_created',contractRevision);await audit('commercial.revision_approved',contractRevision);
    const hid=await audit('commercial.stage_changed',p,{before:{stage:'contracted',token:'PRIVATE-TOKEN'},after:{stage:'handoff',secret:'PRIVATE-TOKEN'},reason:'개발 인계'});
    const handoff=await service.detail(p,users.viewer,'audit',hid);assert.equal(handoff.event.stage,'contract');assert.match(handoff.detail.fields.find(f=>f.label==='주의').value,/최종 전달.*아닙니다/);assert.ok(!JSON.stringify(handoff).includes('PRIVATE-'));
    const g=randomUUID();await pool.query("INSERT INTO github_deliveries(id,project_id,execution_id,request_sha256,snapshot,snapshot_sha256,status,branch,created_by) VALUES($1,$2,$3,$4,$5,$4,'published','ains/example',$6)",[g,p,requestId,hash(g),{token:'PRIVATE-TOKEN'},users.owner]);const gid=await audit('github_delivery.published',g,{pr_url:'https://github.com/example/project/pull/1',token:'PRIVATE-TOKEN'});
    assert.equal((await service.detail(p,users.viewer,'audit',gid)).event.stage,'review');assert.equal((await service.overview(p,users.viewer)).stages.find(s=>s.id==='delivery').event_count,0);
    const list=await service.events(p,users.viewer,{limit:100});assert.equal(list.events.filter(e=>e.type==='revision').length,1);assert.equal(list.events.filter(e=>e.type==='commercial_revision').length,1);assert.equal(list.events.filter(e=>e.type==='commercial_decision').length,1);assert.equal(list.events.filter(e=>e.type==='work_item_event').length,1);assert.equal(list.events.some(e=>['work_item.imported','commercial.revision_created','commercial.revision_approved','task_draft.created','revision.uploaded'].includes(e.kind)),false);
    assert.equal(list.events.find(e=>e.type==='revision').occurred_time_source,'recorded');assert.equal(list.events.find(e=>e.type==='revision').kind,'document_registered');
  });
  await t.test('milestones are owner/reviewer only, project scoped, immutable and exactly idempotent',async()=>{
    const input=milestone({kind:'contract_signed',source_refs:[{type:'revision',id:policy.id},{type:'commercial_revision',id:contractRevision},{type:'automation_task',id:doneTask}]});
    for(const role of ['member','viewer','outsider'])await assert.rejects(service.recordMilestone(p,users[role],input),{code:'FORBIDDEN'});
    await assert.rejects(service.recordMilestone(p,users.owner,milestone({source_refs:[{type:'revision',id:foreign.id}]})),{code:'JOURNEY_SOURCE_NOT_FOUND'});
    const responses=await Promise.all([service.recordMilestone(p,users.reviewer,input),service.recordMilestone(p,users.reviewer,input)]);assert.deepEqual(responses.map(r=>r.replayed).sort(),[false,true]);assert.equal(responses[0].milestone.source_refs.length,3);
    assert.ok(responses[0].milestone.created_at>new Date(responses[0].milestone.occurred_at));assert.equal(responses[0].milestone.created_by,users.reviewer);
    await assert.rejects(service.recordMilestone(p,users.owner,input),{code:'JOURNEY_REQUEST_CONFLICT'});await assert.rejects(service.recordMilestone(other,users.reviewer,input),{code:'JOURNEY_REQUEST_CONFLICT'});await assert.rejects(service.recordMilestone(p,users.reviewer,{...input,title:'변경'}),{code:'JOURNEY_REQUEST_CONFLICT'});
    await assert.rejects(pool.query("UPDATE project_journey_milestones SET title='바꾸기' WHERE id=$1",[input.request_id]));await assert.rejects(pool.query('DELETE FROM project_journey_milestones WHERE id=$1',[input.request_id]));
    const before=(await service.overview(p,users.owner)).progress;await service.recordMilestone(p,users.owner,milestone({kind:'final_delivery',title:'고객에게 최종 전달'}));await service.recordMilestone(p,users.owner,milestone({kind:'contract_closed',title:'계약 종료 확인'}));
    const after=await service.overview(p,users.owner);assert.deepEqual(after.progress,before);assert.equal(after.stages.find(s=>s.id==='delivery').milestone_count,1);assert.equal(after.stages.find(s=>s.id==='closure').milestone_count,1);
  });
  await t.test('full-period keyset pagination preserves microseconds and snapshot when newly recorded events are backdated',async()=>{
    const pageProject=await project();
    const ids=[];for(let i=0;i<7;i++){const input=milestone({occurred_at:i===0?'2020-01-01T00:00:00Z':'2024-01-01T00:00:00Z'});await service.recordMilestone(pageProject,users.owner,input);ids.push(input.request_id);}
    const first=await service.events(pageProject,users.viewer,{limit:2});assert.equal(first.total,7);assert.equal(first.events[0].occurred_at.slice(0,4),'2020');
    await service.recordMilestone(pageProject,users.owner,milestone({occurred_at:'2021-01-01T00:00:00Z'}));
    let cursor=first.next_cursor;const seen=first.events.map(e=>e.id);while(cursor){const page=await service.events(pageProject,users.viewer,{limit:2,cursor});assert.equal(page.snapshot_at,first.snapshot_at);assert.equal(page.total,7);seen.push(...page.events.map(e=>e.id));cursor=page.next_cursor;}
    assert.equal(new Set(seen).size,7);assert.deepEqual([...seen].sort(),ids.sort());assert.equal((await service.events(pageProject,users.viewer)).total,8);
    await assert.rejects(service.events(other,users.viewer,{cursor:first.next_cursor}),{code:'JOURNEY_CURSOR_INVALID'});await assert.rejects(service.events(pageProject,users.viewer,{stage:'closure',cursor:first.next_cursor}),{code:'JOURNEY_CURSOR_INVALID'});await assert.rejects(service.events(pageProject,users.viewer,{cursor:'not-valid'}),{code:'JOURNEY_CURSOR_INVALID'});
    assert.equal((await service.events(pageProject,users.viewer,{from:'2020-01-01T00:00:00Z',to:'2021-01-01T00:00:00Z'})).total,1);
    const tiedProject=await project();for(let i=1;i<=3;i++)await audit('project.created',tiedProject,{},tiedProject,'2024-01-01T00:00:00.00000'+i+'Z');
    let micro=await service.events(tiedProject,users.owner,{limit:1});const microIds=[];while(true){microIds.push(...micro.events.map(e=>e.id));if(!micro.next_cursor)break;micro=await service.events(tiedProject,users.owner,{limit:1,cursor:micro.next_cursor});}assert.equal(new Set(microIds).size,3);
  });
  await t.test('source detail is bounded, provides real plan/contract/results, excludes arbitrary metadata and enforces membership',async()=>{
    preflight=randomUUID();await pool.query("INSERT INTO work_preflights(id,project_id,work_item_id,request_sha256,input_snapshot,input_sha256,report,created_by) VALUES($1,$2,$3,$4,$5,$4,$6,$7)",[preflight,p,work,hash(preflight),{title:'범위 사전 검토',requirement:'기간을 표시한다.',token:'PRIVATE-TOKEN'},{summary:'사전 검토 요약',findings:[{message:'보관 기간 확인'}],token:'PRIVATE-TOKEN'},users.owner]);
    validation=randomUUID();await pool.query('INSERT INTO work_result_validations(id,project_id,preflight_id,request_sha256,input_snapshot,input_sha256,report,created_by) VALUES($1,$2,$3,$4,$5,$4,$6,$7)',[validation,p,preflight,hash(validation),{token:'PRIVATE-TOKEN'},{summary:'검수 요약',issues:[{severity:'review',message:'테스트 근거 필요'}],requirements:[{text:'기간 표시',status:'missing'}],token:'PRIVATE-TOKEN'},users.owner]);
    for(const [type,rid,needle] of [['revision',policy.id,'정책'],['commercial_revision',contractRevision,'범위 원문'],['implementation_plan',plan,'기간 설정 표시'],['implementation_request',requestId,'실행 요청 취소'],['work_preflight',preflight,'보관 기간 확인'],['work_validation',validation,'테스트 근거 필요'],['analysis',aid,'보관 기간 미확정']]){
      const result=await service.getSource(p,users.viewer,type,rid);assert.equal(result.source.id,rid);assert.match(JSON.stringify(result),new RegExp(needle));assert.ok(!JSON.stringify(result).includes('PRIVATE-'));
      await assert.rejects(service.getSource(other,users.viewer,type,rid),{code:'JOURNEY_SOURCE_NOT_FOUND'});await assert.rejects(service.getSource(p,users.outsider,type,rid),{code:'FORBIDDEN'});
    }
    await assert.rejects(service.events(p,users.outsider),{code:'FORBIDDEN'});await assert.rejects(service.overview(p,users.outsider),{code:'FORBIDDEN'});await assert.rejects(service.detail(other,users.viewer,'revision',policy.id),{code:'JOURNEY_EVENT_NOT_FOUND'});
  });
  await t.test('event pagination uses fixed query count and PostgreSQL scopes every source',async()=>{
    let calls=0;const counted={query(...args){calls++;return pool.query(...args);}};
    const countedService=createProjectJourney({pool:counted});await countedService.events(p,users.viewer,{limit:100});assert.equal(calls,3);
    const explain=(await pool.query(`EXPLAIN (FORMAT JSON) SELECT * FROM (${EVENT_SQL}) journey`,[p])).rows[0]['QUERY PLAN'];assert.match(JSON.stringify(explain),new RegExp(p));
    const bulkProject=await project();await pool.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail,created_at) SELECT $1,$2,'project.created',$1,'{}','2022-01-01'::timestamptz+n*interval '1 microsecond' FROM generate_series(1,1200)n",[bulkProject,users.owner]);
    const page=await service.events(bulkProject,users.viewer,{limit:100});assert.equal(page.events.length,100);assert.equal(page.total,1200);const next=await service.events(bulkProject,users.viewer,{limit:100,cursor:page.next_cursor});assert.equal(next.events.length,100);assert.equal(new Set([...page.events,...next.events].map(e=>e.id)).size,200);
  });
  await t.test('HTTP routes return exact envelopes and reject reader mutations',async()=>{
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:users[req.get('x-test-role')||'viewer']};next();});const router=express.Router({mergeParams:true});mountProjectJourneyRoutes(router,{pool,review:(req,res,next)=>next()});app.use('/api/projects/:p',router);app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.code||err.message}));server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base='http://127.0.0.1:'+server.address().port+'/api/projects/'+p;
    const overview=await (await fetch(base+'/journey')).json();assert.equal(overview.permissions.record_milestone,false);
    const events=await (await fetch(base+'/journey/events?type=revision')).json();assert.equal(events.events.length,1);assert.equal((await fetch(base+'/journey/events/revision/'+policy.id)).status,200);assert.equal((await fetch(base+'/journey/sources/implementation_plan/'+plan)).status,200);
    assert.equal((await fetch(base+'/journey/milestones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(milestone())})).status,403);
    const input=milestone();const submit=()=>fetch(base+'/journey/milestones',{method:'POST',headers:{'Content-Type':'application/json','x-test-role':'owner'},body:JSON.stringify(input)});assert.equal((await submit()).status,201);assert.equal((await submit()).status,200);
  });
});
