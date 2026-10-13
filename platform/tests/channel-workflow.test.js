'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {createChannelLedger}=require('../server/channel-ledger');
const {createChannelWorkflowService}=require('../server/channel-workflow');
const {createQuestionService,getBlockingQuestions}=require('../server/question-ledger');
const {getAnalysisInput}=require('../server/work-governance');
const url=process.env.TEST_DATABASE_URL,suite=url?test:test.skip,code=c=>e=>e.code===c;
let admin,pool,schema,owner,reviewer,member,viewer,outsider,ledger,channels,workflow,questions;
before(async()=>{
 if(!url)return;schema='channel_workflow_'+randomUUID().replaceAll('-','');admin=createPool(url);await admin.query(`CREATE SCHEMA ${schema}`);
 pool=createPool({connectionString:url,options:`-c search_path=${schema}`});await migrate(pool);
 [owner,reviewer,member,viewer,outsider]=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('owner@workflow.test','Owner','unused'),('reviewer@workflow.test','Reviewer','unused'),('member@workflow.test','Member','unused'),('viewer@workflow.test','Viewer','unused'),('outsider@workflow.test','Outsider','unused') RETURNING id")).rows.map(r=>r.id);
 ledger=createLedger(pool);channels=createChannelLedger(pool);workflow=createChannelWorkflowService(pool);questions=createQuestionService(pool);
});
after(async()=>{if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
async function fixture({accepted=true,timestamp=true,deleted=false}={}){
 const p=(await ledger.createProject(owner,{name:'채널 업무 연결 검증'})).id;
 await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'reviewer'),($1,$3,'member'),($1,$4,'viewer')",[p,reviewer,member,viewer]);
 const domain=(await ledger.listDomains(p))[0];
 const src=await channels.createSource(p,owner,{provider:'kakaotalk',name:'고객 협의방',external_channel_id:'ROOM-1',default_domain_id:domain.id});
 const original={batch_id:randomUUID(),conversation_key:'source-conversation',messages:[{event_id:randomUUID(),message_id:randomUUID(),kind:deleted?'deleted':'created',author:'고객 PM',text:deleted?'':'로그인 오류를 수정해 주세요. 실패 5회 후 잠금으로 합의했습니다.',sent_at:timestamp?'2026-10-01T10:00:00+09:00':null,changed_at:deleted?'2026-10-01T11:00:00+09:00':null,url:'https://example.test/message/1'}]};
 const inbox=await channels.ingest(p,src.id,member,original);
 if(accepted){await pool.query("UPDATE channel_inbox SET status='needs_review' WHERE id=$1",[inbox.id]);await channels.accept(p,inbox.id,reviewer,{title:'검토한 고객 요청',text:'담당자가 원문을 확인했습니다.',domain_id:domain.id,record_kind:'conversation',decided_on:null,reason:'원문 대조',acknowledge_evidence:true});}
 const preview=await workflow.preview(p,owner,inbox.id);
 return {p,domain,src,inbox,original,preview};
}
function request(f,extra={}){return {request_id:randomUUID(),source_sha256:f.preview.source_ref?.sha256||'a'.repeat(64),event_ids:[f.inbox.evidence[0].id],text:'로그인 버그를 수정해 주세요.',acknowledge_evidence:true,...extra};}
async function waiting(f,extra={}){
 return questions.create(f.p,member,{request_id:randomUUID(),title:'잠금 기준 확인',question:'실패 5회 후 잠금인가요?',recipient:'고객 PM',channel:'kakaotalk',assigned_to:member,asked_by:'프로젝트 PM',asked_at:'2026-09-30T00:00:00Z',due_at:null,blocking:true,source_refs:[],work_item_ids:[],...extra});
}
function answer(f,q,extra={}){return request(f,{text:'실패 5회 후 잠금입니다.',question_id:q.id,expected_question_version:q.version,responded_by:'고객 PM',responded_at:'2026-10-01T01:00:00.000Z',...extra});}
async function count(p,table){return (await pool.query(`SELECT count(*)::int n FROM ${table} WHERE project_id=$1`,[p])).rows[0].n;}
suite('reviewed channel creates exactly one pending classification and immutable provenance under concurrent replay',async()=>{
 const f=await fixture(),body=request(f),results=await Promise.all([workflow.classify(f.p,reviewer,f.inbox.id,body),workflow.classify(f.p,reviewer,f.inbox.id,body)]);
 assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);const r=results[0];
 assert.equal(r.classification.status,'needs_review');assert.equal(r.classification.report.category,'uncertain');assert.equal(r.classification.report.suggested_category,'bug_fix');assert.equal(r.classification.decision,null);assert.equal(r.classification.nora_analysis,null);
 assert.equal(r.classification.input_snapshot.requirement,body.text);assert.ok(r.classification.input_snapshot.sources.some(s=>s.type==='channel_inbox'&&s.id===f.inbox.id&&s.sha256===f.preview.source_ref.sha256));
 assert.equal(r.mapping.source_snapshot.selected_messages[0].text,f.original.messages[0].text);assert.equal(r.mapping.request_snapshot.text,body.text);assert.equal(r.mapping.target_id,r.classification.id);
 const ai=await getAnalysisInput(pool,f.p,'classification',r.classification.id);assert.ok(ai.sources.some(s=>s.id===f.inbox.id));
 assert.equal(await count(f.p,'channel_workflow_mappings'),1);assert.equal(await count(f.p,'maintenance_classifications'),1);assert.equal(await count(f.p,'implementation_requests'),0);
 await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,{...body,text:'신규 기능을 만들어 주세요.'}),code('CHANNEL_WORKFLOW_REQUEST_CONFLICT'));
 await assert.rejects(workflow.classify(f.p,owner,f.inbox.id,body),code('CHANNEL_WORKFLOW_REQUEST_CONFLICT'));
 await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,{...body,request_id:randomUUID()}),code('CHANNEL_WORKFLOW_ALREADY_LINKED'));
 await assert.rejects(pool.query("UPDATE channel_workflow_mappings SET request_snapshot='{}' WHERE id=$1",[r.mapping.id]),code('23514'));
 await assert.rejects(pool.query('DELETE FROM channel_workflow_mappings WHERE id=$1',[r.mapping.id]),code('23514'));
});
suite('permissions, cross-project references, evidence acknowledgement, selection and exact hash fail closed',async()=>{
 const f=await fixture(),g=await fixture(),body=request(f);
 for(const u of [member,viewer,outsider])await assert.rejects(workflow.classify(f.p,u,f.inbox.id,body),code('FORBIDDEN'));
 await assert.rejects(workflow.preview(f.p,outsider,f.inbox.id),code('FORBIDDEN'));
 assert.equal((await workflow.preview(f.p,viewer,f.inbox.id)).can_review,false);
 await assert.rejects(workflow.classify(g.p,owner,f.inbox.id,body),code('NOT_FOUND'));
 await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,{...body,acknowledge_evidence:false}),code('CHANNEL_WORKFLOW_ACK_REQUIRED'));
 await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,{...body,event_ids:[]}),code('CHANNEL_WORKFLOW_INVALID_SELECTION'));
 await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,{...body,event_ids:[body.event_ids[0],body.event_ids[0]]}),code('CHANNEL_WORKFLOW_INVALID_SELECTION'));
 await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,{...body,event_ids:[g.inbox.evidence[0].id]}),code('CHANNEL_WORKFLOW_INVALID_SELECTION'));
 await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,{...body,source_sha256:'0'.repeat(64)}),code('CHANNEL_WORKFLOW_SOURCE_CHANGED'));
 for(const text of ['', 'a'.repeat(10001),'\0','\ud800'])await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,{...body,text}));
 assert.equal(await count(f.p,'channel_workflow_mappings'),0);assert.equal(await count(f.p,'maintenance_classifications'),0);
});
suite('unaccepted, deleted and subsequently edited evidence cannot authorize new workflow transitions',async()=>{
 const pending=await fixture({accepted:false});assert.equal(pending.preview.available,false);assert.equal(pending.preview.source_ref,null);
 await assert.rejects(workflow.classify(pending.p,reviewer,pending.inbox.id,request(pending)),code('CHANNEL_WORKFLOW_REVIEW_REQUIRED'));
 const removed=await fixture({deleted:true});assert.equal(removed.preview.messages[0].selectable,false);
 await assert.rejects(workflow.classify(removed.p,reviewer,removed.inbox.id,request(removed)),code('CHANNEL_WORKFLOW_INVALID_SELECTION'));
 const f=await fixture(),q=await waiting(f);
 await channels.ingest(f.p,f.src.id,member,{...f.original,batch_id:randomUUID(),messages:[{...f.original.messages[0],event_id:randomUUID(),kind:'updated',text:'잠금 기준은 3회입니다.',changed_at:'2026-10-01T11:00:00+09:00'}]});
 assert.equal((await workflow.preview(f.p,owner,f.inbox.id)).blocked_reason,'CHANNEL_WORKFLOW_SOURCE_CHANGED');
 await assert.rejects(workflow.classify(f.p,reviewer,f.inbox.id,request(f)),code('CHANNEL_WORKFLOW_SOURCE_CHANGED'));
 await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,answer(f,q)),code('CHANNEL_WORKFLOW_SOURCE_CHANGED'));
 assert.equal((await questions.get(f.p,owner,q.id)).status,'waiting');assert.equal(await count(f.p,'channel_workflow_mappings'),0);
});
suite('answer bridge preserves customer evidence and keeps linked work blocked until separate review',async()=>{
 const f=await fixture(),plan=randomUUID(),w=randomUUID();
 await pool.query("INSERT INTO implementation_plans(id,project_id,requested_revision_ids,request_sha256,input_snapshot,input_sha256,created_by) VALUES($1,$2,$3,$4,'{}',$4,$5)",[plan,f.p,[randomUUID()],'a'.repeat(64),owner]);
 await pool.query("INSERT INTO work_items(id,project_id,plan_id,source_task_id,source_task,created_by) VALUES($1,$2,$3,'TASK-1',$4,$5)",[w,f.p,plan,{id:'TASK-1',title:'인증 정책 적용',description:'5회 잠금',depends_on:[],evidence:[],acceptance_criteria:['고객 확인']},owner]);
 const q=await waiting(f,{work_item_ids:[w]}),body=answer(f,q),r=await workflow.answer(f.p,reviewer,f.inbox.id,body);
 assert.equal(r.question.status,'answered_pending');assert.equal(r.question.version,2);assert.equal(r.question.blocking,true);assert.equal((await getBlockingQuestions(pool,f.p,w)).length,1);
 assert.deepEqual(r.question.answer.source_refs,[f.preview.source_ref]);assert.equal(r.question.answer.channel,'고객 협의방');assert.equal(r.question.answer.provider,'kakaotalk');assert.equal(r.question.answer.channel_mapping_id,r.mapping.id);
 assert.equal(r.question.answer.responded_at_origin,'source');assert.equal(r.question.answer.sender_identity,'source_label_unverified');
 assert.equal((await workflow.answer(f.p,reviewer,f.inbox.id,body)).replayed,true);assert.equal((await questions.get(f.p,owner,q.id)).history.length,2);
 assert.equal(await count(f.p,'question_deliveries'),0);assert.equal(await count(f.p,'context_candidates'),0);
 await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,{...body,request_id:randomUUID()}),code('CHANNEL_WORKFLOW_ALREADY_LINKED'));
});
suite('answers require waiting question, exact version, source author and valid source chronology; unknown time is marked manual',async()=>{
 const f=await fixture(),g=await fixture(),q=await waiting(f),gq=await waiting(g),body=answer(f,q);
 await assert.rejects(workflow.answer(f.p,member,f.inbox.id,body),code('FORBIDDEN'));
 await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,{...body,question_id:gq.id}),code('QUESTION_NOT_FOUND'));
 await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,{...body,expected_question_version:2}),code('QUESTION_STALE'));
 await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,{...body,responded_by:'임의 작성자'}),code('CHANNEL_WORKFLOW_AUTHOR_MISMATCH'));
 await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,{...body,responded_at:'2026-10-01T01:10:00Z'}),code('CHANNEL_WORKFLOW_TIME_MISMATCH'));
 await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,{...body,responded_at:'2026-09-01T00:00:00Z'}),code('QUESTION_ANSWER_ORDER'));
 await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,{...body,responded_at:new Date(Date.now()+86400000).toISOString()}),code('QUESTION_FUTURE_ANSWER'));
 const draft=await waiting(f,{asked_by:'',asked_at:null});await assert.rejects(workflow.answer(f.p,reviewer,f.inbox.id,answer(f,draft)),code('QUESTION_NOT_WAITING'));
 const m=await fixture({timestamp:false}),mq=await waiting(m),r=await workflow.answer(m.p,reviewer,m.inbox.id,answer(m,mq));assert.equal(r.question.answer.responded_at_origin,'manual');assert.equal(r.mapping.source_snapshot.answer_metadata.responded_at_origin,'manual');
 assert.equal(await count(f.p,'channel_workflow_mappings'),0);
});
suite('two concurrent answers to one question cannot overwrite each other or lose the evidence journal',async()=>{
 const f=await fixture(),q=await waiting(f),a=answer(f,q),b={...a,request_id:randomUUID(),text:'다른 요약'};
 const result=await Promise.allSettled([workflow.answer(f.p,reviewer,f.inbox.id,a),workflow.answer(f.p,owner,f.inbox.id,b)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'CHANNEL_WORKFLOW_ALREADY_LINKED');
 assert.equal(await count(f.p,'channel_workflow_mappings'),1);assert.equal((await questions.get(f.p,owner,q.id)).history.length,2);
});
suite('journal failure rolls back the candidate answer and its question event together',async()=>{
 const f=await fixture(),q=await waiting(f);
 const failing=createChannelWorkflowService({async connect(){const db=await pool.connect();return {query(sql,...args){if(sql.startsWith('INSERT INTO channel_workflow_mappings'))throw Object.assign(Error('simulated journal failure'),{code:'TEST_JOURNAL_FAILED'});return db.query(sql,...args);},release(){db.release();}};}});
 await assert.rejects(failing.answer(f.p,reviewer,f.inbox.id,answer(f,q)),code('TEST_JOURNAL_FAILED'));
 const unchanged=await questions.get(f.p,owner,q.id);assert.equal(unchanged.status,'waiting');assert.equal(unchanged.answer,null);assert.equal(unchanged.version,1);assert.equal(unchanged.history.length,1);
 assert.equal(await count(f.p,'channel_workflow_mappings'),0);
});
suite('message edits race safely with bridge creation through channel source lock ordering',async()=>{
 const f=await fixture();const client=await pool.connect();await client.query('BEGIN');await client.query('SELECT id FROM channel_sources WHERE id=$1 FOR UPDATE',[f.src.id]);
 const bridge=workflow.classify(f.p,reviewer,f.inbox.id,request(f));
 // Insert a newer source version while bridge is waiting for the same source row.
 await client.query("INSERT INTO channel_events(project_id,source_id,event_id,message_id,conversation_key,kind,author,text,sent_at,changed_at,payload_sha256) VALUES($1,$2,$3,$4,$5,'updated','고객 PM','변경된 합의',$6,$7,$8)",[f.p,f.src.id,randomUUID(),f.original.messages[0].message_id,f.original.conversation_key,'2026-10-01T01:00:00Z','2026-10-01T02:00:00Z','b'.repeat(64)]);
 await client.query('COMMIT');client.release();await assert.rejects(bridge,code('CHANNEL_WORKFLOW_SOURCE_CHANGED'));
 assert.equal(await count(f.p,'maintenance_classifications'),0);assert.equal(await count(f.p,'channel_workflow_mappings'),0);
});
suite('bounded question pagination is explicit manual selection and mapping history is retained after source changes',async()=>{
 const f=await fixture();for(let i=0;i<3;i++)await waiting(f,{title:'질문 '+i});
 let view=await workflow.preview(f.p,viewer,f.inbox.id,{limit:'2',offset:'0'});assert.equal(view.waiting_questions.length,2);assert.equal(view.question_pagination.has_more,true);assert.equal(view.reply_matching,'manual_selection_required');
 const next=await workflow.preview(f.p,viewer,f.inbox.id,{limit:'2',offset:'2'});assert.equal(next.waiting_questions.length,1);assert.ok(!view.waiting_questions.some(q=>q.id===next.waiting_questions[0].id));
 await assert.rejects(workflow.preview(f.p,owner,f.inbox.id,{limit:101}),code('CHANNEL_WORKFLOW_INVALID_PAGE'));
 const body=request(f),r=await workflow.classify(f.p,reviewer,f.inbox.id,body);
 await channels.ingest(f.p,f.src.id,member,{...f.original,batch_id:randomUUID(),messages:[{...f.original.messages[0],event_id:randomUUID(),kind:'deleted',text:'',changed_at:'2026-10-01T11:00:00+09:00'}]});
 view=await workflow.preview(f.p,viewer,f.inbox.id);assert.equal(view.available,false);assert.equal(view.mappings[0].target_id,r.classification.id);assert.equal(view.mappings[0].source_snapshot.selected_messages[0].text,f.original.messages[0].text);
 assert.equal((await workflow.classify(f.p,reviewer,f.inbox.id,body)).replayed,true,'exact replay only reads the already-committed transition');
 await assert.rejects(getAnalysisInput(pool,f.p,'classification',r.classification.id),code('GOVERNANCE_STALE'));
});
suite('HTTP workflow routes enforce session, CSRF, reviewer role and project isolation',async t=>{
 const {createApp}=require('../server/server'),{sha256}=require('../server/auth'),f=await fixture(),origin='https://channel-workflow.example.test';
 const server=createApp({pool,production:true,appOrigin:origin}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,route='/api/projects/'+f.p+'/channel-inbox/'+f.inbox.id+'/workflow';
 async function auth(user){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sha256(token),user,csrf]);return {Cookie:'ains_session='+token,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf};}
 const ownerHeaders=await auth(owner),memberHeaders=await auth(member),outsideHeaders=await auth(outsider),body=request(f);
 assert.equal((await fetch(base+route)).status,401);assert.equal((await fetch(base+route,{headers:outsideHeaders})).status,404);
 let res=await fetch(base+route,{headers:memberHeaders});assert.equal(res.status,200);assert.equal((await res.json()).can_review,false);
 for(const headers of [memberHeaders,{...ownerHeaders,'X-CSRF-Token':'wrong'},{...ownerHeaders,Origin:'https://wrong.example.test'}])assert.equal((await fetch(base+route+'/classification',{method:'POST',headers,body:JSON.stringify(body)})).status,403);
 res=await fetch(base+route+'/classification',{method:'POST',headers:ownerHeaders,body:JSON.stringify(body)});const result=await res.json();assert.equal(res.status,201,JSON.stringify(result));assert.equal(result.classification.status,'needs_review');
 assert.equal(await count(f.p,'channel_workflow_mappings'),1);
});
