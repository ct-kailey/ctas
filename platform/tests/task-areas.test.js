'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { createLedger } = require('../server/ledger');
const { createProjectMembers } = require('../server/project-members');
const { createTaskAreas, AREAS, STATUSES, parseUpdate, progress } = require('../server/task-areas');

test('task area inputs accept partial changes, supported states, and bounded multiple assignees', () => {
  assert.deepEqual(AREAS, ['screen', 'server', 'database']);
  for (const status of STATUSES) assert.equal(parseUpdate({ expected_version: 0, status }).status, status);
  const member = randomUUID();
  assert.deepEqual(parseUpdate({ expected_version: 3, description: '  로그인  ', reference: ' /login ', assignee_ids: [member.toUpperCase()] }),
    { expected_version: 3, description: '로그인', reference: '/login', assignee_ids: [member] });
  for (const body of [null, [], {}, { expected_version: -1, status: 'todo' }, { expected_version: 1.5, status: 'todo' }, { expected_version: 0 }, { expected_version: 0, task_status: 'done' }, { expected_version: 0, approved: true }, { expected_version: 0, status: 'qa' }, { expected_version: 0, description: null }, { expected_version: 0, description: 'a'.repeat(10001) }, { expected_version: 0, reference: 'a'.repeat(2001) }, { expected_version: 0, reference: '\0' }, { expected_version: 0, assignee_ids: [member, member] }, { expected_version: 0, assignee_ids: [randomUUID(), 'not-an-id'] }, { expected_version: 0, assignee_ids: Array.from({length:51}, () => randomUUID()) }]) {
    assert.throws(() => parseUpdate(body), error => error.code.startsWith('TASK_AREA_'));
  }
});
test('task area progress excludes unneeded areas and never implies overall task completion', () => {
  assert.deepEqual(progress([{status:'done'},{status:'todo'},{status:'not_applicable'}]), {completed:1,total:2,percent:50});
  assert.deepEqual(progress([{status:'done'},{status:'blocked'},{status:'review'}]), {completed:1,total:3,percent:33});
  assert.deepEqual(progress([{status:'not_applicable'},{status:'not_applicable'},{status:'not_applicable'}]), {completed:0,total:0,percent:0});
});

test('task areas preserve project isolation, concurrent updates and separate audited progress', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'task_areas_' + randomUUID().replaceAll('-', '');
  const admin = createPool(process.env.TEST_DATABASE_URL); let pool;
  t.after(async () => { if (pool) await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` }); await migrate(pool);
  const users = {};
  for (const role of ['owner','reviewer','member','viewer','outsider']) users[role] = (await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,'PASSWORD_SECRET') RETURNING id", [role,role+'@task-areas.test'])).rows[0].id;
  const ledger = createLedger(pool), service = createTaskAreas({ pool });
  async function project() {
    const p = (await ledger.createProject(users.owner,{name:'영역별 작업'})).id;
    for (const role of ['reviewer','member','viewer']) await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,users[role],role]);
    return p;
  }
  async function setupTask(p, title='로그인 개발') {
    const record = await ledger.createRecord(p,users.owner,{title:'로그인 정책',document_category:'policy',text:'작업자는 자신의 계정으로 로그인한다.',history:{source_type:'other',channel:'테스트'}});
    const aid = randomUUID(), tid = randomUUID();
    await pool.query('INSERT INTO task_automation_analyses(id,project_id,revision_id,request_sha256,input_snapshot,input_sha256,dedup_sha256,created_by) VALUES($1,$2,$3,$4,$5,$4,$6,$7)',[aid,p,record.revision_id,'a'.repeat(64),{},aid,users.owner]);
    await pool.query('INSERT INTO automation_tasks(id,project_id,analysis_id,title,description,acceptance_criteria,evidence,input_snapshot,input_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[tid,p,aid,title,'로그인 구현','[]','[]',{},'b'.repeat(64),users.owner]);
    return { tid, aid };
  }
  const p = await project(), other = await project(), {tid,aid} = await setupTask(p), foreign = await setupTask(other);
  const initialTask = (await pool.query('SELECT * FROM automation_tasks WHERE id=$1',[tid])).rows[0];
  await t.test('reads return three virtual defaults without writes or external execution', async () => {
    const data = await service.get(p,users.viewer,tid);
    assert.deepEqual(data.areas.map(a=>[a.area,a.status,a.version]), [['screen','todo',0],['server','todo',0],['database','todo',0]]);
    assert.ok(data.areas.every(a=>a.updated_at===null && a.updated_by===null && !a.assignee_ids.length && !a.assignees.length));
    assert.deepEqual(data.progress,{completed:0,total:3,percent:0});
    assert.deepEqual(data.history,[]); assert.equal(data.history_has_more,false);
    assert.deepEqual((await service.list(p,users.viewer)).items[0],{task_id:tid,areas:data.areas.map(({description,reference,...summary})=>summary),progress:data.progress});
    for (const table of ['automation_task_areas','automation_task_area_assignees','automation_task_area_history','task_automation_jobs']) assert.equal((await pool.query('SELECT 1 FROM '+table)).rowCount,0);
  });
  await t.test('scoped reads and writes reject outsiders, viewers and foreign tasks', async () => {
    for (const method of ['get','list']) await assert.rejects(service[method](p,users.outsider,tid),{code:'FORBIDDEN'});
    await assert.rejects(service.get(p,users.viewer,foreign.tid),{code:'TASK_AREA_TASK_NOT_FOUND',status:404});
    for (const actor of ['viewer','outsider']) await assert.rejects(service.update(p,users[actor],tid,'screen',{expected_version:0,status:'done'}),{code:'FORBIDDEN'});
    await assert.rejects(service.update(p,users.member,foreign.tid,'screen',{expected_version:0,status:'done'}),{code:'TASK_AREA_TASK_NOT_FOUND'});
    await assert.rejects(service.update(p,users.owner,tid,'invalid',{expected_version:0,status:'done'}),{code:'TASK_AREA_INVALID'});
    for (const assignee of [users.viewer,users.outsider,randomUUID()]) await assert.rejects(service.update(p,users.member,tid,'screen',{expected_version:0,assignee_ids:[assignee]}),{code:'TASK_AREA_ASSIGNEES_INVALID',status:409});
  });
  await t.test('multiple project contributors and status changes have names and immutable history', async () => {
    const ids=[users.member,users.reviewer].sort();
    const data = await service.update(p,users.member,tid,'screen',{expected_version:0,assignee_ids:ids,status:'in_progress',description:'로그인 입력과 실패 안내',reference:'/login'});
    const screen=data.areas[0]; assert.equal(screen.version,1); assert.equal(screen.updated_by,users.member);
    assert.deepEqual(screen.assignee_ids,ids); assert.equal(screen.assignees.length,2); assert.ok(screen.assignees.every(a=>Object.keys(a).sort().join(',')==='id,name'));
    assert.equal(data.history[0].actor_id,users.member); assert.equal(data.history[0].actor_name,'member');
    assert.deepEqual(data.history[0].changed_fields,['status','description','reference','assignee_ids']);
    assert.equal(data.history[0].before_state.status,'todo'); assert.equal(data.history[0].after_state.status,'in_progress');
    const event=(await pool.query("SELECT * FROM events WHERE kind='task_area.updated' AND entity_id=$1",[tid])).rows[0];
    assert.equal(event.actor_id,users.member); assert.equal(event.project_id,p); assert.equal(event.detail.history_id,data.history[0].id);
    assert.doesNotMatch(JSON.stringify(data),/PASSWORD_SECRET|@task-areas/);
    await assert.rejects(pool.query("UPDATE automation_task_area_history SET changed_fields='[]'"),{code:'23514'});
    await assert.rejects(pool.query('DELETE FROM automation_task_area_history'),{code:'23514'});
    await assert.rejects(pool.query("UPDATE automation_task_areas SET project_id=$1 WHERE task_id=$2",[other,tid]),{code:'23514'});
    await assert.rejects(pool.query('DELETE FROM automation_task_areas'),{code:'23514'});
    await assert.rejects(pool.query("INSERT INTO automation_task_area_assignees(task_id,project_id,area,user_id) VALUES($1,$2,'screen',$3)",[tid,p,users.viewer]),{code:'23514'});
  });
  await t.test('stale or concurrent first writes cannot overwrite another contributor', async () => {
    await assert.rejects(service.update(p,users.owner,tid,'screen',{expected_version:0,status:'done'}),{code:'TASK_AREA_VERSION_CONFLICT',status:409});
    const outputs=await Promise.allSettled([
      service.update(p,users.owner,tid,'server',{expected_version:0,status:'in_progress',reference:'POST /app/login'}),
      service.update(p,users.member,tid,'server',{expected_version:0,status:'blocked',reference:'POST /different'}),
    ]);
    assert.equal(outputs.filter(o=>o.status==='fulfilled').length,1);
    assert.equal(outputs.find(o=>o.status==='rejected').reason.code,'TASK_AREA_VERSION_CONFLICT');
    assert.equal((await service.get(p,users.viewer,tid)).areas[1].version,1);
    const before=(await service.get(p,users.viewer,tid)).history.length;
    const same=await service.update(p,users.owner,tid,'screen',{expected_version:1,status:'in_progress'});
    assert.equal(same.unchanged,true); assert.equal(same.areas[0].version,1); assert.equal(same.history.length,before);
  });
  await t.test('area progress never starts AI, modifies task status or approves a merge', async () => {
    await service.update(p,users.reviewer,tid,'screen',{expected_version:1,status:'done'});
    await service.update(p,users.member,tid,'server',{expected_version:1,status:'done'});
    const done=await service.update(p,users.owner,tid,'database',{expected_version:0,status:'not_applicable'});
    assert.deepEqual(done.progress,{completed:2,total:2,percent:100});
    assert.deepEqual((await pool.query('SELECT * FROM automation_tasks WHERE id=$1',[tid])).rows[0],initialTask);
    assert.equal((await pool.query('SELECT 1 FROM task_automation_jobs')).rowCount,0);
    await service.update(p,users.owner,tid,'screen',{expected_version:2,status:'not_applicable'});
    const all=await service.update(p,users.owner,tid,'server',{expected_version:2,status:'not_applicable'});
    assert.deepEqual(all.progress,{completed:0,total:0,percent:0});
  });
  await t.test('membership changes and reassignment remain valid across races and inactive work', async () => {
    await service.update(p,users.owner,tid,'screen',{expected_version:3,status:'todo'});
    const members=createProjectMembers(pool);
    const member=(await members.list(p,users.owner)).members.find(row=>row.id===users.member);
    assert.equal(member.assignments.open_task_areas,1); assert.equal(member.has_assignment_history,true);
    await assert.rejects(members.change(p,users.owner,users.member,{expected_role:'member',role:'viewer'}),{code:'MEMBER_HAS_ACTIVE_ASSIGNMENTS'});
    await assert.rejects(members.remove(p,users.owner,users.member,{expected_role:'member'}),{code:'MEMBER_HAS_ASSIGNMENT_HISTORY'});
    await assert.rejects(pool.query("UPDATE memberships SET role='viewer' WHERE project_id=$1 AND user_id=$2",[p,users.member]),{code:'23514'});
    await service.update(p,users.owner,tid,'screen',{expected_version:4,status:'done'});
    await members.change(p,users.owner,users.member,{expected_role:'member',role:'viewer'});
    const inactive=(await members.list(p,users.owner)).members.find(row=>row.id===users.member);
    assert.equal(inactive.assignments.open_task_areas,0); assert.equal(inactive.has_assignment_history,true);
    await assert.rejects(members.remove(p,users.owner,users.member,{expected_role:'viewer'}),{code:'MEMBER_HAS_ASSIGNMENT_HISTORY'});
    const annotated=await service.update(p,users.owner,tid,'screen',{expected_version:5,description:'완료한 로그인 입력과 실패 안내'});
    assert.equal(annotated.areas[0].version,6);assert.ok(annotated.areas[0].assignee_ids.includes(users.member));
    await assert.rejects(service.update(p,users.owner,tid,'screen',{expected_version:6,status:'in_progress'}),{code:'TASK_AREA_ASSIGNEES_INVALID'});
    const changed=await service.update(p,users.owner,tid,'screen',{expected_version:6,status:'in_progress',assignee_ids:[users.owner]});
    assert.deepEqual(changed.areas[0].assignee_ids,[users.owner]);
    assert.ok(changed.history.some(h=>h.before_state.assignee_ids.includes(users.member)));
    await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2",[p,users.member]);
  });
  await t.test('database foreign keys reject cross-project task and membership relationships', async () => {
    await assert.rejects(pool.query("INSERT INTO automation_task_areas(task_id,project_id,area,version,updated_by) VALUES($1,$2,'screen',1,$3)",[foreign.tid,p,users.owner]),{code:'23503'});
    await assert.rejects(pool.query("INSERT INTO automation_task_area_assignees(task_id,project_id,area,user_id) VALUES($1,$2,'screen',$3)",[tid,other,users.member]),{code:'23503'});
  });
  await t.test('board reads have bounded latest task scope and default areas for legacy tasks', async () => {
    await pool.query(`INSERT INTO automation_tasks(id,project_id,analysis_id,title,description,acceptance_criteria,evidence,input_snapshot,input_sha256,created_by,created_at)
      SELECT gen_random_uuid(),$1,$2,'추가 작업 '||n,'업무','[]','[]','{}',$3,$4,now()+n*interval '1 second' FROM generate_series(1,201) n`,[p,aid,'c'.repeat(64),users.owner]);
    const data=await service.list(p,users.viewer); assert.equal(data.limit,200); assert.equal(data.items.length,200);
    assert.ok(data.items.every(item=>item.task_id!==tid && item.task_id!==foreign.tid && item.areas.length===3 && item.areas.every(a=>a.version===0)));
    assert.ok(data.items.every(item=>item.areas.every(a=>!('description' in a) && !('reference' in a))));
    assert.equal((await service.get(p,users.viewer,tid)).areas[0].version,7,'older tasks still have full detail');
  });
  await t.test('history is bounded without dropping earlier audit records', async () => {
    for(let version=1;version<=52;version++) await service.update(p,users.owner,tid,'database',{expected_version:version,reference:'테이블 정보 '+version});
    const data=await service.get(p,users.viewer,tid);
    assert.equal(data.history.length,50); assert.equal(data.history_has_more,true);
    assert.equal(data.history[0].version,53); assert.equal(data.history[0].after_state.reference,'테이블 정보 52');
    assert.ok((await pool.query('SELECT 1 FROM automation_task_area_history WHERE project_id=$1 AND task_id=$2',[p,tid])).rowCount>50);
  });
});
