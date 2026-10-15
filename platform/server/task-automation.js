'use strict';
const { createHash } = require('node:crypto');
const { transaction } = require('./db');
const { membership } = require('./context-ledger');
const { hash, id } = require('./context-contract');
const { repositoryCoordinates } = require('./repository-check');
const notes = require('./implementation-notes');
const riskV2 = require('../../nora/task-automation/risk-flow-v2');
const riskV3 = require('../../nora/task-automation/risk-flow-v3');
const provisional = require('./task-provisional-execution');
const questions = require('./question-ledger');
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
function executionProfile(config){return {...(config.execution_mode==='desktop'?{desktop_device_id:config.desktop_device_id||null}:{}),execution_mode:config.execution_mode||'connector_api',sdk_provider:config.sdk_provider||null,sdk_connection_id:config.sdk_connection_id||null,sdk_working_folder:config.sdk_working_folder||null,uncertainty_mode:config.uncertainty_mode||'strict'};}
function verificationPolicy(config,profile){return {settings_version:Number(config.version),preview_origins:config.preview_origins,execution_profile:profile||null};}
function artifactVerificationPolicy(row){return row.artifact?.verification_policy||{settings_version:row.input_snapshot.automation.settings_version,preview_origins:row.input_snapshot.automation.preview_origins,execution_profile:row.execution_context?.execution_profile||null};}
function effectiveArtifact(row){
  if(!row.artifact)return null;
  // Preserve an approval created before verification observations existed: its
  // signed evidence must not acquire new fields while the merge is in flight.
  if(!row.artifact.verification_policy&&!row.verification&&row.review?.artifact_sha256===hash(row.artifact))return row.artifact;
  return {...row.artifact,verification_policy:artifactVerificationPolicy(row),...(row.verification&&row.verification.artifact_sha256===hash(row.artifact)?Object.fromEntries(['kind','pr_number','pr_url','checks','preview_url','ci_status','preview_status','verification_status','verification_policy','observed_at'].filter(k=>Object.hasOwn(row.verification,k)).map(k=>[k,row.verification[k]])):{} )};
}
function publicTask(row,detail=false) { const artifact=effectiveArtifact(row);return { ...row, version:Number(row.version), requires_provisional_confirmation:row.status==='todo'&&Boolean(row.input_snapshot?.implementation_notes?.length||row.question_ids?.length), input_snapshot:detail?row.input_snapshot:undefined, artifact:artifact?{...artifact,...(!detail?{diff:undefined,reported_checks:undefined,reported_implementation_report:undefined}:{})}:null }; }
const ANALYSIS_SELECT=`SELECT a.*,j.execution,EXISTS(SELECT 1 FROM automation_tasks t WHERE t.project_id=a.project_id AND t.analysis_id=a.id) has_tasks
 FROM task_automation_analyses a LEFT JOIN LATERAL
 (SELECT jsonb_build_object('id',id,'status',status,'error_code',error_code,'trace_id',trace_id,'created_at',created_at,'updated_at',updated_at) execution
  FROM task_automation_jobs WHERE project_id=a.project_id AND analysis_id=a.id AND kind='risk' ORDER BY created_at DESC,id DESC LIMIT 1) j ON true`;
function analysisCanRetry(r){return ['failed','uncertain'].includes(r.status)&&r.execution?.status===r.status&&r.result===null&&!r.question_ids?.length&&!r.has_tasks;}
function publicAnalysis(r) { return { id:r.id,project_id:r.project_id,revision_id:r.revision_id,customer_question_language:r.input_snapshot?.project?.customer_question_language||null,status:r.status,risks:r.result?.risks||[],question_ids:r.question_ids,error_code:r.error_code,created_at:r.created_at,updated_at:r.updated_at,trace_id:r.result?.trace_id||r.execution?.trace_id||null,execution:r.execution||null,can_retry:analysisCanRetry(r),uncertainty_mode:r.input_snapshot?.automation?.uncertainty_mode||'strict',temporary_decisions:r.result?.temporary_decisions||[],work_gaps:r.result?.work_gaps||[],feedback:r.input_snapshot?.feedback?{note_id:r.input_snapshot.feedback.note_id,note_version:r.input_snapshot.feedback.note_version,feedback_id:r.input_snapshot.feedback.feedback_id}:null }; }
async function analysis(db,p,aid){const row=(await db.query(ANALYSIS_SELECT+' WHERE a.project_id=$1 AND a.id=$2',[p,aid])).rows[0];if(!row)fail('TASK_ANALYSIS_NOT_FOUND','이 프로젝트의 정책 분석을 찾을 수 없습니다.',404);return row;}
async function capabilities(provider,p,db=provider.pool) {
  const config=await settings(db,p), n=(await db.query('SELECT workspace_id,status,connector_id FROM project_nora_workspaces WHERE project_id=$1',[p])).rows[0];
  const base={risk_analysis:false,development:false,merge:false,blockers:[]};
  if(!n||n.status!=='ready')return {...base,blockers:['TASK_CONNECTION_REQUIRED']};
  if(!config.enabled)return {...base,blockers:['TASK_AUTOMATION_DISABLED']};
  let offered;
  try { offered=typeof provider.capabilities==='function'?await provider.capabilities({projectId:p,workspaceId:n.workspace_id,settings:config,developmentContractVersion:'3'}):{risk_analysis:typeof provider.analyzeRisk==='function',development:typeof provider.develop==='function',merge:typeof provider.merge==='function'}; }
  catch(e){if(config.execution_mode!=='desktop')return {...base,blockers:[safeCode(e,'TASK_CONNECTION_REQUIRED')]};offered={blockers:[safeCode(e,'TASK_CONNECTION_REQUIRED')]};}
  const blockers=Array.isArray(offered?.blockers)?offered.blockers.filter(v=>typeof v==='string'||v&&typeof v.code==='string'&&typeof v.message==='string').slice(0,30).map(v=>typeof v==='string'?v.slice(0,200):{code:v.code.slice(0,100),message:v.message.slice(0,1000)}):[];
  const add=(code,message)=>{if(!blockers.some(v=>(typeof v==='string'?v:v.code)===code))blockers.push({code,message});};
  if(config.execution_mode!=='desktop'&&!config.development_flow_slug)add('TASK_DEVELOPMENT_FLOW_REQUIRED','게시된 프로젝트 개발 흐름을 선택하세요.');
  if(!n.connector_id)add('TASK_GIT_CONNECTOR_REQUIRED','이 Nora 워크스페이스의 GitHub 커넥터를 선택하세요.');
  const repository=(await db.query('SELECT repository_check FROM project_settings WHERE project_id=$1',[p])).rows[0]?.repository_check;
  const repositoryReady=repository?.status==='ready'&&repository.credential_source==='nora'&&SHA.test(repository.head_sha||'');
  if(!repositoryReady)add('TASK_REPOSITORY_REQUIRED','Nora GitHub 연결로 기준 브랜치를 확인한 뒤 정책을 다시 분석하세요.');
  if(config.execution_mode==='desktop'){const device=await require('./desktop-execution').readyDevice(db,p,config);if(!device)add('DESKTOP_DEVICE_REQUIRED','CTAS Desktop에서 프로젝트를 연결하고 실행 기기를 선택하세요.');return {risk_analysis:Boolean(offered?.risk_analysis&&provider.analyzeRisk),development:Boolean(device&&n.connector_id&&repositoryReady),merge:false,diff:true,pr:false,ci:false,preview:false,blockers:blockers.filter(b=>!['TASK_DEVELOPMENT_FLOW_REQUIRED','NORA_SDK_CONNECTION_REQUIRED','NORA_SDK_FLOW_INVALID'].includes(typeof b==='string'?b:b.code))};}
  return {risk_analysis:Boolean(offered?.risk_analysis&&provider.analyzeRisk),development:Boolean(offered?.development&&provider.develop&&config.development_flow_slug&&n.connector_id&&repositoryReady),merge:Boolean(offered?.merge&&provider.merge&&n.connector_id&&repositoryReady),...Object.fromEntries(['diff','pr','ci','preview'].map(k=>[k,Boolean(offered?.[k])])),blockers};
}
async function snapshot(db,p,rid,requestId,{feedback=null,implementationNotes=[],schemaVersion='3.0',questionLanguage}={}) {
  const row=(await db.query(`SELECT r.*,d.title,d.document_category FROM revisions r JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id WHERE r.project_id=$1 AND r.id=$2`,[p,id(rid)])).rows[0];
  if(!row)fail('TASK_SOURCE_NOT_FOUND','이 프로젝트의 문서를 선택하세요.',404);
  if(row.document_category!=='policy')fail('TASK_POLICY_REQUIRED','정책 문서만 자동 위험 분석 대상으로 선택할 수 있습니다.');
  if(row.status!=='ready'||row.document_json?.project_id!==p||row.document_json?.revision_id!==row.id||row.document_json?.document_id!==row.document_id||row.document_json?.source?.sha256!==row.sha256||row.document_json?.extraction?.complete!==true||!Array.isArray(row.document_json.segments)||!row.document_json.segments.length||row.document_json.segments.some(s=>s.extraction_status!=='ok'))fail('TASK_SOURCE_NOT_READY','불완전한 문서 추출 또는 확인이 필요한 구간을 먼저 검토하세요.');
  const n=(await db.query('SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1',[p])).rows[0];
  if(!n)fail('TASK_CONNECTION_REQUIRED','프로젝트의 Nora 워크스페이스를 먼저 등록하세요.');
  const config=await settings(db,p);if(!config.enabled)fail('TASK_AUTOMATION_DISABLED','프로젝트 자동화를 설정에서 활성화하세요.');
  const project=(await db.query('SELECT s.*,p.name FROM project_settings s JOIN projects p ON p.id=s.project_id WHERE project_id=$1',[p])).rows[0];
  const contextVersion=Number((await db.query('SELECT version FROM context_heads WHERE project_id=$1',[p])).rows[0]?.version||0);
  const records=(await db.query(`SELECT r.id,r.content_sha256,r.title,r.body FROM context_records r WHERE r.project_id=$1 AND NOT EXISTS(SELECT 1 FROM context_supersessions s WHERE s.project_id=r.project_id AND s.previous_id=r.id) ORDER BY r.context_version DESC LIMIT 201`,[p])).rows;
  if(records.length>200)fail('TASK_CONTEXT_TOO_LARGE','분석 범위를 나누어 주세요.',413);
  const value={schema_version:'1.0',project_id:p,request_id:requestId,source:{revision_id:row.id,document_id:row.document_id,title:row.title,category:row.document_category,sha256:row.sha256,segments:row.document_json.segments},context:{version:contextVersion,records},project:{name:project.name,goal:project.goal,settings_version:Number(project.version)},repository:{url:project.repository_url,base_branch:project.base_branch,head_sha:project.repository_check?.status==='ready'&&project.repository_check?.credential_source==='nora'?project.repository_check.head_sha:null},nora:{workspace_id:n.workspace_id},automation:{settings_version:config.version,risk_flow_slug:config.risk_flow_slug,development_flow_slug:config.development_flow_slug,preview_origins:config.preview_origins}};
  if(schemaVersion==='3.0'||schemaVersion==='2.0'||config.uncertainty_mode==='provisional'||feedback){value.schema_version=schemaVersion==='3.0'?'3.0':'2.0';value.automation.uncertainty_mode=schemaVersion==='3.0'?'per_task':config.uncertainty_mode||'strict';value.feedback=feedback;value.implementation_notes=implementationNotes;}
  if(value.schema_version==='3.0')value.project.customer_question_language=questionLanguage||await require('./question-language').defaultLanguage(db,p);
  if(Buffer.byteLength(JSON.stringify(value))>500000)fail('TASK_CONTEXT_TOO_LARGE','정책과 관련 기록의 분석 범위를 줄여 주세요.',413);
  return value;
}
async function assertFresh(db,p,value,expectedHash,{development=false,verification=false,profile=null}={}) {
  if(value.project_id!==p||hash(value)!==expectedHash)fail('TASK_SNAPSHOT_MISMATCH','작업의 고정된 근거를 확인할 수 없습니다.');
  const current=await snapshot(db,p,value.source.revision_id,value.request_id,{feedback:value.feedback||null,implementationNotes:value.implementation_notes||[],schemaVersion:value.schema_version||'1.0',questionLanguage:value.project.customer_question_language});
  // Language is part of the run snapshot, not an evolving source-policy constraint.
  // Keep legacy snapshots byte-compatible and never change a queued run's language.
  if(!Object.hasOwn(value.project,'customer_question_language'))delete current.project.customer_question_language;
  if(value.feedback){
    const f=value.feedback,history=(await db.query(`SELECT n.version,n.status,h.detail,(SELECT jsonb_build_object('id',f.id,'version',f.version,'text',f.detail->>'text') FROM project_implementation_note_history f WHERE f.project_id=n.project_id AND f.note_id=n.id AND f.kind='feedback' ORDER BY f.version DESC LIMIT 1) latest_feedback FROM project_implementation_notes n JOIN project_implementation_note_history h ON h.project_id=n.project_id AND h.note_id=n.id AND h.version=$3 AND h.kind='followup_created' WHERE n.project_id=$1 AND n.id=$2 FOR SHARE OF n`,[p,f.note_id,f.note_version+1])).rows[0];
    if(!history||history.latest_feedback?.id!==f.feedback_id||history.latest_feedback.version!==f.note_version||hash(history.latest_feedback.text)!==f.feedback_sha256||history.detail.analysis_id!==value.request_id||history.detail.feedback_id!==f.feedback_id||history.detail.feedback_sha256!==f.feedback_sha256)fail('TASK_FEEDBACK_STALE','새 피드백이 기록되었습니다. 최신 피드백으로 다시 분석하세요.');
  }
  if(verification&&profile){const config=await settings(db,p);if(hash(executionProfile(config))!==hash(profile))fail('TASK_SOURCE_STALE','코드 실행 환경이나 불확실성 처리 정책이 변경되었습니다.');current.automation.settings_version=value.automation.settings_version;current.automation.preview_origins=value.automation.preview_origins;}
  if(hash(current)!==expectedHash)fail('TASK_SOURCE_STALE','정책·프로젝트 기록·저장소 설정이 변경되었습니다. 최신 문서로 다시 분석하세요.');
  const latest=(await db.query('SELECT id FROM revisions WHERE project_id=$1 AND document_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[p,value.source.document_id])).rows[0];
  if(latest?.id!==value.source.revision_id)fail('TASK_SOURCE_STALE','정책의 새 버전이 등록되었습니다. 최신 문서로 다시 분석하세요.');
  if(development&&(!value.repository.url||!value.repository.base_branch||!SHA.test(value.repository.head_sha||'')))fail('TASK_REPOSITORY_REQUIRED','Nora GitHub 커넥터에서 기준 브랜치를 확인한 뒤 다시 분석하세요.');
}
function validateArtifact(output,row,{previewOrigins=row.input_snapshot.automation.preview_origins}={}) {
  if(output?.schema_version!==(row.execution_context?'3.0':row.input_snapshot.schema_version||'1.0')||output.project_id!==row.project_id||output.task_id!==row.id||output.input_sha256!==row.input_sha256||typeof output.trace_id!=='string'||!output.trace_id)fail('TASK_DEVELOPMENT_SCOPE_MISMATCH','개발 결과의 프로젝트·작업 근거가 요청과 다릅니다.');
  provisional.assertExecutionContext(row);
  if(row.execution_context&&output.development_context_sha256!==row.execution_context_sha256)fail('TASK_EXECUTION_CONTEXT_MISMATCH','개발 결과가 확인한 질문 기록과 다릅니다.');
  const a=output.artifact,s=row.input_snapshot,unverified=a?.evidence_status==='unverified',report=row.execution_context?require('../../nora/task-automation/development-flow').validateImplementationReport(output.implementation_report,s,{acceptanceCriteria:row.acceptance_criteria,developmentContext:row.execution_context,artifact:a,allowUnverified:unverified}):s.schema_version==='2.0'?riskV2.validateDevelopmentNotes(output.implementation_report,s,{acceptanceCriteria:row.acceptance_criteria}):null;
  if(report?.completion==='blocked'&&a===null)return {implementation_report:report,trace_id:output.trace_id,...(row.execution_context?{development_context_sha256:row.execution_context_sha256,...(output.development_completed_at?{development_completed_at:output.development_completed_at}:{})}: {})};
  const repo=repositoryCoordinates(s.repository.url).url.replace(/\.git$/,'');
  const local=row.execution_context&&a?.kind==='local_patch',commit=row.execution_context&&a?.kind==='git_commit';
  if(!a||(!local&&!SHA.test(a.head_sha||''))||a.base_sha!==s.repository.head_sha||a.target_branch!==s.repository.base_branch||typeof a.diff!=='string'||!a.diff.trim()||Buffer.byteLength(a.diff)>1048576||(!local&&!commit&&(!Number.isSafeInteger(a.pr_number)||a.pr_number<1||a.pr_url!==`${repo}/pull/${a.pr_number}`))||(local&&(!unverified||a.head_sha!==null||a.pr_number!==null||a.pr_url!==null||!require('./implementation-runner').safePatch(a.diff,a.changed_files||[])))||(commit&&(a.pr_number!==null||a.pr_url!==null||a.evidence_status!=='verified')))fail('TASK_ARTIFACT_INVALID','작업 범위와 코드 변경 내역을 확인할 수 없습니다.');
  let preview=null;
  if(a.preview_url!==null||!row.execution_context){
    try{preview=new URL(a.preview_url);}catch{fail('TASK_PREVIEW_REQUIRED','검토 가능한 프리뷰 주소가 필요합니다.');}
    if(preview.protocol!=='https:'||preview.username||preview.password||!previewOrigins.includes(preview.origin))fail('TASK_PREVIEW_ORIGIN_INVALID','프로젝트에서 허용한 프리뷰 주소가 아닙니다.');
  }
  if(a.reported_checks!==undefined&&(!Array.isArray(a.reported_checks)||a.reported_checks.length>100||a.reported_checks.some(c=>!c||Object.keys(c).some(k=>!['command','exit_code','output'].includes(k))||typeof c.command!=='string'||!c.command||c.command.length>2000||c.exit_code!==null&&(!Number.isInteger(c.exit_code)||c.exit_code<0||c.exit_code>255)||typeof c.output!=='string'||c.output.length>10000)))fail('TASK_REPORTED_CHECKS_INVALID','AI가 보고한 실행 내역의 형식을 확인하세요.');
  if(!Array.isArray(a.checks)||!a.checks.length||a.checks.length>100||a.checks.some(c=>!c||typeof c.name!=='string'||!c.name.trim()||!['passed','failed','pending',...(row.execution_context?['unavailable']:[])].includes(c.status)))fail('TASK_CHECKS_REQUIRED','검증 실행 내역이 필요합니다.');
  return {...(report?unverified?{reported_implementation_report:report}:{implementation_report:report}:{}),...(a.kind?{kind:a.kind}:{}),...(a.evidence_status?{evidence_status:a.evidence_status}:{}),verification_policy:a.verification_policy||{settings_version:s.automation.settings_version,preview_origins:s.automation.preview_origins,execution_profile:row.execution_context?.execution_profile||null},...Object.fromEntries(['ci_status','preview_status','verification_status','changed_files','reported_checks'].filter(k=>Object.hasOwn(a,k)).map(k=>[k,a[k]])),pr_number:a.pr_number,pr_url:a.pr_url,head_sha:a.head_sha,base_sha:a.base_sha,target_branch:a.target_branch,preview_url:preview?.href||null,diff:a.diff,checks:a.checks.map(c=>({name:c.name.slice(0,200),status:c.status})),trace_id:output.trace_id,...(row.execution_context?{development_context_sha256:row.execution_context_sha256,...(output.development_completed_at?{development_completed_at:output.development_completed_at}:{})}: {})};
}
function validateMerge(result,row) {
  const a=row.artifact;
  if(result?.project_id!==row.project_id||result.task_id!==row.id||result.input_sha256!==row.input_sha256||result.head_sha!==a.head_sha||result.target_branch!==a.target_branch||result.pr_number!==a.pr_number||result.merged!==true||!SHA.test(result.merge_commit_sha||''))fail('TASK_MERGE_NOT_CONFIRMED','승인한 커밋의 기준 브랜치 병합을 확인하지 못했습니다.');
  return {project_id:row.project_id,task_id:row.id,input_sha256:row.input_sha256,head_sha:a.head_sha,target_branch:a.target_branch,pr_number:a.pr_number,merged:true,merge_commit_sha:result.merge_commit_sha};
}
async function queueAnalysis(db,p,u,value,input,fingerprint) {
  const sha=hash(input),{request_id:ignored,...evidence}=input,dedup=hash(evidence);
  let row=(await db.query('SELECT * FROM task_automation_analyses WHERE project_id=$1 AND dedup_sha256=$2',[p,dedup])).rows[0];
  if(!row){
    row=(await db.query('INSERT INTO task_automation_analyses(id,project_id,revision_id,request_sha256,input_snapshot,input_sha256,dedup_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[value.request_id,p,value.revision_id,fingerprint,input,sha,dedup,u])).rows[0];
    await db.query("INSERT INTO task_automation_jobs(project_id,kind,analysis_id,created_by) VALUES($1,'risk',$2,$3)",[p,row.id,u]);
    await audit(db,p,u,'analysis_requested',row.id,{revision_id:value.revision_id,input_sha256:sha,...(input.feedback?{feedback_id:input.feedback.feedback_id,note_id:input.feedback.note_id}:{})});
  }
  await db.query('INSERT INTO task_automation_requests(id,project_id,analysis_id,request_sha256,created_by) VALUES($1,$2,$3,$4,$5)',[value.request_id,p,row.id,fingerprint,u]);
  return publicAnalysis(await analysis(db,p,row.id));
}
function createTaskAutomation({pool,provider={}}) {
  return {
    async overview(p,u) { await membership(pool,p,u);const [a,t,c,s,i]=await Promise.all([pool.query(ANALYSIS_SELECT+' WHERE a.project_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 100',[p]),pool.query('SELECT * FROM automation_tasks WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200',[p]),capabilities(provider,p,pool),settings(pool,p),pool.query('SELECT revision_id,status,error_code,created_at FROM task_automation_intake WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',[p])]);return {analyses:a.rows.map(publicAnalysis),tasks:t.rows.map(r=>publicTask(r)),settings:s,capabilities:c,intake:i.rows}; },
    async sdkConnections(p,u){await membership(pool,p,u,['owner']);const n=(await pool.query('SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1',[p])).rows[0];if(!n||typeof provider.sdkConnections!=='function')fail('TASK_CONNECTION_REQUIRED','Nora 연결을 먼저 완료하세요.');return provider.sdkConnections({projectId:p,workspaceId:n.workspace_id});},
    async connectSdk(p,u,value){object(value,['provider','working_folder']);await membership(pool,p,u,['owner']);require('./nora-task-provider').sdkSettings({sdk_provider:value.provider,sdk_connection_id:null,sdk_working_folder:value.working_folder});const n=(await pool.query('SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1',[p])).rows[0];if(!n||typeof provider.connectSdk!=='function')fail('TASK_CONNECTION_REQUIRED','Nora SDK 연결을 사용할 수 없습니다.');const request=await provider.connectSdk({projectId:p,workspaceId:n.workspace_id,provider:value.provider,workingFolder:value.working_folder});await audit(pool,p,u,'sdk_connection_requested',p,{provider:value.provider,working_folder:value.working_folder});return {request};},
    async refreshArtifact(p,u,tid,value){
      object(value,['expected_version']);version(value.expected_version);await membership(pool,p,u,WRITERS);
      const row=await task(pool,p,tid),config=await settings(pool,p);
      if(row.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','작업 상태가 변경되었습니다.');
      if(!['qa','blocked'].includes(row.status)||row.execution_status!=='ready'||!row.artifact||typeof row.artifact.diff!=='string'||!row.artifact.diff.trim()||!(SHA.test(row.artifact.head_sha||'')||row.artifact.kind==='local_patch'&&row.artifact.evidence_status==='unverified')||row.review)fail('TASK_REFRESH_NOT_READY','개발 결과가 있고 아직 병합 승인하지 않은 작업만 갱신할 수 있습니다.');
      if(row.artifact?.transport==='desktop')fail('DESKTOP_VERIFICATION_UNAVAILABLE','로컬 변경안은 독립 검증 전입니다. 데스크톱에서 변경 내역과 실행 결과를 확인하세요.');
      if(typeof provider.refreshArtifact!=='function')fail('TASK_REFRESH_UNAVAILABLE','개발 결과 조회 연결이 필요합니다.');
      const before=hash(row.artifact),previous=effectiveArtifact(row),fresh=await provider.refreshArtifact({projectId:p,workspaceId:row.input_snapshot.nora.workspace_id,settings:config,taskId:row.id,snapshot:row.input_snapshot,snapshotHash:row.input_sha256,artifact:previous});
      if(fresh.head_sha!==row.artifact.head_sha||fresh.base_sha!==row.artifact.base_sha||fresh.diff!==row.artifact.diff||((fresh.pr_number!==previous.pr_number||fresh.pr_url!==previous.pr_url)&&!(previous.kind==='git_commit'&&previous.evidence_status==='verified'&&previous.pr_number===null&&fresh.kind==='pull_request'&&Number.isSafeInteger(fresh.pr_number)&&fresh.pr_number>0))||fresh.evidence_status!==row.artifact.evidence_status&&row.artifact.evidence_status)fail('TASK_REFRESH_EVIDENCE_CHANGED','원래 개발 결과와 다른 변경 내역은 이 작업에 덮어쓸 수 없습니다.');
      const output={schema_version:row.execution_context?'3.0':row.input_snapshot.schema_version,project_id:p,task_id:row.id,input_sha256:row.input_sha256,trace_id:row.execution_trace_id||row.artifact.trace_id,development_context_sha256:row.execution_context_sha256,implementation_report:row.artifact.implementation_report||row.artifact.reported_implementation_report,artifact:fresh};validateArtifact(output,row,{previewOrigins:config.preview_origins});
      return transaction(pool,async db=>{await membership(db,p,u,WRITERS);await lock(db,p);const current=await task(db,p,tid,true);if(current.version!==value.expected_version||current.review||hash(current.artifact)!==before)fail('TASK_VERSION_CONFLICT','조회 중 작업 상태가 변경되었습니다.');if((await settings(db,p)).version!==config.version)fail('TASK_VERSION_CONFLICT','조회 중 자동화 설정이 변경되었습니다.');let stale=null;try{await assertFresh(db,p,current.input_snapshot,current.input_sha256,{development:true,verification:true,profile:current.execution_context?.execution_profile});}catch(error){if(['TASK_SOURCE_STALE','TASK_FEEDBACK_STALE'].includes(error.code))stale=error.code;else throw error;}
        const verification={artifact_sha256:before,kind:fresh.kind||row.artifact.kind,pr_number:fresh.pr_number,pr_url:fresh.pr_url,checks:fresh.checks,preview_url:fresh.preview_url,ci_status:fresh.ci_status,preview_status:fresh.preview_status,verification_status:fresh.verification_status,verification_policy:verificationPolicy(config,current.execution_context?.execution_profile?executionProfile(config):null),observed_at:new Date().toISOString()};
        const status=stale||(current.artifact.implementation_report||current.artifact.reported_implementation_report)?.completion==='blocked'?'blocked':'qa';const saved=(await db.query('UPDATE automation_tasks SET verification=$3,status=$4,error_code=$5,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *',[p,tid,verification,status,stale])).rows[0];await audit(db,p,u,'artifact_verification_updated',tid,verification);return publicTask(saved,true);});
    },
    async getTask(p,u,tid) { await membership(pool,p,u);return publicTask(await task(pool,p,tid),true); },
    async startCheck(p,u,tid) { await membership(pool,p,u);return provisional.startCheck(pool,p,await task(pool,p,tid)); },
    async saveSettings(p,u,value) {
      object(value,['expected_version','enabled','risk_flow_slug','development_flow_slug','preview_origins','uncertainty_mode','execution_mode','sdk_provider','sdk_connection_id','sdk_working_folder','desktop_device_id']);version(value.expected_version);
      if(typeof value.enabled!=='boolean'||!Array.isArray(value.preview_origins)||value.preview_origins.length>10)fail('TASK_SETTINGS_INVALID','자동화 설정 형식을 확인하세요.',400);
      if(value.sdk_provider!==undefined&&value.sdk_provider!==null&&!['codex','claude-code'].includes(value.sdk_provider)||value.sdk_connection_id!=null&&(typeof value.sdk_connection_id!=='string'||!value.sdk_connection_id.trim()||value.sdk_connection_id.length>200)||value.sdk_working_folder!=null&&(typeof value.sdk_working_folder!=='string'||value.sdk_working_folder.length>2000))fail('TASK_SETTINGS_INVALID','SDK 연결 설정 형식을 확인하세요.',400);
      if(value.uncertainty_mode!==undefined&&!['strict','provisional'].includes(value.uncertainty_mode))fail('TASK_SETTINGS_INVALID','불확실성 처리 모드를 확인하세요.',400);
      const slug=v=>{if(v===null||v===undefined||v==='')return null;if(typeof v!=='string'||!/^[-a-zA-Z0-9_]{1,150}$/.test(v))fail('TASK_FLOW_INVALID','게시된 Nora 흐름 식별자를 확인하세요.',400);return v;};
      const risk=slug(value.risk_flow_slug),dev=slug(value.development_flow_slug),origins=[...new Set(value.preview_origins.map(v=>{let url;try{url=new URL(v);}catch{fail('TASK_PREVIEW_ORIGIN_INVALID','HTTPS 프리뷰 원점을 입력하세요.',400);}if(url.protocol!=='https:'||url.origin!==v||url.username||url.password)fail('TASK_PREVIEW_ORIGIN_INVALID','경로 없이 HTTPS 프리뷰 원점을 입력하세요.',400);return url.origin;}))];
      return transaction(pool,async db=>{await membership(db,p,u,['owner']);await lock(db,p);const s=await settings(db,p);if(s.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','자동화 설정이 변경되었습니다.');if((await db.query("SELECT 1 FROM automation_tasks WHERE project_id=$1 AND review IS NOT NULL AND execution_status IN('merging','uncertain') LIMIT 1",[p])).rowCount)fail('TASK_APPROVAL_IN_PROGRESS','승인한 병합 결과를 확인한 뒤 자동화 설정을 변경하세요.');const mode=value.execution_mode??s.execution_mode??'connector_api',sdk={sdk_provider:value.sdk_provider===undefined?s.sdk_provider:value.sdk_provider,sdk_connection_id:value.sdk_connection_id===undefined?s.sdk_connection_id:value.sdk_connection_id,sdk_working_folder:value.sdk_working_folder===undefined?s.sdk_working_folder:value.sdk_working_folder};if(!['connector_api','nora_sdk','desktop'].includes(mode))fail('TASK_SETTINGS_INVALID','개발 실행 방식을 확인하세요.',400);if(mode==='nora_sdk')require('./nora-task-provider').sdkSettings(sdk);const deviceId=value.desktop_device_id===undefined?s.desktop_device_id:value.desktop_device_id;if(deviceId!==null&&deviceId!==undefined)id(deviceId);if(mode==='desktop'){if(!['codex','claude-code'].includes(sdk.sdk_provider))fail('TASK_SETTINGS_INVALID','데스크톱에서 실행할 CLI를 선택하세요.',400);if(deviceId&&!await require('./desktop-execution').readyDevice(db,p,{desktop_device_id:deviceId,sdk_provider:sdk.sdk_provider}))fail('DESKTOP_DEVICE_REQUIRED','이 프로젝트와 CLI에 연결된 실행 기기를 선택하세요.');}const r=(await db.query('UPDATE task_automation_settings SET enabled=$2,risk_flow_slug=$3,development_flow_slug=$4,preview_origins=$5,uncertainty_mode=$7,execution_mode=$8,sdk_provider=$9,sdk_connection_id=$10,sdk_working_folder=$11,desktop_device_id=$12,version=version+1,updated_by=$6,updated_at=now() WHERE project_id=$1 RETURNING *',[p,value.enabled,risk,dev,JSON.stringify(origins),u,value.uncertainty_mode||s.uncertainty_mode||'strict',mode,sdk.sdk_provider||null,sdk.sdk_connection_id||null,sdk.sdk_working_folder||null,deviceId||null])).rows[0];await audit(db,p,u,'settings_updated',p,{version:r.version});return r;});
    },
    async analyze(p,u,value) {
      object(value,['revision_id','request_id','customer_question_language']);id(value.revision_id);id(value.request_id);const questionLanguage=require('./question-language').language(value.customer_question_language,{optional:true});const fingerprint=hash(value);
      return transaction(pool,async db=>{
        await membership(db,p,u,WRITERS);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-task-request:' || $1,0))",[value.request_id]);
        await lock(db,p);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-context:' || $1,0))",[p]);
        const old=(await db.query('SELECT * FROM task_automation_requests WHERE id=$1',[value.request_id])).rows[0];
        if(old){
          if(old.project_id!==p||old.created_by!==u||old.request_sha256!==fingerprint)fail('TASK_REQUEST_CONFLICT','다른 분석에 사용한 요청 ID입니다.');
          return publicAnalysis(await analysis(db,p,old.analysis_id));
        }
        return queueAnalysis(db,p,u,value,await snapshot(db,p,value.revision_id,value.request_id,{questionLanguage}),fingerprint);
      });
    },
    async retryAnalysis(p,u,aid,value){
      id(aid);object(value,['request_id','expected_job_id','acknowledge_uncertain']);id(value.request_id);id(value.expected_job_id);
      if(value.acknowledge_uncertain!==undefined&&typeof value.acknowledge_uncertain!=='boolean')fail('TASK_INPUT_INVALID','불확실한 실행의 확인 여부를 확인하세요.',400);
      const fingerprint=hash({kind:'risk_retry',analysis_id:aid,...value});
      return transaction(pool,async db=>{
        await membership(db,p,u,WRITERS);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-task-request:' || $1,0))",[value.request_id]);
        await lock(db,p);await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-context:' || $1,0))",[p]);
        const old=(await db.query('SELECT * FROM task_automation_requests WHERE id=$1',[value.request_id])).rows[0];
        if(old){if(old.project_id!==p||old.created_by!==u||old.analysis_id!==aid||old.request_sha256!==fingerprint)fail('TASK_REQUEST_CONFLICT','다른 분석 요청에 사용한 요청 ID입니다.');return publicAnalysis(await analysis(db,p,aid));}
        const row=await analysis(db,p,aid);
        if(row.execution?.id!==value.expected_job_id)fail('TASK_RETRY_STALE','분석 실행 상태가 변경되었습니다. 최신 실행 기록을 확인하세요.');
        if(!analysisCanRetry(row))fail('TASK_RETRY_NOT_ALLOWED','실패하거나 결과가 불확실하고 아직 질문·작업이 생성되지 않은 정책 분석만 다시 실행할 수 있습니다.');
        if(row.status==='uncertain'&&value.acknowledge_uncertain!==true)fail('TASK_RETRY_CONFIRMATION_REQUIRED','이전 실행 결과가 불확실합니다. Nora 실행 이력을 확인한 뒤 재분석을 선택하세요.');
        await assertFresh(db,p,row.input_snapshot,row.input_sha256);
        const attempt=(await db.query("INSERT INTO task_automation_jobs(project_id,kind,analysis_id,created_by,payload) VALUES($1,'risk',$2,$3,$4) RETURNING id",[p,aid,u,{retry_request_id:value.request_id,previous_job_id:row.execution.id,acknowledged_uncertain:row.status==='uncertain'}])).rows[0];
        await db.query("UPDATE task_automation_analyses SET status='queued',error_code=NULL,updated_at=now() WHERE project_id=$1 AND id=$2",[p,aid]);
        await db.query('INSERT INTO task_automation_requests(id,project_id,analysis_id,request_sha256,created_by) VALUES($1,$2,$3,$4,$5)',[value.request_id,p,aid,fingerprint,u]);
        await audit(db,p,u,'analysis_retried',aid,{request_id:value.request_id,job_id:attempt.id,previous_job_id:row.execution.id,previous_status:row.status,previous_error_code:row.error_code,previous_trace_id:row.execution.trace_id,acknowledged_uncertain:row.status==='uncertain'});
        return publicAnalysis(await analysis(db,p,aid));
      });
    },
    async analyzeFeedback(p,u,value) {
      object(value,['note_id','expected_version','request_id']);id(value.note_id);id(value.request_id);version(value.expected_version);const fingerprint=hash({kind:'feedback',...value});
      return transaction(pool,async db=>{
        await membership(db,p,u,WRITERS);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-task-request:' || $1,0))",[value.request_id]);
        await lock(db,p);await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-context:' || $1,0))",[p]);
        const old=(await db.query('SELECT * FROM task_automation_requests WHERE id=$1',[value.request_id])).rows[0];
        if(old){if(old.project_id!==p||old.created_by!==u||old.request_sha256!==fingerprint)fail('TASK_REQUEST_CONFLICT','다른 분석에 사용한 요청 ID입니다.');return publicAnalysis(await analysis(db,p,old.analysis_id));}
        const frozen=await notes.getFollowupInput(db,{projectId:p,noteId:value.note_id,actorId:u,expectedVersion:value.expected_version});
        const input=await snapshot(db,p,frozen.sourceRevisionId,value.request_id,{feedback:frozen.feedback});
        riskV3.validateRiskRequest(input,{projectId:p,workspaceId:input.nora.workspace_id});
        const result=await queueAnalysis(db,p,u,{...value,revision_id:frozen.sourceRevisionId},input,fingerprint);
        await notes.recordFollowup(db,{projectId:p,noteId:value.note_id,requestId:value.request_id,actorId:u,expectedVersion:value.expected_version,analysisId:result.id});
        return result;
      });
    },
    async transition(p,u,tid,value) {
      object(value,['expected_version','status','provisional_consent']);version(value.expected_version);await membership(pool,p,u,WRITERS);
      if(value.provisional_consent!==undefined){object(value.provisional_consent,['review_token']);if(!/^[a-f0-9]{64}$/.test(value.provisional_consent.review_token||''))fail('TASK_PROVISIONAL_CONSENT_INVALID','확인한 질문 기록이 필요합니다.',400);}
      if(value.status==='done')fail('TASK_QA_APPROVAL_REQUIRED','검토 대기에서 프리뷰와 변경 내역을 확인하고 병합을 승인해야 완료됩니다.');
      if(value.status!=='in_progress')fail('TASK_TRANSITION_INVALID','대기 작업을 진행 중으로 옮겨 개발을 시작하세요. 검토 대기와 완료는 실행 결과로 결정됩니다.');
      const c=await capabilities(provider,p,pool);if(!c.development)fail('TASK_DEVELOPMENT_UNAVAILABLE','프로젝트 개발 흐름과 코드 실행 환경 연결을 먼저 완료하세요.');
      const fingerprint=hash({actor_id:u,...value});
      return transaction(pool,async db=>{
        await membership(db,p,u,WRITERS);await lock(db,p);await questions.lockQuestionWorkflow(db,p);
        const r=await task(db,p,tid,true);
        // A retry can arrive after the worker started or finished. The immutable
        // request fingerprint prevents another actor/body from replaying consent.
        if(r.start_request_sha256===fingerprint)return publicTask(r,true);
        if(r.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','작업 상태가 변경되었습니다.');
        if(r.status!=='todo'||r.execution_status!=='idle')fail('TASK_ALREADY_STARTED','이미 시작한 개발은 자동으로 다시 실행하지 않습니다.');
        await assertFresh(db,p,r.input_snapshot,r.input_sha256,{development:true});
        const check=await provisional.startCheck(db,p,r);
        if(check.requires_confirmation&&!value.provisional_consent)fail('TASK_PROVISIONAL_CONFIRMATION_REQUIRED','고객 질문과 확인할 내용을 보고 임시 구현 진행 여부를 확인해 주세요.');
        if(value.provisional_consent&&value.provisional_consent.review_token!==check.review_token)fail('TASK_PROVISIONAL_CONTEXT_CHANGED','질문이나 답변이 변경되었습니다. 최신 내용을 다시 확인해 주세요.');
        const analysis=(await db.query('SELECT * FROM task_automation_analyses WHERE project_id=$1 AND id=$2',[p,r.analysis_id])).rows[0];
        if(check.questions.length&&r.input_snapshot.schema_version!=='3.0')await provisional.draftAnalysisQuestions(db,analysis,analysis.result);
        const context=provisional.executionContext(check,u),config=await settings(db,p);context.execution_profile=executionProfile(config);const contextHash=hash(context);
        const changed=(await db.query("UPDATE automation_tasks SET status='in_progress',execution_status='queued',started_by=$3,execution_context=$4,execution_context_sha256=$5,start_request_sha256=$6,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",[p,r.id,u,context,contextHash,fingerprint])).rows[0];
        const job=(await db.query("INSERT INTO task_automation_jobs(project_id,kind,task_id,created_by,payload) VALUES($1,'develop',$2,$3,$4) RETURNING id",[p,r.id,u,{development_context_sha256:contextHash,...(config.execution_mode==='desktop'?{execution_mode:'desktop',desktop_device_id:config.desktop_device_id}:{})}])).rows[0];
        if(config.execution_mode==='desktop')await require('./desktop-execution').enqueueDesktop(db,p,job.id,changed,config,context);
        await audit(db,p,u,'development_requested',r.id,{head_sha:r.input_snapshot.repository.head_sha,provisional_authorized:context.provisional_authorized,question_ids:check.questions.map(q=>q.id),development_context_sha256:contextHash});
        return publicTask(changed,true);
      });
    },
    async approveMerge(p,u,tid,value) {
      object(value,['expected_version','head_sha','note']);version(value.expected_version);if(!SHA.test(value.head_sha||''))fail('TASK_HEAD_REQUIRED','검토한 PR 커밋이 필요합니다.',400);const note=text(value.note,3000);await membership(pool,p,u,REVIEWERS);
      if(!(await capabilities(provider,p,pool)).merge)fail('TASK_MERGE_UNAVAILABLE','Nora GitHub 커넥터에서 커밋 확인을 포함한 병합 기능을 사용할 수 없습니다.');
      return transaction(pool,async db=>{await membership(db,p,u,REVIEWERS);await lock(db,p);const r=await task(db,p,tid,true);r.artifact=effectiveArtifact(r);if(r.review&&r.review.actor_id===u&&r.review.head_sha===value.head_sha&&r.review.note===note)return publicTask(r,true);if(r.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','작업 상태가 변경되었습니다.');if(r.status!=='qa'||r.execution_status!=='ready'||r.artifact?.head_sha!==value.head_sha)fail('TASK_REVIEW_STALE','검토 대기의 현재 프리뷰와 변경 내역을 다시 확인하세요.');if(!r.artifact.pr_number||!r.artifact.preview_url||r.artifact.evidence_status==='unverified'||r.artifact.checks.some(c=>c.status!=='passed'))fail('TASK_CHECKS_NOT_PASSED','모든 검증이 통과한 뒤 병합을 승인하세요.');await assertFresh(db,p,r.input_snapshot,r.input_sha256,{development:true,verification:true,profile:r.execution_context?.execution_profile});const config=await settings(db,p);if(hash(r.artifact.verification_policy)!==hash(verificationPolicy(config,r.execution_context?.execution_profile?executionProfile(config):null)))fail('TASK_VERIFICATION_STALE','프리뷰 검증 설정이 변경되었습니다. 결과를 갱신한 뒤 다시 승인하세요.');const review={actor_id:u,head_sha:value.head_sha,target_branch:r.artifact.target_branch,note,artifact_sha256:hash(r.artifact),reviewed_version:r.version,approved_at:new Date().toISOString()};const changed=(await db.query("UPDATE automation_tasks SET execution_status='merging',review=$3,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",[p,r.id,review])).rows[0];await db.query("INSERT INTO task_automation_jobs(project_id,kind,task_id,created_by,payload) VALUES($1,'merge',$2,$3,$4)",[p,r.id,u,{review}]);await audit(db,p,u,'merge_approved',r.id,{head_sha:value.head_sha,target_branch:r.artifact.target_branch});return publicTask(changed,true);});
    },
    async reconcileMerge(p,u,tid,value) {
      object(value,['expected_version']);version(value.expected_version);await membership(pool,p,u,REVIEWERS);if(typeof provider.reconcileMerge!=='function')fail('TASK_RECONCILE_UNAVAILABLE','병합 상태를 확인할 서버 연결이 필요합니다.');
      return transaction(pool,async db=>{await membership(db,p,u,REVIEWERS);await lock(db,p);const r=await task(db,p,tid,true);if(r.version!==value.expected_version)fail('TASK_VERSION_CONFLICT','작업 상태가 변경되었습니다.');if(r.execution_status!=='uncertain'||!r.review)fail('TASK_RECONCILE_NOT_REQUIRED','결과가 불확실한 병합 요청만 확인할 수 있습니다.');if((await db.query("SELECT 1 FROM task_automation_jobs WHERE task_id=$1 AND kind='reconcile_merge' AND status IN('queued','running','awaiting_connection')",[r.id])).rowCount)return publicTask(r,true);const original=(await db.query("SELECT id FROM task_automation_jobs WHERE task_id=$1 AND kind='merge'",[r.id])).rows[0];await db.query("INSERT INTO task_automation_jobs(project_id,kind,task_id,created_by,payload) VALUES($1,'reconcile_merge',$2,$3,$4)",[p,r.id,u,{operation_id:original.id}]);return publicTask(r,true);});
    },
  };
}
module.exports={createTaskAutomation,capabilities,settings,snapshot,assertFresh,validateArtifact,validateMerge,stableId,task,executionProfile,verificationPolicy,artifactVerificationPolicy,effectiveArtifact,publicTask,publicAnalysis,lock,audit,fail,safeCode,WRITERS,REVIEWERS};
