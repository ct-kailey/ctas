'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db'),{seed}=require('./work-execution-fixture');
test('reviewed bug request becomes a scoped Nora plan with frozen reasoning and stale evidence protection',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const admin=createPool(process.env.TEST_DATABASE_URL),schema='maintenance_plan_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});await migrate(pool);
 const owner=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES('maintenance@example.test','검토자','unused') RETURNING id")).rows[0].id,f=await seed(pool,owner);
 const classification=await f.gov.classify(f.p.id,owner,{request_id:randomUUID(),text:'승인 회원 로그인 오류를 기존 요구사항대로 수정해 주세요.',source_refs:[f.source]});
 const body={request_id:randomUUID(),classification_id:classification.id,revision_ids:[f.r.id]};
 await assert.rejects(f.implementation.createPlan(f.p.id,owner,body),e=>e.code==='MAINTENANCE_PLAN_REVIEW_REQUIRED');
 await f.gov.reviewClassification(f.p.id,owner,classification.id,{expected_version:classification.version,category:'bug_fix',note:'원래 승인 회원은 관리 화면에 접근할 수 있어야 하므로 기존 합의 대비 오류 수정으로 확인'});
 const plan=await f.implementation.createPlan(f.p.id,owner,body);assert.equal(plan.status,'queued');assert.equal(plan.input_snapshot.maintenance.id,classification.id);assert.match(plan.input_snapshot.project.goal,/승인 회원 로그인 오류/);assert.ok(plan.input_snapshot.maintenance.decision_sha256);assert.equal(plan.input_snapshot.sources[0].revision_id,f.r.id);assert.deepEqual(plan.stale_reasons,[]);
 assert.equal((await f.implementation.createPlan(f.p.id,owner,body)).id,plan.id);await assert.rejects(f.implementation.createPlan(f.p.id,owner,{...body,classification_id:randomUUID()}),e=>e.code==='IMPLEMENTATION_REQUEST_CONFLICT');
 await pool.query('INSERT INTO context_heads(project_id,version) VALUES($1,1) ON CONFLICT(project_id) DO UPDATE SET version=context_heads.version+1',[f.p.id]);
 const changed=await f.implementation.getPlan(f.p.id,plan.id,owner);assert.ok(changed.stale_reasons.includes('MAINTENANCE_MAIN_CONTEXT_CHANGED'));await assert.rejects(f.implementation.createPlan(f.p.id,owner,{...body,request_id:randomUUID()}),e=>e.code==='MAINTENANCE_CLASSIFICATION_STALE');
 assert.equal((await pool.query('SELECT count(*)::int n FROM work_items WHERE project_id=$1',[f.p.id])).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int n FROM implementation_requests WHERE project_id=$1',[f.p.id])).rows[0].n,0);
 const request=await f.gov.classify(f.p.id,owner,{request_id:randomUUID(),text:'별도 신규 기능 추가 요청',source_refs:[f.source]});await f.gov.reviewClassification(f.p.id,owner,request.id,{expected_version:request.version,category:'new_feature',note:'새로운 기능으로 계약·기획 협의 필요'});await assert.rejects(f.implementation.createPlan(f.p.id,owner,{...body,request_id:randomUUID(),classification_id:request.id}),e=>e.code==='MAINTENANCE_PLAN_REVIEW_REQUIRED');
});
