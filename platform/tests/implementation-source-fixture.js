'use strict';
// Legacy workflow tests still pass through the real review/confirmation boundary.
// Security tests call createPlan directly; there is no runtime enforcement bypass.
async function createReviewedPlan(pool,implementation,p,u,body){
 const previous=(await pool.query('SELECT c.preparation_id FROM implementation_plans p LEFT JOIN implementation_plan_confirmations c ON c.plan_id=p.id WHERE p.project_id=$1 AND p.id=$2',[p,body.request_id])).rows[0];
 if(previous)return implementation.createPlan(p,u,{...body,...(previous.preparation_id?{preparation_id:previous.preparation_id,acknowledge_project_sources:true}:{})});
 const config=await implementation.getSettings(p,u),revisions=body.revision_ids;
 if(!config.goal.trim()||!config.repository_url||!config.base_branch||!Array.isArray(revisions)||!revisions.length||revisions.length>5||new Set(revisions).size!==revisions.length)return implementation.createPlan(p,u,body);
 const docs=(await pool.query('SELECT r.*,d.baseline_revision_id,d.record_kind FROM revisions r JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id WHERE r.project_id=$1 AND r.id=ANY($2::uuid[])',[p,revisions])).rows;
 if(docs.length!==revisions.length||docs.some(r=>r.record_kind!=='specification'||r.status!=='ready'||r.baseline_revision_id!==r.id))return implementation.createPlan(p,u,body);
 const reviewer=(await pool.query("SELECT user_id FROM memberships WHERE project_id=$1 AND role='owner' ORDER BY user_id LIMIT 1",[p])).rows[0].user_id;
 for(const revisionId of revisions){const prior=(await pool.query('SELECT * FROM implementation_source_reviews WHERE project_id=$1 AND revision_id=$2 ORDER BY sequence DESC LIMIT 1',[p,revisionId])).rows[0];if(!prior||Number(prior.settings_version)!==config.version)await implementation.reviewSource(p,reviewer,{revision_id:revisionId,expected_settings_version:config.version,usage:'implementation',intended_project_id:p,reason:'합성 테스트: 현재 프로젝트 목표·저장소·원문을 검토했습니다.'});}
 const preparation=await implementation.preparePlan(p,u,{revision_ids:revisions});
 return implementation.createPlan(p,u,{...body,preparation_id:preparation.id,acknowledge_project_sources:true});
}
module.exports={createReviewedPlan};
