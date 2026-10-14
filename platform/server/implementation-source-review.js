'use strict';
// Source applicability is a reviewable fact, not inferred from repository names or keywords.
const {createHash}=require('node:crypto');
const KINDS=new Set(['product_development','client_project','unspecified']);
function fail(code,message,status=409){throw Object.assign(new Error(message),{code,status});}
function projectKind(value){if(!KINDS.has(value))fail('INVALID_PROJECT_KIND','프로젝트 용도를 선택하세요.',400);return value;}
function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function blocker(code,message){return {code,message};}
function target(config){const check=config.repository_check;return {url:config.repository_url,base_branch:config.base_branch,head_sha:check?.status==='ready'?check.head_sha:null,status:check?.status||'unchecked'};}
async function latestReviews(client,p,revisionIds){return (await client.query('SELECT DISTINCT ON (revision_id) * FROM implementation_source_reviews WHERE project_id=$1 AND revision_id=ANY($2::uuid[]) ORDER BY revision_id,sequence DESC',[p,revisionIds])).rows;}
function sourceBlockers(row,review,config,p){
 const blocks=[];
 if(!review)return [blocker('SOURCE_REVIEW_REQUIRED','이 문서가 현재 프로젝트의 개발 요구사항인지 검토해야 합니다.')];
 if(review.usage==='reference')blocks.push(blocker('REFERENCE_SOURCE','참고 자료는 개발 계획의 요구사항으로 사용할 수 없습니다.'));
 if(review.usage==='mismatch'||(review.usage==='implementation'&&review.intended_project_id!==p))blocks.push(blocker('SOURCE_PROJECT_MISMATCH','다른 프로젝트의 자료입니다. 해당 프로젝트에서 등록·검토해 주세요.'));
 if(Number(review.settings_version)!==config.version||review.project_kind!==config.project_kind||review.repository_url!==config.repository_url||review.base_branch!==config.base_branch||review.revision_sha256!==row.sha256)blocks.push(blocker('SOURCE_REVIEW_STALE','문서 검토 후 프로젝트 목표·용도·저장소 또는 문서 내용이 변경되었습니다. 다시 검토하세요.'));
 return blocks;
}
async function buildPreparation(client,p,config,rows){
 const reviews=await latestReviews(client,p,rows.map(r=>r.id));
 const blockers=[];
 if(config.project_kind==='unspecified')blockers.push(blocker('PROJECT_KIND_REQUIRED','프로젝트 설정에서 자체 제품 개발 또는 고객 프로젝트를 선택하세요.'));
 if(!config.goal.trim()||!config.repository_url||!config.base_branch)blockers.push(blocker('PROJECT_SETTINGS_REQUIRED','프로젝트 목표·저장소·기준 브랜치를 먼저 설정하세요.'));
 const sources=rows.map(row=>{const r=reviews.find(v=>v.revision_id===row.id),review=r?{id:r.id,usage:r.usage,intended_project_id:r.intended_project_id,reason:r.reason,actor_id:r.actor_id,reviewed_at:new Date(r.reviewed_at).toISOString(),settings_version:Number(r.settings_version),project_kind:r.project_kind,repository_url:r.repository_url,base_branch:r.base_branch}:null;return {document_id:row.document_id,revision_id:row.id,title:row.title,domain_id:row.domain_id,sha256:row.sha256,excerpt:row.document_json.segments.map(s=>s.text).join('\n').slice(0,2000),review,blockers:sourceBlockers(row,r,config,p)};});
 return {status:blockers.length||sources.some(s=>s.blockers.length)?'blocked':'ready',project:{id:p,name:config.name,goal:config.goal,project_kind:config.project_kind,settings_version:config.version},repository:target(config),sources,blockers};
}
async function assertPreparation(client,p,u,preparationId,acknowledgement,config,rows){
 if(!preparationId||acknowledgement!==true)fail('PLAN_SOURCE_CONFIRMATION_REQUIRED','프로젝트 목표·대상 저장소·사용 문서를 확인한 후 계획을 생성하세요.');
 const prior=(await client.query('SELECT *,expires_at>now() AS unexpired FROM implementation_plan_preparations WHERE project_id=$1 AND id=$2',[p,preparationId])).rows[0];
 if(!prior||prior.prepared_by!==u)fail('PLAN_PREPARATION_NOT_FOUND','현재 사용자가 확인한 계획 입력을 찾을 수 없습니다. 다시 확인하세요.');
 if(!prior.unexpired)fail('PLAN_PREPARATION_EXPIRED','입력 확인 후 30분이 지났습니다. 최신 입력을 다시 확인하세요.');
 const current=await buildPreparation(client,p,config,rows);
 if(prior.status!=='ready'||current.status!=='ready')fail('PLAN_SOURCE_SCOPE_BLOCKED','다른 프로젝트 자료·참고 자료·미검토 문서가 포함되어 계획 생성을 보류했습니다. 문서 용도를 검토하세요.');
 if(hash(current)!==prior.snapshot_sha256)fail('PLAN_PREPARATION_STALE','확인 후 프로젝트 설정·저장소·선택 문서·문서 검토가 변경되었습니다. 최신 입력을 다시 확인하세요.');
 return prior;
}
async function sourceStaleReasons(client,p,input,config){
 const confirmation=(await client.query('SELECT c.actor_id,p.snapshot FROM implementation_plan_confirmations c JOIN implementation_plan_preparations p ON p.id=c.preparation_id AND p.project_id=c.project_id WHERE c.project_id=$1 AND c.plan_id=$2',[p,input.request_id])).rows[0];
 if(!confirmation)return ['SOURCE_CONFIRMATION_REQUIRED'];
 const snapshot=confirmation.snapshot,reviewRows=await latestReviews(client,p,input.sources.map(s=>s.revision_id)),reasons=[];
 if(snapshot.project.name!==config.name||snapshot.project.project_kind!==config.project_kind)reasons.push('PROJECT_SCOPE_CHANGED');
 if(snapshot.project.settings_version!==input.settings_version||snapshot.project.id!==p||snapshot.repository.url!==input.repository.url||snapshot.repository.base_branch!==input.repository.base_branch||snapshot.sources.length!==input.sources.length)reasons.push('SOURCE_CONFIRMATION_MISMATCH');
 for(const source of input.sources){const saved=snapshot.sources.find(s=>s.revision_id===source.revision_id&&s.document_id===source.document_id&&s.sha256===source.sha256),latest=reviewRows.find(r=>r.revision_id===source.revision_id);if(!saved?.review||!latest||latest.id!==saved.review.id||sourceBlockers({sha256:source.sha256},latest,config,p).length)reasons.push('SOURCE_REVIEW_CHANGED');}
 return [...new Set(reasons)];
}
module.exports={projectKind,buildPreparation,assertPreparation,sourceStaleReasons,sourceReviewHash:hash};
