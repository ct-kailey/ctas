'use strict';
const {transaction}=require('./db');
const catalog=require('./context-sources');
const {currentEvidence,lockedInbox}=require('./channel-ledger');
const {lockGovernanceProject,classifyInTransaction,classifyRequest}=require('./work-governance');
const {getQuestion,checkVersion,event:questionEvent}=require('./question-ledger');
const {fail,object,text,id,timestamp,hash,REVIEW,version}=require('./question-contract');

async function member(db,p,u,roles){
 const row=(await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE',[p,id(u)])).rows[0];
 if(!row||roles&&!roles.includes(row.role))fail('FORBIDDEN','이 프로젝트에서 대화를 업무에 연결할 권한이 없습니다.',403);
 return row.role;
}
function sha(value){if(typeof value!=='string'||!/^([a-f0-9]{64})$/.test(value))fail('CHANNEL_WORKFLOW_INVALID_INPUT','현재 원문의 해시가 필요합니다.');return value;}
function selectedIds(value){
 if(!Array.isArray(value)||!value.length||value.length>50)fail('CHANNEL_WORKFLOW_INVALID_SELECTION','근거 메시지를 1–50개 선택하세요.');
 const ids=value.map(id).sort();if(new Set(ids).size!==ids.length)fail('CHANNEL_WORKFLOW_INVALID_SELECTION','같은 메시지를 중복 선택할 수 없습니다.');return ids;
}
function parse(body,type){
 object(body,['request_id','source_sha256','event_ids','text','acknowledge_evidence',...(type==='question_answer'?['question_id','expected_question_version','responded_by','responded_at']:[])]);
 if(body.acknowledge_evidence!==true)fail('CHANNEL_WORKFLOW_ACK_REQUIRED','선택한 원문을 대조한 뒤 업무에 연결하세요.');
 const input={request_id:id(body.request_id),source_sha256:sha(body.source_sha256),event_ids:selectedIds(body.event_ids),text:text(body.text,type==='classification'?'고객 요청':'답변',10000),acknowledge_evidence:true};
 if(type==='question_answer')Object.assign(input,{question_id:id(body.question_id),expected_question_version:version(body.expected_question_version),responded_by:text(body.responded_by,'답변한 사람',200),responded_at:timestamp(body.responded_at)});
 return input;
}
function mapping(row){return {...row,target_id:row.classification_id||row.question_id};}
async function messages(db,p,row){
 const ids=row.input_snapshot.messages.map(m=>m.event_id);
 return (await db.query('SELECT id,event_id,message_id,kind,author,text,sent_at,changed_at,url FROM channel_events WHERE project_id=$1 AND source_id=$2 AND id=ANY($3::uuid[]) ORDER BY sequence',[p,row.source_id,ids])).rows.map(m=>({...m,selectable:m.kind!=='deleted'}));
}
async function sourceState(db,p,row){
 if(row.status!=='accepted')return {available:false,blocked_reason:'CHANNEL_WORKFLOW_REVIEW_REQUIRED',source_ref:null};
 const src=await catalog.source(db,p,'channel_inbox',row.id),source_ref={type:src.type,id:src.id,sha256:src.sha256};
 const current=!row.evidence_changed&&src.approved&&!src.evidence_changed&&await currentEvidence(db,row);
 return {available:!!current,blocked_reason:current?null:'CHANNEL_WORKFLOW_SOURCE_CHANGED',source_ref,catalog_source:src};
}
function selection(row,evidence,ids){
 const chosen=evidence.filter(m=>ids.includes(m.id));
 if(chosen.length!==ids.length||chosen.some(m=>m.kind==='deleted'))fail('CHANNEL_WORKFLOW_INVALID_SELECTION','현재 수집 항목의 삭제되지 않은 원문만 선택하세요.');
 return chosen;
}
async function freshSource(db,p,inboxId,input){
 const {row,src}=await lockedInbox(db,p,inboxId),state=await sourceState(db,p,row);
 if(!state.available)fail(state.blocked_reason,row.status==='accepted'?'원본 대화가 변경되었습니다. 최신 수집 항목을 다시 검토하세요.':'대화를 먼저 검토하여 기록으로 등록하세요.',409);
 if(state.source_ref.sha256!==input.source_sha256)fail('CHANNEL_WORKFLOW_SOURCE_CHANGED','검토한 원문이 변경되었습니다. 최신 내용을 다시 확인하세요.',409);
 const evidence=await messages(db,p,row),chosen=selection(row,evidence,input.event_ids);
 return {row,src,state,chosen};
}
async function priorMapping(db,p,u,inboxId,type,input,requestHash){
 const prior=(await db.query('SELECT * FROM channel_workflow_mappings WHERE id=$1',[input.request_id])).rows[0];
 if(!prior)return null;
 if(prior.project_id!==p||prior.inbox_id!==inboxId||prior.target_type!==type||prior.created_by!==u||prior.request_sha256!==requestHash)fail('CHANNEL_WORKFLOW_REQUEST_CONFLICT','이 요청 ID는 다른 연결에 사용되었습니다.',409);
 return prior;
}
async function target(db,p,row){
 if(row.target_type==='classification'){
  const result=(await db.query('SELECT * FROM maintenance_classifications WHERE project_id=$1 AND id=$2',[p,row.classification_id])).rows[0];
  return {classification:{...result,version:Number(result.version)}};
 }
 return {question:await getQuestion(db,p,row.question_id)};
}
async function duplicate(db,p,type,selectedHash,questionId){
 const row=(await db.query('SELECT id FROM channel_workflow_mappings WHERE project_id=$1 AND target_type=$2 AND selection_sha256=$3 AND ($2=\'classification\' OR question_id=$4)',[p,type,selectedHash,questionId||null])).rows[0];
 if(row)throw Object.assign(new Error('선택한 근거는 이미 이 업무에 연결되었습니다. 연결 이력에서 확인하세요.'),{code:'CHANNEL_WORKFLOW_ALREADY_LINKED',status:409,mapping_id:row.id});
}
async function appendMapping(db,p,u,type,input,requestHash,evidence,targetId,targetVersion,answerMeta){
 const {row,src,state,chosen}=evidence;
 const sourceSnapshot={schema_version:'1.0',source:row.input_snapshot.source,conversation_key:row.conversation_key,input_snapshot:row.input_snapshot,input_sha256:row.input_sha256,accepted_review:row.review,selected_messages:chosen,source_ref:state.source_ref,...(answerMeta?{answer_metadata:answerMeta}:{})};
 const result=(await db.query(`INSERT INTO channel_workflow_mappings(id,project_id,inbox_id,source_id,target_type,classification_id,question_id,target_version,source_sha256,source_ref,source_snapshot,event_ids,selection_sha256,request_snapshot,request_sha256,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,[input.request_id,p,row.id,src.id,type,type==='classification'?targetId:null,type==='question_answer'?targetId:null,targetVersion,state.source_ref.sha256,state.source_ref,sourceSnapshot,input.event_ids,hash({source_id:src.id,event_ids:input.event_ids}),input,requestHash,u])).rows[0];
 await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[p,u,'channel.workflow_linked',result.id,{inbox_id:row.id,target_type:type,target_id:targetId,target_version:targetVersion,source_ref:state.source_ref,event_ids:input.event_ids,automatic_execution_allowed:false}]);
 return mapping(result);
}
function answerTime(input,chosen){
 if(Date.parse(input.responded_at)>Date.now()+300000)fail('QUESTION_FUTURE_ANSWER','답변 시각은 현재보다 미래일 수 없습니다.');
 const authored=chosen.filter(m=>m.author===input.responded_by);
 if(!authored.length)fail('CHANNEL_WORKFLOW_AUTHOR_MISMATCH','답변한 사람은 선택한 원문의 작성자 중에서 지정하세요.');
 const times=authored.flatMap(m=>[m.sent_at,m.kind==='updated'?m.changed_at:null].filter(Boolean).map(t=>new Date(t).getTime()));
 if(times.includes(Date.parse(input.responded_at)))return 'source';
 if(authored.some(m=>!m.sent_at&&!(m.kind==='updated'&&m.changed_at)))return 'manual';
 fail('CHANNEL_WORKFLOW_TIME_MISMATCH','답변 시각은 선택한 작성자의 원문 시각과 일치해야 합니다.');
}
function page(query){
 const limit=query.limit===undefined?30:Number(query.limit),offset=query.offset===undefined?0:Number(query.offset);
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>10000)fail('CHANNEL_WORKFLOW_INVALID_PAGE','조회 범위를 확인하세요.');return {limit,offset};
}
function createChannelWorkflowService(pool){return {
 async preview(p,u,inboxId,query={}){
  inboxId=id(inboxId);const {limit,offset}=page(query);
  return transaction(pool,async db=>{
   await lockGovernanceProject(db,p);const role=await member(db,p,u);
   const {row,src}=await lockedInbox(db,p,inboxId),state=await sourceState(db,p,row),evidence=await messages(db,p,row);
   const waiting=(await db.query(`SELECT id,title,question,recipient,channel,version,asked_at,blocking FROM project_questions WHERE project_id=$1 AND status='waiting' ORDER BY asked_at DESC,id LIMIT $2 OFFSET $3`,[p,limit+1,offset])).rows;
   const mappings=(await db.query('SELECT m.*,u.name AS actor_name FROM channel_workflow_mappings m JOIN users u ON u.id=m.created_by WHERE m.project_id=$1 AND m.inbox_id=$2 ORDER BY m.created_at DESC,m.id LIMIT 100',[p,row.id])).rows.map(mapping);
   return {inbox_id:row.id,available:state.available,blocked_reason:state.blocked_reason,can_review:REVIEW.includes(role),source_ref:state.source_ref,source:{title:state.catalog_source?.title||src.name,provider:src.provider,channel:src.name},messages:evidence,waiting_questions:waiting.slice(0,limit),question_pagination:{limit,offset,has_more:waiting.length>limit},mappings,mappings_limit:100,
    classification_preview:classifyRequest({requirement:evidence.filter(m=>m.kind!=='deleted').map(m=>m.text).join('\n'),sources:state.available?[state.source_ref]:[]}),reply_matching:'manual_selection_required'};
  });
 },
 async classify(p,u,inboxId,body){
  inboxId=id(inboxId);const input=parse(body,'classification'),requestHash=hash({inbox_id:inboxId,target_type:'classification',...input});
  return transaction(pool,async db=>{
   await lockGovernanceProject(db,p);await member(db,p,u,REVIEW);
   const prior=await priorMapping(db,p,u,inboxId,'classification',input,requestHash);if(prior)return {mapping:mapping(prior),...await target(db,p,prior),replayed:true};
   const evidence=await freshSource(db,p,inboxId,input);
   await duplicate(db,p,'classification',hash({source_id:evidence.src.id,event_ids:input.event_ids}));
   const classification=await classifyInTransaction(db,p,u,{request_id:input.request_id,text:input.text,source_refs:[evidence.state.source_ref]});
   const result=await appendMapping(db,p,u,'classification',input,requestHash,evidence,classification.id,classification.version);
   return {mapping:result,classification,replayed:false};
  });
 },
 async answer(p,u,inboxId,body){
  inboxId=id(inboxId);const input=parse(body,'question_answer'),requestHash=hash({inbox_id:inboxId,target_type:'question_answer',...input});
  return transaction(pool,async db=>{
   await lockGovernanceProject(db,p);await member(db,p,u,REVIEW);
   const prior=await priorMapping(db,p,u,inboxId,'question_answer',input,requestHash);if(prior)return {mapping:mapping(prior),...await target(db,p,prior),replayed:true};
   const evidence=await freshSource(db,p,inboxId,input),selectionHash=hash({source_id:evidence.src.id,event_ids:input.event_ids});
   await duplicate(db,p,'question_answer',selectionHash,input.question_id);
   const q=await getQuestion(db,p,input.question_id,true);checkVersion(q,input.expected_question_version);
   if(q.status!=='waiting')fail('QUESTION_NOT_WAITING','답변 대기 중인 질문에만 새 답변을 연결할 수 있습니다.',409);
   if(Date.parse(input.responded_at)<new Date(q.asked_at).getTime())fail('QUESTION_ANSWER_ORDER','답변 시각은 질문 시각 이후여야 합니다.');
   const origin=answerTime(input,evidence.chosen),channel=evidence.src.name;
   const answer={text:input.text,responded_by:input.responded_by,responded_at:input.responded_at,channel,provider:evidence.src.provider,recorded_by:u,recorded_at:new Date().toISOString(),source_refs:[evidence.state.source_ref],channel_mapping_id:input.request_id,source_event_ids:input.event_ids,responded_at_origin:origin,sender_identity:'source_label_unverified'};
   const question=(await db.query("UPDATE project_questions SET answer=$3,status='answered_pending',version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",[p,q.id,answer])).rows[0];
   await questionEvent(db,p,u,question,'answer_recorded',{answer,channel_inbox_id:inboxId,channel_mapping_id:input.request_id});
   const result=await appendMapping(db,p,u,'question_answer',input,requestHash,evidence,question.id,question.version,{responded_at_origin:origin,sender_identity:'source_label_unverified'});
   return {mapping:result,question,replayed:false};
  });
 }
};}
module.exports={createChannelWorkflowService};
