'use strict';
const {assertLegacyNoraDispatch}=require('./project-nora');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {transaction}=require('./db');
const {lockGovernanceProject,assertPlanGovernance}=require('./work-governance');
const {implementationHash}=require('./implementation-ledger');
const {getImplementationStaleReasons}=require('./implementation-ledger');
const {error}=require('./auth');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=value=>createHash('sha256').update(value).digest('hex');
function fail(code,message,status=409){throw error(code,message,status);}
function plain(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('INVALID_RUNNER_INPUT','실행기 입력 형식을 확인하세요.',400);}
function short(value,max){return typeof value==='string'&&value.length<=max&&!value.includes('\0')&&value.isWellFormed();}
function safePatch(patch,files){
 const safe=f=>typeof f==='string'&&/^[A-Za-z0-9_./@+-]+$/.test(f)&&!f.startsWith('/')&&!f.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git')&&!/(^|\/)(\.env(?:\..*)?|auth\.json|credentials[^/]*|id_rsa|id_ed25519)$/.test(f);
 if(files.some(f=>!safe(f))||new Set(files).size!==files.length||patch.includes('GIT binary patch'))return false;
 const found=[];let current=null,inHunk=false;
 for(const line of patch.split('\n')){
  if(line.startsWith('diff --git ')){const m=/^diff --git a\/([^ ]+) b\/([^ ]+)$/.exec(line);if(!m||m[1]!==m[2]||!safe(m[1]))return false;current=m[1];found.push(current);inHunk=false;}
  else if(line.startsWith('@@'))inHunk=true;
  else if(!inHunk&&line.startsWith('--- ')){if(line!=='--- /dev/null'&&line!==`--- a/${current}`)return false;}
  else if(!inHunk&&line.startsWith('+++ ')){if(line!=='+++ /dev/null'&&line!==`+++ b/${current}`)return false;}
  else if(!inHunk&&(/^(new file mode|old mode|new mode|deleted file mode) (120000|160000)/.test(line)||/^(rename|copy) (from|to) /.test(line)))return false;
 }
 return JSON.stringify([...found].sort())===JSON.stringify([...files].sort());
}
async function audit(db,p,actor,kind,id,detail={}){await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[p,actor,kind,id,JSON.stringify(detail)]);}
async function owner(db,p,u){if(!(await db.query("SELECT 1 FROM memberships WHERE project_id=$1 AND user_id=$2 AND role='owner'",[p,u])).rowCount)fail('FORBIDDEN','실행 연결은 프로젝트 관리자만 관리할 수 있습니다.',403);}
async function request(db,id,p,lock=false){if(!UUID.test(id))fail('NOT_FOUND','구현 실행 요청을 찾을 수 없습니다.',404);const r=(await db.query(`SELECT * FROM implementation_requests WHERE id=$1 AND project_id=$2${lock?' FOR UPDATE':''}`,[id,p])).rows[0];if(!r)fail('NOT_FOUND','구현 실행 요청을 찾을 수 없습니다.',404);return r;}
async function current(db,row){const reasons=await getImplementationStaleReasons(db,row.project_id,row.input_snapshot.plan_input,{lock:true});if(reasons.length)fail('IMPLEMENTATION_STALE','프로젝트 설정·기준선·저장소 기준이 달라졌습니다. 새 계획을 검토하세요.');}
async function tokenAuth(db,id,header){
 if(!UUID.test(id)||typeof header!=='string'||!/^Bearer ains_run_[a-f0-9]{64}$/.test(header))fail('RUNNER_UNAUTHORIZED','실행 연결 파일이 없거나 만료되었습니다.',401);
 const token=(await db.query(`SELECT t.* FROM implementation_runner_tokens t JOIN memberships m ON m.project_id=t.project_id AND m.user_id=t.created_by AND m.role='owner'
 WHERE t.request_id=$1 AND t.token_hash=$2 AND t.revoked_at IS NULL AND t.expires_at>now()`,[id,sha(header.slice(7))])).rows[0];
 if(!token)fail('RUNNER_UNAUTHORIZED','실행 연결 파일이 없거나 만료되었습니다.',401);return token;
}
function validateCompletion(body,row){
 plain(body,['lease_token','status','result','error_code']);
 if(!UUID.test(body.lease_token||''))fail('INVALID_RUNNER_INPUT','실행 점유 식별자가 필요합니다.',400);
 if(!['patch_ready','failed','uncertain'].includes(body.status))fail('INVALID_RUNNER_INPUT','실행 결과 상태를 확인하세요.',400);
 if(body.status!=='patch_ready'){
  if(body.result!==null&&body.result!==undefined)fail('INVALID_RUNNER_INPUT','실패 결과에 변경안을 등록할 수 없습니다.',400);
  if(!/^[A-Z][A-Z0-9_]{0,63}$/.test(body.error_code||''))fail('INVALID_RUNNER_INPUT','오류 코드가 필요합니다.',400);
  return {status:body.status,result:null,error_code:body.error_code};
 }
 if(body.error_code!==null&&body.error_code!==undefined)fail('INVALID_RUNNER_INPUT','완료 결과의 오류 상태를 확인하세요.',400);
 const r=body.result;plain(r,['summary','patch','changed_files','reported_checks','observed_commands','limitations','base_commit_sha','patch_sha256']);
 if(!short(r.summary,5000)||!r.summary.trim()||!short(r.patch,512000)||!r.patch.startsWith('diff --git ')||r.base_commit_sha!==row.input_snapshot.repository.head_sha||r.patch_sha256!==sha(r.patch))fail('INVALID_RUNNER_RESULT','변경안·기준 커밋·해시를 확인할 수 없습니다.',400);
 for(const key of ['changed_files','reported_checks','limitations'])if(!Array.isArray(r[key])||r[key].length>100||r[key].some(v=>!short(v,key==='changed_files'?500:2000)))fail('INVALID_RUNNER_RESULT','실행 결과 목록을 확인하세요.',400);
 if(!r.changed_files.length||r.changed_files.some(v=>!v||v.startsWith('/')||v.split(/[\\/]/).some(p=>p==='..'||p==='.git')))fail('INVALID_RUNNER_RESULT','작업 폴더 밖의 변경은 등록할 수 없습니다.',400);
 if(!safePatch(r.patch,r.changed_files))fail('INVALID_RUNNER_RESULT','변경안의 파일 경로·목록이 일치하지 않거나 지원하지 않는 파일입니다.',400);
 // Candidate results preserve completed work even if context changed during execution.
 // They still must match the immutable authorized path scope; review/publish rechecks freshness.
 if(row.input_snapshot.governance){const paths=(row.input_snapshot.governance.scope||[]).filter(r=>r.kind==='path').map(r=>r.key);if(!paths.length||r.changed_files.some(file=>!paths.some(p=>file===p||file.startsWith(p+'/'))))fail('EXECUTOR_SCOPE_EXCEEDED','변경 파일이 승인된 코드 경로 범위를 벗어났습니다.',409);}
 if(!Array.isArray(r.observed_commands)||r.observed_commands.length>100||r.observed_commands.some(c=>!c||Object.keys(c).some(k=>!['command','exit_code'].includes(k))||!short(c.command,2000)||!Number.isInteger(c.exit_code)))fail('INVALID_RUNNER_RESULT','관찰된 명령 결과가 올바르지 않습니다.',400);
 return {status:'patch_ready',result:r,error_code:null};
}
function createImplementationRunner({pool,appOrigin,requireGovernance=true}){
 async function checkGovernance(db,row){if(!requireGovernance)return;const check=await assertPlanGovernance(db,row.project_id,row.plan_id);if(!row.input_snapshot.governance||implementationHash(check)!==implementationHash(row.input_snapshot.governance))fail('GOVERNANCE_SCOPE_CHANGED','승인된 실행 범위가 변경되었습니다. 새 실행 계획을 검토하세요.');}
 return {
  async issue(p,id,u){return transaction(pool,async db=>{
   await owner(db,p,u);await assertLegacyNoraDispatch(db,p,{lock:true});
   if(requireGovernance)await lockGovernanceProject(db,p);await owner(db,p,u);const initial=await request(db,id,p);await current(db,initial);await checkGovernance(db,initial);const row=await request(db,id,p,true);
   if(row.status!=='awaiting_runner')fail('RUNNER_NOT_WAITING','실행 대기 중인 요청에만 연결 파일을 만들 수 있습니다.');
   await db.query('UPDATE implementation_runner_tokens SET revoked_at=now() WHERE request_id=$1 AND revoked_at IS NULL',[id]);
   const token='ains_run_'+randomBytes(32).toString('hex');
   const saved=(await db.query("INSERT INTO implementation_runner_tokens(request_id,project_id,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '2 hours') RETURNING id,expires_at",[id,p,sha(token),u])).rows[0];
   await audit(db,p,u,'implementation.runner_ticket_issued',id,{ticket_id:saved.id,expires_at:saved.expires_at});
   return {filename:`ains-execution-${id}.json`,ticket:{schema_version:'1.0',url:appOrigin,request_id:id,token,expires_at:saved.expires_at}};
  });},
  async revoke(p,id,u){return transaction(pool,async db=>{await owner(db,p,u);const row=await request(db,id,p,true);if(row.status!=='awaiting_runner')fail('RUNNER_NOT_WAITING','이미 시작한 실행은 연결 파일 취소로 중단할 수 없습니다.');await db.query('UPDATE implementation_runner_tokens SET revoked_at=now() WHERE request_id=$1 AND revoked_at IS NULL',[id]);await audit(db,p,u,'implementation.runner_ticket_revoked',id);return {revoked:true};});},
  async claim(id,header){return transaction(pool,async db=>{
   const scopedToken=await tokenAuth(db,id,header);await assertLegacyNoraDispatch(db,scopedToken.project_id,{lock:true});
   let token=await tokenAuth(db,id,header);if(requireGovernance)await lockGovernanceProject(db,token.project_id);const initial=await request(db,id,token.project_id);await current(db,initial);await checkGovernance(db,initial);const row=await request(db,id,token.project_id,true);token=await tokenAuth(db,id,header);
   if(row.status!=='awaiting_runner')fail('RUNNER_ALREADY_CLAIMED','이 요청은 이미 실행됐거나 다른 실행기가 처리 중입니다.');
   const lease=randomUUID();const saved=(await db.query("UPDATE implementation_requests SET status='running',runner_token_id=$2,lease_token=$3,lease_expires_at=now()+interval '3 minutes' WHERE id=$1 RETURNING lease_expires_at",[id,token.id,lease])).rows[0];
   await audit(db,row.project_id,token.created_by,'implementation.execution_started',id,{runner_token_id:token.id,input_sha256:row.input_sha256});
   return {request_id:id,input_snapshot:row.input_snapshot,input_sha256:row.input_sha256,lease_token:lease,lease_expires_at:saved.lease_expires_at};
  });},
  async heartbeat(id,header,body){plain(body,['lease_token']);if(!UUID.test(body.lease_token||''))fail('INVALID_RUNNER_INPUT','실행 점유 식별자가 필요합니다.',400);return transaction(pool,async db=>{
   const token=await tokenAuth(db,id,header);if(requireGovernance){await lockGovernanceProject(db,token.project_id);const initial=await request(db,id,token.project_id);await current(db,initial);await checkGovernance(db,initial);}const row=(await db.query("UPDATE implementation_requests SET lease_expires_at=now()+interval '3 minutes' WHERE id=$1 AND runner_token_id=$2 AND lease_token=$3 AND status='running' AND lease_expires_at>now() RETURNING lease_expires_at",[id,token.id,body.lease_token])).rows[0];
   if(!row)fail('RUNNER_LEASE_LOST','실행 점유가 만료되었습니다. 결과를 자동으로 다시 실행하지 마세요.');return row;
  });},
  async complete(id,header,body){let importer;const result=await transaction(pool,async db=>{
   const token=await tokenAuth(db,id,header),row=await request(db,id,token.project_id,true);if(requireGovernance)importer={p:row.project_id,u:token.created_by};const completion=validateCompletion(body,row),hash=sha(JSON.stringify(completion));
   if(row.runner_token_id!==token.id)fail('RUNNER_LEASE_LOST','다른 실행기의 결과는 등록할 수 없습니다.');
   if(['patch_ready','failed','uncertain'].includes(row.status)){
    if(row.completion_sha256===hash)return {status:row.status,request_id:id};fail('RUNNER_RESULT_CONFLICT','이미 확정되었거나 점유가 만료된 실행입니다.');
   }
   if(row.status!=='running'||row.lease_token!==body.lease_token||new Date(row.lease_expires_at)<=new Date())fail('RUNNER_LEASE_LOST','실행 점유가 만료되어 결과를 확정할 수 없습니다.');
   await db.query('UPDATE implementation_requests SET status=$2,result=$3,error_code=$4,completion_sha256=$5,completed_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1',[id,completion.status,completion.result===null?null:JSON.stringify(completion.result),completion.error_code,hash]);
   await audit(db,row.project_id,token.created_by,'implementation.execution_'+completion.status,id,{patch_sha256:completion.result?.patch_sha256||null,changed_files:completion.result?.changed_files||[],error_code:completion.error_code});
   return {status:completion.status,request_id:id};
  });
   if(result.status==='patch_ready'&&importer){try{await require('./work-result-bridge').importExecutionResult(pool,importer.p,id,importer.u);}catch{console.warn(JSON.stringify({event:'work_result_import_deferred',request_id:id}));}}
   return result;},
  async recoverExpired(){return transaction(pool,async db=>{const rows=(await db.query("SELECT id,project_id FROM implementation_requests WHERE status='running' AND lease_expires_at<=now() FOR UPDATE SKIP LOCKED")).rows;for(const row of rows){await db.query("UPDATE implementation_requests SET status='uncertain',error_code='RUNNER_LEASE_EXPIRED',completed_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1",[row.id]);await audit(db,row.project_id,null,'implementation.execution_uncertain',row.id,{error_code:'RUNNER_LEASE_EXPIRED'});}return rows.length;});},
 };
}
module.exports={createImplementationRunner,validateCompletion,safePatch};
