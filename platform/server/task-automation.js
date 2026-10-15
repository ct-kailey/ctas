'use strict';
const { createHash } = require('node:crypto');
const { transaction } = require('./db');
const { membership } = require('./context-ledger');
const { hash, id } = require('./context-contract');
const { repositoryCoordinates } = require('./repository-check');
const WRITERS = ['owner','reviewer','member'], REVIEWERS = ['owner','reviewer'];
const SHA = /^[a-f0-9]{40}$/;
function fail(code, message, status = 409) { throw Object.assign(new Error(message), { code, status }); }
function object(v, keys) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) fail('TASK_INPUT_INVALID', '자동화 요청 항목을 확인하세요.', 400); }
function text(v, max = 5000) { if (typeof v !== 'string' || !v.trim() || v.length > max || v.includes('\0')) fail('TASK_INPUT_INVALID', '내용의 형식과 길이를 확인하세요.', 400); return v.trim(); }
function version(v) { if (!Number.isSafeInteger(v) || v < 1) fail('TASK_VERSION_REQUIRED', '현재 작업 버전이 필요합니다.', 400); }
function safeCode(e, fallback = 'TASK_AUTOMATION_FAILED') { return /^(TASK|NORA)_[A-Z0-9_]{1,80}$/.test(e?.code || '') ? e.code : fallback; }
function stableId(...parts) { const h = createHash('sha256').update(parts.join(':')).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; }
async function lock(db,p) { await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-task-automation:' || $1,0))", [p]); }
async function settings(db,p) { return (await db.query('SELECT * FROM task_automation_settings WHERE project_id=$1', [p])).rows[0]; }
async function audit(db,p,u,kind,entity,detail={}) { await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)', [p,u,'task_automation.'+kind,entity,JSON.stringify(detail)]); }
async function task(db,p,tid,forUpdate=false) { const r = (await db.query(`SELECT * FROM automation_tasks WHERE project_id=$1 AND id=$2${forUpdate?' FOR UPDATE':''}`, [p,id(tid)])).rows[0]; if (!r) fail('TASK_NOT_FOUND','이 프로젝트의 자동화 작업을 찾을 수 없습니다.',404); return r; }
function publicTask(row,detail=false) { return { ...row, version:Number(row.version), input_snapshot:detail?row.input_snapshot:undefined, artifact:row.artifact?{...row.artifact,...(!detail?{diff:undefined}:{})}:null }; }
function publicAnalysis(r) { return { id:r.id,project_id:r.project_id,revision_id:r.revision_id,status:r.status,risks:r.result?.risks||[],question_ids:r.question_ids,error_code:r.error_code,created_at:r.created_at,updated_at:r.updated_at,trace_id:r.result?.trace_id||null }; }
async function capabilities(provider,p,db=provider.pool) {
  const config=await settings(db,p), n=(await db.query('SELECT workspace_id,status,connector_id FROM project_nora_workspaces WHERE project_id=$1',[p])).rows[0];
  const base={risk_analysis:false,development:false,merge:false,blockers:[]};
  if(!n||n.status!=='ready')return {...base,blockers:['TASK_CONNECTION_REQUIRED']};
  if(!config.enabled)return {...base,blockers:['TASK_AUTOMATION_DISABLED']};
  let offered;
  try { offered=typeof provider.capabilities==='function'?await provider.capabilities({projectId:p,workspaceId:n.workspace_id,settings:config}):{risk_analysis:typeof provider.analyzeRisk==='function',development:typeof provider.develop==='function',merge:typeof provider.merge==='function'}; }
  catch(e){return {...base,blockers:[safeCode(e,'TASK_CONNECTION_REQUIRED')]};}
  const blockers=Array.isArray(offered?.blockers)?offered.blockers.filter(v=>typeof v==='string'||v&&typeof v.code==='string'&&typeof v.message==='string').slice(0,30).map(v=>typeof v==='string'?v.slice(0,200):{code:v.code.slice(0,100),message:v.message.slice(0,1000)}):[];
  const add=(code,message)=>{if(!blockers.some(v=>(typeof v==='string'?v:v.code)===code))blockers.push({code,message});};
  if(!config.development_flow_slug)add('TASK_DEVELOPMENT_FLOW_REQUIRED','게시된 프로젝트 개발 흐름을 선택하세요.');
  if(!n.connector_id)add('TASK_GIT_CONNECTOR_REQUIRED','이 Nora 워크스페이스의 GitHub 커넥터를 선택하세요.');
  if(!config.preview_origins.length)add('TASK_PREVIEW_ORIGIN_REQUIRED','검토할 프리뷰의 HTTPS 원점을 설정하세요.');
  const repository=(await db.query('SELECT repository_check FROM project_settings WHERE project_id=$1',[p])).rows[0]?.repository_check;
  const repositoryReady=repository?.status==='ready'&&repository.credential_source==='nora'&&SHA.test(repository.head_sha||'');
  if(!repositoryReady)add('TASK_REPOSITORY_REQUIRED','Nora GitHub 연결로 기준 브랜치를 확인한 뒤 정책을 다시 분석하세요.');
  return {risk_analysis:Boolean(offered?.risk_analysis&&provider.analyzeRisk),development:Boolean(offered?.development&&provider.develop&&config.development_flow_slug&&n.connector_id&&config.preview_origins.length&&repositoryReady),merge:Boolean(offered?.merge&&provider.merge&&n.connector_id&&repositoryReady),blockers};
}
async function snapshot(db,p,rid,requestId) {
  const row=(await db.query(`SELECT r.*,d.title,d.document_category FROM revisions r JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id WHERE r.project_id=$1 AND r.id=$2`,[p,id(rid)])).rows[0];
  if(!row)fail('TASK_SOURCE_NOT_FOUND','이 프로젝트의 문서를 선택하세요.',404);
  if(row.document_category!=='policy')fail('TASK_POLICY_REQUIRED','정책 문서만 자동 위험 분석 대상으로 선택할 수 있습니다.');
  if(row.status!=='ready'||row.document_json?.extraction?.complete!==true||!Array.isArray(row.document_json.segments)||!row.document_json.segments.length||row.document_json.segments.some(s=>s.extraction_status!=='ok'))fail('TASK_SOURCE_NOT_READY','불완전한 문서 추출 또는 확인이 필요한 구간을 먼저 검토하세요.');
  const n=(await db.query('SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1',[p])).rows[0];
  if(!n)fail('TASK_CONNECTION_REQUIRED','프로젝트의 Nora 워크스페이스를 먼저 등록하세요.');
  const config=await settings(db,p);if(!config.enabled)fail('TASK_AUTOMATION_DISABLED','프로젝트 자동화를 설정에서 활성화하세요.');
  const project=(await db.query('SELECT s.*,p.name FROM project_settings s JOIN projects p ON p.id=s.project_id WHERE project_id=$1',[p])).rows[0];
  const contextVersion=Number((await db.query('SELECT version FROM context_heads WHERE project_id=$1',[p])).rows[0]?.version||0);
  const records=(await db.query(`SELECT r.id,r.content_sha256,r.title,r.body FROM context_records r WHERE r.project_id=$1 AND NOT EXISTS(SELECT 1 FROM context_supersessions s WHERE s.project_id=r.project_id AND s.previous_id=r.id) ORDER BY r.context_version DESC LIMIT 201`,[p])).rows;
  if(records.length>200)fail('TASK_CONTEXT_TOO_LARGE','분석 범위를 나누어 주세요.',413);
  const value={schema_version:'1.0',project_id:p,request_id:requestId,source:{revision_id:row.id,document_id:row.document_id,title:row.title,category:row.document_category,sha256:row.sha256,segments:row.document_json.segments},context:{version:contextVersion,records},project:{name:project.name,goal:project.goal,settings_version:Number(project.version)},repository:{url:project.repository_url,base_branch:project.base_branch,head_sha:project.repository_check?.status==='ready'&&project.repository_check?.credential_source==='nora'?project.repository_check.head_sha:null},nora:{workspace_id:n.workspace_id},automation:{settings_version:config.version,risk_flow_slug:config.risk_flow_slug,development_flow_slug:config.development_flow_slug,preview_origins:config.preview_origins}};
  if(Buffer.byteLength(JSON.stringify(value))>500000)fail('TASK_CONTEXT_TOO_LARGE','정책과 관련 기록의 분석 범위를 줄여 주세요.',413);
  return value;
}
async function assertFresh(db,p,value,expectedHash,{development=false}={}) {
  if(value.project_id!==p||hash(value)!==expectedHash)fail('TASK_SNAPSHOT_MISMATCH','작업의 고정된 근거를 확인할 수 없습니다.');
  const current=await snapshot(db,p,value.source.revision_id,value.request_id);
  if(hash(current)!==expectedHash)fail('TASK_SOURCE_STALE','정책·프로젝트 기록·저장소 설정이 변경되었습니다. 최신 문서로 다시 분석하세요.');
  const latest=(await db.query('SELECT id FROM revisions WHERE project_id=$1 AND document_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[p,value.source.document_id])).rows[0];
  if(latest?.id!==value.source.revision_id)fail('TASK_SOURCE_STALE','정책의 새 버전이 등록되었습니다. 최신 문서로 다시 분석하세요.');
  if(development&&(!value.repository.url||!value.repository.base_branch||!SHA.test(value.repository.head_sha||'')))fail('TASK_REPOSITORY_REQUIRED','Nora GitHub 커넥터에서 기준 브랜치를 확인한 뒤 다시 분석하세요.');
}
function validateArtifact(output,row) {
  if(output?.schema_version!=='1.0'||output.project_id!==row.project_id||output.task_id!==row.id||output.input_sha256!==row.input_sha256||typeof output.trace_id!=='string'||!output.trace_id)fail('TASK_DEVELOPMENT_SCOPE_MISMATCH','개발 결과의 프로젝트·작업 근거가 요청과 다릅니다.');
  const a=output.artifact,s=row.input_snapshot,repo=repositoryCoordinates(s.repository.url).url.replace(/\.git$/,'');
  if(!a||!Number.isSafeInteger(a.pr_number)||a.pr_number<1||a.pr_url!==`${repo}/pull/${a.pr_number}`||!SHA.test(a.head_sha||'')||a.base_sha!==s.repository.head_sha||a.target_branch!==s.repository.base_branch||typeof a.diff!=='string'||!a.diff.trim()||Buffer.byteLength(a.diff)>1048576)fail('TASK_ARTIFACT_INVALID','검증된 PR·커밋·변경 내역이 필요합니다.');
  let preview;try{preview=new URL(a.preview_url);}catch{fail('TASK_PREVIEW_REQUIRED','검토 가능한 프리뷰 주소가 필요합니다.');}
  if(preview.protocol!=='https:'||preview.username||preview.password||!s.automation.preview_origins.includes(preview.origin))fail('TASK_PREVIEW_ORIGIN_INVALID','프로젝트에서 허용한 프리뷰 주소가 아닙니다.');
  if(!Array.isArray(a.checks)||!a.checks.length||a.checks.length>100||a.checks.some(c=>!c||typeof c.name!=='string'||!c.name.trim()||!['passed','failed','pending'].includes(c.status)))fail('TASK_CHECKS_REQUIRED','검증 실행 내역이 필요합니다.');
  return {pr_number:a.pr_number,pr_url:a.pr_url,head_sha:a.head_sha,base_sha:a.base_sha,target_branch:a.target_branch,preview_url:preview.href,diff:a.diff,checks:a.checks.map(c=>({name:c.name.slice(0,200),status:c.status})),trace_id:output.trace_id};
}
function validateMerge(result,row) {
  const a=row.artifact;
  if(result?.project_id!==row.project_id||result.task_id!==row.id||result.input_sha256!==row.input_sha256||result.head_sha!==a.head_sha||result.target_branch!==a.target_branch||result.pr_number!==a.pr_number||result.merged!==true||!SHA.test(result.merge_commit_sha||''))fail('TASK_MERGE_NOT_CONFIRMED','승인한 커밋의 기준 브랜치 병합을 확인하지 못했습니다.');
  return {project_id:row.project_id,task_id:row.id,input_sha256:row.input_sha256,head_sha:a.head_sha,target_branch:a.target_branch,pr_number:a.pr_number,merged:true,merge_commit_sha:result.merge_commit_sha};
}
function createTaskAutomation({pool,provider={}}) {
  return {
    async overview(p,u) { await membership(pool,p,u);const [a,t,c,s,i]=await Promise.all([pool.query('SELECT * FROM task_automation_analyses WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',[p]),pool.query('SELECT * FROM automation_tasks WHERE project_id=$1 ORDER BY created_at DESC LIMIT 200',[p]),capabilities(provider,p,pool),settings(pool,p),pool.query('SELECT revision_id,status,error_code,created_at FROM task_automation_intake WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',[p])]);return {analyses:a.rows.map(publicAnalysis),tasks:t.rows.map(r=>publicTask(r)),settings:s,capabilities:c,intake:i.rows}; },
    async getTask(p,u,tid) { await membership(pool,p,u);return publicTask(await task(pool,p,tid),true); },
    async saveSettings(p,u,value) {
      object(value,['expected_version','enabled','risk_flow_slug','development_flow_slug','preview_origins']);version(value.expected_version);
      if(typeof value.enabled!=='boolean'||!Array.isArray(value.preview_origins)||value.preview_origins.length>10)fail('TASK_SETTINGS_INVALID','자동화 설정 형식을 확인하세요.',400);
      const slug=v=>{if(v===null||v===undefined||v==='')return null;if(typeof v!=='string'||!/^[-a-zA-Z0-9_]{1,150}$/.test(v))fail('TASK_FLOW_INVALID','게시된 Nora 흐름 식별자를 확인하세요.',400);return v;};
      const risk=slug(value.risk_flow_slug),dev=slug(value.development_flow_slug),origins=[...new Set(value.preview_origins.map(v=>{let url;try{url=new URL(v);}catch{fail('TASK_PREVIEW_ORIGIN_INVALID','HTTPS 프리뷰 원점을 입력하세요.',400);}if(url.protocol!=='https:'||url.origin!==v||url.username||url.password)fail('TASK_PREVIEW_ORIGIN_INVALID','경로 없이 HTTPS 프리뷰 원점을 입력하세요.',400);return url.origin;}))];
      return transaction(pool,async db=>{await membership(db,p,u,['owner']);await lock(db,p);const s=await settings(db,p);if(s.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','자동화 설정이 변경되었습니다.');const r=(await db.query('UPDATE task_automation_settings SET enabled=$2,risk_flow_slug=$3,development_flow_slug=$4,preview_origins=$5,version=version+1,updated_by=$6,updated_at=now() WHERE project_id=$1 RETURNING *',[p,value.enabled,risk,dev,JSON.stringify(origins),u])).rows[0];await audit(db,p,u,'settings_updated',p,{version:r.version});return r;});
    },
    async analyze(p,u,value) {
      object(value,['revision_id','request_id']);id(value.revision_id);id(value.request_id);const fingerprint=hash(value);
      return transaction(pool,async db=>{
        await membership(db,p,u,WRITERS);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-task-request:' || $1,0))",[value.request_id]);
        await lock(db,p);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-context:' || $1,0))",[p]);
        const old=(await db.query('SELECT * FROM task_automation_requests WHERE id=$1',[value.request_id])).rows[0];
        if(old){
          if(old.project_id!==p||old.created_by!==u||old.request_sha256!==fingerprint)fail('TASK_REQUEST_CONFLICT','다른 분석에 사용한 요청 ID입니다.');
          return publicAnalysis((await db.query('SELECT * FROM task_automation_analyses WHERE project_id=$1 AND id=$2',[p,old.analysis_id])).rows[0]);
        }
        const input=await snapshot(db,p,value.revision_id,value.request_id),sha=hash(input);
        // Transport request identity is not new policy evidence. Repeated clicks and
        // automatic/manual requests must share the same analysis and resulting tasks.
        const {request_id:ignored,...evidence}=input,dedup=hash(evidence);
        let row=(await db.query('SELECT * FROM task_automation_analyses WHERE project_id=$1 AND dedup_sha256=$2',[p,dedup])).rows[0];
        if(!row){
          row=(await db.query('INSERT INTO task_automation_analyses(id,project_id,revision_id,request_sha256,input_snapshot,input_sha256,dedup_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[value.request_id,p,value.revision_id,fingerprint,input,sha,dedup,u])).rows[0];
          await db.query("INSERT INTO task_automation_jobs(project_id,kind,analysis_id,created_by) VALUES($1,'risk',$2,$3)",[p,row.id,u]);
          await audit(db,p,u,'analysis_requested',row.id,{revision_id:value.revision_id,input_sha256:sha});
        }
        await db.query('INSERT INTO task_automation_requests(id,project_id,analysis_id,request_sha256,created_by) VALUES($1,$2,$3,$4,$5)',[value.request_id,p,row.id,fingerprint,u]);
        return publicAnalysis(row);
      });
    },
    async transition(p,u,tid,value) {
      object(value,['expected_version','status']);version(value.expected_version);await membership(pool,p,u,WRITERS);
      if(value.status==='done')fail('TASK_QA_APPROVAL_REQUIRED','검토 대기에서 프리뷰와 변경 내역을 확인하고 병합을 승인해야 완료됩니다.');
      if(value.status!=='in_progress')fail('TASK_TRANSITION_INVALID','대기 작업을 진행 중으로 옮겨 개발을 시작하세요. 검토 대기와 완료는 실행 결과로 결정됩니다.');
      const c=await capabilities(provider,p,pool);if(!c.development)fail('TASK_DEVELOPMENT_UNAVAILABLE','프로젝트 개발 흐름·GitHub 연결·프리뷰 설정을 먼저 완료하세요.');
      return transaction(pool,async db=>{await membership(db,p,u,WRITERS);await lock(db,p);const r=await task(db,p,tid,true);if(r.status==='in_progress'&&r.execution_status==='queued'&&r.version===value.expected_version+1)return publicTask(r,true);if(r.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','작업 상태가 변경되었습니다.');if(r.status!=='todo'||r.execution_status!=='idle')fail('TASK_ALREADY_STARTED','이미 시작한 개발은 자동으로 다시 실행하지 않습니다.');await assertFresh(db,p,r.input_snapshot,r.input_sha256,{development:true});const changed=(await db.query("UPDATE automation_tasks SET status='in_progress',execution_status='queued',started_by=$3,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",[p,r.id,u])).rows[0];await db.query("INSERT INTO task_automation_jobs(project_id,kind,task_id,created_by) VALUES($1,'develop',$2,$3)",[p,r.id,u]);await audit(db,p,u,'development_requested',r.id,{head_sha:r.input_snapshot.repository.head_sha});return publicTask(changed,true);});
    },
    async approveMerge(p,u,tid,value) {
      object(value,['expected_version','head_sha','note']);version(value.expected_version);if(!SHA.test(value.head_sha||''))fail('TASK_HEAD_REQUIRED','검토한 PR 커밋이 필요합니다.',400);const note=text(value.note,3000);await membership(pool,p,u,REVIEWERS);
      if(!(await capabilities(provider,p,pool)).merge)fail('TASK_MERGE_UNAVAILABLE','Nora GitHub 커넥터에서 커밋 확인을 포함한 병합 기능을 사용할 수 없습니다.');
      return transaction(pool,async db=>{await membership(db,p,u,REVIEWERS);await lock(db,p);const r=await task(db,p,tid,true);if(r.review&&r.review.actor_id===u&&r.review.head_sha===value.head_sha&&r.review.note===note)return publicTask(r,true);if(r.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','작업 상태가 변경되었습니다.');if(r.status!=='qa'||r.execution_status!=='ready'||r.artifact?.head_sha!==value.head_sha)fail('TASK_REVIEW_STALE','검토 대기의 현재 프리뷰와 변경 내역을 다시 확인하세요.');if(r.artifact.checks.some(c=>c.status!=='passed'))fail('TASK_CHECKS_NOT_PASSED','모든 검증이 통과한 뒤 병합을 승인하세요.');await assertFresh(db,p,r.input_snapshot,r.input_sha256,{development:true});const review={actor_id:u,head_sha:value.head_sha,target_branch:r.artifact.target_branch,note,artifact_sha256:hash(r.artifact),reviewed_version:r.version,approved_at:new Date().toISOString()};const changed=(await db.query("UPDATE automation_tasks SET execution_status='merging',review=$3,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",[p,r.id,review])).rows[0];await db.query("INSERT INTO task_automation_jobs(project_id,kind,task_id,created_by,payload) VALUES($1,'merge',$2,$3,$4)",[p,r.id,u,{review}]);await audit(db,p,u,'merge_approved',r.id,{head_sha:value.head_sha,target_branch:r.artifact.target_branch});return publicTask(changed,true);});
    },
    async reconcileMerge(p,u,tid,value) {
      object(value,['expected_version']);version(value.expected_version);await membership(pool,p,u,REVIEWERS);if(typeof provider.reconcileMerge!=='function')fail('TASK_RECONCILE_UNAVAILABLE','병합 상태를 확인할 서버 연결이 필요합니다.');
      return transaction(pool,async db=>{await membership(db,p,u,REVIEWERS);await lock(db,p);const r=await task(db,p,tid,true);if(r.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','작업 상태가 변경되었습니다.');if(r.execution_status!=='uncertain'||!r.review)fail('TASK_RECONCILE_NOT_REQUIRED','결과가 불확실한 병합 요청만 확인할 수 있습니다.');if((await db.query("SELECT 1 FROM task_automation_jobs WHERE task_id=$1 AND kind='reconcile_merge' AND status IN('queued','running','awaiting_connection')",[r.id])).rowCount)return publicTask(r,true);const original=(await db.query("SELECT id FROM task_automation_jobs WHERE task_id=$1 AND kind='merge'",[r.id])).rows[0];await db.query("INSERT INTO task_automation_jobs(project_id,kind,task_id,created_by,payload) VALUES($1,'reconcile_merge',$2,$3,$4)",[p,r.id,u,{operation_id:original.id}]);return publicTask(r,true);});
    },
  };
}
module.exports={createTaskAutomation,capabilities,settings,snapshot,assertFresh,validateArtifact,validateMerge,stableId,task,publicTask,publicAnalysis,lock,audit,fail,safeCode,WRITERS,REVIEWERS};
