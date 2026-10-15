'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {membership}=require('./context-ledger');
const {CATALOG_SQL}=require('./context-sources');
const {hash,fail,id}=require('./context-contract');
const {validateSnapshot}=require('../../nora/domain-guide/contract');
const WRITERS=['owner','reviewer','member'],REVIEWERS=['owner','reviewer'];
const MAX_SOURCES=200,MAX_SNAPSHOT_BYTES=700000;

async function lockGuide(db,projectId){
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-domain-guide:'||$1,0))",[projectId]);
  await db.query('INSERT INTO domain_guide_settings(project_id) VALUES($1) ON CONFLICT DO NOTHING',[projectId]);
  return (await db.query('SELECT * FROM domain_guide_settings WHERE project_id=$1 FOR UPDATE',[projectId])).rows[0];
}
async function audit(db,p,u,kind,entity,detail={}){
  await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[p,u,'domain_guide.'+kind,entity,JSON.stringify(detail)]);
}
function publicRun(row){if(!row)return null;return Object.fromEntries(['id','status','source_fingerprint','error_code','error_message','created_at','completed_at'].map(k=>[k,row[k]??null]));}
function publicSettings(row){return {auto_refresh:row?.auto_refresh===true,last_error_code:row?.last_error_code||null,last_error_message:row?.last_error_message||null};}
function decorateVersion(row,fingerprint){return row?{...row,stale:!fingerprint||row.source_fingerprint!==fingerprint}:null;}
function summary(row,fingerprint){const {guide,snapshot,...rest}=decorateVersion(row,fingerprint);return {...rest,title:guide.title};}
async function project(db,p){const row=(await db.query('SELECT p.id,p.name,COALESCE(s.goal,\'\') goal FROM projects p LEFT JOIN project_settings s ON s.project_id=p.id WHERE p.id=$1',[p])).rows[0];if(!row)fail('NOT_FOUND','프로젝트를 찾을 수 없습니다.',404);return row;}

// The canonical catalogue already checks transitive source withdrawal, supersession
// and changed channel evidence. All source text is retained, or a visible limit error
// is returned. Never send an arbitrary first-N subset to the model.
async function buildSnapshot(db,p){
  const info=await project(db,p);
  const result=await db.query(`WITH catalog AS (${CATALOG_SQL}), selected AS (
    SELECT c.*,d.name AS domain_name FROM catalog c LEFT JOIN project_domains d ON d.project_id=$1 AND d.id=c.domain_id
    WHERE NOT c.evidence_changed AND (
      (c.type='revision' AND c.id=(SELECT r.id FROM revisions r WHERE r.project_id=$1 AND r.document_id=c.document_id AND r.status='ready' ORDER BY r.created_at DESC,r.id DESC LIMIT 1))
      OR (c.type='context_record' AND c.approved)
      OR (c.type='commercial_revision' AND EXISTS(SELECT 1 FROM commercial_documents cd WHERE cd.project_id=$1 AND cd.latest_revision_id=c.id))
    )
  ) SELECT * FROM selected ORDER BY type,id LIMIT $2`,[p,MAX_SOURCES+1]);
  if(result.rows.length>MAX_SOURCES)fail('GUIDE_SOURCE_LIMIT',`가이드 근거가 ${MAX_SOURCES}개를 초과합니다. 전체 자료를 누락 없이 다룰 수 있도록 범위를 정리한 뒤 다시 요청하세요.`,409);
  if(!result.rows.length)fail('GUIDE_NO_SOURCES','분석이 완료된 문서나 확정된 프로젝트 기록을 먼저 등록하세요.',409);
  const sources=result.rows.map(row=>({id:row.type+':'+row.id,kind:row.type,title:row.title,body:row.text,authority:row.approved?'confirmed':'reference',domain_id:row.domain_id||null,domain_name:row.domain_name||null,occurred_at:row.occurred_at?new Date(row.occurred_at).toISOString():null}));
  if(sources.some(s=>typeof s.body!=='string'||!s.body.trim()))fail('GUIDE_SOURCE_EMPTY','본문이 비어 있는 근거가 있습니다. 문서 추출 내용을 확인한 뒤 다시 요청하세요.',409);
  const snapshot={schema_version:'1.0',project_id:p,project:{name:info.name,goal:info.goal},sources};
  snapshot.fingerprint=hash(snapshot);
  if(Buffer.byteLength(JSON.stringify(snapshot))>MAX_SNAPSHOT_BYTES)fail('GUIDE_SOURCE_TOO_LARGE','가이드 근거가 700 KB를 초과합니다. 자료를 조용히 생략하지 않았습니다. 근거 범위를 정리한 뒤 다시 요청하세요.',409);
  return validateSnapshot(snapshot);
}
async function sourceState(db,p){try{const snapshot=await buildSnapshot(db,p);return {snapshot,fingerprint:snapshot.fingerprint,source_count:snapshot.sources.length,error:null};}catch(error){if(!String(error.code||'').startsWith('GUIDE_'))throw error;return {snapshot:null,fingerprint:null,source_count:null,error:{code:error.code,message:error.message}};}}

// Caller holds the project/settings lock. This creates a durable request only;
// the external model is always invoked after the transaction has committed.
async function enqueueGuide(db,p,u,settings,snapshot,{force=false}={}){
  const uncertain=(await db.query("SELECT id FROM domain_guide_runs r WHERE project_id=$1 AND status='uncertain' AND NOT EXISTS(SELECT 1 FROM domain_guide_run_retries a WHERE a.run_id=r.id) LIMIT 1",[p])).rows[0];
  if(uncertain)fail('GUIDE_RUN_UNCERTAIN','이전 가이드 실행의 결과가 확인되지 않았습니다. 중복 실행을 막기 위해 운영자의 실행 이력 확인이 필요합니다.',409);
  const active=(await db.query("SELECT * FROM domain_guide_runs WHERE project_id=$1 AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1",[p])).rows[0];
  if(active)return {run:publicRun(active),coalesced:true};
  const latest=(await db.query('SELECT * FROM domain_guide_versions WHERE project_id=$1 ORDER BY number DESC LIMIT 1',[p])).rows[0];
  if(!force&&latest&&latest.status!=='rejected'&&latest.source_fingerprint===snapshot.fingerprint){
    await db.query('UPDATE domain_guide_settings SET processed_generation=$2,last_error_code=NULL,last_error_message=NULL WHERE project_id=$1',[p,settings.dirty_generation]);
    const prior=(await db.query('SELECT * FROM domain_guide_runs WHERE id=$1 AND project_id=$2',[latest.run_id,p])).rows[0];
    return {run:publicRun(prior),unchanged:true};
  }
  const binding=(await db.query("SELECT workspace_id FROM project_nora_workspaces WHERE project_id=$1 AND status='ready'",[p])).rows[0];
  if(!binding)fail('GUIDE_NORA_NOT_READY','프로젝트의 Nora 워크스페이스 연결을 먼저 완료하세요.',409);
  const row=(await db.query(`INSERT INTO domain_guide_runs(id,project_id,requested_by,workspace_id,snapshot,source_fingerprint,captured_generation)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[randomUUID(),p,u,binding.workspace_id,JSON.stringify(snapshot),snapshot.fingerprint,settings.dirty_generation])).rows[0];
  await db.query('UPDATE domain_guide_settings SET processed_generation=$2,last_error_code=NULL,last_error_message=NULL WHERE project_id=$1',[p,settings.dirty_generation]);
  await audit(db,p,u,'requested',row.id,{source_fingerprint:snapshot.fingerprint,source_count:snapshot.sources.length});
  return {run:publicRun(row)};
}
function createDomainGuide({pool,provider={}}){
  if(!pool)throw new Error('Domain guide pool is required');
  return {
    async overview({projectId:p,userId:u}){
      const role=await membership(pool,p,u);
      const [info,settingsResult,versionsResult,runResult,state]=await Promise.all([project(pool,p),pool.query('SELECT * FROM domain_guide_settings WHERE project_id=$1',[p]),pool.query('SELECT *,count(*) OVER() AS total FROM domain_guide_versions WHERE project_id=$1 ORDER BY number DESC LIMIT 100',[p]),pool.query('SELECT * FROM domain_guide_runs WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[p]),sourceState(pool,p)]);
      const settings=settingsResult.rows[0],versions=versionsResult.rows;
      const published=settings?.published_version_id?(await pool.query('SELECT * FROM domain_guide_versions WHERE id=$1 AND project_id=$2',[settings.published_version_id,p])).rows[0]:null;
      // Only the newest produced version is a current draft; earlier drafts remain
      // visible in history, but cannot accidentally become the current publication.
      const latest=versions[0],draft=latest?.status==='draft'?latest:null;
      return {project:info,settings:publicSettings(settings),published:decorateVersion(published,state.fingerprint),draft:decorateVersion(draft,state.fingerprint),versions:versions.map(v=>summary(v,state.fingerprint)),versions_total:Number(versions[0]?.total||0),versions_has_more:Number(versions[0]?.total||0)>versions.length,run:publicRun(runResult.rows[0]),source:{fingerprint:state.fingerprint,source_count:state.source_count,changed:Boolean(latest&&latest.source_fingerprint!==state.fingerprint),error:state.error},can_edit:WRITERS.includes(role),can_review:REVIEWERS.includes(role),can_manage_settings:role==='owner'};
    },
    async getVersion({projectId:p,userId:u,versionId:v}){
      await membership(pool,p,u);const row=(await pool.query('SELECT * FROM domain_guide_versions WHERE project_id=$1 AND id=$2',[p,id(v)])).rows[0];
      if(!row)fail('GUIDE_VERSION_NOT_FOUND','가이드 버전을 찾을 수 없습니다.',404);
      const [info,state]=await Promise.all([project(pool,p),sourceState(pool,p)]);
      return {project:info,version:decorateVersion(row,state.fingerprint)};
    },
    async requestRefresh({projectId:p,userId:u,enableAuto}){
      if(enableAuto!==undefined&&typeof enableAuto!=='boolean')fail('GUIDE_INVALID_INPUT','자동 갱신 설정을 확인하세요.');
      return transaction(pool,async db=>{
        const role=await membership(db,p,u,WRITERS),settings=await lockGuide(db,p);
        if(enableAuto!==undefined){if(role!=='owner')fail('FORBIDDEN','자동 갱신 설정은 프로젝트 관리자만 변경할 수 있습니다.',403);settings.auto_refresh=enableAuto;await db.query('UPDATE domain_guide_settings SET auto_refresh=$2,requested_by=$3,updated_at=now() WHERE project_id=$1',[p,enableAuto,u]);}
        return enqueueGuide(db,p,u,settings,await buildSnapshot(db,p));
      });
    },
    async updateSettings({projectId:p,userId:u,autoRefresh}){
      if(typeof autoRefresh!=='boolean')fail('GUIDE_INVALID_INPUT','자동 갱신 여부를 선택하세요.');
      return transaction(pool,async db=>{await membership(db,p,u,['owner']);await lockGuide(db,p);
        const row=(await db.query('UPDATE domain_guide_settings SET auto_refresh=$2,requested_by=$3,dirty_generation=dirty_generation+1,dirty_at=clock_timestamp(),updated_at=now(),last_error_code=NULL,last_error_message=NULL WHERE project_id=$1 RETURNING *',[p,autoRefresh,u])).rows[0];
        await audit(db,p,u,'settings',p,{auto_refresh:autoRefresh});return {settings:publicSettings(row)};
      });
    },
    async retry({projectId:p,userId:u,runId,acknowledge,reason='이전 실행 결과 미확인과 새 생성 비용을 확인한 후 재요청'}){
      if(acknowledge!==true||typeof reason!=='string'||!reason.trim()||reason.length>2000)fail('GUIDE_RETRY_ACK_REQUIRED','이전 실행은 결과 미확인으로 남으며 새 생성 비용이 발생할 수 있음을 확인해 주세요.',409);
      return transaction(pool,async db=>{
        await membership(db,p,u,REVIEWERS);const settings=await lockGuide(db,p);
        const row=(await db.query('SELECT * FROM domain_guide_runs WHERE project_id=$1 AND id=$2 FOR UPDATE',[p,id(runId)])).rows[0];
        if(!row)fail('GUIDE_RUN_NOT_FOUND','가이드 실행을 찾을 수 없습니다.',404);
        if(row.status!=='uncertain')fail('GUIDE_RETRY_NOT_UNCERTAIN','결과 확인이 필요한 실행만 새로 요청할 수 있습니다.',409);
        if((await db.query('SELECT 1 FROM domain_guide_run_retries WHERE run_id=$1',[row.id])).rows[0])fail('GUIDE_RETRY_ALREADY_AUTHORIZED','이미 새 생성이 요청된 실행입니다. 최신 실행 상태를 확인하세요.',409);
        await db.query('INSERT INTO domain_guide_run_retries(run_id,project_id,authorized_by,reason) VALUES($1,$2,$3,$4)',[row.id,p,u,reason.trim()]);
        const result=await enqueueGuide(db,p,u,settings,await buildSnapshot(db,p),{force:true});
        await audit(db,p,u,'retry_authorized',row.id,{new_run_id:result.run?.id||null,reason:reason.trim()});
        return result;
      });
    },
    async review({projectId:p,userId:u,versionId:v,decision,comment=''}){
      if(!['approve','reject'].includes(decision)||typeof comment!=='string'||comment.length>4000)fail('GUIDE_INVALID_INPUT','가이드 검토 결과와 의견을 확인하세요.');
      return transaction(pool,async db=>{await membership(db,p,u,REVIEWERS);await lockGuide(db,p);
        const row=(await db.query('SELECT * FROM domain_guide_versions WHERE project_id=$1 AND id=$2 FOR UPDATE',[p,id(v)])).rows[0];
        if(!row)fail('GUIDE_VERSION_NOT_FOUND','가이드 버전을 찾을 수 없습니다.',404);
        if(row.status!=='draft')fail('GUIDE_ALREADY_REVIEWED','이미 검토가 완료된 버전입니다.',409);
        let fingerprint=null;
        if(decision==='approve'){
          const snapshot=await buildSnapshot(db,p);fingerprint=snapshot.fingerprint;
          const latest=(await db.query('SELECT id FROM domain_guide_versions WHERE project_id=$1 ORDER BY number DESC LIMIT 1',[p])).rows[0];
          if(row.source_fingerprint!==fingerprint||latest.id!==row.id)fail('GUIDE_SOURCE_STALE','근거 또는 최신 초안이 변경되었습니다. 최신 근거로 갱신한 가이드를 검토하세요.',409);
        }else fingerprint=(await sourceState(db,p)).fingerprint;
        const reviewed=(await db.query('UPDATE domain_guide_versions SET status=$3,reviewed_by=$4,reviewed_at=clock_timestamp(),review_comment=$5 WHERE id=$1 AND project_id=$2 RETURNING *',[row.id,p,decision==='approve'?'approved':'rejected',u,comment.trim()])).rows[0];
        if(decision==='approve')await db.query('UPDATE domain_guide_settings SET published_version_id=$2,updated_at=now() WHERE project_id=$1',[p,row.id]);
        await audit(db,p,u,decision==='approve'?'approved':'rejected',row.id,{number:row.number,source_fingerprint:row.source_fingerprint});
        return {version:decorateVersion(reviewed,fingerprint)};
      });
    },
  };
}
module.exports={createDomainGuide,buildSnapshot,lockGuide,enqueueGuide,audit,publicRun,WRITERS,MAX_SOURCES,MAX_SNAPSHOT_BYTES};
