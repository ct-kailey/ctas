'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {createLedger}=require('../server/ledger');
const {createChannelLedger,normalizeBatch}=require('../server/channel-ledger');
const dbUrl=process.env.TEST_DATABASE_URL,suite=dbUrl?test:test.skip;
const code=expected=>error=>error.code===expected;
let admin,pool,ledger,channels,owner,reviewer,member,viewer,outsider,schema;
before(async()=>{
  if(!dbUrl)return;
  schema='channels_'+randomUUID().replaceAll('-','');admin=createPool(dbUrl);await admin.query(`CREATE SCHEMA ${schema}`);
  pool=createPool({connectionString:dbUrl,options:`-c search_path=${schema}`});await migrate(pool);ledger=createLedger(pool);channels=createChannelLedger(pool);
  const rows=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES ('owner@channel.test','Owner','unused'),('reviewer@channel.test','Reviewer','unused'),('member@channel.test','Member','unused'),('viewer@channel.test','Viewer','unused'),('outsider@channel.test','Outsider','unused') RETURNING id,email")).rows;
  [owner,reviewer,member,viewer,outsider]=['owner','reviewer','member','viewer','outsider'].map(n=>rows.find(r=>r.email.startsWith(n+'@')).id);
});
after(async()=>{if(!dbUrl)return;if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
async function setup(provider='slack') {
  const p=await ledger.createProject(owner,{name:'대화 수집 검증'});
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'reviewer'),($1,$3,'member'),($1,$4,'viewer')",[p.id,reviewer,member,viewer]);
  const domain=(await ledger.listDomains(p.id))[0];
  const src=await channels.createSource(p.id,owner,{provider,name:'#제품-결정',external_workspace_id:'WS-1',external_channel_id:'CH-1',default_domain_id:domain.id});
  return {p,src,domain};
}
function batch(overrides={}) {
  return {batch_id:randomUUID(),conversation_key:'thread-1',messages:[{event_id:randomUUID(),message_id:randomUUID(),kind:'created',author:'담당자',text:'회원 인증은 이메일로 진행하기로 합의했습니다.\r\n원문 보존',sent_at:'2026-09-27T10:00:00+09:00',changed_at:null,url:'https://example.test/thread/1'}],...overrides};
}
async function ready(p,item,status='needs_review') {await pool.query('UPDATE channel_inbox SET status=$1 WHERE project_id=$2 AND id=$3',[status,p.id,item.id]);}
function decision(domain,extra={}) {return {title:'인증 정책 결정',text:'담당자가 원문을 확인했습니다. 이메일 인증을 채택합니다.',domain_id:domain.id,record_kind:'decision',decided_on:'2026-09-27',reason:'원문과 담당자의 합의를 확인함',acknowledge_evidence:true,...extra};}
async function counts(p) {return (await pool.query('SELECT (SELECT count(*)::int FROM documents WHERE project_id=$1) documents,(SELECT count(*)::int FROM revisions WHERE project_id=$1) revisions,(SELECT count(*)::int FROM jobs WHERE project_id=$1) jobs,(SELECT count(*)::int FROM channel_events WHERE project_id=$1) evidence,(SELECT count(*)::int FROM channel_inbox WHERE project_id=$1) inbox',[p.id])).rows[0];}

test('channel normalization preserves source timestamps and raw message bytes with strict bounds',()=>{
  const original=batch();const value=normalizeBatch(original);
  assert.equal(value.messages[0].sent_at,'2026-09-27T01:00:00.000Z');assert.equal(value.messages[0].raw_sent_at,'2026-09-27T10:00:00+09:00');assert.equal(value.messages[0].text,original.messages[0].text);
  for(const patch of [{sent_at:'2026-02-30T00:00:00Z'},{changed_at:'2026-09-27T10:00:00'},{sent_at:'2026-09-27T10:00:00+14:30'},{url:'https://secret:pass@example.test/'},{url:'javascript:alert(1)'},{text:'\0'},{text:'\ud800'},{kind:'deleted',text:'old deleted text'},{author:''},{unknown:'value'}]) {
    assert.throws(()=>normalizeBatch({...original,messages:[{...original.messages[0],...patch}]}));
  }
  assert.throws(()=>normalizeBatch({...original,messages:Array(51).fill(original.messages[0])}),code('INVALID_CHANNEL_INPUT'));
  assert.throws(()=>normalizeBatch({...original,messages:[{...original.messages[0],text:'a'.repeat(20000)},{...original.messages[0],event_id:'second',message_id:'second',text:'a'}]}),code('INVALID_CHANNEL_INPUT'));
  assert.throws(()=>normalizeBatch({...original,messages:[original.messages[0],{...original.messages[0],event_id:'second'}]}),code('INVALID_CHANNEL_INPUT'));
});
suite('source permissions, scoped domain IDs, nonconnected status and pause are enforced',async()=>{
  const {p,src,domain}=await setup(),q=await setup();
  assert.equal(src.connection_status,'not_connected');assert.equal(src.enabled,true);assert.equal(src.manual_intake_enabled,true);
  await assert.rejects(channels.createSource(p.id,member,{provider:'teams',name:'팀',external_channel_id:'team'}),code('FORBIDDEN'));
  await assert.rejects(channels.createSource(p.id,owner,{provider:'teams',name:'팀',external_channel_id:'team',default_domain_id:q.domain.id}),code('DOMAIN_NOT_FOUND'));
  await assert.rejects(channels.createSource(p.id,owner,{provider:'slack',name:'복제',external_workspace_id:'WS-1',external_channel_id:'CH-1'}),code('CHANNEL_SOURCE_EXISTS'));
  await assert.rejects(channels.updateSource(p.id,src.id,owner,{connection_status:'connected'}),code('INVALID_CHANNEL_INPUT'));
  await assert.rejects(channels.updateSource(p.id,src.id,member,{enabled:false}),code('FORBIDDEN'));
  await assert.rejects(channels.listSources(p.id,outsider),code('FORBIDDEN'));
  assert.equal((await channels.listSources(p.id,viewer))[0].default_domain_id,domain.id);
  await channels.updateSource(p.id,src.id,reviewer,{manual_intake_enabled:false});
  await assert.rejects(channels.ingest(p.id,src.id,member,batch()),code('CHANNEL_PAUSED'));
  await channels.updateSource(p.id,src.id,owner,{manual_intake_enabled:true});
  await assert.rejects(channels.ingest(p.id,src.id,viewer,batch()),code('FORBIDDEN'));
  await assert.rejects(channels.ingest(q.p.id,src.id,member,batch()),code('NOT_FOUND'));
});
suite('batch and event idempotency are scoped, exact and atomic under concurrent replay',async()=>{
  const {p,src}=await setup(),original=batch();
  const [one,two]=await Promise.all([channels.ingest(p.id,src.id,member,original),channels.ingest(p.id,src.id,member,original)]);
  assert.equal(one.id,two.id);assert.deepEqual([one.replayed,two.replayed].sort(),[false,true]);assert.deepEqual(await counts(p),{documents:0,revisions:0,jobs:0,evidence:1,inbox:1});
  assert.equal(one.input_snapshot.messages[0].event_id,one.evidence[0].id);assert.equal(one.evidence[0].raw_sent_at,original.messages[0].sent_at);assert.equal(one.status,'queued');
  await assert.rejects(channels.ingest(p.id,src.id,member,{...original,messages:[{...original.messages[0],text:'바뀐 본문'}]}),code('BATCH_REPLAY_CONFLICT'));
  await assert.rejects(channels.ingest(p.id,src.id,member,{...original,batch_id:'retry-as-new',messages:[{...original.messages[0],text:'바뀐 본문'}]}),code('EVENT_REPLAY_CONFLICT'));
  const invalid=batch({messages:[{...original.messages[0],event_id:'new-event',message_id:'new-message'},{...original.messages[0],text:'conflicting'}]});
  await assert.rejects(channels.ingest(p.id,src.id,member,invalid),code('EVENT_REPLAY_CONFLICT'));
  assert.deepEqual(await counts(p),{documents:0,revisions:0,jobs:0,evidence:1,inbox:1},'all event inserts roll back on a conflicting later event');
  const alias={...original,batch_id:'same-evidence-new-batch'};
  const dedup=await channels.ingest(p.id,src.id,member,alias);assert.equal(dedup.id,one.id);assert.equal(dedup.replayed,true);
  await assert.rejects(channels.ingest(p.id,src.id,member,{...alias,messages:[{...alias.messages[0],text:'alias conflict'}]}),code('BATCH_REPLAY_CONFLICT'));
  assert.deepEqual(await counts(p),{documents:0,revisions:0,jobs:0,evidence:1,inbox:1});
  const secondSource=await channels.createSource(p.id,owner,{provider:'teams',name:'동일 ID 다른 채널',external_channel_id:'CH-2'});
  assert.notEqual((await channels.ingest(p.id,secondSource.id,member,original)).id,one.id);
  await assert.rejects(channels.getInbox(p.id,one.id,outsider),code('FORBIDDEN'));
  assert.equal((await channels.listInbox(p.id,viewer)).length,2);
});
suite('human accept creates one draft revision and intake atomically, never a baseline',async()=>{
  const {p,src,domain}=await setup('kakaotalk'),original=batch(),item=await channels.ingest(p.id,src.id,member,original),body=decision(domain);
  await assert.rejects(channels.accept(p.id,item.id,reviewer,body),code('CHANNEL_REVIEW_NOT_READY'));
  await ready(p,item);
  await assert.rejects(channels.accept(p.id,item.id,member,body),code('FORBIDDEN'));
  await assert.rejects(channels.accept(p.id,item.id,reviewer,{...body,acknowledge_evidence:false}),code('EVIDENCE_ACK_REQUIRED'));
  const q=await setup();await assert.rejects(channels.accept(p.id,item.id,reviewer,{...body,domain_id:q.domain.id}),code('DOMAIN_NOT_FOUND'));
  assert.equal((await counts(p)).documents,0);
  const accepted=await channels.accept(p.id,item.id,reviewer,body),again=await channels.accept(p.id,item.id,owner,body);
  assert.equal(accepted.status,'accepted');assert.equal(accepted.revision_id,again.revision_id);assert.equal(accepted.job_id,again.job_id);
  assert.deepEqual(await counts(p),{documents:1,revisions:1,jobs:1,evidence:1,inbox:1});
  const revision=await ledger.getRevision(p.id,accepted.revision_id,{includeContent:true}),document=(await ledger.listDocuments(p.id))[0];
  assert.equal(document.baseline_revision_id,null);assert.equal(revision.status,'queued');assert.equal(revision.history.decided_on,'2026-09-27');assert.equal(revision.history.channel,src.name);
  assert.match(revision.content.toString(),/수집 당시 원문/);assert.ok(revision.content.toString().includes(original.messages[0].event_id));assert.ok(revision.content.toString().includes(original.messages[0].sent_at));
  assert.match(revision.content.toString(),/> 회원 인증은 이메일로 진행하기로 합의했습니다\./);
  await assert.rejects(channels.accept(p.id,item.id,owner,{...body,title:'다른 제목'}),code('REVIEW_REPLAY_CONFLICT'));
  await assert.rejects(channels.dismiss(p.id,item.id,owner,{reason:'제외'}),code('CHANNEL_REVIEW_NOT_READY'));
  await assert.rejects(pool.query("UPDATE channel_inbox SET review='{}' WHERE id=$1",[item.id]),code('23514'));
  await assert.rejects(pool.query("UPDATE channel_inbox SET input_snapshot='{}' WHERE id=$1",[item.id]),code('23514'));
});
suite('edits and deletions preserve evidence, block stale review and flag accepted provenance',async()=>{
  const {p,src,domain}=await setup(),original=batch(),item=await channels.ingest(p.id,src.id,member,original);await ready(p,item);
  const edited=batch({messages:[{...original.messages[0],event_id:'edited-1',kind:'updated',text:'합의 변경: 전화 인증',changed_at:'2026-09-27T11:00:00+09:00'}]});
  const changed=await channels.ingest(p.id,src.id,member,edited);
  assert.equal((await channels.getInbox(p.id,item.id,viewer)).evidence_changed,true);
  await assert.rejects(channels.accept(p.id,item.id,reviewer,decision(domain)),code('EVIDENCE_CHANGED'));
  assert.equal((await channels.getInbox(p.id,item.id,viewer)).input_snapshot.messages[0].text,original.messages[0].text);
  await ready(p,changed);const accepted=await channels.accept(p.id,changed.id,reviewer,decision(domain));
  const deleted=await channels.ingest(p.id,src.id,member,batch({messages:[{...edited.messages[0],event_id:'deleted-1',kind:'deleted',text:'',changed_at:'2026-09-27T12:00:00+09:00'}]}));
  assert.equal(deleted.evidence_changed,false);
  const old=await channels.getInbox(p.id,changed.id,owner);assert.equal(old.status,'accepted');assert.equal(old.provenance_changed,true);assert.equal(old.revision_id,accepted.revision_id);
  const oldReplay=await channels.ingest(p.id,src.id,member,{...original,batch_id:'old-new-batch'});assert.equal(oldReplay.evidence_changed,true);assert.equal(oldReplay.id,item.id);assert.equal(oldReplay.replayed,true);
  await assert.rejects(pool.query('UPDATE channel_events SET text=$1 WHERE id=$2',['tamper',item.evidence[0].id]),code('23514'));
  await assert.rejects(pool.query('DELETE FROM channel_events WHERE id=$1',[item.evidence[0].id]),code('23514'));
  await assert.rejects(pool.query('UPDATE channel_inbox SET evidence_changed=false WHERE id=$1',[item.id]),code('23514'));
  assert.equal((await counts(p)).evidence,3);
});
suite('missing, uncertain or failed analysis permits explicit manual review and records its provenance',async()=>{
  for(const status of ['needs_review','failed','uncertain']) {
    const {p,src,domain}=await setup(),item=await channels.ingest(p.id,src.id,member,batch());await ready(p,item,status);
    const accepted=await channels.accept(p.id,item.id,owner,decision(domain));assert.equal(accepted.analysis,null);assert.equal(accepted.review.manual_analysis_override,true,`${status} without AI analysis must preserve manual review provenance`);
  }
  const {p,src}=await setup(),item=await channels.ingest(p.id,src.id,member,batch());
  const dismissed=await channels.dismiss(p.id,item.id,reviewer,{reason:'업무 결정 아님'});
  assert.equal(dismissed.status,'dismissed');assert.equal((await channels.dismiss(p.id,item.id,owner,{reason:'업무 결정 아님'})).id,item.id);
  await assert.rejects(channels.dismiss(p.id,item.id,owner,{reason:'다른 사유'}),code('REVIEW_REPLAY_CONFLICT'));assert.equal((await counts(p)).documents,0);
});
suite('record creation rolls back if final audit insert fails',async()=>{
  const {p,src,domain}=await setup(),item=await channels.ingest(p.id,src.id,member,batch());await ready(p,item);
  await pool.query(`CREATE FUNCTION fail_channel_accept_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='channel.accepted' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_channel_accept BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_channel_accept_test()`);
  try {await assert.rejects(channels.accept(p.id,item.id,owner,decision(domain)),/forced audit failure/);} finally {await pool.query('DROP TRIGGER fail_channel_accept ON events; DROP FUNCTION fail_channel_accept_test()');}
  assert.deepEqual(await counts(p),{documents:0,revisions:0,jobs:0,evidence:1,inbox:1});assert.equal((await channels.getInbox(p.id,item.id,owner)).status,'needs_review');
});

suite('late older events cannot replace current evidence and ambiguous versions block acceptance',async()=>{
  const {p,src,domain}=await setup(),original=batch();
  await channels.ingest(p.id,src.id,member,original);
  const changed=batch({messages:[{...original.messages[0],event_id:'updated-latest',kind:'updated',text:'가장 최신 합의',changed_at:'2026-09-27T12:00:00+09:00'}]});
  const latest=await channels.ingest(p.id,src.id,member,changed);await ready(p,latest);
  const late=batch({messages:[{...changed.messages[0],event_id:'updated-late-older',text:'늦게 도착한 과거 합의',changed_at:'2026-09-27T11:00:00+09:00'}]});
  const older=await channels.ingest(p.id,src.id,member,late);
  assert.equal(older.evidence_changed,true);assert.equal(older.status,'failed');
  assert.equal((await channels.getInbox(p.id,latest.id,owner)).evidence_changed,false,'older timestamp must not invalidate confirmed latest source content');
  await assert.rejects(channels.accept(p.id,older.id,owner,decision(domain)),code('EVIDENCE_CHANGED'));
  const accepted=await channels.accept(p.id,latest.id,owner,decision(domain));assert.equal(accepted.status,'accepted');
  const lateCreated=await channels.ingest(p.id,src.id,member,batch({messages:[{...original.messages[0],event_id:'created-late',text:'늦게 도착한 최초 버전'}]}));
  assert.equal(lateCreated.evidence_changed,true);assert.equal((await channels.getInbox(p.id,latest.id,owner)).provenance_changed,false);
  const equalTime=await channels.ingest(p.id,src.id,member,batch({messages:[{...changed.messages[0],event_id:'equal-time-different-content',text:'동일 시각 다른 내용'}]}));
  assert.equal(equalTime.evidence_changed,true);assert.equal((await channels.getInbox(p.id,latest.id,owner)).provenance_changed,true);
  const missingTime=await channels.ingest(p.id,src.id,member,batch({messages:[{...changed.messages[0],event_id:'missing-change-time',text:'변경 시각 불명',changed_at:null}]}));
  assert.equal(missingTime.evidence_changed,true);
});
suite('project admission caps new analyses at 60 per hour while preserving exact retry',async()=>{
  const {p,src}=await setup();let original,first;
  for(let i=0;i<60;i++) {const input=batch({conversation_key:'rate-'+i});const result=await channels.ingest(p.id,src.id,member,input);if(i===0){original=input;first=result;}}
  await assert.rejects(channels.ingest(p.id,src.id,member,batch()),code('CHANNEL_RATE_LIMIT'));
  assert.equal((await channels.ingest(p.id,src.id,member,original)).id,first.id);
  assert.deepEqual(await counts(p),{documents:0,revisions:0,jobs:0,evidence:60,inbox:60},'over-limit evidence insert is rolled back');
});
suite('concurrent acceptance creates exactly one record and a source change cannot race approval',async()=>{
  const {p,src,domain}=await setup(),input=batch(),item=await channels.ingest(p.id,src.id,member,input);await ready(p,item);
  const results=await Promise.all([channels.accept(p.id,item.id,owner,decision(domain)),channels.accept(p.id,item.id,reviewer,decision(domain))]);
  assert.equal(results[0].revision_id,results[1].revision_id);assert.equal((await counts(p)).documents,1);
  const nextInput=batch(),next=await channels.ingest(p.id,src.id,member,nextInput);await ready(p,next);
  const racing=await Promise.allSettled([
    channels.accept(p.id,next.id,owner,decision(domain)),
    channels.ingest(p.id,src.id,member,batch({messages:[{...nextInput.messages[0],event_id:'racing-edit',kind:'updated',text:'수정된 합의',changed_at:'2026-09-27T12:00:00+09:00'}]})),
  ]);
  const final=await channels.getInbox(p.id,next.id,owner);assert.equal(final.evidence_changed,true);
  if(racing[0].status==='fulfilled'){assert.equal(final.status,'accepted');assert.equal(final.provenance_changed,true);}
  else {assert.equal(racing[0].reason.code,'EVIDENCE_CHANGED');assert.notEqual(final.status,'accepted');}
});
