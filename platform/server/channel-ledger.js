'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { transaction } = require('./db');
const { history, editorText, SOURCE_TYPES } = require('./record-contract');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PROVIDERS = ['kakaotalk','discord','slack','teams','other'];
const WRITERS = ['owner','reviewer','member'], REVIEWERS = ['owner','reviewer'];
function fail(code, message, status=400) { throw Object.assign(new Error(message), { code,status }); }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function id(value) { if (typeof value!=='string' || !UUID.test(value)) fail('INVALID_ID','올바른 항목 ID가 필요합니다.'); return value.toLowerCase(); }
function object(value, keys) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k))) fail('INVALID_CHANNEL_INPUT','지원하지 않는 채널 입력입니다.');
}
function text(value,label,max=300,{empty=false,trim=true}={}) {
  if (typeof value!=='string' || !value.isWellFormed() || value.includes('\0')) fail('INVALID_CHANNEL_INPUT',`${label} 형식을 확인하세요.`);
  const result=trim?value.trim():value;
  if ((!empty&&!result.trim()) || result.length>max) fail('INVALID_CHANNEL_INPUT',`${label}은 최대 ${max}자까지 입력할 수 있습니다.`);
  return result;
}
function optional(value,label,max=300) { return value===undefined || value===null || value==='' ? null : text(value,label,max); }
function sourceTime(value) {
  if (value===undefined || value===null) return {raw:null,normalized:null};
  try { const raw=history({source_created_at:value}).source_created_at; if (!raw) throw Error(); return {raw,normalized:new Date(raw).toISOString()}; }
  catch { fail('INVALID_CHANNEL_TIME','원본 시각은 시간대를 포함한 유효한 ISO 시각이어야 합니다.'); }
}
function normalizeBatch(body) {
  object(body,['batch_id','conversation_key','messages']);
  const batch_id=text(body.batch_id,'배치 ID'), conversation_key=text(body.conversation_key,'대화 식별자');
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length>50) fail('INVALID_CHANNEL_INPUT','한 번에 1–50개 메시지를 수집할 수 있습니다.');
  const seen=new Set(),messageIds=new Set(); let length=0;
  const messages=body.messages.map(value=>{
    object(value,['event_id','message_id','kind','author','text','sent_at','changed_at','url']);
    const event_id=text(value.event_id,'이벤트 ID'),message_id=text(value.message_id,'메시지 ID');
    if (seen.has(event_id) || messageIds.has(message_id)) fail('INVALID_CHANNEL_INPUT','한 배치에는 메시지별 최신 이벤트 하나만 포함하세요.'); seen.add(event_id); messageIds.add(message_id);
    if (!['created','updated','deleted'].includes(value.kind)) fail('INVALID_CHANNEL_INPUT','올바른 메시지 이벤트 종류를 선택하세요.');
    const author=text(value.author,'작성자',200), content=text(value.text,'메시지',20000,{empty:value.kind==='deleted',trim:false});
    if (value.kind==='deleted' && content!=='') fail('INVALID_CHANNEL_INPUT','삭제된 메시지 이벤트의 본문은 비워 주세요.');
    length+=content.length;
    const sent=sourceTime(value.sent_at),changed=sourceTime(value.changed_at);
    let url;
    try { url=history({url:value.url}).url; } catch { fail('INVALID_CHANNEL_INPUT','메시지 링크는 인증 정보가 없는 HTTP/HTTPS 주소여야 합니다.'); }
    return {event_id,message_id,kind:value.kind,author,text:content,sent_at:sent.normalized,changed_at:changed.normalized,raw_sent_at:sent.raw,raw_changed_at:changed.raw,url};
  });
  if (length>20000) fail('INVALID_CHANNEL_INPUT','배치 전체 메시지는 최대 20,000자입니다.');
  return {batch_id,conversation_key,messages};
}
async function member(client,p,u,roles) {
  const row=(await client.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2',[p,id(u)])).rows[0];
  if (!row || (roles&&!roles.includes(row.role))) fail('FORBIDDEN','이 작업을 수행할 프로젝트 권한이 없습니다.',403);
}
async function audit(client,p,u,kind,entity,detail={}) {
  await client.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[p,u,kind,entity,JSON.stringify(detail)]);
}
async function source(client,p,sourceId,lock=false) {
  const row=(await client.query(`SELECT * FROM channel_sources WHERE project_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[p,id(sourceId)])).rows[0];
  if (!row) fail('NOT_FOUND','프로젝트의 수집 채널을 찾을 수 없습니다.',404); return row;
}
async function inbox(client,p,inboxId,lock=false) {
  const row=(await client.query(`SELECT * FROM channel_inbox WHERE project_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[p,id(inboxId)])).rows[0];
  if (!row) fail('NOT_FOUND','수집 검토 항목을 찾을 수 없습니다.',404); return row;
}
async function detail(client,p,inboxId) {
  const row=await inbox(client,p,inboxId),src=await source(client,p,row.source_id);
  const ids=row.input_snapshot.messages.map(m=>m.event_id);
  const evidence=(await client.query('SELECT * FROM channel_events WHERE project_id=$1 AND source_id=$2 AND id=ANY($3::uuid[]) ORDER BY sequence',[p,row.source_id,ids])).rows;
  return {...row,source_name:src.name,provider:src.provider,default_domain_id:src.default_domain_id,evidence};
}
async function lockedInbox(client,p,inboxId) {
  const initial=await inbox(client,p,inboxId);
  const src=await source(client,p,initial.source_id,true);
  return {src,row:await inbox(client,p,inboxId,true)};
}
async function currentEvidence(client,row) {
  // An edit/deletion supersedes its create event. Among changed versions, source
  // timestamps decide order; equal or missing timestamps remain ambiguous.
  const candidates=(await client.query(`SELECT e.id,e.message_id,e.kind,e.ordering_time::text AS ordering_time
    FROM unnest($2::text[]) AS requested(message_id)
    CROSS JOIN LATERAL (
      SELECT id,message_id,kind,sequence,CASE WHEN kind='created' THEN sent_at ELSE changed_at END AS ordering_time
      FROM channel_events WHERE source_id=$1 AND message_id=requested.message_id
      ORDER BY (kind<>'created') DESC,(CASE WHEN kind='created' THEN sent_at ELSE changed_at END) DESC NULLS FIRST,sequence DESC LIMIT 2
    ) e ORDER BY e.message_id,(e.kind<>'created') DESC,e.ordering_time DESC NULLS FIRST,e.sequence DESC`,[row.source_id,row.message_ids])).rows;
  const supplied=new Set(row.input_snapshot.messages.map(m=>m.event_id));
  return row.message_ids.every(messageId=>{
    const versions=candidates.filter(e=>e.message_id===messageId),latest=versions[0],prior=versions[1];
    if (!latest || !supplied.has(latest.id)) return false;
    if (prior && (latest.kind==='created')===(prior.kind==='created') && (!latest.ordering_time || !prior.ordering_time || latest.ordering_time===prior.ordering_time)) return false;
    return true;
  });
}
function reviewInput(body) {
  object(body,['title','text','domain_id','record_kind','decided_on','reason','acknowledge_evidence']);
  if (body.acknowledge_evidence!==true) fail('EVIDENCE_ACK_REQUIRED','수집 원문을 확인한 뒤 기록으로 등록하세요.');
  if (!['conversation','decision','work_item','note'].includes(body.record_kind)) fail('INVALID_RECORD_KIND','올바른 기록 유형을 선택하세요.');
  const result={title:text(body.title,'기록 제목',300),text:text(body.text,'검토한 본문',20000,{trim:false}),domain_id:id(body.domain_id),record_kind:body.record_kind,decided_on:history({decided_on:body.decided_on}).decided_on,reason:text(body.reason,'검토 사유',2000),acknowledge_evidence:true};
  return result;
}
function evidenceText(row,evidence,body) {
  const snapshot=row.input_snapshot,src=snapshot.source;
  const lines=[body.text,'','---','## 수집 당시 원문 (검토 근거)',`출처: ${src.name} (${src.provider})`,`외부 워크스페이스: ${src.external_workspace_id||'미제공'}`,`외부 채널: ${src.external_channel_id}`,`대화 식별자: ${row.conversation_key}`,`수집 검토 ID: ${row.id}`,`수집 시각: ${row.created_at.toISOString()}`,''];
  for (const m of snapshot.messages) {
    const raw=evidence.find(e=>e.id===m.event_id);
    lines.push(`### ${m.author} · ${m.kind}`,`메시지 ID: ${m.message_id}`,`원본 이벤트 ID: ${raw?.event_id||'미제공'}`,`증거 ID: ${m.event_id}`,`원본 발송 시각: ${raw?.raw_sent_at||'미제공'}`,`원본 변경 시각: ${raw?.raw_changed_at||'미제공'}`,`링크: ${m.url||'미제공'}`,'',...m.text.split(/\r?\n/).map(line=>`> ${line}`),'');
  }
  return editorText(lines.join('\n'));
}
function createChannelLedger(pool) {
  return {
    async listSources(p,u) { await member(pool,p,u); return (await pool.query('SELECT * FROM channel_sources WHERE project_id=$1 ORDER BY created_at DESC,id',[p])).rows; },
    async createSource(p,u,body={}) {
      object(body,['provider','name','external_workspace_id','external_channel_id','default_domain_id']);
      if (!PROVIDERS.includes(body.provider)) fail('INVALID_CHANNEL_INPUT','지원하는 대화 채널을 선택하세요.');
      const name=text(body.name,'채널 이름',200),workspace=optional(body.external_workspace_id,'외부 워크스페이스 ID'),channel=text(body.external_channel_id,'외부 채널 ID'),domain=body.default_domain_id? id(body.default_domain_id):null;
      return transaction(pool,async client=>{
        await member(client,p,u,REVIEWERS);
        if (domain && !(await client.query('SELECT id FROM project_domains WHERE project_id=$1 AND id=$2',[p,domain])).rowCount) fail('DOMAIN_NOT_FOUND','프로젝트의 업무 영역을 찾을 수 없습니다.',404);
        const created=(await client.query('INSERT INTO channel_sources(project_id,provider,name,external_workspace_id,external_channel_id,default_domain_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING *',[p,body.provider,name,workspace,channel,domain,u])).rows[0];
        if (!created) fail('CHANNEL_SOURCE_EXISTS','이 프로젝트에 이미 등록된 채널입니다.',409);
        await audit(client,p,u,'channel.source_created',created.id,{provider:created.provider,name,connection_status:created.connection_status}); return created;
      });
    },
    async updateSource(p,sourceId,u,body={}) {
      object(body,['enabled','manual_intake_enabled']);
      if (!Object.keys(body).length || Object.values(body).some(v=>typeof v!=='boolean')) fail('INVALID_CHANNEL_INPUT','수집 사용 여부를 선택하세요.');
      return transaction(pool,async client=>{
        await member(client,p,u,REVIEWERS); const src=await source(client,p,sourceId,true);
        const updated=(await client.query('UPDATE channel_sources SET enabled=$1,manual_intake_enabled=$2,updated_at=now() WHERE id=$3 RETURNING *',[body.enabled??src.enabled,body.manual_intake_enabled??src.manual_intake_enabled,src.id])).rows[0];
        await audit(client,p,u,'channel.source_updated',src.id,{enabled:updated.enabled,manual_intake_enabled:updated.manual_intake_enabled}); return updated;
      });
    },
    async ingest(p,sourceId,u,body={}) {
      const batch=normalizeBatch(body),batchHash=hash(batch);
      return transaction(pool,async client=>{
        await member(client,p,u,WRITERS);
        // Consistent lock order: project admission, source, inbox rows.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`channel-intake:${p}`]);
        const src=await source(client,p,sourceId,true);
        const prior=(await client.query('SELECT inbox_id AS id,batch_sha256 FROM channel_batches WHERE source_id=$1 AND batch_id=$2',[src.id,batch.batch_id])).rows[0];
        if (prior) {
          if (prior.batch_sha256!==batchHash) fail('BATCH_REPLAY_CONFLICT','같은 배치 ID에 다른 메시지가 입력되었습니다.',409);
          return {...await detail(client,p,prior.id),replayed:true};
        }
        if (!src.enabled || !src.manual_intake_enabled) fail('CHANNEL_PAUSED','이 채널의 수동 수집이 일시 정지되어 있습니다.',409);
        const collected=[];
        for (const m of batch.messages) {
          const payloadHash=hash({conversation_key:batch.conversation_key,...m});
          let existing=(await client.query('SELECT * FROM channel_events WHERE source_id=$1 AND event_id=$2',[src.id,m.event_id])).rows[0];
          if (existing && existing.payload_sha256!==payloadHash) fail('EVENT_REPLAY_CONFLICT','같은 원본 이벤트 ID에 다른 내용이 입력되었습니다.',409);
          const other=(await client.query('SELECT conversation_key FROM channel_events WHERE source_id=$1 AND message_id=$2 LIMIT 1',[src.id,m.message_id])).rows[0];
          if (other && other.conversation_key!==batch.conversation_key) fail('MESSAGE_SCOPE_CONFLICT','같은 메시지는 다른 대화로 이동할 수 없습니다.',409);
          if (!existing) existing=(await client.query('INSERT INTO channel_events(project_id,source_id,event_id,message_id,conversation_key,kind,author,text,sent_at,changed_at,raw_sent_at,raw_changed_at,url,payload_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',[p,src.id,m.event_id,m.message_id,batch.conversation_key,m.kind,m.author,m.text,m.sent_at,m.changed_at,m.raw_sent_at,m.raw_changed_at,m.url,payloadHash])).rows[0];
          collected.push({...m,id:existing.id});
        }
        const evidenceHash=hash(collected.map(m=>m.id).sort());
        const same=(await client.query('SELECT id FROM channel_inbox WHERE source_id=$1 AND conversation_key=$2 AND evidence_sha256=$3',[src.id,batch.conversation_key,evidenceHash])).rows[0];
        if (same) {
          await client.query('INSERT INTO channel_batches(source_id,project_id,batch_id,batch_sha256,inbox_id) VALUES($1,$2,$3,$4,$5)',[src.id,p,batch.batch_id,batchHash,same.id]);
          return {...await detail(client,p,same.id),replayed:true};
        }
        const recent=(await client.query("SELECT count(*)::int AS count FROM channel_inbox WHERE project_id=$1 AND created_at>now()-interval '1 hour'",[p])).rows[0].count;
        if (recent>=60) fail('CHANNEL_RATE_LIMIT','프로젝트 수집은 시간당 60회까지 가능합니다.',429);
        const inboxId=randomUUID();
        const snapshot={schema_version:'1.0',request_id:inboxId,project_id:p,source:{id:src.id,provider:src.provider,name:src.name,external_workspace_id:src.external_workspace_id,external_channel_id:src.external_channel_id},conversation_key:batch.conversation_key,messages:collected.map(m=>({event_id:m.id,message_id:m.message_id,kind:m.kind,author:m.author,text:m.text,sent_at:m.sent_at,changed_at:m.changed_at,url:m.url}))};
        const messageIds=[...new Set(batch.messages.map(m=>m.message_id))];
        const isCurrent=await currentEvidence(client,{source_id:src.id,message_ids:messageIds,input_snapshot:snapshot});
        await client.query('INSERT INTO channel_inbox(id,project_id,source_id,batch_id,conversation_key,batch_sha256,input_snapshot,input_sha256,message_ids,created_by,evidence_changed,status,error_code,evidence_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[inboxId,p,src.id,batch.batch_id,batch.conversation_key,batchHash,JSON.stringify(snapshot),hash(snapshot),messageIds,u,!isCurrent,isCurrent?'queued':'failed',isCurrent?null:'EVIDENCE_CHANGED',evidenceHash]);
        await client.query('INSERT INTO channel_batches(source_id,project_id,batch_id,batch_sha256,inbox_id) VALUES($1,$2,$3,$4,$5)',[src.id,p,batch.batch_id,batchHash,inboxId]);
        await audit(client,p,u,'channel.collected',inboxId,{source_id:src.id,batch_id:batch.batch_id,message_count:collected.length,input_sha256:hash(snapshot),evidence_changed:!isCurrent});
        return {...await detail(client,p,inboxId),replayed:false};
      });
    },
    async listInbox(p,u) {
      await member(pool,p,u);
      return (await pool.query('SELECT i.*,s.name AS source_name,s.provider,s.default_domain_id FROM channel_inbox i JOIN channel_sources s ON s.id=i.source_id AND s.project_id=i.project_id WHERE i.project_id=$1 ORDER BY i.created_at DESC,i.id LIMIT 100',[p])).rows;
    },
    async getInbox(p,inboxId,u) { await member(pool,p,u); return detail(pool,p,inboxId); },
    async accept(p,inboxId,u,body={}) {
      const input=reviewInput(body),actionHash=hash(input);
      return transaction(pool,async client=>{
        await member(client,p,u,REVIEWERS); const {src,row}=await lockedInbox(client,p,inboxId);
        if (row.status==='accepted') {
          if (row.review.input_sha256!==actionHash) fail('REVIEW_REPLAY_CONFLICT','이미 다른 내용으로 등록된 검토입니다.',409);
          return detail(client,p,row.id);
        }
        if (!['needs_review','failed','uncertain'].includes(row.status)) fail('CHANNEL_REVIEW_NOT_READY','분석이 끝난 검토 항목만 기록으로 등록할 수 있습니다.',409);
        if (row.evidence_changed || !await currentEvidence(client,row)) fail('EVIDENCE_CHANGED','수집 이후 원본이 변경되었습니다. 최신 메시지를 새 배치로 수집해 검토하세요.',409);
        if (!(await client.query('SELECT id FROM project_domains WHERE project_id=$1 AND id=$2',[p,input.domain_id])).rowCount) fail('DOMAIN_NOT_FOUND','프로젝트의 업무 영역을 찾을 수 없습니다.',404);
        const full=await detail(client,p,row.id),content=evidenceText(row,full.evidence,input),sha=createHash('sha256').update(content).digest('hex');
        const first=full.evidence.filter(e=>e.raw_sent_at).sort((a,b)=>new Date(a.sent_at)-new Date(b.sent_at))[0];
        const metadata=history({source_type:SOURCE_TYPES.includes(src.provider)?src.provider:'other',occurred_on:first?.raw_sent_at?.slice(0,10)||null,decided_on:input.decided_on,source_created_at:first?.raw_sent_at||null,channel:src.name,url:row.input_snapshot.messages.find(m=>m.url)?.url||null,external_id:`channel-inbox:${row.id}`,participants:[...new Set(row.input_snapshot.messages.map(m=>m.author))],tags:['수집 검토',src.provider]});
        const document=(await client.query('INSERT INTO documents(project_id,title,domain_id,record_kind) VALUES($1,$2,$3,$4) RETURNING id',[p,input.title,input.domain_id,input.record_kind])).rows[0];
        const revision=(await client.query("INSERT INTO revisions(project_id,document_id,filename,mime_type,sha256,content,created_by,history) VALUES($1,$2,'channel-record.md','text/markdown',$3,$4,$5,$6) RETURNING id",[p,document.id,sha,content,u,JSON.stringify(metadata)])).rows[0];
        const job=(await client.query("INSERT INTO jobs(project_id,kind,revision_id) VALUES($1,'intake',$2) RETURNING id",[p,revision.id])).rows[0];
        const review={action:'accept',actor_id:u,reviewed_at:new Date().toISOString(),input_sha256:actionHash,evidence_sha256:row.input_sha256,reason:input.reason,acknowledge_evidence:true,title:input.title,text:input.text,domain_id:input.domain_id,record_kind:input.record_kind,decided_on:input.decided_on,manual_analysis_override:row.status!=='needs_review' || !row.analysis};
        await client.query("UPDATE channel_inbox SET status='accepted',review=$1,document_id=$2,revision_id=$3,job_id=$4,completed_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$5",[JSON.stringify(review),document.id,revision.id,job.id,row.id]);
        await audit(client,p,u,'revision.uploaded',revision.id,{document_id:document.id,domain_id:input.domain_id,record_kind:input.record_kind,filename:'channel-record.md',sha256:sha,job_id:job.id,history:metadata,channel_inbox_id:row.id});
        await audit(client,p,u,'channel.accepted',row.id,{document_id:document.id,revision_id:revision.id,job_id:job.id,review});
        return detail(client,p,row.id);
      });
    },
    async dismiss(p,inboxId,u,body={}) {
      object(body,['reason']); const reason=text(body.reason,'검토 사유',2000),actionHash=hash({reason});
      return transaction(pool,async client=>{
        await member(client,p,u,REVIEWERS); const {row}=await lockedInbox(client,p,inboxId);
        if (row.status==='dismissed') {
          if (row.review.input_sha256!==actionHash) fail('REVIEW_REPLAY_CONFLICT','이미 다른 사유로 제외된 검토입니다.',409);
          return detail(client,p,row.id);
        }
        if (['running','accepted'].includes(row.status)) fail('CHANNEL_REVIEW_NOT_READY','실행 중이거나 등록된 항목은 제외할 수 없습니다.',409);
        const review={action:'dismiss',actor_id:u,reviewed_at:new Date().toISOString(),reason,input_sha256:actionHash,evidence_sha256:row.input_sha256};
        await client.query("UPDATE channel_inbox SET status='dismissed',review=$1,completed_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$2",[JSON.stringify(review),row.id]);
        await audit(client,p,u,'channel.dismissed',row.id,{review}); return detail(client,p,row.id);
      });
    },
  };
}
module.exports={createChannelLedger,normalizeBatch,currentEvidence,lockedInbox};
